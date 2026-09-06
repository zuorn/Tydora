import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import type { GraphData } from '@shared/content-model';
import { GraphCanvas } from './graph-canvas';

/**
 * Near-fullscreen modal hosting a GraphCanvas. Opened from the note's local
 * graph (local or global mode). Enter/leave is a one-shot CSS transition on
 * opacity/transform only — no continuous repaint.
 */
@Component({
  selector: 'app-graph-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GraphCanvas],
  template: `
    <div class="graph-overlay" [class.visible]="visible()" (click)="requestClose()">
      <div
        #panel
        class="graph-panel"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        (click)="$event.stopPropagation()"
      >
        <header class="graph-panel-head">
          <h2 class="graph-panel-title">{{ title() }}</h2>
          <button
            type="button"
            class="graph-panel-close"
            aria-label="Close graph"
            (click)="requestClose()"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div class="graph-panel-body">
          <app-graph-canvas
            [data]="data()"
            [activeSlug]="activeSlug()"
            [alwaysLabels]="alwaysLabels()"
            [maxZoom]="maxZoom()"
          />
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: contents;
      }
      .graph-overlay {
        position: fixed;
        inset: 0;
        z-index: 200;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.5);
        opacity: 0;
        transition: opacity 180ms ease;
      }
      .graph-overlay.visible {
        opacity: 1;
      }
      .graph-panel {
        display: flex;
        flex-direction: column;
        outline: none;
        width: min(1200px, 94vw);
        height: 90vh;
        background: var(--global--background-primary);
        border: 1px solid var(--global--background-modifier-border);
        border-radius: 12px;
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.35);
        overflow: hidden;
        opacity: 0;
        transform: translateY(12px);
        transition:
          opacity 180ms ease,
          transform 180ms ease;
      }
      .graph-overlay.visible .graph-panel {
        opacity: 1;
        transform: none;
      }
      .graph-panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex: 0 0 auto;
        padding: 12px 16px;
        border-bottom: 1px solid var(--global--background-modifier-border);
      }
      .graph-panel-title {
        margin: 0;
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--global--text-normal);
      }
      .graph-panel-close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        padding: 0;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--global--text-muted);
        cursor: pointer;
        transition: background 120ms ease, color 120ms ease;
      }
      .graph-panel-close:hover {
        background: var(--global--background-modifier-hover);
        color: var(--global--text-normal);
      }
      .graph-panel-close:focus-visible {
        outline: 2px solid var(--global--interactive-accent);
        outline-offset: 2px;
      }
      .graph-panel-body {
        flex: 1 1 auto;
        min-height: 0;
      }
      .graph-panel-body app-graph-canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
    `,
  ],
})
export class GraphOverlay {
  readonly data = input.required<GraphData>();
  readonly activeSlug = input<string | null>(null);
  readonly title = input('Graph');
  readonly alwaysLabels = input(false);
  readonly maxZoom = input(1);
  readonly close = output<void>();

  protected readonly visible = signal(false);
  private closing = false;
  private closeTimer?: ReturnType<typeof setTimeout>;
  private readonly router = inject(Router);
  private readonly panel = viewChild<ElementRef<HTMLDivElement>>('panel');

  constructor() {
    // Mount hidden, then flip to visible so the CSS transition plays in. Move
    // focus into the dialog (the panel, not a button — avoids a stray ring).
    afterNextRender(() => {
      this.visible.set(true);
      this.panel()?.nativeElement.focus();
    });

    // Clicking a node navigates — close so the reader lands on the note.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.requestClose());

    // The deferred emit must not fire after this overlay is torn down (e.g. the
    // note view is recreated by the navigation that triggered the close).
    inject(DestroyRef).onDestroy(() => clearTimeout(this.closeTimer));
  }

  protected requestClose(): void {
    if (this.closing) {
      return;
    }
    this.closing = true;
    this.visible.set(false);
    this.closeTimer = setTimeout(() => this.close.emit(), 180);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.requestClose();
  }
}
