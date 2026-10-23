const http = require('http');
const https = require('https');

const TARGET_HOST = 'generativelanguage.googleapis.com';
const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  // تنظیم هدرهای CORS برای ارتباط بدون مانع
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const options = {
    hostname: TARGET_HOST,
    port: 443,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: TARGET_HOST
    }
  };

  // حذف هدرهایی که ممکن است در ارسال مجدد به سرور مقصد تداخل ایجاد کنند
  delete options.headers['content-length'];

  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Relay error:', err);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Relay connection failed', details: err.message }));
  });

  // انتقال مستقیم و بدون دستکاری بدنه درخواست وردپرس به گوگل
  req.pipe(proxyReq);
});

server.listen(PORT, () => {
  console.log(`Relay active on port ${PORT}`);
});
