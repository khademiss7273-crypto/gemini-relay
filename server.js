const http = require('http');
const https = require('https');

const TARGET_HOST = 'generativelanguage.googleapis.com';
const PORT = process.env.PORT || 10000;

function sendToGoogle(options, requestBody) {
  return new Promise((resolve, reject) => {
    const proxyReq = https.request(options, (proxyRes) => {
      const chunks = [];
      proxyRes.on('data', c => chunks.push(c));
      proxyRes.on('end', () => {
        resolve({
          statusCode: proxyRes.statusCode,
          headers: proxyRes.headers,
          body: Buffer.concat(chunks)
        });
      });
    });

    proxyReq.on('error', reject);

    if (requestBody && requestBody.length > 0) {
      proxyReq.write(requestBody);
    }
    proxyReq.end();
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const bodyChunks = [];
  req.on('data', chunk => bodyChunks.push(chunk));

  req.on('end', async () => {
    let requestBody = Buffer.concat(bodyChunks);
    let targetPath = req.url;
    let methodToSend = req.method;

    // رفع مشکل قرارگیری بدنه جیسون در آدرس کوئری
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
    delete headers['connection'];
    delete headers['keep-alive'];

    if (requestBody.length > 0) {
      headers['content-length'] = Buffer.byteLength(requestBody);
    } else {
      delete headers['content-length'];
    }

    // مدل‌های مجاز به ترتیب اولویت برای دور زدن ترافیک 503
    const candidateModels = ['gemini-3.8-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp'];
    let lastResponse = null;

    for (let i = 0; i < candidateModels.length; i++) {
      const currentModel = candidateModels[i];
      const currentPath = targetPath.replace(/gemini-[a-zA-Z0-9.-]+/g, currentModel);

      const options = {
        hostname: TARGET_HOST,
        port: 443,
        path: currentPath,
        method: methodToSend,
        headers: headers
      };

      console.log(`[TRY ${i + 1}] Requesting model: ${currentModel}`);
      try {
        lastResponse = await sendToGoogle(options, requestBody);
        
        // اگر پاسخ موفق بود یا خطای دیگری غیر از شلوغی سرور (503) بود، چرخه را تمام کن
        if (lastResponse.statusCode !== 503) {
          break;
        }
        console.log(`[503 DETECTED] Model ${currentModel} busy, trying next model...`);
      } catch (err) {
        console.error(`[ERROR]`, err);
      }
    }

    if (lastResponse) {
      res.writeHead(lastResponse.statusCode, lastResponse.headers);
      res.end(lastResponse.body);
    } else {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'All upstream models busy or unreachable' }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Smart Relay active on port ${PORT}`);
});
