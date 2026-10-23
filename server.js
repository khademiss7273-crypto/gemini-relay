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

  const startTime = Date.now();
  const bodyChunks = [];
  req.on('data', chunk => {
    bodyChunks.push(chunk);
  });

  req.on('end', () => {
    let requestBody = Buffer.concat(bodyChunks);
    let targetPath = req.url;
    let methodToSend = req.method;

    // تبدیل خودکار مدل منسوخ به مدل فعال و پرسرعت در صورت ارسال از افزونه
    if (targetPath.includes('gemini-2.5-flash')) {
      targetPath = targetPath.replace('gemini-2.5-flash', 'gemini-1.5-flash');
      console.log(`[MODEL REWRITE] Replaced gemini-2.5-flash with gemini-1.5-flash`);
    }

    // اصلاح ارسال بدنه در صورت تبدیل شدن به کوئری در وردپرس
    if (requestBody.length === 0 && (req.url.includes('?{%22contents%22') || req.url.includes('?{"contents"'))) {
      const parts = req.url.split('?');
      targetPath = parts[0];
      const rawQuery = decodeURIComponent(parts.slice(1).join('?'));
      requestBody = Buffer.from(rawQuery, 'utf8');
      methodToSend = 'POST';
    }

    if (targetPath.includes(':generateContent') && methodToSend === 'GET') {
      methodToSend = 'POST';
    }

    const headers = { ...req.headers };
    headers['host'] = TARGET_HOST;
    headers['content-type'] = 'application/json';

    // حذف هدرهای اتصال هاست برای جلوگیری از بسته‌شدن پیش‌رس سوکت
    delete headers['connection'];
    delete headers['keep-alive'];

    if (requestBody.length > 0) {
      headers['content-length'] = Buffer.byteLength(requestBody);
    } else {
      delete headers['content-length'];
    }

    console.log(`[OUTGOING] ${methodToSend} to ${targetPath.slice(0, 60)}...`);

    const options = {
      hostname: TARGET_HOST,
      port: 443,
      path: targetPath,
      method: methodToSend,
      headers: headers
    };

    const proxyReq = https.request(options, (proxyRes) => {
      console.log(`[RESPONSE] Status: ${proxyRes.statusCode} after ${Date.now() - startTime}ms`);
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
