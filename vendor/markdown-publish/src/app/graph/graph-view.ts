import {
  ChangeDetectionStrategy,
  Component,
  inject,
  PLATFORM_ID,
  resource,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ContentService } from '../content/content.service';
import { SeoService } from '../seo/seo.service';
import { GraphCanvas } from './graph-canvas';

@Component({
  selector: 'app-graph-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GraphCanvas],
  template: `
    @if (isBrowser && graph.value(); as g) {
      <app-graph-canvas class="graph" [data]="g" />
    } @else if (graph.error()) {
      <p class="graph-error">Could not load the graph.</p>
    } @else {
      <div class="graph-placeholder"></div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .graph,
      .graph-placeholder {
        display: block;
        width: 100%;
        height: 100%;
        min-height: calc(100vh - 96px);
      }
      .graph-error {
        padding: 32px 48px;
        color: var(--global--text-muted);
      }
    `,
  ],
})
export class GraphView {
  private readonly content = inject(ContentService);
  private readonly seo = inject(SeoService);
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly graph = resource({
    loader: () => this.content.loadGraph(),
  });

  constructor() {
    void this.seo.set({
      title: 'Graph view',
      description: 'Interactive link graph of all notes.',
      path: '/graph',
      type: 'website',
    });
  }
}
