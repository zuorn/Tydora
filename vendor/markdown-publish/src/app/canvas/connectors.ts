import { Directive, ElementRef, HostListener, inject } from '@angular/core';
import {
  DfConnectorPosition,
  DfInputComponent,
  DfOutputComponent,
  DrawFlowBaseNode,
} from '@ng-draw-flow/core';

export const CONNECTOR_IMPORTS = [DfInputComponent, DfOutputComponent] as const;

// Connectors MUST live in each node's own view (not a child component):
// DrawFlowBaseNode collects them via viewChildren(), which does not descend
// into nested component views. Composed into each node template as a string.
export const CONNECTORS_TEMPLATE = `
    @for (side of sides; track side) {
      <df-output
        [connectorData]="{ nodeId: nodeId, connectorId: 'out-' + side, single: false }"
        [position]="side"
        [class]="'df-conn df-conn-' + side"
      />
      <df-input
        [connectorData]="{ nodeId: nodeId, connectorId: 'in-' + side, single: false }"
        [position]="side"
        [class]="'df-conn df-conn-' + side"
      />
    }
    <span class="df-resize df-resize-r" (pointerdown)="onResizeStart($event, 'x')"></span>
    <span class="df-resize df-resize-b" (pointerdown)="onResizeStart($event, 'y')"></span>
    <span class="df-resize df-resize-c" (pointerdown)="onResizeStart($event, 'both')"></span>
`;

export const CONNECTORS_STYLES = `
  .df-conn {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .df-conn-top { top: 0; left: 50%; }
  .df-conn-bottom { bottom: 0; left: 50%; }
  .df-conn-left { left: 0; top: 50%; }
  .df-conn-right { right: 0; top: 50%; }

  .df-resize {
    position: absolute;
    pointer-events: auto;
    z-index: 3;
  }
  .df-resize-r { top: 0; right: 0; width: 6px; height: 100%; cursor: ew-resize; }
  .df-resize-b { left: 0; bottom: 0; height: 6px; width: 100%; cursor: ns-resize; }
  .df-resize-c {
    right: 0;
    bottom: 0;
    width: 14px;
    height: 14px;
    cursor: nwse-resize;
    z-index: 4;
  }
  .df-resize-c::after {
    content: '';
    position: absolute;
    right: 3px;
    bottom: 3px;
    width: 7px;
    height: 7px;
    border-right: 2px solid var(--global--text-faint);
    border-bottom: 2px solid var(--global--text-faint);
    opacity: 0.7;
  }
`;

@Directive()
export abstract class CanvasNodeBase extends DrawFlowBaseNode {
  protected readonly sides: readonly DfConnectorPosition[] = [
    DfConnectorPosition.Top,
    DfConnectorPosition.Right,
    DfConnectorPosition.Bottom,
    DfConnectorPosition.Left,
  ];

  private pointerDownX = 0;
  private pointerDownY = 0;

  @HostListener('pointerdown', ['$event'])
  protected capturePointerDown(event: PointerEvent): void {
    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
  }

  /** A node drag ends with a click event; treat any click that moved the
   *  pointer >4px as a drag, so dragging a node doesn't open/navigate it. */
  protected wasDragged(event: MouseEvent): boolean {
    return (
      Math.hypot(event.clientX - this.pointerDownX, event.clientY - this.pointerDownY) > 4
    );
  }

  // ---- node resize (edge + corner grips) ----
  // The grip only ANNOUNCES the gesture. Writing width/height/transform to the
  // DOM here fights two other owners of the same styles — the host bindings
  // ([style.width.px]="node().width", re-applied from the model on every CD)
  // and ng-draw-flow's centre-based wrapper geometry — which is exactly what
  // caused sizes snapping back and the misaligned selection "shadow".
  // CanvasView owns the form model, so it owns the gesture and commits
  // width/height + a re-centred position into the model (single source of truth).
  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);

  protected onResizeStart(event: PointerEvent, axis: 'x' | 'y' | 'both'): void {
    // Don't let ng-draw-flow start a node-drag from the grip.
    event.stopPropagation();
    event.preventDefault();
    const el = this.hostEl.nativeElement;
    const d = this.modelSignal() as unknown as { width: number; height: number };
    // Canvas is pan/zoomed: screen px per local px.
    const scale = el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1;
    el.dispatchEvent(
      new CustomEvent<MpResizeStart>('mp-resize-start', {
        bubbles: true,
        detail: {
          nodeId: this.nodeId,
          axis,
          clientX: event.clientX,
          clientY: event.clientY,
          width: d.width,
          height: d.height,
          scale,
        },
      }),
    );
  }
}

/** Detail of the resize-gesture start event emitted by a node's grip. */
export interface MpResizeStart {
  nodeId: string;
  axis: 'x' | 'y' | 'both';
  clientX: number;
  clientY: number;
  width: number;
  height: number;
  scale: number;
}
