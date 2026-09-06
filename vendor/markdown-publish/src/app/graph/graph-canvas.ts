import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  PLATFORM_ID,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import {
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  forceCollide,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import type { GraphData } from '@shared/content-model';
import { ThemeService } from '../theme/theme.service';

interface SimNode extends SimulationNodeDatum {
  slug: string;
  title: string;
  degree: number;
}
type SimLink = SimulationLinkDatum<SimNode>;

type RGBA = [number, number, number, number];

interface Colors {
  line: RGBA;
  node: RGBA;
  unresolved: RGBA;
  focused: RGBA;
  focusedCss: string;
  text: string;
}

const NODE_VS = `#version 300 es
in vec2 a_pos;
in float a_radius;
in vec4 a_color;
in float a_lit;
uniform vec2 u_translate;
uniform float u_scale;
uniform vec2 u_viewport;
uniform float u_dpr;
uniform float u_dim;
out vec4 v_color;
out float v_alpha;
void main() {
  vec2 screen = a_pos * u_scale + u_translate;
  vec2 clip = vec2(screen.x / u_viewport.x * 2.0 - 1.0, 1.0 - screen.y / u_viewport.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = clamp(a_radius * u_scale * u_dpr * 2.0, 1.0, 56.0);
  v_color = a_color;
  // Non-lit nodes fade toward transparent as the hover dim ramps in.
  v_alpha = mix(1.0 - u_dim * 0.72, 1.0, a_lit);
}`;

const NODE_FS = `#version 300 es
precision mediump float;
in vec4 v_color;
in float v_alpha;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  float aa = fwidth(d) * 1.5;
  float alpha = 1.0 - smoothstep(0.5 - aa, 0.5, d);
  if (alpha <= 0.0) discard;
  float a = v_color.a * alpha * v_alpha;
  outColor = vec4(v_color.rgb * a, a); // premultiplied
}`;

const EDGE_VS = `#version 300 es
in vec2 a_pos;
uniform vec2 u_translate;
uniform float u_scale;
uniform vec2 u_viewport;
void main() {
  vec2 screen = a_pos * u_scale + u_translate;
  vec2 clip = vec2(screen.x / u_viewport.x * 2.0 - 1.0, 1.0 - screen.y / u_viewport.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

const EDGE_FS = `#version 300 es
precision mediump float;
uniform vec4 u_color;
out vec4 outColor;
void main() { outColor = vec4(u_color.rgb * u_color.a, u_color.a); }`; // premultiplied

@Component({
  selector: 'app-graph-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <canvas #gl class="graph-gl"></canvas>
    <canvas #labels class="graph-labels"></canvas>
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
        width: 100%;
        height: 100%;
      }
      .graph-gl,
      .graph-labels {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }
      .graph-gl {
        touch-action: none;
        cursor: grab;
      }
      .graph-gl:active {
        cursor: grabbing;
      }
      .graph-labels {
        pointer-events: none;
      }
    `,
  ],
})
export class GraphCanvas {
  readonly data = input.required<GraphData>();
  readonly activeSlug = input<string | null>(null);
  /** Show labels regardless of zoom (used by the small local graph). */
  readonly alwaysLabels = input(false);
  /** Upper bound for the initial fit zoom. Higher lets sparse graphs fill. */
  readonly maxZoom = input(1);

  private readonly glRef = viewChild.required<ElementRef<HTMLCanvasElement>>('gl');
  private readonly labelRef =
    viewChild.required<ElementRef<HTMLCanvasElement>>('labels');
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private gl: WebGL2RenderingContext | null = null;
  private lctx: CanvasRenderingContext2D | null = null;
  private parseCtx: CanvasRenderingContext2D | null = null;
  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;
  private ready = false;
  private font = 'sans-serif';
  private rafId = 0;
  private canvasRect: DOMRect | null = null;
  private scrollHandler?: () => void;

