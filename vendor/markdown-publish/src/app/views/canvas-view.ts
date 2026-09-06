import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  PLATFORM_ID,
  resource,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgDrawFlowComponent, type DfDataModel } from '@ng-draw-flow/core';
import { ContentService } from '../content/content.service';
import { toDrawFlowModel } from '../canvas/canvas-mapper';
import { CanvasZoom } from '../canvas/canvas-zoom';
import type { MpResizeStart } from '../canvas/connectors';

const FIT_PADDING = 0.9;

/** Stable reference so the effect's repeated addEventListener dedupes. */
const preventNativeDrag = (event: Event): void => event.preventDefault();

/** ng-draw-flow starts a node drag on pointerdown from ANY mouse button, so a
 *  middle-click "picked up" the note. This runs in the capture phase on the
 *  board root — before the library's node-level listener — and kills the event
 *  for non-primary buttons over a node. The background is untouched, so pan
 *  behaves as before. */
const onlyPrimaryNodeDrag = (event: Event): void => {
  const e = event as PointerEvent;
  if (e.button !== 0 && (e.target as Element).closest('[data-draw-flow-node]')) {
    e.stopPropagation();
  }
};
const MIN_ZOOM = 0.06;
const MAX_ZOOM = 3;

@Component({
  selector: 'app-canvas-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDrawFlowComponent, ReactiveFormsModule],
  template: `
    @if (isBrowser && model()) {
      <!-- ng-draw-flow's (scale) emits the live zoom as an integer percent
           (50 = 0.5x); /100 back to a factor and feed the shared signal so cards
           pick their level of detail reactively (no polling / getComputedStyle). -->
      <ng-draw-flow class="canvas" [formControl]="ctrl" (scale)="zoom.scale.set($event / 100)" />
    } @else if (canvas.error()) {
      <p class="canvas-error">Could not load this canvas.</p>
    }
  `,
  styles: [
    `
      :host {
        display: contents;
      }

      .canvas,
      .canvas-error {
        grid-column: 1 / -1;
      }

      .canvas {
        display: block;
        width: 100%;
        height: 100%;
        /* fill the viewport: a board is a workspace, not an article */
        min-height: calc(100dvh - 16px);
        background-color: var(--global--background-primary);
        background-image: radial-gradient(
          var(--global--background-modifier-border) 1.1px,
          transparent 1.1px
        );
        background-size: 22px 22px;
        --df-pan-zoom-viewport-background: transparent;
        --df-pan-zoom-workspace-background: transparent;
        --df-pan-zoom-grid-color: transparent;
        --df-pan-zoom-border-color: transparent;
        --df-node-background: transparent;
        --df-node-padding: 0;
        --df-node-border: none;
        --df-node-border-radius: 0.5rem;
        --df-node-box-shadow: none;
        /* no selection halo: it drew a detached rectangle around the wrapper
           ("непонятная тень") and means nothing on a published board */
        --df-node-box-shadow-selected: none;
      }
    `,
  ],
})
export class CanvasView {
  readonly slug = input.required<string>();

  private readonly content = inject(ContentService);
  /** Shared board zoom; the template binds ng-draw-flow's (scale) output to it. */
  protected readonly zoom = inject(CanvasZoom);
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly flow = viewChild(NgDrawFlowComponent);
  private readonly flowEl = viewChild(NgDrawFlowComponent, { read: ElementRef });

  protected readonly ctrl = new FormControl<DfDataModel>(
    { nodes: [], connections: [] },
    { nonNullable: true },
  );

  protected readonly canvas = resource({
    params: () => this.slug(),
    loader: ({ params }) => this.content.loadCanvas(params),
  });

  protected readonly model = computed(() => {
    const data = this.canvas.value();
    return data ? toDrawFlowModel(data) : null;
  });

  private resizeObserver?: ResizeObserver;

  /** Active node-resize gesture (started by a grip's mp-resize-start event). */
  private resizeGesture: {
    id: string;
    axis: 'x' | 'y' | 'both';
    startX: number;
    startY: number;
    scale: number;
    startW: number;
    startH: number;
    startCX: number;
    startCY: number;
  } | null = null;

  private resizeRaf = 0;

  /** Commit the gesture's current size into the form model — at most once per
   *  animation frame (each setValue makes ng-draw-flow deep-clone its store
   *  twice, and high-polling mice fire pointermove well above 60Hz).
   *  Absolute values derived from the gesture start (idempotent — no
   *  accumulation drift). The node position is its CENTRE, so shifting it by
   *  half the growth keeps the top/left edge anchored (normal app resize). */
  private onResizeMove(event: PointerEvent): void {
    const g = this.resizeGesture;
    if (!g) {
      return;
    }
    this.resizeLastX = event.clientX;
    this.resizeLastY = event.clientY;
    if (this.resizeRaf) {
      return;
    }
    this.resizeRaf = requestAnimationFrame(() => {
      this.resizeRaf = 0;
      this.commitResize();
    });
  }

  private resizeLastX = 0;
  private resizeLastY = 0;

