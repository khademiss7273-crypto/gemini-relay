const http = require('http');
const https = require('https');

const TARGET_HOST = 'generativelanguage.googleapis.com';
const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // جمع‌آوری کامل دیتای ورودی از وردپرس
  const bodyChunks = [];
  req.on('data', chunk => {
    bodyChunks.push(chunk);
  });

  req.on('end', () => {
    const requestBody = Buffer.concat(bodyChunks);

    const headers = { ...req.headers };
    headers['host'] = TARGET_HOST;

    if (requestBody.length > 0) {
      headers['content-length'] = Buffer.byteLength(requestBody);
      if (!headers['content-type']) {
        headers['content-type'] = 'application/json';
      }
    } else {
      delete headers['content-length'];
    }

    const options = {
      hostname: TARGET_HOST,
      port: 443,
      path: req.url,
      method: req.method,
      headers: headers
    };

    const proxyReq = https.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Relay error:', err);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Relay connection failed', details: err.message }));
    });

    if (requestBody.length > 0) {
      proxyReq.write(requestBody);
    }
    proxyReq.end();
  });
});

server.listen(PORT, () => {
  console.log(`Relay active on port ${PORT}`);
});
