// Emit robots.txt + sitemap.xml + llms.txt + 404.html into the built site from
// the prerendered route list. Base URL comes from $SITE_URL (set at deploy).
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import * as path from 'node:path';

const distDir = path.resolve('dist/markdown-publish');
const browserDir = path.join(distDir, 'browser');
const siteUrl = (process.env.SITE_URL ?? 'http://localhost:4301').replace(/\/+$/, '');

const { routes } = JSON.parse(
  readFileSync(path.join(distDir, 'prerendered-routes.json'), 'utf8'),
);
// Prerendered route paths include the base href (e.g. /repo/note) while
// siteUrl already ends with the same path — strip it or every URL doubles.
const basePath = (process.env.BASE_HREF ?? '/').replace(/\/+$/, '');
const routePaths = Object.keys(routes).map((r) =>
  basePath && r.startsWith(basePath) ? r.slice(basePath.length) || '/' : r,
);
const urls = routePaths.map((r) => `${siteUrl}${encodeURI(r)}`);

// --- sitemap.xml ---
const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n') +
  '\n</urlset>\n';
writeFileSync(path.join(browserDir, 'sitemap.xml'), sitemap);

// --- robots.txt ---
const robots = `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
writeFileSync(path.join(browserDir, 'robots.txt'), robots);

// --- llms.txt (llmstxt.org): a map of the site for AI crawlers/agents ---
let manifest = { site: { title: 'Notes', description: '' }, routes: [] };
const manifestPath = path.join(browserDir, 'content', 'manifest.json');
if (existsSync(manifestPath)) {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
}
const titleBySlug = new Map(
  (manifest.routes ?? []).map((r) => [`/${r.slug}`, r.title]),
);
const noteLines = routePaths
  .filter((p) => p !== '/' && p !== '/graph')
  .map((p) => `- [${titleBySlug.get(p) ?? p}](${siteUrl}${encodeURI(p)})`);
const llms =
  `# ${manifest.site.title}\n\n` +
  (manifest.site.description ? `> ${manifest.site.description}\n\n` : '') +
  'This site is a published knowledge base. Each note is reachable as HTML at ' +
  'its URL.\n\n' +
  '## Notes\n\n' +
  noteLines.join('\n') +
  '\n';
writeFileSync(path.join(browserDir, 'llms.txt'), llms);

// --- 404.html: SPA fallback so deep links to unknown paths still boot the app
// (which client-routes to the not-found view). Hosts that honor 404.html use it.
const indexHtml = path.join(browserDir, 'index.html');
if (existsSync(indexHtml)) {
  copyFileSync(indexHtml, path.join(browserDir, '404.html'));
}

console.log(
  `SEO: ${urls.length} urls -> sitemap.xml + robots.txt + llms.txt (${noteLines.length} notes) + 404.html (base ${siteUrl})`,
);
