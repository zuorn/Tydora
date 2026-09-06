import { promises as fs, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as path from 'node:path';
import fg from 'fast-glob';
import matter from 'gray-matter';
import GithubSlugger from 'github-slugger';
import type {
  Manifest,
  RouteEntry,
  NavNode,
  Note,
  Heading,
  LinkRef,
  ObsidianCanvas,
  CanvasModel,
  GraphData,
  GraphLink,
  SearchDoc,
  SearchIndex,
} from '@shared/content-model';
import { pathToSlug, baseName } from './slug';
import {
  createMarkdown,
  type MarkdownEnv,
  type ResolveResult,
} from './markdown';
import {
  normalizeCanvas,
  makeCanvasEnv,
  type CanvasResolved,
} from './canvas';

const ASSET_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'pdf', 'mp4', 'mp3'];
const MAX_EMBED_DEPTH = 3;

export interface ParseOptions {
  vaultDir: string;
  outDir: string;
  mode: 'public' | 'full';
  /** Absolute deploy origin for canonical/OG URLs (e.g. https://notes.example.com). */
  siteUrl?: string;
  /** Display name for the site (defaults to the vault folder name). */
  siteName?: string;
  /** Site-wide description for the home page + OG fallback. */
  siteDescription?: string;
  /** BCP-47 content language for <html lang> (default 'en'). */
  siteLang?: string;
  /** Optional sidebar footer credit (no default — empty hides the footer). */
  siteFooter?: string;
  /** Explicit home note (file name without extension); overrides detection. */
  homeNote?: string;
}

interface NoteEntry {
  slug: string;
  relPath: string;
  absPath: string;
  base: string;
  data: Record<string, unknown>;
  content: string;
  publish: 'public' | 'private';
  title: string;
}

interface AssetEntry {
  relPath: string;
  absPath: string;
  base: string;
  ext: string;
  /** Filled lazily when the asset is referenced. */
  url?: string;
  hash?: string;
}

