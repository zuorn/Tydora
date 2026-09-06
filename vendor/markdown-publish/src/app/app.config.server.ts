import { mergeApplicationConfig, ApplicationConfig, inject, DOCUMENT } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { WA_WINDOW } from '@ng-web-apis/common';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { ContentService } from './content/content.service';
import { ServerContentService } from './content/content.service.server';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    { provide: ContentService, useClass: ServerContentService },
    {
      // Domino's server-side window has no matchMedia; Taiga's TUI_DARK_MODE calls it during prerender.
      provide: WA_WINDOW,
      useFactory: () => {
        const win = inject(DOCUMENT).defaultView ?? (globalThis as unknown as Window);
        if (typeof win.matchMedia !== 'function') {
          (win as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
          });
        }
        if (typeof win.requestAnimationFrame !== 'function') {
          // Domino also lacks rAF; @ng-web-apis WA_ANIMATION_FRAME destructures
          // both fns from WA_WINDOW and throws per prerendered route otherwise.
          // No-op is correct: animation loops must not run during prerender.
          (win as unknown as { requestAnimationFrame: unknown }).requestAnimationFrame =
            () => 0;
          (win as unknown as { cancelAnimationFrame: unknown }).cancelAnimationFrame =
            () => {};
        }
        return win;
      },
    },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