  // GL objects
  private nodeProgram: WebGLProgram | null = null;
  private edgeProgram: WebGLProgram | null = null;
  private nodeUniforms: Record<string, WebGLUniformLocation | null> = {};
  private edgeUniforms: Record<string, WebGLUniformLocation | null> = {};
  private posBuffer: WebGLBuffer | null = null; // shared node positions
  private radiusBuffer: WebGLBuffer | null = null;
  private colorBuffer: WebGLBuffer | null = null;
  private litBuffer: WebGLBuffer | null = null;
  private edgeIndexBuffer: WebGLBuffer | null = null;
  private hoverEdgeIndexBuffer: WebGLBuffer | null = null;
  private hoverPosBuffer: WebGLBuffer | null = null;
  private nodeVao: WebGLVertexArrayObject | null = null;
  private edgeVao: WebGLVertexArrayObject | null = null;
  private hoverEdgeVao: WebGLVertexArrayObject | null = null;
  private hoverNodeVao: WebGLVertexArrayObject | null = null;
  private posArray = new Float32Array(0);
  private litArray = new Float32Array(0);
  private hoverPosArr = new Float32Array(2);
  private edgeCount = 0;
  private hoverEdgeCount = 0;

  private sim?: Simulation<SimNode, SimLink>;
  /** Budget for keeping the sim alive past alphaMin; reset by build()/drag. */
  private holdTicks = 0;
  private nodes: SimNode[] = [];
  private links: SimLink[] = [];
  private large = false;
  private adjacency = new Map<string, SimNode[]>();
  private slugIndex = new Map<string, number>();

  private tx = 0;
  private ty = 0;
  private k = 1;

  // Camera follows the settling layout until the user pans/zooms/drags.
  private autoFit = true;

  private hover: SimNode | null = null;
  private dim = 0;
  private dimTarget = 0;
  private dimRaf = 0;
  /** Per-node label opacity, eased so collisions fade instead of popping. */
  private readonly labelAlpha = new Map<SimNode, number>();
  private dragNode: SimNode | null = null;
  private panning = false;
  private pointerStart = { x: 0, y: 0 };
  private moved = 0;

  private colors: Colors = {
    line: [0.83, 0.83, 0.83, 0.45],
    node: [0.36, 0.36, 0.36, 1],
    unresolved: [0.67, 0.67, 0.67, 1],
    focused: [0.54, 0.36, 0.96, 1],
    focusedCss: '#8a5cf5',
    text: '#222222',
  };

  private resizeObserver?: ResizeObserver;