export async function parseVault(opts: ParseOptions): Promise<void> {
  const vaultDir = path.resolve(opts.vaultDir);
  const outDir = path.resolve(opts.outDir);

  // 1. Walk
  const mdFiles = await fg('**/*.md', {
    cwd: vaultDir,
    ignore: ['.obsidian/**', '.trash/**'],
    dot: false,
  });
  const assetFiles = await fg(`**/*.{${ASSET_EXTS.join(',')}}`, {
    cwd: vaultDir,
    ignore: ['.obsidian/**', '.trash/**'],
    dot: false,
    caseSensitiveMatch: false,
  });
  const canvasFiles = await fg('**/*.canvas', {
    cwd: vaultDir,
    ignore: ['.obsidian/**', '.trash/**'],
    dot: false,
  });

  // 2. Route map + basename index (notes)
  const allNotes: NoteEntry[] = [];
  for (const rel of mdFiles) {
    const absPath = path.join(vaultDir, rel);
    const raw = await fs.readFile(absPath, 'utf8');
    const parsed = matter(raw);
    const data = (parsed.data ?? {}) as Record<string, unknown>;
    const publish: 'public' | 'private' =
      data.publish === 'public' ? 'public' : 'private';
    allNotes.push({
      slug: pathToSlug(rel),
      relPath: rel,
      absPath,
      base: baseName(rel),
      data,
      content: parsed.content,
      publish,
      title: '',
    });
  }

  // mode filter
  const notes =
    opts.mode === 'public'
      ? allNotes.filter((n) => n.publish === 'public')
      : allNotes;

  // title resolution: data.title ?? first H1 ?? basename
  for (const n of notes) {
    const fmTitle = typeof n.data.title === 'string' ? n.data.title : null;
    const h1 = /^#\s+(.+)$/m.exec(n.content);
    n.title = fmTitle ?? (h1 ? h1[1].trim() : n.base);
  }

  // video-id -> note index. Video notes are named `YYYY-MM-DD-<youtubeId>`,
  // so the id is the basename after the 10-char date and its separator. Lets
  // YouTube links in the vault route to the internal note for that video.
  const byVideoId = new Map<string, NoteEntry | null>();
  for (const n of notes) {
    const m = /^\d{4}-\d{2}-\d{2}-(.+)$/.exec(n.base);
    if (!m) continue;
    const id = m[1];
    if (byVideoId.has(id)) byVideoId.set(id, null); // collision -> skip
    else byVideoId.set(id, n);
  }

  // basename -> slug index (case-insensitive). On collision keep first
  // (shortest path) and mark collided so they fall back to full path.
  const bySlug = new Map<string, NoteEntry>();
  const byBase = new Map<string, NoteEntry | null>();
  for (const n of notes) {
    bySlug.set(n.slug, n);
    const key = n.base.toLowerCase();
    if (byBase.has(key)) byBase.set(key, null); // collision -> require full path
    else byBase.set(key, n);
  }

  // asset index by basename + by relative slug-ish path
  const assets: AssetEntry[] = assetFiles.map((rel) => ({
    relPath: rel,
    absPath: path.join(vaultDir, rel),
    base: rel.split('/').pop() ?? rel,
    ext: (rel.split('.').pop() ?? '').toLowerCase(),
  }));
  const assetByBase = new Map<string, AssetEntry>();
  for (const a of assets) {
    const key = a.base.toLowerCase();
    if (!assetByBase.has(key)) assetByBase.set(key, a);
  }

  const assetsOutDir = path.join(outDir, 'assets');
  await fs.mkdir(assetsOutDir, { recursive: true });

  // Assets referenced during render (markdown-it is sync, so we hash + copy
  // synchronously and collect them here for nothing further; copy happens in
  // resolveAsset on first reference).
  const copiedAssets = new Set<AssetEntry>();

  // resolve target -> note (wikilink / embed / canvas file ref)
  function resolveNote(target: string): NoteEntry | null {
    const t = target.trim();
    // try as basename
    const direct = byBase.get(t.toLowerCase());
    if (direct) return direct;
    // try as full relative path slug
    const asSlug = pathToSlug(t);
    const bySlugHit = bySlug.get(asSlug);
    if (bySlugHit) return bySlugHit;
    // Canvas file refs are relative to the Obsidian vault ROOT; when $VAULT
    // points at a subfolder, our slugs lack the leading segments. Strip them
    // one at a time until something matches (precise, collision-safe).
    const parts = asSlug.split('/');
    for (let i = 1; i < parts.length; i++) {
      const hit = bySlug.get(parts.slice(i).join('/'));
      if (hit) return hit;
    }
    // last resort: basename of a pathy target (collisions are null in byBase)
    return byBase.get(baseName(t).toLowerCase()) ?? null;
  }

  // canvases are linkable too: [[Board.canvas]] / [text](board.canvas) must
  // resolve to the canvas route, not render as a broken link.
  const canvasByBase = new Map<string, { slug: string; title: string }>();
  for (const rel of canvasFiles) {
    const entry = { slug: pathToSlug(rel), title: baseName(rel) };
    const key = baseName(rel).toLowerCase();
    if (!canvasByBase.has(key)) canvasByBase.set(key, entry);
  }

  function resolveLink(target: string): ResolveResult {
    const n = resolveNote(target);
    if (n) return { slug: n.slug, title: n.title };
    const c = canvasByBase.get(baseName(target).toLowerCase());
    if (c) return c;
    return { slug: null, title: target };
  }

  function resolveVideo(id: string): LinkRef | null {
    const n = byVideoId.get(id);
    if (!n) return null;
    return { slug: n.slug, title: n.title };
  }

  function resolveAsset(
    target: string,
  ): { url: string; ext: string } | null {
    const base = target.split('/').pop() ?? target;
    const a = assetByBase.get(base.toLowerCase());
    if (!a) return null;
    if (!a.url) {
      // content-hash, copy into <outDir>/assets/<hash>.<ext> (build-time sync IO)
      const buf = readFileSync(a.absPath);
      const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16);
      a.hash = hash;
      // Base-relative (no leading slash) so it resolves against <base href> and
      // works under a GitHub Pages project-site subpath, not just the root.
      a.url = `assets/${hash}.${a.ext}`;
      writeFileSync(path.join(assetsOutDir, `${hash}.${a.ext}`), buf);
      copiedAssets.add(a);
    }
    return { url: a.url, ext: a.ext };
  }

  const md = createMarkdown();

  // Render a note's content with a fresh env. Used for top-level notes and,
  // recursively, for embeds (cycle-guarded, depth-limited).
  function renderNote(
    n: NoteEntry,
    headingFilter: string | null,
    depth: number,
    stack: Set<string>,
    outgoing: LinkRef[],
    headings: Heading[],
  ): string {
    let content = n.content;
    if (headingFilter) {
      content = extractSection(content, headingFilter);
    }
    const env: MarkdownEnv = {
      resolveLink,
      resolveAsset,
      resolveVideo,
      selfSlug: n.slug,
      outgoing,
      headings,
      slugger: new GithubSlugger(),
      renderEmbed(target, heading) {
        if (depth >= MAX_EMBED_DEPTH) return null;
        const tgt = resolveNote(target);
        if (!tgt) return null;
        if (stack.has(tgt.slug)) return null; // cycle guard
        const nextStack = new Set(stack);
        nextStack.add(tgt.slug);
        // embeds contribute outgoing links of the host note too
        return renderNote(tgt, heading, depth + 1, nextStack, outgoing, []);
      },
    };
    return md.render(content, env);
  }

  // 3. Parse notes
  const parsedNotes: Note[] = [];
  for (const n of notes) {
    const outgoing: LinkRef[] = [];
    const headings: Heading[] = [];
    const stack = new Set<string>([n.slug]);
    let html = renderNote(n, null, 0, stack, outgoing, headings);
    // The note title is rendered by the shell; drop a leading H1 that just
    // repeats it (and its TOC entry) to avoid a duplicated heading.
    if (headings[0]?.level === 1 && headings[0].text.trim() === n.title.trim()) {
      html = html.replace(/^\s*<h1\b[^>]*>[\s\S]*?<\/h1>\s*/, '');
      headings.shift();
    }
    parsedNotes.push({
      slug: n.slug,
      title: n.title,
      html,
      markdown: n.content,
      headings,
      backlinks: [],
      outgoing,
      frontmatter: n.data,
      publish: n.publish,
    });
  }

  // 4. Backlinks: invert outgoing
  const noteBySlug = new Map(parsedNotes.map((p) => [p.slug, p]));
  for (const src of parsedNotes) {
    for (const link of src.outgoing) {
      const target = noteBySlug.get(link.slug);
      if (!target || target.slug === src.slug) continue;
      if (!target.backlinks.some((b) => b.slug === src.slug)) {
        target.backlinks.push({ slug: src.slug, title: src.title });
      }
    }
  }

  // 5. Parse canvases
  interface ParsedCanvas {
    slug: string;
    title: string;
    model: CanvasModel;
  }
  const parsedCanvases: ParsedCanvas[] = [];
  for (const rel of canvasFiles) {
    const absPath = path.join(vaultDir, rel);
    const raw = await fs.readFile(absPath, 'utf8');
    const canvas = JSON.parse(raw) as ObsidianCanvas;
    const model = normalizeCanvas(canvas, {
      resolveLink,
      resolveAsset,
      renderText(text) {
        return md.render(text, makeCanvasEnv(resolveLink, resolveAsset));
      },
      resolveFileNode(file, anchor): CanvasResolved | null {
        const n = resolveNote(file);
        if (!n) return null;
        // `notes` is already mode-filtered (public build excludes private),
        // so membership alone decides availability.
        if (!notes.includes(n)) {
          return {
            slug: n.slug,
            title: n.title || n.base,
            html: '<p class="canvas-unavailable">Недоступно</p>',
            available: false,
          };
        }
        const html = renderNote(
          n,
          anchor ? anchor : null,
          0,
          new Set<string>([n.slug]),
          [],
          [],
        );
        const thumb = resolveAsset(`${n.base}.thumb.jpg`);
        return { slug: n.slug, title: n.title, html, available: true, thumbUrl: thumb?.url };
      },
    });
    parsedCanvases.push({ slug: pathToSlug(rel), title: baseName(rel), model });
  }

  // 6. Assets already materialized synchronously during resolveAsset.

  // 7. Emit
  const notesOutDir = path.join(outDir, 'notes');
  await fs.mkdir(notesOutDir, { recursive: true });
  for (const note of parsedNotes) {
    const file = path.join(notesOutDir, `${note.slug}.json`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(note, null, 2), 'utf8');
  }

  const canvasOutDir = path.join(outDir, 'canvas');
  await fs.mkdir(canvasOutDir, { recursive: true });
  for (const c of parsedCanvases) {
    const file = path.join(canvasOutDir, `${c.slug}.json`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(c.model, null, 2), 'utf8');
  }

  // link graph: nodes = notes, edges = resolved internal outgoing links
  // (deduped undirected, self-links dropped). degree drives node sizing.
  const slugSet = new Set(parsedNotes.map((p) => p.slug));
  const degree = new Map<string, number>();
  const seenEdge = new Set<string>();
  const graphLinks: GraphLink[] = [];
  for (const n of parsedNotes) {
    for (const link of n.outgoing) {
      if (!slugSet.has(link.slug) || link.slug === n.slug) continue;
      const key =
        n.slug < link.slug
          ? `${n.slug} ${link.slug}`
          : `${link.slug} ${n.slug}`;
      if (seenEdge.has(key)) continue;
      seenEdge.add(key);
      graphLinks.push({ source: n.slug, target: link.slug });
      degree.set(n.slug, (degree.get(n.slug) ?? 0) + 1);
      degree.set(link.slug, (degree.get(link.slug) ?? 0) + 1);
    }
  }
  const graph: GraphData = {
    nodes: parsedNotes.map((p) => ({
      slug: p.slug,
      title: p.title,
      degree: degree.get(p.slug) ?? 0,
    })),
    links: graphLinks,
  };
  await fs.writeFile(
    path.join(outDir, 'graph.json'),
    JSON.stringify(graph),
    'utf8',
  );

  // search index: plain-text body per note, for keyword scoring + snippets in
  // the search service and the WebMCP `search_notes` tool (and the embeddings
  // step downstream). Markdown stripped to text; canvases are not full-text.
  const searchDocs: SearchDoc[] = parsedNotes.map((p) => ({
    slug: p.slug,
    title: p.title,
    url: `/${p.slug}`,
    text: markdownToText(p.markdown),
  }));
  const searchIndex: SearchIndex = { docs: searchDocs };
  await fs.writeFile(
    path.join(outDir, 'search-index.json'),
    JSON.stringify(searchIndex),
    'utf8',
  );

  // manifest
  const routes: RouteEntry[] = [
    ...parsedNotes.map((n) => ({
      slug: n.slug,
      kind: 'note' as const,
      title: n.title,
    })),
    ...parsedCanvases.map((c) => ({
      slug: c.slug,
      kind: 'canvas' as const,
      title: c.title,
    })),
  ];
  routes.sort((a, b) => a.slug.localeCompare(b.slug));

  // Home: an explicit "home" note, else a root-level welcome/index note
  // (Obsidian Publish's configured homepage isn't stored in the local vault),
  // else the first route.
  const homeHints = ['добро пожаловать', 'welcome', 'home', 'index', 'readme'];
  const isRoot = (n: NoteEntry) => !n.relPath.includes('/');
  const explicitHome = opts.homeNote?.trim().toLowerCase();
  const homeNote =
    (explicitHome
      ? notes.find((n) => n.base.toLowerCase() === explicitHome) ??
        notes.find((n) => n.slug === pathToSlug(opts.homeNote!.trim()))
      : undefined) ??
    notes.find((n) => n.base.toLowerCase() === 'home') ??
    notes.find(
      (n) =>
        isRoot(n) &&
        homeHints.some((h) => n.base.toLowerCase().includes(h)),
    );
  const homeSlug = homeNote
    ? homeNote.slug
    : routes.length
      ? routes[0].slug
      : '';

  const nav = buildNav([
    ...parsedNotes.map((n) => ({
      slug: n.slug,
      title: n.title,
      type: 'note' as const,
    })),
    ...parsedCanvases.map((c) => ({
      slug: c.slug,
      title: c.title,
      type: 'canvas' as const,
    })),
  ]);

  const manifest: Manifest = {
    site: {
      title: opts.siteName?.trim() || path.basename(vaultDir),
      homeSlug,
      defaultTheme: 'light',
      url: (opts.siteUrl ?? '').replace(/\/+$/, ''),
      description: opts.siteDescription?.trim() || '',
      lang: opts.siteLang?.trim() || 'en',
      footer: opts.siteFooter?.trim() || '',
    },
    routes,
    nav,
  };
  await fs.writeFile(
    path.join(outDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );
}

