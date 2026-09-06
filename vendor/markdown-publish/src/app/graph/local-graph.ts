import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  PLATFORM_ID,
  resource,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { GraphData } from '@shared/content-model';
import { ContentService } from '../content/content.service';
import { GraphCanvas } from './graph-canvas';
import { GraphOverlay } from './graph-overlay';

@Component({
  selector: 'app-local-graph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GraphCanvas, GraphOverlay],
  template: `
    @if (isBrowser && isDesktop() && sub(); as g) {
      @if (g.nodes.length > 0) {
        <section class="local-graph">
          <div class="local-graph-header">
            <h2 class="local-graph-title">Graph</h2>
            <div class="local-graph-actions">
              <button
                type="button"
                class="local-graph-btn"
                aria-label="Expand local graph"
                title="Expand local graph"
                (click)="overlay.set('local')"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
              <button
                type="button"
                class="local-graph-btn"
                aria-label="Open global graph"
                title="Open global graph"
                (click)="overlay.set('global')"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="12" cy="18" r="3" />
                  <circle cx="6" cy="6" r="3" />
                  <circle cx="18" cy="6" r="3" />
                  <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9" />
                  <path d="M12 12v3" />
                </svg>
              </button>
            </div>
          </div>
          @if (overlay() === null) {
            <div class="local-graph-canvas">
              <app-graph-canvas
                [data]="g"
                [activeSlug]="slug()"
                [alwaysLabels]="true"
                [maxZoom]="1.6"
              />
            </div>
          }
        </section>
      }
    }

    @if (overlay() === 'local' && sub(); as g) {
      <app-graph-overlay
        [data]="g"
        [activeSlug]="slug()"
        [alwaysLabels]="true"
        [maxZoom]="1.8"
        title="Local graph"
        (close)="overlay.set(null)"
      />
    }
    @if (overlay() === 'global' && full.value(); as g) {
      <app-graph-overlay
        [data]="g"
        [activeSlug]="slug()"
        [maxZoom]="1.6"
        title="Graph"
        (close)="overlay.set(null)"
      />
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .local-graph-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.5rem;
      }
      .local-graph-title {
        margin: 0;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--global--text-faint);
      }
      .local-graph-actions {
        display: flex;
        gap: 2px;
      }
      .local-graph-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        padding: 0;
        border: none;
        border-radius: 5px;
        background: transparent;
        color: var(--global--text-faint);
        cursor: pointer;
        transition: background 120ms ease, color 120ms ease;
      }
      .local-graph-btn:hover {
        background: var(--global--background-modifier-hover);
        color: var(--global--text-normal);
      }
      .local-graph-btn:focus-visible {
        outline: 2px solid var(--global--interactive-accent);
        outline-offset: 2px;
      }
      .local-graph-canvas {
        height: 240px;
        border: 1px solid var(--global--background-modifier-border);
        border-radius: 8px;
        overflow: hidden;
        background: var(--global--background-primary);
      }
    `,
  ],
})
export class LocalGraph {
  readonly slug = input.required<string>();

  private readonly content = inject(ContentService);
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly overlay = signal<'local' | 'global' | null>(null);
  // Desktop-only: the local graph lives in the right aside, which is hidden at
  // <=1200px. Gate on the same breakpoint so no canvas/sim runs on mobile.
  protected readonly isDesktop = signal(false);

  constructor() {
    if (this.isBrowser) {
      const mq = window.matchMedia('(min-width: 1201px)');
      this.isDesktop.set(mq.matches);
      const onChange = (e: MediaQueryListEvent) => this.isDesktop.set(e.matches);
      mq.addEventListener('change', onChange);
      inject(DestroyRef).onDestroy(() => mq.removeEventListener('change', onChange));
    }
  }

  protected readonly full = resource({
    loader: () => this.content.loadGraph(),
  });

  // Depth-1 neighbourhood of the current note: the note, its direct neighbours,
  // and edges among them.
  protected readonly sub = computed<GraphData | null>(() => {
    const g = this.full.value();
    const s = this.slug();
    if (!g) {
      return null;
    }
    const keep = new Set<string>([s]);
    for (const l of g.links) {
      if (l.source === s) keep.add(l.target);
      else if (l.target === s) keep.add(l.source);
    }
    return {
      nodes: g.nodes.filter((n) => keep.has(n.slug)),
      links: g.links.filter((l) => keep.has(l.source) && keep.has(l.target)),
    };
  });
}
