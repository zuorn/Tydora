import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const root = process.argv[2] ?? 'dist/markdown-publish/browser';
const port = Number(process.argv[3] ?? 4301);
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

async function tryFile(p) {
  try { const s = await stat(p); if (s.isFile()) return p; } catch {}
  return null;
}

createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file =
    (await tryFile(join(root, url))) ??
    (await tryFile(join(root, url, 'index.html'))) ??
    join(root, 'index.html');
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
