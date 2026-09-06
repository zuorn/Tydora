import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig, parseFlags } from './resolve-config.mjs';

test('defaults when nothing provided', () => {
  const c = resolveConfig({ flags: {}, env: {}, cwd: '/nope' });
  assert.equal(c.buildMode, 'full');
  assert.equal(c.siteLang, 'en');
  assert.equal(c.out, 'dist');
  assert.equal(c.vault, null);
});

test('env overrides defaults (MP_-prefixed only)', () => {
  const c = resolveConfig({ flags: {}, env: { MP_SITE_NAME: 'X', MP_BUILD_MODE: 'public' }, cwd: '/nope' });
  assert.equal(c.siteName, 'X');
  assert.equal(c.buildMode, 'public');
});

test('flags override env', () => {
  const c = resolveConfig({ flags: { siteName: 'Flag' }, env: { MP_SITE_NAME: 'Env' }, cwd: '/nope' });
  assert.equal(c.siteName, 'Flag');
});

test('bare provider env vars are ignored (Netlify sets SITE_NAME itself)', () => {
  const c = resolveConfig({ flags: {}, env: { SITE_NAME: 'magnificent-genie', SITE_URL: 'x' }, cwd: '/nope' });
  assert.equal(c.siteName, '');
  assert.equal(c.siteUrl, '');
});

test('siteUrl auto-detects from the hosting provider when not configured', () => {
  const netlify = resolveConfig({ flags: {}, env: { NETLIFY: 'true', URL: 'https://my.netlify.app' }, cwd: '/nope' });
  assert.equal(netlify.siteUrl, 'https://my.netlify.app');
  const vercel = resolveConfig({ flags: {}, env: { VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'my.vercel.app' }, cwd: '/nope' });
  assert.equal(vercel.siteUrl, 'https://my.vercel.app');
  const cf = resolveConfig({ flags: {}, env: { CF_PAGES: '1', CF_PAGES_URL: 'https://my.pages.dev' }, cwd: '/nope' });
  assert.equal(cf.siteUrl, 'https://my.pages.dev');
  // explicit config/flag wins over provider detection
  const explicit = resolveConfig({ flags: { siteUrl: 'https://mine.example' }, env: { NETLIFY: 'true', URL: 'https://x.netlify.app' }, cwd: '/nope' });
  assert.equal(explicit.siteUrl, 'https://mine.example');
});

test('home note override resolves via flag/env', () => {
  const c = resolveConfig({ flags: { home: 'Старт' }, env: {}, cwd: '/nope' });
  assert.equal(c.home, 'Старт');
  const e = resolveConfig({ flags: {}, env: { MP_HOME: 'Welcome' }, cwd: '/nope' });
  assert.equal(e.home, 'Welcome');
});

test('parseFlags maps every flag', () => {
  const f = parseFlags([
    '--vault', 'v', '--out', 'o', '--site-name', 'N',
    '--site-url', 'U', '--site-lang', 'ru', '--build-mode', 'public',
  ]);
  assert.deepEqual(f, {
    vault: 'v', out: 'o', siteName: 'N', siteUrl: 'U', siteLang: 'ru', buildMode: 'public',
  });
});
