import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  PLATFORM_ID,
  Renderer2,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import type { CanvasNode, FileNotePayload } from '@shared/content-model';
import { CONNECTOR_IMPORTS, CONNECTORS_STYLES, CONNECTORS_TEMPLATE, CanvasNodeBase } from './connectors';
import { CanvasZoom } from './canvas-zoom';

/** At/above this board zoom a visible card renders its full (crisp) note body
 *  with working clips; below it the card shows the whole-note thumbnail image. */
const FULL_ZOOM = 0.5;

/** At/above this board zoom a full card's clip GIFs animate; between FULL_ZOOM
 *  and here the full note shows static posters, so a board you've only just
 *  zoomed into animates nothing until you're close enough to watch. */
const NEAR_ZOOM = 0.6;

@Component({
  selector: 'app-file-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [...CONNECTOR_IMPORTS],
  host: {
    '[style.width.px]': 'node().width',
    '[style.height.px]': 'node().height',
    '[style.border-color]': 'node().color || null',
  },
  template:
    `
    @if (payload().available) {
      <button type="button" class="card" (click)="open($event)">
        @switch (detail()) {
          @case ('full') {
            <div class="body" [innerHTML]="safeHtml()"></div>
          }
          @case ('preview') {
            @if (payload().thumbUrl) {
              <img class="card-thumb" [src]="payload().thumbUrl" [alt]="payload().title" loading="lazy" decoding="async" />
            } @else {
              <h3 class="title">{{ payload().title }}</h3>
              <p class="preview">{{ excerpt() }}</p>
            }
          }
          @default {
            <h3 class="title">{{ payload().title }}</h3>
          }
        }
      </button>
    } @else {
      <div class="card unavailable">
        <h3 class="title">{{ payload().title }}</h3>
        <p class="hint">This note is not available.</p>
      </div>
    }
  ` + CONNECTORS_TEMPLATE,
  styles: [
    CONNECTORS_STYLES,
    `
      :host {
        display: block;
        position: relative;
        box-sizing: border-box;
        height: 100%;
        border: 0.0625rem solid var(--df-node-border-color, var(--global--background-modifier-border));
        border-radius: 0.5rem;
        background: var(--global--background-primary);
        overflow: hidden;
      }

      .card {
        /* flex column: kills the UA vertical centering of <button> content */
        display: flex;
        flex-direction: column;
        align-items: stretch;
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0.5rem 0.75rem;
        border: none;
        background: transparent;
        text-align: left;
        font: inherit;
        color: inherit;
        overflow: auto;
      }

      button.card {
        cursor: pointer;
      }

      .title {
        margin: 0 0 0.5rem;
        font-size: 1rem;
      }

      .preview {
        margin: 0;
        font-size: 0.85rem;
        line-height: 1.4;
        color: var(--global--text-muted, inherit);
        overflow: hidden;
      }

      .card-thumb {
        flex: 1 1 auto;
        min-height: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: top center;
        display: block;
        border-radius: 0.25rem;
      }

      .unavailable {
        opacity: 0.6;
      }
    `,
  ],
})
export class FileNode extends CanvasNodeBase {
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);

  protected readonly node = computed(() => this.modelSignal() as unknown as CanvasNode);
  protected readonly payload = computed(() => this.node().payload as FileNotePayload);
  private readonly zoom = inject(CanvasZoom);

  /** Level of detail: off-screen -> title only; on-screen & zoomed out ->
   *  light preview; zoomed in -> full note body. */
  /** Level of detail with hysteresis so it doesn't flicker at the threshold:
   *  once 'full', it stays full until the zoom drops well below FULL_ZOOM. */
  private prevTier: 'title' | 'preview' | 'full' = 'title';
  protected readonly detail = signal<'title' | 'preview' | 'full'>('title');

  protected readonly excerpt = computed(() => {
    const txt = (this.payload().html ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return txt.length > 220 ? txt.slice(0, 220) + '…' : txt;
  });

  /** Canvas virtualization: render only the title until the card scrolls into
   *  view, then mount the full note HTML. Keeps a board of many notes light —
   *  off-screen cards hold no images/GIFs in the DOM at all. SSR renders the
   *  light title (visible=false), and hydration starts in the same state. */
  protected readonly visible = signal(false);

  constructor() {
    super();
    // Pick the level of detail from visibility + zoom, with hysteresis on the
    // full<->preview boundary so a tiny zoom wobble can't flip the card (which
    // showed up as twitching text when zoomed in near the threshold).
    effect(() => {
      // Zoomed out (or off screen) -> light whole-note thumbnail / title.
      // Zoomed in -> crisp full render (with working clips). Hysteresis on the
      // boundary so a tiny zoom wobble can't flip the card (twitching text).
      const v = this.visible();
      const s = this.zoom.scale();
      let t: 'title' | 'preview' | 'full';
      if (!v) t = 'title';
      else if (this.prevTier === 'full') t = s >= FULL_ZOOM - 0.1 ? 'full' : 'preview';
      else t = s >= FULL_ZOOM ? 'full' : 'preview';
      if (t !== this.prevTier) {
        this.prevTier = t;
        this.detail.set(t);
      }
    });
    // Clip level-of-detail: a full card's GIFs animate only when zoomed in past
    // NEAR_ZOOM, otherwise they sit on their static poster. afterRenderEffect
    // re-runs after the body's innerHTML is in the DOM and whenever detail()/zoom
    // change; reading zoom.scale() only inside the 'full' branch means a zoomed-
    // out board never tracks the zoom at all. No-op on the server.
    afterRenderEffect(() => {
      if (this.detail() !== 'full') return;
      const near = this.zoom.scale() >= NEAR_ZOOM;
      const imgs = this.el.nativeElement.querySelectorAll<HTMLImageElement>('img.clip-gif');
      imgs.forEach((img) => {
        const want = near ? img.getAttribute('data-src') : img.getAttribute('data-poster');
        if (want && img.getAttribute('src') !== want) {
          this.renderer.setAttribute(img, 'src', want);
        }
      });
    });
    if (this.isBrowser) {
      const destroyRef = inject(DestroyRef);
      afterNextRender(() => {
        const io = new IntersectionObserver(
          (entries) => {
            const on = entries.some((e) => e.isIntersecting);
            if (on !== this.visible()) this.visible.set(on);
          },
          { rootMargin: '700px' },
        );
        io.observe(this.el.nativeElement);
        destroyRef.onDestroy(() => io.disconnect());
      });
    }
  }

  protected readonly safeHtml = computed(() => {
    let html = this.payload().html ?? '';
    // Default clip GIFs to their static poster on the board; the afterRenderEffect
    // above swaps the animated GIF back in once a full card is zoomed in past
    // NEAR_ZOOM (and SSR/first paint stay on the cheap poster).
    html = html.replace(/<img\b[^>]*\bclass="[^"]*\bclip-gif\b[^"]*"[^>]*>/g, (tag) => {
      const poster = tag.match(/\bdata-poster="([^"]*)"/);
      return poster ? tag.replace(/\bsrc="[^"]*"/, `src="${poster[1]}"`) : tag;
    });
    return this.sanitizer.bypassSecurityTrustHtml(
      this.isBrowser ? DOMPurify.sanitize(html) : html,
    );
  });

  protected open(event: MouseEvent): void {
    if (this.wasDragged(event)) {
      return; // the click ended a drag — don't navigate
    }
    const { slug, anchor } = this.payload();
    this.router.navigateByUrl(`/${slug}${anchor ? `#${anchor}` : ''}`);
  }
}
