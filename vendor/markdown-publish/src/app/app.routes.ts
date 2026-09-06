import { inject } from '@angular/core';
import { CanActivateFn, RedirectCommand, Router, Routes } from '@angular/router';
import { ContentService } from './content/content.service';
import { RouteDispatch } from './views/route-dispatch';
import { GraphView } from './graph/graph-view';

const redirectToHome: CanActivateFn = async () => {
  const content = inject(ContentService);
  const router = inject(Router);
  const manifest = await content.loadManifest();
  return new RedirectCommand(router.parseUrl('/' + manifest.site.homeSlug));
};

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [redirectToHome],
    children: [],
  },
  {
    path: 'graph',
    component: GraphView,
  },
  {
    path: '**',
    component: RouteDispatch,
  },
];
