import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';
import hljs from 'highlight.js';
import GithubSlugger from 'github-slugger';
import type { Heading, LinkRef } from '@shared/content-model';

// Non-stateful github slugify (no dedup counter) — used both for heading
// anchor ids and for resolving #Heading fragments in wikilinks (§5/§14).
export function slugifyHeading(text: string): string {
  return new GithubSlugger().slug(text);
}

const CALLOUT_TYPES = new Set([
  'note', 'abstract', 'summary', 'tldr', 'info', 'todo', 'tip', 'hint',
  'important', 'success', 'check', 'done', 'question', 'help', 'faq',
  'warning', 'caution', 'attention', 'failure', 'fail', 'missing', 'danger',
  'error', 'bug', 'example', 'quote', 'cite',
]);

export interface ResolveResult {
  /** Resolved target slug, or null if unresolved (broken link). */
  slug: string | null;
  title: string;
}

export interface MarkdownEnv {
  /** Resolve a wikilink/embed target (page name) to a note. */
  resolveLink(target: string): ResolveResult;
  /** Resolve an asset reference (e.g. "diagram.png") to a public URL or null. */
  resolveAsset(target: string): { url: string; ext: string } | null;
  /** Render an embedded note/section to an HTML fragment (cycle-guarded). */
  renderEmbed(target: string, heading: string | null): string | null;
  /** Resolve a YouTube video id to its note, for video→note linking. */
  resolveVideo(id: string): LinkRef | null;
  /** Slug of the note being rendered (so its own URL field stays external). */
  selfSlug: string;
  /** Collected outgoing links (deduped by slug) for the current note. */
  outgoing: LinkRef[];
  /** Collected headings for the current note. */
  headings: Heading[];
  /** Anchor slugger state for the current note. */
  slugger: GithubSlugger;
}

interface WikiParts {
  target: string;
  heading: string | null;
  block: string | null;
  alias: string | null;
}

