import { DOCUMENT, inject, Injectable, PendingTasks } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ContentService } from '../content/content.service';

export interface SeoInput {
  /** Page title (note/canvas title). Empty → site name only. */
  title: string;
  description: string;
  /** Route path, e.g. "/v21/01-compile" or "/". */
  path: string;
  type?: 'website' | 'article';
  /** ISO dates for Article schema + freshness signal. */
  published?: string;
  modified?: string;
  /** When true, emit robots noindex (404, etc.). */
  noindex?: boolean;
}

/**
 * Sets per-page SEO into the document head: human-readable <title>, unique
 * meta description, canonical, Open Graph + Twitter, and JSON-LD. Writes run on
 * the server too (domino DOCUMENT), so everything lands in the prerendered HTML
 * — which is what crawlers read without executing JS.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);
  private readonly content = inject(ContentService);
  private readonly pending = inject(PendingTasks);

  private site?: { name: string; url: string; description: string; lang: string };

  private async loadSite(): Promise<{ name: string; url: string; description: string; lang: string }> {
    if (!this.site) {
      const m = await this.content.loadManifest();
      this.site = {
        name: m.site.title,
        url: m.site.url,
        description: m.site.description,
        lang: m.site.lang || 'en',
      };
    }
    return this.site;
  }

  set(input: SeoInput): Promise<void> {
    // Register a pending task so prerendering waits for these head writes before
    // serializing — otherwise the tags wouldn't reach the static HTML.
    const promise = this.apply(input);
    this.pending.run(() => promise);
    return promise;
  }

  private async apply(input: SeoInput): Promise<void> {
    const site = await this.loadSite();
    if (site.lang) {
      this.doc.documentElement.lang = site.lang;
    }
    const desc = clip(input.description || site.description, 200);
    const pageTitle = input.title?.trim();
    const fullTitle =
      pageTitle && site.name && pageTitle !== site.name
        ? `${pageTitle} · ${site.name}`
        : pageTitle || site.name || 'Notes';
    const ogTitle = pageTitle || site.name || 'Notes';
    const abs = this.absolute(input.path, site.url);

    this.title.setTitle(fullTitle);
    this.meta.updateTag({ name: 'description', content: desc });
    this.setRobots(input.noindex === true);
    this.setCanonical(abs);

    // og.png is generated at build time with the site name. Crawlers don't run
    // JS, so an absolute URL (configured or provider-detected) is what makes
    // link previews work everywhere; the baseURI fallback survives subpaths.
    const ogImage = site.url
      ? `${site.url}/og.png`
      : new URL('og.png', this.doc.baseURI).href;
    const og: Record<string, string> = {
      'og:title': ogTitle,
      'og:description': desc,
      'og:type': input.type ?? 'website',
      'og:site_name': site.name,
      'og:image': ogImage,
    };
    if (abs) og['og:url'] = abs;
    for (const [property, content] of Object.entries(og)) {
      this.meta.updateTag({ property, content });
    }

    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: ogTitle });
    this.meta.updateTag({ name: 'twitter:description', content: desc });
    this.meta.updateTag({ name: 'twitter:image', content: ogImage });

    this.setJsonLd(input, abs, desc, site);
  }

  private absolute(path: string, siteUrl: string): string {
    const p = path.startsWith('/') ? path : `/${path}`;
    if (siteUrl) {
      return siteUrl + encodeURI(p);
    }
    // No configured origin: only resolvable in the browser.
    const origin = this.doc.defaultView?.location.origin;
    return origin ? origin + encodeURI(p) : '';
  }

  private setRobots(noindex: boolean): void {
    if (noindex) {
      this.meta.updateTag({ name: 'robots', content: 'noindex, follow' });
    } else {
      this.meta.removeTag('name="robots"');
    }
  }

  private setCanonical(abs: string): void {
    const head = this.doc.head;
    let link = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!abs) {
      link?.remove();
      return;
    }
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', 'canonical');
      head.appendChild(link);
    }
    link.setAttribute('href', abs);
  }

  private setJsonLd(input: SeoInput, abs: string, desc: string, site: { name: string; url: string }): void {
    const data: Record<string, unknown> =
      input.type === 'article'
        ? {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: input.title,
            description: desc,
            ...(abs ? { url: abs, mainEntityOfPage: abs } : {}),
            ...(input.published ? { datePublished: input.published } : {}),
            ...(input.modified ? { dateModified: input.modified } : {}),
            ...(site.name ? { publisher: { '@type': 'Organization', name: site.name } } : {}),
            inLanguage: this.doc.documentElement.lang || undefined,
          }
        : {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: site.name || input.title,
            ...(site.url ? { url: site.url } : {}),
            ...(desc ? { description: desc } : {}),
          };

    let script = this.doc.getElementById('seo-jsonld') as HTMLScriptElement | null;
    if (!script) {
      script = this.doc.createElement('script');
      script.id = 'seo-jsonld';
      script.type = 'application/ld+json';
      this.doc.head.appendChild(script);
    }
    script.textContent = JSON.stringify(data);
  }
}

/** First meaningful slice of a string, trimmed to a word boundary near `max`. */
function clip(text: string, max: number): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) {
    return t;
  }
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

/** Plain-text excerpt from raw markdown, for meta description. */
export function excerptFromMarkdown(markdown: string): string {
  return (markdown ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[\[[^\]]*\]\]/g, ' ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>+\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/[*_~`#>]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
