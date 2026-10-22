const http = require('http');
const https = require('https');

const server = http.createServer((req, res) => {
  const targetUrl = 'https://generativelanguage.googleapis.com' + req.url;
  const parsed = new URL(targetUrl);

  const headers = { ...req.headers };
  delete headers.host;

  const proxyReq = https.request(parsed, {
    method: req.method,
    headers: headers,
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  });

  req.pipe(proxyReq);
});

const port = process.env.PORT || 10000;
server.listen(port, '0.0.0.0', () => {
  console.log(`Relay active on port ${port}`);
});
