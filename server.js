const http = require('http');
const https = require('https');

const TARGET_HOST = 'generativelanguage.googleapis.com';
const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  // هدرهای CORS برای ارتباط بدون مانع
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const startTime = Date.now();
  const bodyChunks = [];

  req.on('data', chunk => {
    bodyChunks.push(chunk);
  });

  req.on('end', () => {
    let requestBody = Buffer.concat(bodyChunks);
    let targetPath = req.url;
    let methodToSend = req.method;

    // تبدیل خودکار هرگونه نام مدل قدیمی/منسوخ به مدل رسمی اعلام‌شده توسط گوگل
    targetPath = targetPath.replace(/gemini-[a-zA-Z0-9.-]+/g, 'gemini-3.8-flash');

    // تصحیح درخواست‌هایی که وردپرس بدنه جیسون را در کوئری آدرس می‌چسباند
    if (requestBody.length === 0 && (req.url.includes('?{%22contents%22') || req.url.includes('?{"contents"'))) {
      const parts = req.url.split('?');
      targetPath = parts[0].replace(/gemini-[a-zA-Z0-9.-]+/g, 'gemini-3.8-flash');
      const rawQuery = decodeURIComponent(parts.slice(1).join('?'));
      requestBody = Buffer.from(rawQuery, 'utf8');
      methodToSend = 'POST';
      console.log('[CORRECTION] Extracted JSON payload from query string to POST body.');
    }

    if (targetPath.includes(':generateContent') && methodToSend === 'GET') {
      methodToSend = 'POST';
    }

    const headers = { ...req.headers };
    headers['host'] = TARGET_HOST;
    headers['content-type'] = 'application/json';

    delete headers['connection'];
    delete headers['keep-alive'];

    if (requestBody.length > 0) {
      headers['content-length'] = Buffer.byteLength(requestBody);
    } else {
      delete headers['content-length'];
    }

    console.log(`[FORWARDING] ${methodToSend} -> ${targetPath.slice(0, 70)}...`);

    const options = {
      hostname: TARGET_HOST,
      port: 443,
      path: targetPath,
      method: methodToSend,
      headers: headers
    };

    const proxyReq = https.request(options, (proxyRes) => {
      console.log(`[RESPONSE] Status: ${proxyRes.statusCode} (${Date.now() - startTime}ms)`);
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('[PROXY ERROR]', err);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Relay failed', details: err.message }));
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
