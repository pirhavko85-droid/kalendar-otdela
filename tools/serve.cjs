const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/manifest.json', ['manifest.json', 'application/manifest+json']],
  ['/sw.js', ['sw.js', 'text/javascript; charset=utf-8']],
  ['/data.enc.json', ['data.enc.json', 'application/json']]
]);
const server = http.createServer((req, res) => {
  const entry = files.get(new URL(req.url, 'http://localhost').pathname);
  if (!entry || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  fs.readFile(path.join(root, entry[0]), (err, data) => {
    if (err) { res.writeHead(500); res.end('Read error'); return; }
    res.writeHead(200, {'Content-Type': entry[1], 'Cache-Control': 'no-store'});
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});
server.on('error', err => { console.error(err.message); process.exitCode = 1; });
server.listen(4173, '127.0.0.1', () => console.log('Dashboard: http://127.0.0.1:4173'));
