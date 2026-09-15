// Dev-only helper: serves the statically exported app (out/) on WEB_PORT.
// Used because output:'export' has no bundled static server.
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'out');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json',
  '.txt': 'text/plain', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

// Containment guard (same pattern as StorageService.assertSafeRef): a request
// path like /%2e%2e/%2e%2e/package.json must never resolve outside out/.
const rootAbs = path.resolve(root);
const insideRoot = (candidate) => {
  const resolved = path.resolve(candidate);
  return resolved === rootAbs || resolved.startsWith(rootAbs + path.sep);
};

http.createServer((req, res) => {
  let p;
  try {
    p = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    res.writeHead(400);
    return res.end('bad request');
  }
  if (p.includes('\0')) {
    res.writeHead(400);
    return res.end('bad request');
  }
  const candidates = [
    path.join(root, p.endsWith('/') ? p + 'index.html' : p),
    // Extensionless deep links map to their directory index (out/sites/new/),
    // so a bookmarked /sites/new serves the real page instead of 404.html.
    path.join(root, p.endsWith('/') ? p + 'index.html' : p + '/index.html'),
    path.join(root, p + '.html'),
    path.join(root, '404.html'),
  ].filter(insideRoot);
  (function next(i) {
    if (i >= candidates.length) { res.writeHead(404); return res.end('not found'); }
    fs.stat(candidates[i], (e, st) => {
      if (e || !st.isFile()) return next(i + 1);
      fs.readFile(candidates[i], (err, data) => {
        if (err) { res.writeHead(500); return res.end(); }
        res.writeHead(200, { 'Content-Type': types[path.extname(candidates[i])] || 'text/plain', 'Cache-Control': 'no-cache' });
        res.end(data);
      });
    });
  })(0);
}).listen(3001, '0.0.0.0');
console.log('static export served on 3001');