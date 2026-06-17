const http = require('http');
const fs = require('fs');
const path = require('path');

const publicPath = path.join(__dirname, '..', 'public');
const port = process.env.PORT || 8765;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const f = path.join(publicPath, p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.setHeader('Content-Type', mime[path.extname(f).toLowerCase()] || 'application/octet-stream');
    fs.createReadStream(f).pipe(res);
  } else {
    res.statusCode = 404;
    res.end('404: ' + p);
  }
});

server.listen(port, () => {
  console.log('Server on http://localhost:' + port);
});
