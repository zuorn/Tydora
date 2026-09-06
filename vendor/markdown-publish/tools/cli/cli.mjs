#!/usr/bin/env node
import { parseFlags, resolveConfig } from './resolve-config.mjs';
import { runBuild } from './run-build.mjs';

const USAGE =
  'Usage: markdown-publish build [--vault <dir>] [--out <dir>] [--config <file>]\n' +
  '       [--vault-dir <dir>] [--site-name <s>] [--site-url <s>] [--site-lang <s>]\n' +
  '       [--site-description <s>] [--site-footer <s>] [--build-mode full|public]';

const [cmd, ...rest] = process.argv.slice(2);
if (cmd !== 'build') {
  console.error(USAGE);
  process.exit(cmd ? 1 : 0);
}

const flags = parseFlags(rest);
const cfg = resolveConfig({ flags, env: process.env, cwd: process.cwd() });
try {
  const out = runBuild(cfg, { cwd: process.cwd() });
  console.log(`✓ Site built to ${out}`);
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