  constructor() {
    if (!this.isBrowser) {
      return;
    }

    afterNextRender(() => this.setup());

    effect(() => {
      this.data();
      if (this.ready) {
        this.build();
      }
    });

    effect(() => {
      this.theme.darkMode();
      if (this.ready) {
        this.readColors();
        this.uploadColors();
        this.requestDraw();
      }
    });

    inject(DestroyRef).onDestroy(() => {
      this.sim?.on('tick', null).on('end', null).stop();
      this.resizeObserver?.disconnect();
      if (this.scrollHandler) {
        window.removeEventListener('scroll', this.scrollHandler, { capture: true });
      }
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
      }
      if (this.dimRaf) {
        cancelAnimationFrame(this.dimRaf);
      }
    });
  }

  private setup(): void {
    const canvas = this.glRef().nativeElement;
    // Premultiplied alpha throughout: shaders emit rgb*a and the blend is
    // ONE/ONE_MINUS_SRC_ALPHA. With premultipliedAlpha:false the browser
    // multiplied by alpha a second time at composite, so half-transparent
    // edges vanished into the page background on the dark theme.
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      premultipliedAlpha: true,
    });
    if (!gl) {
      console.warn('WebGL2 unavailable — graph not rendered');
      return;
    }
    this.gl = gl;
    this.lctx = this.labelRef().nativeElement.getContext('2d');
    this.parseCtx = document
      .createElement('canvas')
      .getContext('2d', { willReadFrequently: true });
    this.initGL();

    this.attachEvents(canvas);
    this.scrollHandler = () => {
      this.canvasRect = canvas.getBoundingClientRect();
    };
    window.addEventListener('scroll', this.scrollHandler, {
      capture: true,
      passive: true,
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host.nativeElement);
    this.resize();
    this.readColors();
    this.ready = true;
    this.build();
  }

  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl!;
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('shader compile', gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  private link(vs: string, fs: string): WebGLProgram {
    const gl = this.gl!;
    const p = gl.createProgram()!;
    gl.attachShader(p, this.compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, this.compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('program link', gl.getProgramInfoLog(p));
    }
    return p;
  }

  private initGL(): void {
    const gl = this.gl!;
    this.nodeProgram = this.link(NODE_VS, NODE_FS);
    this.edgeProgram = this.link(EDGE_VS, EDGE_FS);
    for (const u of ['u_translate', 'u_scale', 'u_viewport', 'u_dpr', 'u_dim']) {
      this.nodeUniforms[u] = gl.getUniformLocation(this.nodeProgram, u);
    }
    for (const u of ['u_translate', 'u_scale', 'u_viewport', 'u_color']) {
      this.edgeUniforms[u] = gl.getUniformLocation(this.edgeProgram, u);
    }
    this.posBuffer = gl.createBuffer();
    this.radiusBuffer = gl.createBuffer();
    this.colorBuffer = gl.createBuffer();
    this.litBuffer = gl.createBuffer();
    this.edgeIndexBuffer = gl.createBuffer();
    this.hoverEdgeIndexBuffer = gl.createBuffer();
    this.hoverPosBuffer = gl.createBuffer();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied sources
  }

  private resize(): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    this.dpr = window.devicePixelRatio || 1;
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    const w = Math.round(rect.width * this.dpr);
    const h = Math.round(rect.height * this.dpr);
    const glCanvas = this.glRef().nativeElement;
    const lblCanvas = this.labelRef().nativeElement;
    glCanvas.width = w;
    glCanvas.height = h;
    lblCanvas.width = w;
    lblCanvas.height = h;
    this.canvasRect = glCanvas.getBoundingClientRect();
    this.gl?.viewport(0, 0, w, h);
    this.requestDraw();
  }

  private build(): void {
    const graph = this.data();
    this.sim?.on('tick', null).on('end', null).stop();

    this.nodes = graph.nodes.map((n) => ({ ...n }));
    const bySlug = new Map(this.nodes.map((n) => [n.slug, n]));
    this.links = graph.links
      .filter((l) => bySlug.has(l.source as string) && bySlug.has(l.target as string))
      .map((l) => ({ source: l.source, target: l.target }));

    // adjacency by node ref (for hover edge highlight) + slug->index
    const index = new Map<string, number>();
    this.nodes.forEach((n, i) => index.set(n.slug, i));
    this.slugIndex = index;
    this.adjacency = new Map(this.nodes.map((n) => [n.slug, []]));
    const edgeIdx = new Uint16Array(this.links.length * 2);
    this.links.forEach((l, i) => {
      const s = l.source as string;
      const t = l.target as string;
      edgeIdx[i * 2] = index.get(s)!;
      edgeIdx[i * 2 + 1] = index.get(t)!;
      this.adjacency.get(s)!.push(bySlug.get(t)!);
      this.adjacency.get(t)!.push(bySlug.get(s)!);
    });
    this.edgeCount = this.links.length;

    // Degree relative to the *displayed* graph: a sub-graph (local view) must
    // not inherit full-vault hub degrees, or every node around a hub renders
    // as a max-size dot.
    for (const n of this.nodes) {
      n.degree = this.adjacency.get(n.slug)?.length ?? 0;
    }

    const large = this.nodes.length > 400;
    this.large = large;
    const baseCharge = large ? -180 : -320;

    const sim = forceSimulation(this.nodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(this.links)
          .id((d) => d.slug)
          .distance(large ? 30 : 52)
          // Attraction grows with the better-connected endpoint: a leaf linked
          // to a hub is pulled in hard (clusters form around hubs), while links
          // between two sparsely-connected notes stay loose. min() kept leaf-hub
          // links weak — exactly the ones that must be tight.
          .strength((l) => {
            const max = Math.max(
              (l.source as SimNode).degree ?? 0,
              (l.target as SimNode).degree ?? 0,
            );
            const base = large ? 0.25 : 0.4;
            return base * (0.4 + Math.min(2, max * 0.15));
          }),
      )
      .force(
        'charge',
        forceManyBody<SimNode>()
          // Repulsion scales with how connected a note is: well-linked hubs
          // repel little (their many links win → attraction dominates → tight
          // clusters), while sparsely-linked notes repel hard (repulsion wins
          // → they push apart and drift to the edges).
          .strength((d) => baseCharge * (0.4 + 1.2 * Math.exp(-(d.degree ?? 0) / 2)))
          .theta(0.9)
          .distanceMax(large ? 1500 : Infinity),
      )
      // Soft pull toward the centre (NOT forceCenter, which hard-recenters the
      // whole graph every tick and makes dragging lurch the entire layout).
      .force('x', forceX<SimNode>(0).strength((d) => (d.degree === 0 ? 0.22 : 0.06)))
      .force('y', forceY<SimNode>(0).strength((d) => (d.degree === 0 ? 0.22 : 0.06)))
      // Lower friction so nodes carry momentum and coast to rest (instead of
      // snapping still); gentler alpha decay so the layout settles over a few
      // seconds rather than freezing at ~2s.
      .velocityDecay(large ? 0.65 : 0.55)
      .alphaDecay(0.0228);

    // Collide on all graphs so nodes never stack into blobs when you zoom in.
    // Extra spacing on big graphs spreads them out, so fit shows small clean
    // dots (not a canvas-filling wall of circles).
    sim.force(
      'collide',
      forceCollide<SimNode>().radius((d) => this.radius(d) + (large ? 10 : 6)),
    );

    // d3 kills the timer the moment alpha crosses alphaMin even if nodes are
    // still mid-flight — on big graphs the layout froze visibly moving ("the
    // graph dies"). While motion is still perceptible, top alpha back up — but
    // with a hold that tapers to zero over HOLD_MAX ticks, so the energy (and
    // the motion) always fades out smoothly instead of cutting off, and a
    // pathological layout can't spin the CPU forever.
    const HOLD_MAX = 1800;
    const sample = Math.max(1, Math.floor(this.nodes.length / 256));
    this.holdTicks = 0;
    sim.on('tick', () => {
      if (sim.alpha() < 0.008 && sim.alphaTarget() === 0 && this.holdTicks < HOLD_MAX) {
        let speed = 0;
        let count = 0;
        for (let i = 0; i < this.nodes.length; i += sample) {
          const n = this.nodes[i];
          speed += Math.hypot(n.vx ?? 0, n.vy ?? 0);
          count++;
        }
        if (speed / count > 0.2) {
          sim.alpha(0.008 * (1 - this.holdTicks / HOLD_MAX));
          this.holdTicks++;
        }
      }
      this.uploadPositions();
      // Track the expanding layout with the camera until the user takes over —
      // no end-of-simulation snap (the old on('end') fit jerked the view).
      if (this.autoFit) {
        this.fitToView();
      }
      this.requestDraw();
    });
    this.sim = sim;

    // static GL buffers
    const gl = this.gl!;
    this.autoFit = true;
    this.hover = null;
    this.dim = 0;
    this.dimTarget = 0;
    this.posArray = new Float32Array(this.nodes.length * 2);
    this.litArray = new Float32Array(this.nodes.length);
    this.uploadStaticBuffers(edgeIdx);
    this.uploadColors();
    this.uploadLit();
    this.uploadPositions();
    this.setupVaos();

    this.fitToView();
  }

  private uploadStaticBuffers(edgeIdx: Uint16Array): void {
    const gl = this.gl!;
    const active = this.activeSlug();
    const radii = new Float32Array(this.nodes.length);
    this.nodes.forEach((n, i) => {
      radii[i] = this.radius(n) * (n.slug === active ? 1.5 : 1);
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, this.radiusBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, radii, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.edgeIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, edgeIdx, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.nodes.length * 2 * 4, gl.DYNAMIC_DRAW);
  }

  private uploadColors(): void {
    const gl = this.gl!;
    const active = this.activeSlug();
    const colors = new Float32Array(this.nodes.length * 4);
    this.nodes.forEach((n, i) => {
      const c =
        n.slug === active
          ? this.colors.focused
          : n.degree === 0
            ? this.colors.unresolved
            : this.colors.node;
      colors.set(c, i * 4);
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
  }

  private uploadLit(): void {
    const gl = this.gl;
    if (!gl) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.litBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.litArray, gl.DYNAMIC_DRAW);
  }

  private uploadPositions(): void {
    const gl = this.gl;
    if (!gl) return;
    const a = this.posArray;
    for (let i = 0; i < this.nodes.length; i++) {
      a[i * 2] = this.nodes[i].x ?? 0;
      a[i * 2 + 1] = this.nodes[i].y ?? 0;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, a);
  }

  private setupVaos(): void {
    const gl = this.gl!;
    const aPosNode = gl.getAttribLocation(this.nodeProgram!, 'a_pos');
    const aRadius = gl.getAttribLocation(this.nodeProgram!, 'a_radius');
    const aColor = gl.getAttribLocation(this.nodeProgram!, 'a_color');
    const aLit = gl.getAttribLocation(this.nodeProgram!, 'a_lit');
    const aPosEdge = gl.getAttribLocation(this.edgeProgram!, 'a_pos');

    // node VAO
    this.nodeVao = gl.createVertexArray();
    gl.bindVertexArray(this.nodeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.enableVertexAttribArray(aPosNode);
    gl.vertexAttribPointer(aPosNode, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.radiusBuffer);
    gl.enableVertexAttribArray(aRadius);
    gl.vertexAttribPointer(aRadius, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.litBuffer);
    gl.enableVertexAttribArray(aLit);
    gl.vertexAttribPointer(aLit, 1, gl.FLOAT, false, 0, 0);

    // edge VAO (uses node positions + edge index)
    this.edgeVao = gl.createVertexArray();
    gl.bindVertexArray(this.edgeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.enableVertexAttribArray(aPosEdge);
    gl.vertexAttribPointer(aPosEdge, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.edgeIndexBuffer);

    // hover edge VAO (node positions + dynamic hover index)
    this.hoverEdgeVao = gl.createVertexArray();
    gl.bindVertexArray(this.hoverEdgeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.enableVertexAttribArray(aPosEdge);
    gl.vertexAttribPointer(aPosEdge, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.hoverEdgeIndexBuffer);

    // hover node VAO (single dynamic point; radius/color via uniforms-as-attrib defaults)
    this.hoverNodeVao = gl.createVertexArray();
    gl.bindVertexArray(this.hoverNodeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.hoverPosBuffer);
    gl.enableVertexAttribArray(aPosNode);
    gl.vertexAttribPointer(aPosNode, 2, gl.FLOAT, false, 0, 0);
    // constant radius/color/lit attributes for the single hover point
    gl.disableVertexAttribArray(aRadius);
    gl.disableVertexAttribArray(aColor);
    gl.disableVertexAttribArray(aLit);
    gl.bindVertexArray(null);
  }

  private radius(n: SimNode): number {
    // More links → bigger node (clear hub hierarchy, like Obsidian). The base
    // keeps orphan (degree-0) notes clearly visible instead of 1px specks.
    return 4 + Math.min(8, Math.sqrt(n.degree) * 0.85);
  }

  private fitToView(): void {
    if (!this.nodes.length || this.cssWidth <= 0) {
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of this.nodes) {
      minX = Math.min(minX, n.x ?? 0);
      minY = Math.min(minY, n.y ?? 0);
      maxX = Math.max(maxX, n.x ?? 0);
      maxY = Math.max(maxY, n.y ?? 0);
    }
    // Padding so node labels (wider than the dots) don't clip at edges; scales
    // with the canvas so a tiny inline preview still fits.
    const pad = this.alwaysLabels()
      ? Math.max(40, Math.min(this.cssWidth, this.cssHeight) * 0.2)
      : 70;
    const w = maxX - minX || 1;
    const h = maxY - minY || 1;
    this.k = Math.max(
      0.05,
      Math.min(
        this.maxZoom(),
        Math.min((this.cssWidth - pad) / w, (this.cssHeight - pad) / h),
      ),
    );
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.tx = this.cssWidth / 2 - cx * this.k;
    this.ty = this.cssHeight / 2 - cy * this.k;
    this.requestDraw();
  }

  private readColors(): void {
    const cs = getComputedStyle(this.host.nativeElement);
    this.font = cs.fontFamily || 'sans-serif';
    const v = (name: string, fb: string) =>
      cs.getPropertyValue(name).trim() || fb;
    const lineCss = v('--graph-line', '#d4d4d4');
    const focusedCss = v(
      '--graph-node-focused',
      v('--interactive-accent', '#8a5cf5'),
    );
    this.colors = {
      line: this.toRgba(lineCss, 0.45),
      node: this.toRgba(v('--graph-node', '#5c5c5c'), 1),
      unresolved: this.toRgba(v('--graph-node-unresolved', '#ababab'), 1),
      focused: this.toRgba(focusedCss, 1),
      focusedCss,
      text: v('--graph-text', '#222222'),
    };
  }

  /** Parse any CSS colour to [r,g,b,a] floats via the 2D context. */
  private toRgba(css: string, alpha: number): RGBA {
    const ctx = this.parseCtx;
    if (!ctx) return [0.5, 0.5, 0.5, alpha];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] / 255, d[1] / 255, d[2] / 255, alpha];
  }

  // Coalesce repaints into one render per animation frame.
  private requestDraw(): void {
    if (this.rafId) {
      return;
    }
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      this.render();
    });
  }

  private render(): void {
    const gl = this.gl;
    if (!gl || !this.nodes.length) {
      return;
    }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const setEdgeUniforms = (color: RGBA) => {
      gl.uniform2f(this.edgeUniforms['u_translate'], this.tx, this.ty);
      gl.uniform1f(this.edgeUniforms['u_scale'], this.k);
      gl.uniform2f(this.edgeUniforms['u_viewport'], this.cssWidth, this.cssHeight);
      gl.uniform4f(this.edgeUniforms['u_color'], color[0], color[1], color[2], color[3]);
    };

    // base edges (fade back as the hover dim ramps in)
    const ln = this.colors.line;
    gl.useProgram(this.edgeProgram);
    setEdgeUniforms([ln[0], ln[1], ln[2], ln[3] * (1 - this.dim * 0.6)]);
    gl.bindVertexArray(this.edgeVao);
    gl.drawElements(gl.LINES, this.edgeCount * 2, gl.UNSIGNED_SHORT, 0);

    // hovered node's edges (accent, fade in with the hover)
    if (this.hoverEdgeCount > 0 && this.dim > 0.01) {
      const f = this.colors.focused;
      setEdgeUniforms([f[0], f[1], f[2], 0.85 * this.dim]);
      gl.bindVertexArray(this.hoverEdgeVao);
      gl.drawElements(gl.LINES, this.hoverEdgeCount * 2, gl.UNSIGNED_SHORT, 0);
    }

    // nodes
    gl.useProgram(this.nodeProgram);
    gl.uniform2f(this.nodeUniforms['u_translate'], this.tx, this.ty);
    gl.uniform1f(this.nodeUniforms['u_scale'], this.k);
    gl.uniform2f(this.nodeUniforms['u_viewport'], this.cssWidth, this.cssHeight);
    gl.uniform1f(this.nodeUniforms['u_dpr'], this.dpr);
    gl.uniform1f(this.nodeUniforms['u_dim'], this.dim);
    gl.bindVertexArray(this.nodeVao);
    gl.drawArrays(gl.POINTS, 0, this.nodes.length);

    // hovered node: soft halo + enlarged accent dot, at its live position
    if (this.hover && this.dim > 0.01) {
      this.hoverPosArr[0] = this.hover.x ?? 0;
      this.hoverPosArr[1] = this.hover.y ?? 0;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.hoverPosBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.hoverPosArr, gl.DYNAMIC_DRAW);
      const aRadius = gl.getAttribLocation(this.nodeProgram!, 'a_radius');
      const aColor = gl.getAttribLocation(this.nodeProgram!, 'a_color');
      const aLit = gl.getAttribLocation(this.nodeProgram!, 'a_lit');
      const f = this.colors.focused;
      const r = this.radius(this.hover);
      gl.bindVertexArray(this.hoverNodeVao);
      gl.vertexAttrib1f(aLit, 1);
      gl.vertexAttrib1f(aRadius, r * 2.4);
      gl.vertexAttrib4f(aColor, f[0], f[1], f[2], 0.22 * this.dim);
      gl.drawArrays(gl.POINTS, 0, 1);
      gl.vertexAttrib1f(aRadius, r * (1 + 0.4 * this.dim));
      gl.vertexAttrib4f(aColor, f[0], f[1], f[2], 1);
      gl.drawArrays(gl.POINTS, 0, 1);
    }
    gl.bindVertexArray(null);

    this.drawLabels();
  }

  private drawLabels(): void {
    const ctx = this.lctx;
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    const active = this.activeSlug();
    const hl = this.hover;
    ctx.font = `12px ${this.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // A node is a label candidate once it's big enough on screen (or focused).
    const T = this.alwaysLabels() ? 3 : 6;
    const FADE = 4;

    const cands: {
      n: SimNode;
      focused: boolean;
      screenR: number;
      sx: number;
      sy: number;
    }[] = [];
    for (const n of this.nodes) {
      const focused = n === hl || n.slug === active;
      const screenR =
        this.radius(n) * (n === hl ? 1.4 : n.slug === active ? 1.5 : 1) * this.k;
      if (!focused && screenR <= T) {
        continue;
      }
      const sx = (n.x ?? 0) * this.k + this.tx;
      const sy = (n.y ?? 0) * this.k + this.ty;
      if (
        sx < -120 ||
        sx > this.cssWidth + 120 ||
        sy < -30 ||
        sy > this.cssHeight + 40
      ) {
        continue;
      }
      cands.push({ n, focused, screenR, sx, sy });
    }
    // Hubs (and focused) win when labels would collide.
    cands.sort(
      (a, b) => (b.focused ? 1 : 0) - (a.focused ? 1 : 0) || b.screenR - a.screenR,
    );

    // A label that would overlap one already placed loses — but instead of
    // dropping it instantly (which pops as nodes drift past each other), ease
    // its opacity toward shown/hidden so the swap is a smooth crossfade.
    const placed: number[] = [];
    const LH = 15;
    const EASE = 0.16;
    const seen = new Set<SimNode>();
    let animating = false;
    for (const c of cands) {
      const label = this.truncate(c.n.title);
      const w = ctx.measureText(label).width;
      const lx = Math.round(c.sx);
      const ly = Math.round(c.sy + c.screenR + 3);
      const x0 = lx - w / 2 - 3;
      const x1 = lx + w / 2 + 3;
      const y0 = ly - 1;
      const y1 = ly + LH;
      let overlap = false;
      for (let i = 0; i < placed.length; i += 4) {
        if (
          x0 < placed[i + 2] &&
          x1 > placed[i] &&
          y0 < placed[i + 3] &&
          y1 > placed[i + 1]
        ) {
          overlap = true;
          break;
        }
      }
      const won = c.focused || !overlap;
      if (won) {
        placed.push(x0, y0, x1, y1);
      }
      seen.add(c.n);
      const target = won ? 1 : 0;
      let a = (this.labelAlpha.get(c.n) ?? 0) + (target - (this.labelAlpha.get(c.n) ?? 0)) * EASE;
      if (Math.abs(target - a) > 0.005) {
        animating = true;
      } else {
        a = target;
      }
      this.labelAlpha.set(c.n, a);
      if (a <= 0.01) {
        continue;
      }
      const lit = c.focused || this.litArray[this.slugIndex.get(c.n.slug)!] > 0;
      const baseA = c.focused ? 1 : Math.min(1, (c.screenR - T) / FADE);
      ctx.globalAlpha = a * baseA * (lit ? 1 : 1 - this.dim * 0.6);
      ctx.fillStyle = c.focused ? this.colors.focusedCss : this.colors.text;
      ctx.fillText(label, lx, ly);
    }
    ctx.globalAlpha = 1;

    // Drop opacity state for nodes no longer in the running (below the zoom
    // threshold / off-screen) so the map stays bounded and they fade in afresh.
    if (this.labelAlpha.size > seen.size) {
      for (const n of this.labelAlpha.keys()) {
        if (!seen.has(n)) {
          this.labelAlpha.delete(n);
        }
      }
    }

    // Keep stepping the fade even when the simulation/camera is idle.
    if (animating) {
      this.requestDraw();
    }
  }

  private truncate(s: string): string {
    return s.length > 24 ? s.slice(0, 23) + '…' : s;
  }

  private toSim(clientX: number, clientY: number): { x: number; y: number } {
    const rect =
      this.canvasRect ?? this.glRef().nativeElement.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.tx) / this.k,
      y: (clientY - rect.top - this.ty) / this.k,
    };
  }

  private nodeAt(clientX: number, clientY: number): SimNode | null {
    const p = this.toSim(clientX, clientY);
    let best: SimNode | null = null;
    let bestD = Infinity;
    for (const n of this.nodes) {
      const dx = (n.x ?? 0) - p.x;
      const dy = (n.y ?? 0) - p.y;
      const d = Math.hypot(dx, dy);
      const hit = this.radius(n) + 4 / this.k;
      if (d <= hit && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  private setHover(node: SimNode | null): void {
    if (node === this.hover) return;
    this.hover = node;
    const gl = this.gl;
    if (node && gl) {
      // lit mask = hovered node + neighbours; + the hovered node's edge buffer
      this.litArray.fill(0);
      const neighbors = this.adjacency.get(node.slug) ?? [];
      const idx = this.slugIndex;
      this.litArray[idx.get(node.slug)!] = 1;
      const arr = new Uint16Array(neighbors.length * 2);
      neighbors.forEach((nb, i) => {
        arr[i * 2] = idx.get(node.slug)!;
        arr[i * 2 + 1] = idx.get(nb.slug)!;
        this.litArray[idx.get(nb.slug)!] = 1;
      });
      this.hoverEdgeCount = neighbors.length;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.hoverEdgeIndexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
      this.uploadLit();
    } else {
      this.hoverEdgeCount = 0;
      // keep the old lit mask; it's irrelevant once dim animates back to 0
    }
    this.dimTarget = node ? 1 : 0;
    this.animateDim();
  }

  // Ease the hover dim factor (0..1) toward its target, repainting each frame,
  // so the highlight/fade is smooth instead of snapping.
  private animateDim(): void {
    if (this.dimRaf) {
      return;
    }
    const step = () => {
      const diff = this.dimTarget - this.dim;
      this.dim += diff * 0.09;
      if (Math.abs(diff) < 0.01) {
        this.dim = this.dimTarget;
        this.dimRaf = 0;
        this.render();
        return;
      }
      this.render();
      this.dimRaf = requestAnimationFrame(step);
    };
    this.dimRaf = requestAnimationFrame(step);
  }

  private attachEvents(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // synthetic events have no active pointer — non-fatal
      }
      this.canvasRect = canvas.getBoundingClientRect();
      this.pointerStart = { x: e.clientX, y: e.clientY };
      this.moved = 0;
      const node = this.nodeAt(e.clientX, e.clientY);
      if (node) {
        // Whole-graph physics: pin the dragged node and reheat the simulation so
        // the rest of the graph reacts with springs.
        this.dragNode = node;
        node.fx = node.x;
        node.fy = node.y;
        this.sim?.alphaTarget(0.3).restart();
      } else {
        this.panning = true;
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      if (this.dragNode) {
        this.autoFit = false;
        const p = this.toSim(e.clientX, e.clientY);
        this.dragNode.fx = p.x;
        this.dragNode.fy = p.y;
        this.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
        this.requestDraw();
      } else if (this.panning) {
        this.autoFit = false;
        this.tx += e.movementX;
        this.ty += e.movementY;
        this.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
        this.requestDraw();
      } else {
        const node = this.nodeAt(e.clientX, e.clientY);
        if (node !== this.hover) {
          canvas.style.cursor = node ? 'pointer' : 'grab';
          this.setHover(node);
        }
      }
    });

    const end = (e: PointerEvent) => {
      const wasClick =
        this.moved < 4 &&
        Math.hypot(e.clientX - this.pointerStart.x, e.clientY - this.pointerStart.y) < 4;
      if (this.dragNode) {
        this.dragNode.fx = null;
        this.dragNode.fy = null;
        // .restart() (symmetric with the pin path) guarantees the timer keeps
        // ticking so the released node + neighbours relax smoothly to rest,
        // instead of freezing if the simulation had already cooled. Fresh hold
        // budget: the layout the drag disturbed gets time to live again.
        this.holdTicks = 0;
        this.sim?.alphaTarget(0).restart();
        if (wasClick) {
          void this.router.navigateByUrl('/' + this.dragNode.slug);
        }
        this.dragNode = null;
      }
      this.panning = false;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.autoFit = false;
        const rect = this.canvasRect ?? canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const factor = Math.exp(-e.deltaY * 0.001);
        const nk = Math.max(0.05, Math.min(8, this.k * factor));
        this.tx = px - ((px - this.tx) * nk) / this.k;
        this.ty = py - ((py - this.ty) * nk) / this.k;
        this.k = nk;
        this.requestDraw();
      },
      { passive: false },
    );
  }
}
