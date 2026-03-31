// Proxies football-data.org API for FIFA World Cup 2026 standings and matches
const https = require('https');

const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const BASE = 'https://api.football-data.org/v4/competitions/WC';

function fetchAPI(path) {
  return new Promise((resolve, reject) => {
    const url = `${BASE}${path}`;
    const options = {
      headers: { 'X-Auth-Token': API_KEY },
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`API ${res.statusCode}: ${data}`));
        } else {
          resolve(JSON.parse(data));
        }
      });
    }).on('error', reject);
  });
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=120, s-maxage=120',
  };

  if (!API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'FOOTBALL_DATA_API_KEY not configured' }) };
  }

  try {
    const type = event.queryStringParameters?.type || 'all';

    if (type === 'standings') {
      const data = await fetchAPI('/standings');
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    if (type === 'matches') {
      const data = await fetchAPI('/matches');
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // Default: fetch both
    const [standings, matches] = await Promise.all([
      fetchAPI('/standings'),
      fetchAPI('/matches'),
    ]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ standings, matches }),
    };
  } catch (err) {
    console.error('Mundial API error:', err.message);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch World Cup data', detail: err.message }),
    };
  }
};
