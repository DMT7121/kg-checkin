import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT || process.argv[2] || 5173);
const host = process.env.HOST || '0.0.0.0';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function resolvePath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = normalize(join(root, cleanPath));
  if (!candidate.startsWith(root)) return { path: join(root, 'index.html'), found: true };
  if (existsSync(candidate) && statSync(candidate).isFile()) return { path: candidate, found: true };
  if (cleanPath.startsWith('/assets/')) return { path: candidate, found: false };
  return { path: join(root, 'index.html'), found: true };
}

createServer((req, res) => {
  const resolved = resolvePath(req.url || '/');
  if (!resolved.found) {
    res.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end('Not found');
    return;
  }

  const path = resolved.path;
  const type = types[extname(path)] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
  });
  createReadStream(path).pipe(res);
}).listen(port, host, () => {
  console.log(`Serving ${root} at http://${host}:${port}`);
});
