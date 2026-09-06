import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  PLATFORM_ID,
  resource,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { ContentService } from '../content/content.service';
import { Toc } from '../aside/toc';
import { Backlinks } from '../aside/backlinks';
import { LocalGraph } from '../graph/local-graph';
import { SeoService, excerptFromMarkdown } from '../seo/seo.service';

@Component({
  selector: 'app-note-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Toc, Backlinks, LocalGraph],
  template: `
    @if (note.value(); as data) {
      <div class="reading">
        <article class="note" data-pagefind-body>
          <h1 class="note-title" data-pagefind-meta="title">{{ data.title }}</h1>
          <div
            class="note-body"
            [innerHTML]="safeHtml()"
            (click)="onClick($event)"
            (mouseover)="onLinkOver($event)"
            (mouseout)="onLinkOut()"
          ></div>
        </article>

        @if (preview(); as p) {
          <div
            class="link-preview"
            [style.left.px]="p.x"
            [style.top.px]="p.y"
            (mouseenter)="cancelHide()"
            (mouseleave)="onLinkOut()"
          >
            <div class="note-body link-preview-body" [innerHTML]="p.html"></div>
          </div>
        }

        <aside class="note-aside">
          <app-local-graph [slug]="slug()" />
          <app-toc [headings]="data.headings" />
          <app-backlinks [backlinks]="data.backlinks" />
        </aside>
      </div>
    } @else if (note.error()) {
      <p class="note-error">Could not load this note.</p>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .reading {
        display: grid;
        grid-template-columns: minmax(0, 800px) minmax(0, 320px);
        justify-content: center;
        max-width: 1120px;
        margin: 0 auto;
        padding: 32px 0 96px;
      }

      .note {
        min-width: 0;
        padding: 0 48px;
        box-sizing: border-box;
      }

      .note-title {
        margin: 0 0 0.6em;
        font-size: 2em;
        font-weight: 700;
        line-height: 1.2;
        letter-spacing: -0.015em;
        color: var(--global--text-normal);
      }

      .note-aside {
        position: sticky;
        top: 32px;
        align-self: start;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        padding: 0 24px 0 16px;
      }

      .note-error {
        padding: 32px 48px;
        color: var(--global--text-muted);
      }

      /* Hover page preview (Obsidian-style) */
      .link-preview {
        position: fixed;
        z-index: 60;
        width: 460px;
        max-height: 320px;
        overflow-y: auto;
        padding: 14px 20px;
        box-sizing: border-box;
        border: 1px solid var(--global--background-modifier-border);
        border-radius: 8px;
        background: var(--global--background-primary);
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.18);
      }

      .link-preview-body {
        font-size: 0.9em;
      }

      @media (max-width: 1200px) {
        .reading {
          /* the track caps and centers the column; margin:0 auto on the item
             would disable grid stretch and size it to min-content (overflow) */
          grid-template-columns: minmax(0, 800px);
        }

        .note-aside {
          display: none;
        }
      }

      @media (max-width: 768px) {
        .reading {
          padding-top: 16px;
        }

        .note {
          padding: 0 20px;
        }
      }

      /* Wide screens: let the reading column and aside breathe instead of
         leaving half the viewport empty. */
      @media (min-width: 1440px) {
        .reading {
          max-width: 1480px;
          grid-template-columns: minmax(0, 1020px) minmax(0, 380px);
        }
      }
    `,
  ],
})
export class NoteView {
  readonly slug = input.required<string>();

  private readonly content = inject(ContentService);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly seo = inject(SeoService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly note = resource({
    params: () => this.slug(),
    loader: ({ params }) => this.content.loadNote(params),
  });

  constructor() {
    // Per-page SEO (runs on the server too → lands in prerendered HTML).
    effect(() => {
      const data = this.note.value();
      if (!data) {
        return;
      }
      const fm = data.frontmatter ?? {};
      // Drop a leading H1 (usually repeats the title) so the description adds info.
      const body = data.markdown.replace(/^\s*#\s+.*(?:\r?\n)+/, '');
      void this.seo.set({
        title: data.title,
        description: excerptFromMarkdown(body),
        path: '/' + this.slug(),
        type: 'article',
        published: isoDate(fm['date'] ?? fm['created'] ?? fm['published']),
        modified: isoDate(fm['updated'] ?? fm['modified'] ?? fm['lastmod']),
      });
    });
  }

  protected readonly safeHtml = computed(() => {
    const data = this.note.value();
    if (!data) {
      return '';
    }
    // DOMPurify needs a DOM; on the server the HTML is already parser-sanitized.
    const html = this.isBrowser
      ? DOMPurify.sanitize(data.html, { ADD_ATTR: ['target'] })
      : data.html;
    return this.sanitizer.bypassSecurityTrustHtml(html);
  });

  // ---- hover page preview ----
  protected readonly preview = signal<{ x: number; y: number; html: SafeHtml } | null>(
    null,
  );
  private previewSlug: string | null = null;
  private showTimer = 0;
  private hideTimer = 0;

  protected onLinkOver(event: MouseEvent): void {
    if (!this.isBrowser || !window.matchMedia('(hover: hover)').matches) {
      return;
    }
    const a = (event.target as HTMLElement).closest('a.wikilink:not(.broken)');
    const href = a?.getAttribute('href') ?? '';
    if (!a || /^https?:/.test(href)) {
      return;
    }
    const slug = decodeURIComponent(href.replace(/^\//, '').split('#')[0]);
    if (!slug) {
      return;
    }
    clearTimeout(this.hideTimer);
    if (this.previewSlug === slug && this.preview()) {
      return;
    }
    clearTimeout(this.showTimer);
    const rect = a.getBoundingClientRect();
    this.showTimer = window.setTimeout(() => void this.showPreview(slug, rect), 300);
  }

  private async showPreview(slug: string, rect: DOMRect): Promise<void> {
    try {
      const note = await this.content.loadNote(slug);
      const html = this.sanitizer.bypassSecurityTrustHtml(
        DOMPurify.sanitize(note.html, { ADD_ATTR: ['target'] }),
      );
      const W = 460;
      const H = 320;
      const x = Math.max(8, Math.min(rect.left, window.innerWidth - W - 8));
      const below = rect.bottom + 8 + H <= window.innerHeight;
      const y = below ? rect.bottom + 8 : Math.max(8, rect.top - H - 8);
      this.previewSlug = slug;
      this.preview.set({ x, y, html });
    } catch {
      // target note failed to load — just no preview
    }
  }

  protected onLinkOut(): void {
    clearTimeout(this.showTimer);
    // Always clear before re-arming: consecutive mouseouts (crossing text on
    // the way to the popup) must not leak an old timer that hides it anyway.
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      this.preview.set(null);
      this.previewSlug = null;
    }, 350);
  }

  protected cancelHide(): void {
    clearTimeout(this.hideTimer);
  }

  protected onClick(event: MouseEvent): void {
    const anchor = (event.target as HTMLElement).closest('a.wikilink');
    if (!anchor) {
      return;
    }
    const href = anchor.getAttribute('href');
    if (!href || /^https?:\/\//.test(href)) {
      return;
    }
    event.preventDefault();
    // hrefs are base-relative in the HTML (crawler-correct under subpaths);
    // the router needs a root-relative URL, so normalize the leading slash.
    this.router.navigateByUrl('/' + href.replace(/^\//, ''));
  }
}

/** Normalize a frontmatter date value to an ISO string, or undefined. */
function isoDate(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  const s = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s : undefined;
}
