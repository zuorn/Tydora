import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  HostListener,
  PLATFORM_ID,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

interface SearchResult {
  url: string;
  title: string;
  excerpt: string;
}

interface PagefindModule {
  search(term: string): Promise<{ results: { data(): Promise<PagefindData> }[] }>;
}

interface PagefindData {
  url: string;
  excerpt: string;
  meta?: { title?: string };
}

@Component({
  selector: 'app-search-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="search-wrap">
      <div #searchBar class="search-bar" (mousedown)="focusInput($event)">
        <span class="search-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <input
          #searchInput
          type="text"
          class="search-input"
          placeholder="Search page or heading..."
          autocomplete="off"
          spellcheck="false"
          [ngModel]="query()"
          (ngModelChange)="query.set($event)"
          (focus)="onFocus()"
          (blur)="onBlur()"
          (keydown)="onKeydown($event)"
        />
        @if (query()) {
          <button type="button" class="search-clear" aria-label="Clear" (mousedown)="clear($event)">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        }
      </div>

      @if (dropdownOpen()) {
        <div
          class="search-dropdown"
          [style.top.px]="ddTop()"
          [style.left.px]="ddLeft()"
          [style.width.px]="ddWidth()"
          (mousedown)="$event.preventDefault()"
        >
          @if (results().length) {
            @for (r of results(); track r.url; let i = $index) {
              <button
                type="button"
                class="suggestion"
                [class.active]="i === active()"
                (click)="go(r.url)"
                (mouseenter)="active.set(i)"
              >
                <span class="suggestion-title">{{ r.title }}</span>
                <span class="suggestion-detail" [innerHTML]="r.excerpt"></span>
              </button>
            }
          } @else {
            <div class="suggestion-empty">No results.</div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .search-wrap {
        position: relative;
      }
      .search-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        box-sizing: border-box;
        height: 32px;
        padding: 4px 8px;
        border: 1px solid var(--global--background-modifier-border);
        border-radius: 5px;
        background: var(--global--background-primary);
        cursor: text;
      }
      .search-bar:focus-within {
        border-color: var(--global--text-accent);
      }
      .search-icon {
        display: inline-flex;
        align-items: center;
        color: var(--global--text-faint);
        flex: 0 0 auto;
      }
      .search-input {
        flex: 1 1 auto;
        min-width: 0;
        border: none;
        outline: none;
        background: transparent;
        color: var(--global--text-normal);
        font-family: inherit;
        font-size: 14px;
        line-height: 1.4;
      }
      .search-input::placeholder {
        color: var(--global--text-faint);
      }
      .search-clear {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        width: 20px;
        height: 20px;
        padding: 0;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: var(--global--text-faint);
        cursor: pointer;
      }
      .search-clear:hover {
        background: var(--global--background-modifier-hover);
        color: var(--global--text-normal);
      }

      .search-dropdown {
        position: fixed;
        z-index: 50;
        max-height: min(60vh, 480px);
        overflow-y: auto;
        padding: 4px;
        box-sizing: border-box;
        background: var(--global--background-primary);
        border: 1px solid var(--global--background-modifier-border);
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
      }
      .suggestion {
        display: flex;
        flex-direction: column;
        gap: 2px;
        width: 100%;
        box-sizing: border-box;
        padding: 6px 10px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        text-align: start;
        cursor: pointer;
        color: var(--global--text-normal);
      }
      .suggestion.active {
        background: var(--global--background-modifier-hover);
      }
      .suggestion-title {
        font-weight: 600;
        font-size: 0.9rem;
        line-height: 1.3;
        color: var(--global--text-normal);
      }
      .suggestion-detail {
        font-size: 0.8rem;
        line-height: 1.4;
        color: var(--global--text-muted);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .suggestion-detail ::ng-deep mark {
        background: rgba(250, 204, 21, 0.4);
        color: inherit;
        border-radius: 2px;
        padding: 0 1px;
      }
      .suggestion-empty {
        padding: 10px 12px;
        color: var(--global--text-muted);
        font-size: 0.85rem;
      }
    `,
  ],
})
export class SearchOverlay {
  protected readonly query = signal('');
  protected readonly results = signal<SearchResult[]>([]);
  protected readonly active = signal(0);
  protected readonly loading = signal(false);
  protected readonly focused = signal(false);

  protected readonly ddTop = signal(0);
  protected readonly ddLeft = signal(0);
  protected readonly ddWidth = signal(0);

  private readonly barEl = viewChild<ElementRef<HTMLDivElement>>('searchBar');
  private readonly inputEl = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  private readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private pagefind: Promise<PagefindModule> | null = null;
  private debounce?: ReturnType<typeof setTimeout>;
  private blurTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const term = this.query().trim();
      if (!this.isBrowser) {
        return;
      }
      clearTimeout(this.debounce);
      if (!term) {
        this.results.set([]);
        return;
      }
      this.debounce = setTimeout(() => void this.run(term), 150);
    });

    // Keep the dropdown anchored to the input while it is open.
    effect(() => {
      if (this.dropdownOpen()) {
        this.updateAnchor();
      }
    });

    if (this.isBrowser) {
      const onScroll = () => {
        if (this.dropdownOpen()) this.updateAnchor();
      };
      document.addEventListener('scroll', onScroll, { capture: true, passive: true });
      inject(DestroyRef).onDestroy(() =>
        document.removeEventListener('scroll', onScroll, { capture: true }),
      );
    }
  }

  protected dropdownOpen(): boolean {
    if (!this.focused() || !this.query().trim()) {
      return false;
    }
    return this.results().length > 0 || !this.loading();
  }

  protected focusInput(event: MouseEvent): void {
    if (event.target !== this.inputEl()?.nativeElement) {
      event.preventDefault();
      this.inputEl()?.nativeElement.focus();
    }
  }

  protected onFocus(): void {
    clearTimeout(this.blurTimer);
    this.focused.set(true);
    this.updateAnchor();
  }

  protected onBlur(): void {
    this.blurTimer = setTimeout(() => this.focused.set(false), 120);
  }

  protected clear(event: MouseEvent): void {
    event.preventDefault();
    this.query.set('');
    this.results.set([]);
    this.active.set(0);
    this.inputEl()?.nativeElement.focus();
  }

  private updateAnchor(): void {
    if (!this.isBrowser) {
      return;
    }
    const rect = this.barEl()?.nativeElement.getBoundingClientRect();
    if (!rect) {
      return;
    }
    this.ddTop.set(Math.round(rect.bottom + 4));
    this.ddLeft.set(Math.round(rect.left));
    this.ddWidth.set(Math.round(Math.max(rect.width, 340)));
  }

  private loadPagefind(): Promise<PagefindModule> {
    if (!this.pagefind) {
      // Resolve against <base href> so search works under a Pages subpath too.
      const url = new URL('pagefind/pagefind.js', this.doc.baseURI).href;
      this.pagefind = new Function('u', 'return import(u)')(
        url,
      ) as Promise<PagefindModule>;
    }
    return this.pagefind;
  }

  private async run(term: string): Promise<void> {
    this.loading.set(true);
    try {
      const pf = await this.loadPagefind();
      const search = await pf.search(term);
      const data = await Promise.all(search.results.slice(0, 10).map((r) => r.data()));
      this.results.set(
        data.map((d) => ({
          url: this.normalize(d.url),
          title: d.meta?.title ?? d.url,
          excerpt: d.excerpt,
        })),
      );
      this.active.set(0);
    } catch {
      this.results.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private normalize(url: string): string {
    return url.replace(/index\.html$/, '').replace(/\/$/, '') || '/';
  }

  protected go(url: string): void {
    clearTimeout(this.blurTimer);
    this.focused.set(false);
    this.query.set('');
    this.results.set([]);
    this.active.set(0);
    this.inputEl()?.nativeElement.blur();
    void this.router.navigateByUrl(url);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.focused.set(false);
      this.inputEl()?.nativeElement.blur();
      return;
    }
    const items = this.results();
    if (!items.length) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.active.update((i) => (i + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.active.update((i) => (i - 1 + items.length) % items.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.go(items[this.active()].url);
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    if (this.dropdownOpen()) {
      this.updateAnchor();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.inputEl()?.nativeElement.focus();
    }
  }
}
