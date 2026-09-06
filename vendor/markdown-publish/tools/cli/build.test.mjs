import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBuild } from './run-build.mjs';
import { resolveConfig } from './resolve-config.mjs';

const PKG_ROOT = resolve(fileURLToPath(import.meta.url), '../../..');

test('builds the fixtures vault into a complete static site under a base href', () => {
  const out = resolve(PKG_ROOT, 'tmp-test-out');
  rmSync(out, { recursive: true, force: true });
  const cfg = resolveConfig({
    flags: {
      vault: join(PKG_ROOT, 'tools/fixtures/vault'),
      out,
      siteUrl: 'http://localhost/sub',
      baseHref: '/sub/',
    },
    env: {},
    cwd: PKG_ROOT,
  });
  runBuild(cfg, { cwd: PKG_ROOT });
  for (const f of ['index.html', 'sitemap.xml', 'robots.txt', 'llms.txt', '404.html',
                   'content/manifest.json', 'pagefind/pagefind.js', 'og.png']) {
    assert.ok(existsSync(join(out, f)), `missing ${f}`);
  }
  // the generated og card must be a real 1200x630 PNG (not the html fallback)
  const png = readFileSync(join(out, 'og.png'));
  assert.equal(png.readUInt32BE(16), 1200, 'og.png width');
  assert.equal(png.readUInt32BE(20), 630, 'og.png height');
  // base-href must reach the output: the root redirect points under /sub/ (so a
  // GitHub Pages project site at user.github.io/sub doesn't 404).
  const rootHtml = readFileSync(join(out, 'index.html'), 'utf8');
  assert.match(rootHtml, /\/sub\//, 'root redirect/base did not honour --base-href');
  // sitemap urls must not double the base path (siteUrl already ends with /sub;
  // prerendered route paths also start with /sub — gen-seo strips it).
  const sitemap = readFileSync(join(out, 'sitemap.xml'), 'utf8');
  assert.doesNotMatch(sitemap, /\/sub\/sub\//, 'sitemap doubled the base path');
  assert.match(sitemap, /<loc>http:\/\/localhost\/sub\/<\/loc>|<loc>http:\/\/localhost\/sub<\/loc>/, 'sitemap missing root url');
  // wikilink hrefs must be base-RELATIVE (no leading slash): root-absolute ones
  // bypass <base href> and 404 for crawlers/middle-click on subpath sites.
  const home = readFileSync(join(out, 'content', 'notes', 'home.json'), 'utf8');
  assert.doesNotMatch(home, /class=\\"wikilink\\" href=\\"\//, 'root-absolute wikilink href found');
  assert.match(home, /class=\\"wikilink\\" href=\\"[^/]/, 'no base-relative wikilink href found');
  rmSync(out, { recursive: true, force: true });
}, { timeout: 180000 });
