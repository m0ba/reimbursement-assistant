import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const port = Number(process.env.PORT || 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.gz': 'application/gzip',
  '.webmanifest': 'application/manifest+json',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pdf': 'application/pdf',
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(root, url === '/' ? 'index.html' : url);
  if (!file.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(root, 'index.html');
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' || url.endsWith('version.json') ? 'no-store' : 'public, max-age=3600',
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`报销助手已启动：http://localhost:${port}`);
  console.log('同一局域网的手机可用本机 IP 访问，端口同上。');
});
