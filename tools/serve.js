/**
 * A static server for `docs/`, in the standard library and nothing else.
 *
 * The application needs no build step and no server to be developed -- but it
 * does need one to be RUN, because ES modules and fetch() are refused over
 * file://. Rather than ask a reviewer to have Python, or to install a package
 * so that a project with no dependencies can be looked at, this is forty lines
 * of node:http.
 *
 *   npm start            then open http://localhost:8000/app/
 *   npm start -- 8123    on another port
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../docs', import.meta.url)));
const PORT = Number(process.argv[2]) || 8000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(ROOT, url);
  // Never serve outside docs/, whatever the request says.
  if (!path.resolve(file).startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      // The source is edited while the page is open; never hand back a copy.
      'cache-control': 'no-store',
    }).end(data);
  });
}).listen(PORT, () => {
  console.log(`aLOTofImaginArches — http://localhost:${PORT}/app/`);
  console.log(`user guide        — http://localhost:${PORT}/`);
});
