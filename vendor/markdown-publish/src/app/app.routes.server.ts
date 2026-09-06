import { inject } from '@angular/core';
import { RenderMode, ServerRoute } from '@angular/ssr';
import { ContentService } from './content/content.service';

export const serverRoutes: ServerRoute[] = [
  {
    path: '',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'graph',
    renderMode: RenderMode.Prerender,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      const content = inject(ContentService);
      const manifest = await content.loadManifest();
      return manifest.routes.map((route) => ({ '**': route.slug }));
    },
  },
];
