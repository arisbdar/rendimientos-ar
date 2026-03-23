// Simple visit counter using counterapi.dev
const https = require('https');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject);
  });
}

exports.handler = async () => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  try {
    const data = await fetchJSON('https://api.counterapi.dev/v1/rendimientos-co/visits/up');
    return { statusCode: 200, headers, body: JSON.stringify({ count: data.count }) };
  } catch {
    return { statusCode: 200, headers, body: JSON.stringify({ count: null }) };
  }
};
