import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  resource,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ContentService } from '../content/content.service';
import { SeoService } from '../seo/seo.service';
import { NoteView } from './note-view';
import { CanvasView } from './canvas-view';
import { NotFound } from './not-found';

@Component({
  selector: 'app-route-dispatch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NoteView, CanvasView, NotFound],
  styles: [':host { display: contents; }'],
  template: `
    @if (manifest.value()) {
      @switch (entry()?.kind) {
        @case ('note') {
          <app-note-view [slug]="slug()" />
        }
        @case ('canvas') {
          <app-canvas-view [slug]="slug()" />
        }
        @default {
          <app-not-found />
        }
      }
    }
  `,
})
export class RouteDispatch {
  private readonly route = inject(ActivatedRoute);
  private readonly content = inject(ContentService);
  private readonly seo = inject(SeoService);

  private readonly urlSegments = toSignal(this.route.url, {
    initialValue: this.route.snapshot.url,
  });

  constructor() {
    // Notes set their own SEO (they have body text for a description); here we
    // cover canvases (title only) and unknown routes (404 → noindex).
    effect(() => {
      if (!this.manifest.value()) {
        return;
      }
      const entry = this.entry();
      if (entry?.kind === 'canvas') {
        void this.seo.set({
          title: entry.title,
          description: '',
          path: '/' + this.slug(),
          type: 'website',
        });
      } else if (!entry) {
        void this.seo.set({
          title: 'Page not found',
          description: '',
          path: '/' + this.slug(),
          type: 'website',
          noindex: true,
        });
      }
    });
  }

  protected readonly slug = computed(() =>
    this.urlSegments()
      .map((s) => s.path)
      .join('/'),
  );

  protected readonly manifest = resource({
    loader: () => this.content.loadManifest(),
  });

  protected readonly entry = computed(() =>
    this.manifest.value()?.routes.find((r) => r.slug === this.slug()),
  );
}