  private commitResize(): void {
    const g = this.resizeGesture;
    if (!g) {
      return;
    }
    const w =
      g.axis === 'y'
        ? g.startW
        : Math.max(80, g.startW + (this.resizeLastX - g.startX) / g.scale);
    const h =
      g.axis === 'x'
        ? g.startH
        : Math.max(40, g.startH + (this.resizeLastY - g.startY) / g.scale);
    const value = this.ctrl.value;
    this.ctrl.setValue({
      ...value,
      nodes: value.nodes.map((n) =>
        n.id === g.id && 'position' in n
          ? {
              ...n,
              position: {
                x: g.startCX + (w - g.startW) / 2,
                y: g.startCY + (h - g.startH) / 2,
              },
              data: { ...n.data, width: w, height: h },
            }
          : n,
      ),
    });
  }

  constructor() {
    effect(() => {
      const model = this.model();
      if (model) {
        this.ctrl.setValue(model);
      }
    });

    if (this.isBrowser) {
      effect(() => {
        // Re-observe whenever the element appears or the canvas changes, so the
        // ResizeObserver delivers a fresh (post-layout) callback to re-fit.
        this.canvas.value();
        const el = this.flowEl()?.nativeElement as HTMLElement | undefined;
        this.resizeObserver?.disconnect();
        if (el) {
          this.resizeObserver = new ResizeObserver(() => this.fit());
          this.resizeObserver.observe(el);
          // Links (<a>) and images are natively draggable: the browser starts
          // its own HTML drag-and-drop, fires pointercancel and starves the
          // node drag of pointermoves — the link-card "lets go" mid-drag.
          // Killing dragstart inside the board disables native DnD for every
          // node (anchors, favicons, content images) in one place.
          // (addEventListener dedupes the same fn, so re-runs are safe.)
          el.addEventListener('dragstart', preventNativeDrag);
          el.addEventListener('pointerdown', onlyPrimaryNodeDrag, true);
        }
      });

      // Safety net: ng-draw-flow ends a node drag on a document `pointerup`. If
      // that release is missed (e.g. the mouse is released outside the window),
      // it keeps dragging on button-less moves — the node "sticks" to the
      // cursor until the next click. When we see a move with no buttons pressed
      // after a press, synthesize the pointerup so the drag ends cleanly.
      let pointerDown = false;
      const onDocDown = () => (pointerDown = true);
      const onDocUp = () => {
        pointerDown = false;
        this.resizeGesture = null;
      };
      const onDocMove = (event: PointerEvent) => {
        if (pointerDown && event.buttons === 0) {
          pointerDown = false;
          this.resizeGesture = null;
          document.dispatchEvent(
            new PointerEvent('pointerup', { pointerId: event.pointerId, bubbles: true }),
          );
          return;
        }
        this.onResizeMove(event);
      };
      // Node resize: each node's grip emits mp-resize-start (see CanvasNodeBase).
      // The gesture is owned HERE because this component owns the form model:
      // committing width/height + a re-centred position into the model keeps the
      // Angular host bindings, ng-draw-flow's wrapper geometry and the
      // connections in sync — no inline-style hacks for them to fight over.
      const onResizeStart = (event: Event) => {
        const d = (event as CustomEvent<MpResizeStart>).detail;
        const node = this.ctrl.value.nodes.find((n) => n.id === d.nodeId);
        // Our mapper always emits positioned nodes; the `in` check narrows the
        // DfDataInitialNode | DfDataNode union.
        if (!node || !('position' in node)) {
          return;
        }
        this.resizeGesture = {
          id: d.nodeId,
          axis: d.axis,
          startX: d.clientX,
          startY: d.clientY,
          scale: d.scale || 1,
          startW: d.width,
          startH: d.height,
          startCX: node.position.x,
          startCY: node.position.y,
        };
      };
      document.addEventListener('mp-resize-start', onResizeStart);
      document.addEventListener('pointerdown', onDocDown, true);
      document.addEventListener('pointerup', onDocUp, true);
      document.addEventListener('pointermove', onDocMove, true);

      inject(DestroyRef).onDestroy(() => {
        this.resizeObserver?.disconnect();
        document.removeEventListener('mp-resize-start', onResizeStart);
        document.removeEventListener('pointerdown', onDocDown, true);
        document.removeEventListener('pointerup', onDocUp, true);
        document.removeEventListener('pointermove', onDocMove, true);
      });
    }
  }

  private fit(): void {
    const flow = this.flow();
    const el = this.flowEl()?.nativeElement as HTMLElement | undefined;
    const bounds = this.canvas.value()?.bounds;
    if (!flow || !el || !bounds) {
      return;
    }
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const cw = bounds.maxX - bounds.minX;
    const ch = bounds.maxY - bounds.minY;
    if (vw <= 0 || vh <= 0 || cw <= 0 || ch <= 0) {
      return;
    }
    const zoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, Math.min(vw / cw, vh / ch) * FIT_PADDING),
    );
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    // setPosition emits ng-draw-flow's (scale) output, which updates the shared
    // zoom signal; set it here too so the very first paint already has it.
    this.zoom.scale.set(zoom);
    flow.setPosition({ x: -cx * zoom, y: -cy * zoom, zoom });
  }
}