/** Strip markdown syntax to readable plain text (for search scoring/snippets
 *  and embeddings). Keeps link/wikilink display text, drops code/markup. */
function markdownToText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    .replace(/`[^`]*`/g, ' ') // inline code
    .replace(/!\[\[[^\]]*\]\]/g, ' ') // embeds
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2') // [[target|alias]] -> alias
    .replace(/\[\[([^\]]+)\]\]/g, '$1') // [[target]] -> target
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [text](url) -> text
    .replace(/^>+\s?/gm, '') // blockquote markers
    .replace(/^#{1,6}\s+/gm, '') // heading markers
    .replace(/^\s{0,3}[-*+]\s+/gm, '') // list bullets
    .replace(/[*_~]{1,3}/g, '') // emphasis markers
    .replace(/<[^>]+>/g, ' ') // raw html tags
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract a section starting at the given heading until the next heading of
 *  equal/higher level. Heading matched by slugified comparison. */
function extractSection(content: string, heading: string): string {
  const targetSlug = new GithubSlugger().slug(heading);
  const lines = content.split('\n');
  let startIdx = -1;
  let startLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.+)$/.exec(lines[i]);
    if (!m) continue;
    if (new GithubSlugger().slug(m[2].trim()) === targetSlug) {
      startIdx = i;
      startLevel = m[1].length;
      break;
    }
  }
  if (startIdx === -1) return content;
  const out: string[] = [lines[startIdx]];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s+/.exec(lines[i]);
    if (m && m[1].length <= startLevel) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

interface NavEntry {
  slug: string;
  title: string;
  type: 'note' | 'canvas';
}

/** Build a folder tree NavNode[] from note/canvas slugs. */
function buildNav(entries: NavEntry[]): NavNode[] {
  const root: NavNode[] = [];
  const sorted = [...entries].sort((a, b) => a.slug.localeCompare(b.slug));
  for (const entry of sorted) {
    const parts = entry.slug.split('/');
    let level = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i];
      let folder = level.find(
        (nd) => nd.type === 'folder' && nd.name === name,
      );
      if (!folder) {
        folder = { type: 'folder', name, children: [] };
        level.push(folder);
      }
      level = folder.children!;
    }
    level.push({ type: entry.type, name: entry.title, slug: entry.slug });
  }
  // Folders first, then notes/canvases, each alphabetically (Obsidian order).
  const sortLevel = (nodes: NavNode[]): void => {
    nodes.sort(
      (a, b) =>
        (a.type === 'folder' ? 0 : 1) - (b.type === 'folder' ? 0 : 1) ||
        a.name.localeCompare(b.name),
    );
    for (const node of nodes) {
      if (node.children) {
        sortLevel(node.children);
      }
    }
  };
  sortLevel(root);
  return root;
}
