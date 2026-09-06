import { spawnSync } from 'node:child_process';
import { cpSync, rmSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// tools/cli/run-build.mjs → package root is two levels up.
const PKG_ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
const DIST_BROWSER = join(PKG_ROOT, 'dist', 'markdown-publish', 'browser');
const SEP = process.platform === 'win32' ? ';' : ':';

const requireFromPkg = createRequire(join(PKG_ROOT, 'package.json'));

/**
 * Locate a package's install directory by scanning the resolver's candidate
 * node_modules paths for `<dir>/<pkg>/package.json` on disk. Unlike
 * `require.resolve(pkg)`, this does not go through the package's `exports`
 * map, so it works even for packages (e.g. pagefind) that export no `.` or
 * `./package.json` subpath.
 */
function packageDir(pkg) {
  for (const base of requireFromPkg.resolve.paths(pkg) ?? []) {
    const cand = join(base, ...pkg.split('/'), 'package.json');
    if (existsSync(cand)) return dirname(cand);
  }
  throw new Error(`Cannot locate package directory for "${pkg}"`);
}

/**
 * Resolve a package's executable JS entry from its own node_modules, so we can
 * run it via `node <entry>` with no shell. Reads the package's `package.json`
 * `bin` field (string → that file; object → the named bin) and resolves it to
 * an absolute path. This keeps paths with spaces intact and avoids DEP0190.
 */
function resolveBinJs(pkg, binName) {
  const pkgDir = packageDir(pkg);
  const { bin } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  const rel = typeof bin === 'string' ? bin : bin?.[binName ?? pkg];
  if (!rel) {
    throw new Error(`Cannot resolve bin "${binName ?? pkg}" for package "${pkg}"`);
  }
  return resolve(pkgDir, rel);
}

const BIN = {
  tsx: resolveBinJs('tsx'),
  ng: resolveBinJs('@angular/cli', 'ng'),
  pagefind: resolveBinJs('pagefind'),
};

/** Spawn `node <binJs> <args...>` with no shell on every platform. */
function runNode(binJs, args, env) {
  const res = spawnSync(process.execPath, [binJs, ...args], {
    cwd: PKG_ROOT,
    stdio: 'inherit',
    env,
    shell: false,
  });
  if (res.status !== 0) {
    throw new Error(`node ${binJs} ${args.join(' ')} failed (exit ${res.status})`);
  }
}

/** Run the full build pipeline against the user's vault, emit to cfg.out. */
export function runBuild(cfg, { cwd = process.cwd() } = {}) {
  const vaultPath = cfg.vault
    ? resolve(cwd, cfg.vault)
    : resolve(cwd, cfg.vaultDir);
  if (!existsSync(vaultPath)) {
    throw new Error(`Vault not found: ${vaultPath}`);
  }
  const outPath = resolve(cwd, cfg.out);

  // Base href must start and end with '/'. For a GitHub Pages project site this
  // is "/<repo>/"; for a user/root site or custom domain it stays "/".
  let baseHref = String(cfg.baseHref ?? '/').trim() || '/';
  if (!baseHref.startsWith('/')) baseHref = '/' + baseHref;
  if (!baseHref.endsWith('/')) baseHref += '/';

  const env = {
    ...process.env,
    VAULT: vaultPath,
    BASE_HREF: baseHref,
    CONTENT_OUT: join(PKG_ROOT, 'src', 'content'),
    BUILD_MODE: cfg.buildMode,
    SITE_NAME: cfg.siteName,
    SITE_URL: cfg.siteUrl,
    SITE_LANG: cfg.siteLang,
    SITE_DESCRIPTION: cfg.siteDescription,
    SITE_FOOTER: cfg.siteFooter,
    HOME_NOTE: cfg.home,
    PATH: `${join(PKG_ROOT, 'node_modules', '.bin')}${SEP}${process.env.PATH ?? ''}`,
  };

  // Clean disposable per-invocation outputs.
  rmSync(join(PKG_ROOT, 'src', 'content'), { recursive: true, force: true });
  rmSync(join(PKG_ROOT, 'dist'), { recursive: true, force: true });

  runNode(BIN.tsx, ['tools/vault-parser/run.ts'], env); // → src/content
  runNode(BIN.ng, ['build', '--base-href', baseHref], env); // → dist/markdown-publish/browser
  runNode(BIN.pagefind, ['--site', DIST_BROWSER], env); // search index
  runNode(join(PKG_ROOT, 'tools', 'gen-seo.mjs'), [], env); // robots/sitemap/llms/404
  runNode(join(PKG_ROOT, 'tools', 'gen-og.mjs'), [], env); // og.png with the site name

  rmSync(outPath, { recursive: true, force: true });
  mkdirSync(outPath, { recursive: true });
  cpSync(DIST_BROWSER, outPath, { recursive: true });
  return outPath;
}
