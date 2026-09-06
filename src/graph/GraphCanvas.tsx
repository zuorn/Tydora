import { useEffect, useRef } from "react";
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
} from "d3-force";
import "./GraphCanvas.css";

/**
 * Graph data model — mirrors @abstractwebunit/markdown-publish's
 * shared/content-model graph shape so the forked site and the in-app graph
 * share one representation.
 */
export interface GraphNode {
  slug: string;
  title: string;
  degree: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

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

export interface GraphCanvasProps {
  data: GraphData;
  /** Currently-open note slug (rendered as the focused/accent node). */
  activeSlug?: string | null;
  /** Always draw labels regardless of zoom (used by the small local graph). */
  alwaysLabels?: boolean;
  /** Upper bound for the initial fit zoom. */
  maxZoom?: number;
  /** Called when a node is clicked. */
  onNodeClick?: (slug: string) => void;
}

// ── Shaders ───────────────────────────────────────────────────────────

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
  outColor = vec4(v_color.rgb * a, a);
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
void main() { outColor = vec4(u_color.rgb * u_color.a, u_color.a); }`;

interface GraphEngine {
  build: () => void;
  refreshColors: () => void;
}

export function GraphCanvas({
  data,
  activeSlug = null,
  alwaysLabels = false,
  maxZoom = 1,
  onNodeClick,
}: GraphCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const labelCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GraphEngine | null>(null);

  // Keep latest props in refs so the imperative GL engine can read them.
  const propsRef = useRef({ data, activeSlug, alwaysLabels, maxZoom, onNodeClick });
  propsRef.current = { data, activeSlug, alwaysLabels, maxZoom, onNodeClick };

  // Initialise the WebGL engine once.
  useEffect(() => {
    const host = hostRef.current;
    const glCanvas = glCanvasRef.current;
    const labelCanvas = labelCanvasRef.current;
    if (!host || !glCanvas || !labelCanvas) return;

    // Capture non-null references so nested closures keep the narrowed type.
    const hostEl: HTMLDivElement = host;
    const glEl: HTMLCanvasElement = glCanvas;
    const labelEl: HTMLCanvasElement = labelCanvas;

    const gl = glEl.getContext("webgl2", {
      antialias: true,
      premultipliedAlpha: true,
    });
    if (!gl) {
      console.warn("WebGL2 unavailable — graph not rendered");
      return;
    }
    const gl2: WebGL2RenderingContext = gl;
    const lctx = labelEl.getContext("2d")!;
    const parseCtx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;

    let dpr = 1;
    let cssWidth = 0;
    let cssHeight = 0;
    let font = "sans-serif";
    let rafId = 0;
    let canvasRect: DOMRect | null = null;
    let scrollHandler: (() => void) | undefined;

    let nodeProgram: WebGLProgram | null = null;
    let edgeProgram: WebGLProgram | null = null;
    const nodeUniforms: Record<string, WebGLUniformLocation | null> = {};
    const edgeUniforms: Record<string, WebGLUniformLocation | null> = {};
    let posBuffer: WebGLBuffer | null = null;
    let radiusBuffer: WebGLBuffer | null = null;
    let colorBuffer: WebGLBuffer | null = null;
    let litBuffer: WebGLBuffer | null = null;
    let edgeIndexBuffer: WebGLBuffer | null = null;
    let hoverEdgeIndexBuffer: WebGLBuffer | null = null;
    let hoverPosBuffer: WebGLBuffer | null = null;
    let nodeVao: WebGLVertexArrayObject | null = null;
    let edgeVao: WebGLVertexArrayObject | null = null;
    let hoverEdgeVao: WebGLVertexArrayObject | null = null;
    let hoverNodeVao: WebGLVertexArrayObject | null = null;
    let posArray = new Float32Array(0);
    let litArray = new Float32Array(0);
    const hoverPosArr = new Float32Array(2);
    let edgeCount = 0;
    let hoverEdgeCount = 0;

    let sim: Simulation<SimNode, SimLink> | undefined;
    let holdTicks = 0;
    let nodes: SimNode[] = [];
    let links: SimLink[] = [];
    let large = false;
    const adjacency = new Map<string, SimNode[]>();
    const slugIndex = new Map<string, number>();

    let tx = 0;
    let ty = 0;
    let k = 1;
    let autoFit = true;

    let hover: SimNode | null = null;
    let dim = 0;
    let dimTarget = 0;
    let dimRaf = 0;
    const labelAlpha = new Map<SimNode, number>();
    let dragNode: SimNode | null = null;
    let panning = false;
    const pointerStart = { x: 0, y: 0 };
    let moved = 0;

    let colors: Colors = {
      line: [0.83, 0.83, 0.83, 0.45],
      node: [0.36, 0.36, 0.36, 1],
      unresolved: [0.67, 0.67, 0.67, 1],
      focused: [0.54, 0.36, 0.96, 1],
      focusedCss: "#8a5cf5",
      text: "#222222",
    };

    let resizeObserver: ResizeObserver | undefined;

    // ── Helpers ──

    function compile(type: number, src: string): WebGLShader {
      const sh = gl2.createShader(type)!;
      gl2.shaderSource(sh, src);
      gl2.compileShader(sh);
      if (!gl2.getShaderParameter(sh, gl2.COMPILE_STATUS)) {
        console.error("shader compile", gl2.getShaderInfoLog(sh));
      }
      return sh;
    }

    function link(vs: string, fs: string): WebGLProgram {
      const p = gl2.createProgram()!;
      gl2.attachShader(p, compile(gl2.VERTEX_SHADER, vs));
      gl2.attachShader(p, compile(gl2.FRAGMENT_SHADER, fs));
      gl2.linkProgram(p);
      if (!gl2.getProgramParameter(p, gl2.LINK_STATUS)) {
        console.error("program link", gl2.getProgramInfoLog(p));
      }
      return p;
    }

    function initGL(): void {
      nodeProgram = link(NODE_VS, NODE_FS);
      edgeProgram = link(EDGE_VS, EDGE_FS);
      for (const u of ["u_translate", "u_scale", "u_viewport", "u_dpr", "u_dim"]) {
        nodeUniforms[u] = gl2.getUniformLocation(nodeProgram, u);
      }
      for (const u of ["u_translate", "u_scale", "u_viewport", "u_color"]) {
        edgeUniforms[u] = gl2.getUniformLocation(edgeProgram, u);
      }
      posBuffer = gl2.createBuffer();
      radiusBuffer = gl2.createBuffer();
      colorBuffer = gl2.createBuffer();
      litBuffer = gl2.createBuffer();
      edgeIndexBuffer = gl2.createBuffer();
      hoverEdgeIndexBuffer = gl2.createBuffer();
      hoverPosBuffer = gl2.createBuffer();
      gl2.enable(gl2.BLEND);
      gl2.blendFunc(gl2.ONE, gl2.ONE_MINUS_SRC_ALPHA);
    }

    function resize(): void {
      const rect = hostEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      dpr = window.devicePixelRatio || 1;
      cssWidth = rect.width;
      cssHeight = rect.height;
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      glEl.width = w;
      glEl.height = h;
      labelEl.width = w;
      labelEl.height = h;
      canvasRect = glEl.getBoundingClientRect();
      gl2.viewport(0, 0, w, h);
      requestDraw();
    }

    function radius(n: SimNode): number {
      return 4 + Math.min(8, Math.sqrt(n.degree) * 0.85);
    }

    function fitToView(): void {
      if (!nodes.length || cssWidth <= 0) return;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const n of nodes) {
        minX = Math.min(minX, n.x ?? 0);
        minY = Math.min(minY, n.y ?? 0);
        maxX = Math.max(maxX, n.x ?? 0);
        maxY = Math.max(maxY, n.y ?? 0);
      }
      const pad = propsRef.current.alwaysLabels
        ? Math.max(40, Math.min(cssWidth, cssHeight) * 0.2)
        : 70;
      const w = maxX - minX || 1;
      const h = maxY - minY || 1;
      k = Math.max(
        0.05,
        Math.min(propsRef.current.maxZoom, Math.min((cssWidth - pad) / w, (cssHeight - pad) / h)),
      );
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      tx = cssWidth / 2 - cx * k;
      ty = cssHeight / 2 - cy * k;
      requestDraw();
    }

    function toRgba(css: string, alpha: number): RGBA {
      parseCtx.clearRect(0, 0, 1, 1);
      parseCtx.fillStyle = "#000";
      parseCtx.fillStyle = css;
      parseCtx.fillRect(0, 0, 1, 1);
      const d = parseCtx.getImageData(0, 0, 1, 1).data;
      return [d[0] / 255, d[1] / 255, d[2] / 255, alpha];
    }

    function readColors(): void {
      const cs = getComputedStyle(hostEl);
      font = cs.fontFamily || "sans-serif";
      const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
      const lineCss = v("--graph-line", v("--border", "#d4d4d4"));
      const focusedCss = v("--graph-node-focused", v("--accent", "#8a5cf5"));
      colors = {
        line: toRgba(lineCss, 0.45),
        node: toRgba(v("--graph-node", "#5c5c5c"), 1),
        unresolved: toRgba(v("--graph-node-unresolved", "#ababab"), 1),
        focused: toRgba(focusedCss, 1),
        focusedCss,
        text: v("--graph-text", v("--text-primary", "#222222")),
      };
    }

    function requestDraw(): void {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        render();
      });
    }

    function uploadStaticBuffers(edgeIdx: Uint16Array): void {
      const active = propsRef.current.activeSlug;
      const radii = new Float32Array(nodes.length);
      nodes.forEach((n, i) => {
        radii[i] = radius(n) * (n.slug === active ? 1.5 : 1);
      });
      gl2.bindBuffer(gl2.ARRAY_BUFFER, radiusBuffer);
      gl2.bufferData(gl2.ARRAY_BUFFER, radii, gl2.STATIC_DRAW);

      gl2.bindBuffer(gl2.ELEMENT_ARRAY_BUFFER, edgeIndexBuffer);
      gl2.bufferData(gl2.ELEMENT_ARRAY_BUFFER, edgeIdx, gl2.STATIC_DRAW);

      gl2.bindBuffer(gl2.ARRAY_BUFFER, posBuffer);
      gl2.bufferData(gl2.ARRAY_BUFFER, nodes.length * 2 * 4, gl2.DYNAMIC_DRAW);
    }

    function uploadColors(): void {
      const active = propsRef.current.activeSlug;
      const arr = new Float32Array(nodes.length * 4);
      nodes.forEach((n, i) => {
        const c = n.slug === active ? colors.focused : n.degree === 0 ? colors.unresolved : colors.node;
        arr.set(c, i * 4);
      });
      gl2.bindBuffer(gl2.ARRAY_BUFFER, colorBuffer);
      gl2.bufferData(gl2.ARRAY_BUFFER, arr, gl2.STATIC_DRAW);
    }

    function uploadLit(): void {
      gl2.bindBuffer(gl2.ARRAY_BUFFER, litBuffer);
      gl2.bufferData(gl2.ARRAY_BUFFER, litArray, gl2.DYNAMIC_DRAW);
    }

    function uploadPositions(): void {
      const a = posArray;
      for (let i = 0; i < nodes.length; i++) {
        a[i * 2] = nodes[i].x ?? 0;
        a[i * 2 + 1] = nodes[i].y ?? 0;
      }
      gl2.bindBuffer(gl2.ARRAY_BUFFER, posBuffer);
      gl2.bufferSubData(gl2.ARRAY_BUFFER, 0, a);
    }

    function setupVaos(): void {
      const aPosNode = gl2.getAttribLocation(nodeProgram!, "a_pos");
      const aRadius = gl2.getAttribLocation(nodeProgram!, "a_radius");
      const aColor = gl2.getAttribLocation(nodeProgram!, "a_color");
      const aLit = gl2.getAttribLocation(nodeProgram!, "a_lit");
      const aPosEdge = gl2.getAttribLocation(edgeProgram!, "a_pos");

      nodeVao = gl2.createVertexArray();
      gl2.bindVertexArray(nodeVao);
      gl2.bindBuffer(gl2.ARRAY_BUFFER, posBuffer);
      gl2.enableVertexAttribArray(aPosNode);
      gl2.vertexAttribPointer(aPosNode, 2, gl2.FLOAT, false, 0, 0);
      gl2.bindBuffer(gl2.ARRAY_BUFFER, radiusBuffer);
      gl2.enableVertexAttribArray(aRadius);
      gl2.vertexAttribPointer(aRadius, 1, gl2.FLOAT, false, 0, 0);
      gl2.bindBuffer(gl2.ARRAY_BUFFER, colorBuffer);
      gl2.enableVertexAttribArray(aColor);
      gl2.vertexAttribPointer(aColor, 4, gl2.FLOAT, false, 0, 0);
      gl2.bindBuffer(gl2.ARRAY_BUFFER, litBuffer);
      gl2.enableVertexAttribArray(aLit);
      gl2.vertexAttribPointer(aLit, 1, gl2.FLOAT, false, 0, 0);

      edgeVao = gl2.createVertexArray();
      gl2.bindVertexArray(edgeVao);
      gl2.bindBuffer(gl2.ARRAY_BUFFER, posBuffer);
      gl2.enableVertexAttribArray(aPosEdge);
      gl2.vertexAttribPointer(aPosEdge, 2, gl2.FLOAT, false, 0, 0);
      gl2.bindBuffer(gl2.ELEMENT_ARRAY_BUFFER, edgeIndexBuffer);

      hoverEdgeVao = gl2.createVertexArray();
      gl2.bindVertexArray(hoverEdgeVao);
      gl2.bindBuffer(gl2.ARRAY_BUFFER, posBuffer);
      gl2.enableVertexAttribArray(aPosEdge);
      gl2.vertexAttribPointer(aPosEdge, 2, gl2.FLOAT, false, 0, 0);
      gl2.bindBuffer(gl2.ELEMENT_ARRAY_BUFFER, hoverEdgeIndexBuffer);

      hoverNodeVao = gl2.createVertexArray();
      gl2.bindVertexArray(hoverNodeVao);
      gl2.bindBuffer(gl2.ARRAY_BUFFER, hoverPosBuffer);
      gl2.enableVertexAttribArray(aPosNode);
      gl2.vertexAttribPointer(aPosNode, 2, gl2.FLOAT, false, 0, 0);
      gl2.disableVertexAttribArray(aRadius);
      gl2.disableVertexAttribArray(aColor);
      gl2.disableVertexAttribArray(aLit);
      gl2.bindVertexArray(null);
    }

    // ── Build ──

    function build(): void {
      const graph = propsRef.current.data;
      sim?.on("tick", null).on("end", null).stop();

      nodes = graph.nodes.map((n) => ({ ...n }));
      const bySlug = new Map(nodes.map((n) => [n.slug, n]));
      links = graph.links
        .filter((l) => bySlug.has(l.source) && bySlug.has(l.target))
        .map((l) => ({ source: l.source, target: l.target }));

      const index = new Map<string, number>();
      nodes.forEach((n, i) => index.set(n.slug, i));
      slugIndex.clear();
      for (const [s, i] of index) slugIndex.set(s, i);
      adjacency.clear();
      for (const n of nodes) adjacency.set(n.slug, []);
      const edgeIdx = new Uint16Array(links.length * 2);
      links.forEach((l, i) => {
        const s = l.source as string;
        const t = l.target as string;
        edgeIdx[i * 2] = index.get(s)!;
        edgeIdx[i * 2 + 1] = index.get(t)!;
        adjacency.get(s)!.push(bySlug.get(t)!);
        adjacency.get(t)!.push(bySlug.get(s)!);
      });
      edgeCount = links.length;

      for (const n of nodes) {
        n.degree = adjacency.get(n.slug)?.length ?? 0;
      }

      large = nodes.length > 400;
      const baseCharge = large ? -180 : -320;

      const simulation = forceSimulation(nodes)
        .force(
          "link",
          forceLink<SimNode, SimLink>(links)
            .id((d) => d.slug)
            .distance(large ? 30 : 52)
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
          "charge",
          forceManyBody<SimNode>()
            .strength((d) => baseCharge * (0.4 + 1.2 * Math.exp(-(d.degree ?? 0) / 2)))
            .theta(0.9)
            .distanceMax(large ? 1500 : Infinity),
        )
        .force("x", forceX<SimNode>(0).strength((d) => (d.degree === 0 ? 0.22 : 0.06)))
        .force("y", forceY<SimNode>(0).strength((d) => (d.degree === 0 ? 0.22 : 0.06)))
        .velocityDecay(large ? 0.65 : 0.55)
        .alphaDecay(0.0228);

      simulation.force(
        "collide",
        forceCollide<SimNode>().radius((d) => radius(d) + (large ? 10 : 6)),
      );

      const HOLD_MAX = 1800;
      const sample = Math.max(1, Math.floor(nodes.length / 256));
      holdTicks = 0;
      simulation.on("tick", () => {
        if (simulation.alpha() < 0.008 && simulation.alphaTarget() === 0 && holdTicks < HOLD_MAX) {
          let speed = 0;
          let count = 0;
          for (let i = 0; i < nodes.length; i += sample) {
            const n = nodes[i];
            speed += Math.hypot(n.vx ?? 0, n.vy ?? 0);
            count++;
          }
          if (speed / count > 0.2) {
            simulation.alpha(0.008 * (1 - holdTicks / HOLD_MAX));
            holdTicks++;
          }
        }
        uploadPositions();
        if (autoFit) fitToView();
        requestDraw();
      });
      sim = simulation;

      autoFit = true;
      hover = null;
      dim = 0;
      dimTarget = 0;
      posArray = new Float32Array(nodes.length * 2);
      litArray = new Float32Array(nodes.length);
      uploadStaticBuffers(edgeIdx);
      uploadColors();
      uploadLit();
      uploadPositions();
      setupVaos();
      fitToView();
    }

    // ── Render ──

    function render(): void {
      if (!nodes.length) return;
      gl2.clearColor(0, 0, 0, 0);
      gl2.clear(gl2.COLOR_BUFFER_BIT);

      const setEdgeUniforms = (color: RGBA) => {
        gl2.uniform2f(edgeUniforms["u_translate"], tx, ty);
        gl2.uniform1f(edgeUniforms["u_scale"], k);
        gl2.uniform2f(edgeUniforms["u_viewport"], cssWidth, cssHeight);
        gl2.uniform4f(edgeUniforms["u_color"], color[0], color[1], color[2], color[3]);
      };

      const ln = colors.line;
      gl2.useProgram(edgeProgram);
      setEdgeUniforms([ln[0], ln[1], ln[2], ln[3] * (1 - dim * 0.6)]);
      gl2.bindVertexArray(edgeVao);
      gl2.drawElements(gl2.LINES, edgeCount * 2, gl2.UNSIGNED_SHORT, 0);

      if (hoverEdgeCount > 0 && dim > 0.01) {
        const f = colors.focused;
        setEdgeUniforms([f[0], f[1], f[2], 0.85 * dim]);
        gl2.bindVertexArray(hoverEdgeVao);
        gl2.drawElements(gl2.LINES, hoverEdgeCount * 2, gl2.UNSIGNED_SHORT, 0);
      }

      gl2.useProgram(nodeProgram);
      gl2.uniform2f(nodeUniforms["u_translate"], tx, ty);
      gl2.uniform1f(nodeUniforms["u_scale"], k);
      gl2.uniform2f(nodeUniforms["u_viewport"], cssWidth, cssHeight);
      gl2.uniform1f(nodeUniforms["u_dpr"], dpr);
      gl2.uniform1f(nodeUniforms["u_dim"], dim);
      gl2.bindVertexArray(nodeVao);
      gl2.drawArrays(gl2.POINTS, 0, nodes.length);

      if (hover && dim > 0.01) {
        hoverPosArr[0] = hover.x ?? 0;
        hoverPosArr[1] = hover.y ?? 0;
        gl2.bindBuffer(gl2.ARRAY_BUFFER, hoverPosBuffer);
        gl2.bufferData(gl2.ARRAY_BUFFER, hoverPosArr, gl2.DYNAMIC_DRAW);
        const aRadius = gl2.getAttribLocation(nodeProgram!, "a_radius");
        const aColor = gl2.getAttribLocation(nodeProgram!, "a_color");
        const aLit = gl2.getAttribLocation(nodeProgram!, "a_lit");
        const f = colors.focused;
        const r = radius(hover);
        gl2.bindVertexArray(hoverNodeVao);
        gl2.vertexAttrib1f(aLit, 1);
        gl2.vertexAttrib1f(aRadius, r * 2.4);
        gl2.vertexAttrib4f(aColor, f[0], f[1], f[2], 0.22 * dim);
        gl2.drawArrays(gl2.POINTS, 0, 1);
        gl2.vertexAttrib1f(aRadius, r * (1 + 0.4 * dim));
        gl2.vertexAttrib4f(aColor, f[0], f[1], f[2], 1);
        gl2.drawArrays(gl2.POINTS, 0, 1);
      }
      gl2.bindVertexArray(null);

      drawLabels();
    }

    function drawLabels(): void {
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, cssWidth, cssHeight);

      const active = propsRef.current.activeSlug;
      const hl = hover;
      lctx.font = `12px ${font}`;
      lctx.textAlign = "center";
      lctx.textBaseline = "top";

      const T = propsRef.current.alwaysLabels ? 3 : 6;
      const FADE = 4;

      const cands: { n: SimNode; focused: boolean; screenR: number; sx: number; sy: number }[] = [];
      for (const n of nodes) {
        const focused = n === hl || n.slug === active;
        const screenR = radius(n) * (n === hl ? 1.4 : n.slug === active ? 1.5 : 1) * k;
        if (!focused && screenR <= T) continue;
        const sx = (n.x ?? 0) * k + tx;
        const sy = (n.y ?? 0) * k + ty;
        if (sx < -120 || sx > cssWidth + 120 || sy < -30 || sy > cssHeight + 40) continue;
        cands.push({ n, focused, screenR, sx, sy });
      }
      cands.sort((a, b) => (b.focused ? 1 : 0) - (a.focused ? 1 : 0) || b.screenR - a.screenR);

      const placed: number[] = [];
      const LH = 15;
      const EASE = 0.16;
      const seen = new Set<SimNode>();
      let animating = false;
      for (const c of cands) {
        const label = c.n.title.length > 24 ? c.n.title.slice(0, 23) + "…" : c.n.title;
        const w = lctx.measureText(label).width;
        const lx = Math.round(c.sx);
        const ly = Math.round(c.sy + c.screenR + 3);
        const x0 = lx - w / 2 - 3;
        const x1 = lx + w / 2 + 3;
        const y0 = ly - 1;
        const y1 = ly + LH;
        let overlap = false;
        for (let i = 0; i < placed.length; i += 4) {
          if (x0 < placed[i + 2] && x1 > placed[i] && y0 < placed[i + 3] && y1 > placed[i + 1]) {
            overlap = true;
            break;
          }
        }
        const won = c.focused || !overlap;
        if (won) placed.push(x0, y0, x1, y1);
        seen.add(c.n);
        const target = won ? 1 : 0;
        const prev = labelAlpha.get(c.n) ?? 0;
        let a = prev + (target - prev) * EASE;
        if (Math.abs(target - a) > 0.005) animating = true;
        else a = target;
        labelAlpha.set(c.n, a);
        if (a <= 0.01) continue;
        const lit = c.focused || litArray[slugIndex.get(c.n.slug)!] > 0;
        const baseA = c.focused ? 1 : Math.min(1, (c.screenR - T) / FADE);
        lctx.globalAlpha = a * baseA * (lit ? 1 : 1 - dim * 0.6);
        lctx.fillStyle = c.focused ? colors.focusedCss : colors.text;
        lctx.fillText(label, lx, ly);
      }
      lctx.globalAlpha = 1;

      if (labelAlpha.size > seen.size) {
        for (const n of Array.from(labelAlpha.keys())) {
          if (!seen.has(n)) labelAlpha.delete(n);
        }
      }

      if (animating) requestDraw();
    }

    // ── Interaction ──

    function toSim(clientX: number, clientY: number): { x: number; y: number } {
      const rect = canvasRect ?? glEl.getBoundingClientRect();
      return {
        x: (clientX - rect.left - tx) / k,
        y: (clientY - rect.top - ty) / k,
      };
    }

    function nodeAt(clientX: number, clientY: number): SimNode | null {
      const p = toSim(clientX, clientY);
      let best: SimNode | null = null;
      let bestD = Infinity;
      for (const n of nodes) {
        const dx = (n.x ?? 0) - p.x;
        const dy = (n.y ?? 0) - p.y;
        const d = Math.hypot(dx, dy);
        const hit = radius(n) + 4 / k;
        if (d <= hit && d < bestD) {
          best = n;
          bestD = d;
        }
      }
      return best;
    }

    function setHover(node: SimNode | null): void {
      if (node === hover) return;
      hover = node;
      if (node) {
        litArray.fill(0);
        const neighbors = adjacency.get(node.slug) ?? [];
        const idx = slugIndex;
        litArray[idx.get(node.slug)!] = 1;
        const arr = new Uint16Array(neighbors.length * 2);
        neighbors.forEach((nb, i) => {
          arr[i * 2] = idx.get(node.slug)!;
          arr[i * 2 + 1] = idx.get(nb.slug)!;
          litArray[idx.get(nb.slug)!] = 1;
        });
        hoverEdgeCount = neighbors.length;
        gl2.bindBuffer(gl2.ELEMENT_ARRAY_BUFFER, hoverEdgeIndexBuffer);
        gl2.bufferData(gl2.ELEMENT_ARRAY_BUFFER, arr, gl2.DYNAMIC_DRAW);
        uploadLit();
      } else {
        hoverEdgeCount = 0;
      }
      dimTarget = node ? 1 : 0;
      animateDim();
    }

    function animateDim(): void {
      if (dimRaf) return;
      const step = () => {
        const diff = dimTarget - dim;
        dim += diff * 0.09;
        if (Math.abs(diff) < 0.01) {
          dim = dimTarget;
          dimRaf = 0;
          render();
          return;
        }
        render();
        dimRaf = requestAnimationFrame(step);
      };
      dimRaf = requestAnimationFrame(step);
    }

    function attachEvents(): void {
      glEl.addEventListener("pointerdown", (e) => {
        try {
          glEl.setPointerCapture(e.pointerId);
        } catch {
          // synthetic events have no active pointer
        }
        canvasRect = glEl.getBoundingClientRect();
        pointerStart.x = e.clientX;
        pointerStart.y = e.clientY;
        moved = 0;
        const node = nodeAt(e.clientX, e.clientY);
        if (node) {
          dragNode = node;
          node.fx = node.x;
          node.fy = node.y;
          sim?.alphaTarget(0.3).restart();
        } else {
          panning = true;
        }
      });

      glEl.addEventListener("pointermove", (e) => {
        if (dragNode) {
          autoFit = false;
          const p = toSim(e.clientX, e.clientY);
          dragNode.fx = p.x;
          dragNode.fy = p.y;
          moved += Math.abs(e.movementX) + Math.abs(e.movementY);
          requestDraw();
        } else if (panning) {
          autoFit = false;
          tx += e.movementX;
          ty += e.movementY;
          moved += Math.abs(e.movementX) + Math.abs(e.movementY);
          requestDraw();
        } else {
          const node = nodeAt(e.clientX, e.clientY);
          if (node !== hover) {
            glEl.style.cursor = node ? "pointer" : "grab";
            setHover(node);
          }
        }
      });

      const end = (e: PointerEvent) => {
        const wasClick =
          moved < 4 &&
          Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) < 4;
        if (dragNode) {
          dragNode.fx = null;
          dragNode.fy = null;
          holdTicks = 0;
          sim?.alphaTarget(0).restart();
          if (wasClick) {
            propsRef.current.onNodeClick?.(dragNode.slug);
          }
          dragNode = null;
        }
        panning = false;
      };
      glEl.addEventListener("pointerup", end);
      glEl.addEventListener("pointercancel", end);

      glEl.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          autoFit = false;
          const rect = canvasRect ?? glEl.getBoundingClientRect();
          const px = e.clientX - rect.left;
          const py = e.clientY - rect.top;
          const factor = Math.exp(-e.deltaY * 0.001);
          const nk = Math.max(0.05, Math.min(8, k * factor));
          tx = px - ((px - tx) * nk) / k;
          ty = py - ((py - ty) * nk) / k;
          k = nk;
          requestDraw();
        },
        { passive: false },
      );
    }

    // ── Init ──

    initGL();
    attachEvents();
    scrollHandler = () => {
      canvasRect = glEl.getBoundingClientRect();
    };
    window.addEventListener("scroll", scrollHandler, { capture: true, passive: true });
    resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(host);
    resize();
    readColors();
    build();

    // Expose engine methods for prop changes.
    engineRef.current = {
      build,
      refreshColors: () => {
        readColors();
        uploadColors();
        requestDraw();
      },
    };

    // ── Cleanup ──
    return () => {
      engineRef.current = null;
      sim?.on("tick", null).on("end", null).stop();
      resizeObserver?.disconnect();
      if (scrollHandler) window.removeEventListener("scroll", scrollHandler, { capture: true });
      if (rafId) cancelAnimationFrame(rafId);
      if (dimRaf) cancelAnimationFrame(dimRaf);
    };
  }, []);

  // Rebuild when data changes.
  useEffect(() => {
    engineRef.current?.build();
  }, [data]);

  // Re-read colors + active node when theme or active note changes.
  useEffect(() => {
    engineRef.current?.refreshColors();
  }, [activeSlug]);

  return (
    <div ref={hostRef} className="graph-canvas-host">
      <canvas ref={glCanvasRef} className="graph-gl" />
      <canvas ref={labelCanvasRef} className="graph-labels" />
    </div>
  );
}
