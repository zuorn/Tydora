import {
  DOCUMENT,
  effect,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const STORAGE_KEY = 'site-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // Own source of truth: light by default (matches the reference), deterministic
  // on the server so the prerendered <body> class never flashes.
  readonly darkMode = signal(false);

  constructor() {
    if (this.isBrowser) {
      const stored = this.doc.defaultView?.localStorage.getItem(STORAGE_KEY);
      this.darkMode.set(stored === 'dark');
    }

    effect(() => {
      const dark = this.darkMode();
      const body = this.doc.body.classList;
      body.toggle('theme-dark', dark);
      body.toggle('theme-light', !dark);
      if (this.isBrowser) {
        this.doc.defaultView?.localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
      }
    });
  }

  toggle(): void {
    this.darkMode.update((value) => !value);
  }
}
