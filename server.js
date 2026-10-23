const http = require('http');
const https = require('https');

const TARGET_HOST = 'generativelanguage.googleapis.com';
const PORT = process.env.PORT || 10000;

// سریع‌ترین مدل با کمترین تاخیر در اکانت شما
const ACTIVE_MODEL = 'gemini-flash-lite-latest';

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

  req.on('data', chunk => bodyChunks.push(chunk));

  req.on('end', () => {
    let requestBody = Buffer.concat(bodyChunks);
    let targetPath = req.url;
    let methodToSend = req.method;

    // نگاشت به سریع‌ترین مدل
    targetPath = targetPath.replace(/gemini-[a-zA-Z0-9.-]+/g, ACTIVE_MODEL);

    // بررسی و استخراج دیتای بدنه در صورتی که در URL آمده باشد
    if (requestBody.length === 0 && (req.url.includes('?{%22contents%22') || req.url.includes('?{"contents"'))) {
      const parts = req.url.split('?');
      targetPath = parts[0].replace(/gemini-[a-zA-Z0-9.-]+/g, ACTIVE_MODEL);
      const rawQuery = decodeURIComponent(parts.slice(1).join('?'));
      requestBody = Buffer.from(rawQuery, 'utf8');
      methodToSend = 'POST';
    }

    if (targetPath.includes(':generateContent') && methodToSend === 'GET') {
      methodToSend = 'POST';
    }

    // بهینه‌سازی سرعت: غیرفعال کردن زمان تفکر (Thinking Budget = 0) برای دریافت آنی پاسخ
    if (requestBody.length > 0) {
      try {
        const json = JSON.parse(requestBody.toString('utf8'));
        if (!json.generationConfig) {
          json.generationConfig = {};
        }
        // قطع زمان تفکر مدل برای سرعت حداکثری
        json.generationConfig.thinkingConfig = { thinkingBudget: 0 };
        // محدود کردن سقف خروجی برای بازگشت سریع مقاله زیر 20 ثانیه
        if (!json.generationConfig.maxOutputTokens || json.generationConfig.maxOutputTokens > 2048) {
          json.generationConfig.maxOutputTokens = 2048;
        }
        requestBody = Buffer.from(JSON.stringify(json), 'utf8');
      } catch (e) {
        // در صورت عدم پارس جیسون، بدنه اصلی ارسال می‌شود
      }
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

    console.log(`[FORWARDING] -> ${ACTIVE_MODEL}`);

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
  console.log(`Fast Relay active on port ${PORT}`);
});