function parseWiki(inner: string): WikiParts {
  let alias: string | null = null;
  const pipe = inner.indexOf('|');
  if (pipe !== -1) {
    alias = inner.slice(pipe + 1).trim();
    inner = inner.slice(0, pipe);
  }
  let block: string | null = null;
  let heading: string | null = null;
  const caret = inner.indexOf('^');
  const hash = inner.indexOf('#');
  if (caret !== -1) {
    block = inner.slice(caret + 1).trim();
    inner = inner.slice(0, caret);
  } else if (hash !== -1) {
    heading = inner.slice(hash + 1).trim();
    inner = inner.slice(0, hash);
  }
  return { target: inner.trim(), heading, block, alias };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

// Extract the 11-char video id from a YouTube watch/short URL. `hasTime` marks
// links that point at a timestamp (a clip) — those stay external.
function parseYouTubeId(href: string): { id: string; hasTime: boolean } | null {
  const short = /^https?:\/\/(?:www\.)?youtu\.be\/([A-Za-z0-9_-]{11})(?:[?#].*)?$/i.exec(href);
  if (short) return { id: short[1], hasTime: /[?&]t=/.test(href) };
  const watch =
    /^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{11})(?:[&#].*)?$/i.exec(
      href,
    );
  if (watch) return { id: watch[1], hasTime: /[?&]t=/.test(href) };
  return null;
}

// ---- custom inline rule: wikilinks & embeds ----

function wikilinkRule(md: MarkdownIt): void {
  md.inline.ruler.before('link', 'wikilink', (state, silent) => {
    const start = state.pos;
    const src = state.src;
    const isEmbed = src[start] === '!';
    const bracketAt = isEmbed ? start + 1 : start;
    if (src[bracketAt] !== '[' || src[bracketAt + 1] !== '[') return false;
    const close = src.indexOf(']]', bracketAt + 2);
    if (close === -1) return false;
    const inner = src.slice(bracketAt + 2, close);
    if (silent) {
      state.pos = close + 2;
      return true;
    }
    const env = state.env as MarkdownEnv;
    const parts = parseWiki(inner);

    if (isEmbed) {
      const asset = env.resolveAsset(parts.target);
      if (asset) {
        const token = state.push('html_inline', '', 0);
        const alt = escapeAttr(parts.alias ?? parts.target);
        if (asset.ext === 'pdf') {
          token.content = `<embed class="embed-pdf" src="${asset.url}" type="application/pdf">`;
        } else {
          // alias may carry size: 400 or 400x300
          let sizeAttr = '';
          if (parts.alias && /^\d+(x\d+)?$/.test(parts.alias)) {
            const [w, h] = parts.alias.split('x');
            sizeAttr = ` width="${w}"${h ? ` height="${h}"` : ''}`;
            token.content = `<img class="embed-img" src="${asset.url}" alt=""${sizeAttr}>`;
          } else {
            token.content = `<img class="embed-img" src="${asset.url}" alt="${alt}">`;
          }
        }
        state.pos = close + 2;
        return true;
      }
      // note/section embed
      const fragment = env.renderEmbed(parts.target, parts.heading);
      const token = state.push('html_inline', '', 0);
      if (fragment != null) {
        token.content = `<div class="embed embed-note">${fragment}</div>`;
      } else {
        token.content = `<span class="embed broken">![[${escapeHtml(inner)}]]</span>`;
      }
      state.pos = close + 2;
      return true;
    }

    // plain wikilink
    const res = env.resolveLink(parts.target);
    const label = parts.alias ?? parts.target;
    if (res.slug == null) {
      const token = state.push('html_inline', '', 0);
      token.content = `<a class="wikilink broken" href="#">${escapeHtml(label)}</a>`;
    } else {
      let anchor = '';
      if (parts.heading) anchor = '#' + slugifyHeading(parts.heading);
      else if (parts.block) anchor = '#^' + parts.block;
      // Base-RELATIVE (no leading slash): every page carries <base href>, so
      // the browser resolves this against the site base — a root-absolute
      // "/slug" 404s for crawlers/middle-click on subpath deployments (e.g.
      // GitHub Pages project sites). The SPA click handler is unaffected:
      // the router treats "x/y" and "/x/y" identically.
      const href = `${res.slug}${anchor}`;
      const token = state.push('html_inline', '', 0);
      token.content = `<a class="wikilink" href="${escapeAttr(href)}">${escapeHtml(label)}</a>`;
      if (!env.outgoing.some((l) => l.slug === res.slug)) {
        env.outgoing.push({ slug: res.slug, title: res.title });
      }
    }
    state.pos = close + 2;
    return true;
  });
}

// ---- custom inline rule: tags ----

function tagRule(md: MarkdownIt): void {
  md.inline.ruler.before('text', 'tag', (state, silent) => {
    const pos = state.pos;
    const src = state.src;
    if (src[pos] !== '#') return false;
    // must be at start or preceded by whitespace
    if (pos > 0 && !/\s/.test(src[pos - 1])) return false;
    const rest = src.slice(pos + 1);
    const m = /^[A-Za-z0-9_\-/]*[A-Za-z][A-Za-z0-9_\-/]*/.exec(rest);
    if (!m || m[0].length === 0) return false;
    const tag = m[0];
    if (silent) {
      state.pos = pos + 1 + tag.length;
      return true;
    }
    const token = state.push('html_inline', '', 0);
    token.content = `<a class="tag" href="/tags/${escapeAttr(tag)}">#${escapeHtml(tag)}</a>`;
    state.pos = pos + 1 + tag.length;
    return true;
  });
}

// ---- custom block rule: callouts ----

function calloutRule(md: MarkdownIt): void {
  md.block.ruler.before('blockquote', 'callout', (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    if (state.src.charCodeAt(start) !== 0x3e /* > */) return false;
    // first content line must look like: > [!type] ...
    const firstLine = state.src.slice(start + 1, max).replace(/^\s/, '');
    const m = /^\[!([A-Za-z]+)\]([+-]?)\s*(.*)$/.exec(firstLine);
    if (!m) return false;
    if (silent) return true;

    let type = m[1].toLowerCase();
    if (!CALLOUT_TYPES.has(type)) type = 'note';
    const titleText = m[3].trim();

    // collect subsequent quoted lines
    let nextLine = startLine + 1;
    const bodyLines: string[] = [];
    for (; nextLine < endLine; nextLine++) {
      const lstart = state.bMarks[nextLine] + state.tShift[nextLine];
      const lmax = state.eMarks[nextLine];
      if (state.sCount[nextLine] < state.blkIndent) break;
      if (state.src.charCodeAt(lstart) !== 0x3e) {
        // blank line ends the callout
        if (lstart >= lmax) break;
        break;
      }
      bodyLines.push(state.src.slice(lstart + 1, lmax).replace(/^\s/, ''));
    }

    const titleHtml = titleText
      ? md.renderInline(titleText, state.env)
      : type.charAt(0).toUpperCase() + type.slice(1);
    const bodyHtml = bodyLines.length ? md.render(bodyLines.join('\n'), state.env) : '';

    const token = state.push('html_block', '', 0);
    token.map = [startLine, nextLine];
    token.content =
      `<div class="callout callout-${type}">` +
      `<div class="callout-title">${titleHtml}</div>` +
      `<div class="callout-body">${bodyHtml}</div>` +
      `</div>\n`;

    state.line = nextLine;
    return true;
  });
}

function highlight(str: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try {
      const out = hljs.highlight(str, { language: lang }).value;
      return `<pre class="hljs"><code class="language-${lang}">${out}</code></pre>`;
    } catch {
      /* fall through */
    }
  }
  return `<pre class="hljs"><code>${escapeHtml(str)}</code></pre>`;
}

export function createMarkdown(): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
    highlight,
  });

  md.use(anchor, {
    slugify: (s: string) => slugifyHeading(s),
    permalink: false,
  });
  md.use(footnote);
  md.use(taskLists, { enabled: true, label: false });

  wikilinkRule(md);
  tagRule(md);
  calloutRule(md);

  // capture headings during the heading_open render so we can build TOC
  const defaultHeadingOpen =
    md.renderer.rules.heading_open ||
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.heading_open = (tokens, idx, options, env: MarkdownEnv, self) => {
    const token = tokens[idx];
    const level = Number(token.tag.slice(1));
    const inline = tokens[idx + 1];
    const text = inline && inline.type === 'inline' ? inline.content : '';
    const slug = slugifyHeading(text);
    if (env && env.headings) env.headings.push({ level, text, slug });
    return defaultHeadingOpen(tokens, idx, options, env, self);
  };

  // rewrite standard markdown images (![](path)) to hashed asset URLs, the same
  // way Obsidian embeds (![[..]]) are handled. Remote / data URIs pass through.
  const defaultImage =
    md.renderer.rules.image ||
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.image = (tokens, idx, options, env: MarkdownEnv, self) => {
    const token = tokens[idx];
    const srcIdx = token.attrIndex('src');
    if (srcIdx >= 0) {
      const src = token.attrs![srcIdx][1];
      if (!/^([a-z]+:)?\/\//i.test(src) && !src.startsWith('data:')) {
        const resolved = env.resolveAsset(src);
        if (resolved) {
          token.attrs![srcIdx][1] = resolved.url;
          // Animated GIF with a sibling poster (<name>.jpg): tag it so the
          // canvas can show the static poster when zoomed out / off-screen and
          // animate the real GIF only up close (avoids dozens of GIFs decoding
          // at once). No poster sibling -> unchanged, so other vaults are safe.
          if (resolved.ext === 'gif') {
            const posterBase = (src.split('/').pop() ?? src).replace(/\.gif$/i, '.jpg');
            const poster = env.resolveAsset(posterBase);
            if (poster) {
              token.attrSet('data-src', resolved.url);
              token.attrSet('data-poster', poster.url);
              const ci = token.attrIndex('class');
              token.attrSet('class', (ci >= 0 ? token.attrs![ci][1] + ' ' : '') + 'clip-gif');
            }
          }
        }
      }
    }
    return defaultImage(tokens, idx, options, env, self);
  };

  // external links (markdown links + linkified bare URLs) open in a new tab so
  // following one does not navigate away from the published site.
  const defaultLinkOpen =
    md.renderer.rules.link_open ||
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env: MarkdownEnv, self) => {
    const token = tokens[idx];
    const hrefIdx = token.attrIndex('href');
    const href = hrefIdx >= 0 ? token.attrs![hrefIdx][1] : '';
    if (/^https?:\/\//i.test(href)) {
      const yt = parseYouTubeId(href);
      const note = yt && !yt.hasTime ? env.resolveVideo(yt.id) : null;
      if (note && note.slug !== env.selfSlug) {
        // a link to a video we publish → route to its note instead of YouTube
        token.attrs![hrefIdx][1] = `${note.slug}`;
        token.attrSet('class', 'wikilink');
        if (!env.outgoing.some((l) => l.slug === note.slug)) {
          env.outgoing.push({ slug: note.slug, title: note.title });
        }
      } else {
        token.attrSet('target', '_blank');
        token.attrSet('rel', 'noopener noreferrer');
      }
    } else if (
      href &&
      !/^(#|\/\/|\/)/.test(href) &&
      !/^[a-z][a-z0-9+.-]*:/i.test(href)
    ) {
      // Relative internal markdown link, e.g. [text](01-build.md) or
      // [text](sub/note.md#heading). Obsidian resolves these like wikilinks;
      // without this they 404 and get no hover preview. Anchor-only (#x),
      // root-absolute (/x), protocol (mailto:, http:) and // are left alone.
      const hashIdx = href.indexOf('#');
      const rawPath = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
      const frag = hashIdx >= 0 ? href.slice(hashIdx) : '';
      const target = decodeURIComponent(rawPath)
        .replace(/\.md$/i, '')
        .replace(/^\.\//, '');
      const res = target ? env.resolveLink(target) : { slug: null, title: '' };
      if (res.slug != null) {
        token.attrs![hrefIdx][1] = `${res.slug}${frag}`;
        token.attrSet('class', 'wikilink');
        if (!env.outgoing.some((l) => l.slug === res.slug)) {
          env.outgoing.push({ slug: res.slug, title: res.title });
        }
      } else if (/\.md$/i.test(rawPath)) {
        // looked like an internal note link but didn't resolve → mark broken
        token.attrs![hrefIdx][1] = '#';
        token.attrSet('class', 'wikilink broken');
      }
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  return md;
}
