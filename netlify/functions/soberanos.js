// Fetches sovereign bond USD prices from data912 (tickers ending in D)
const https = require('https');

const BONDS_URL = 'https://data912.com/live/arg_bonds';
const TICKERS_USD = ['BPD7D','AO27D','AN29D','AL29D','AL30D','AL35D','AE38D','AL41D','GD29D','GD30D','GD35D','GD38D','GD41D'];

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  try {
    const bonds = await fetchJSON(BONDS_URL);

    const result = [];
    for (const bond of bonds) {
      if (!TICKERS_USD.includes(bond.symbol)) continue;
      const priceUsd = parseFloat(bond.c) || 0;
      if (priceUsd <= 0) continue;
      const baseSymbol = bond.symbol.replace(/D$/, '');
      result.push({
        symbol: baseSymbol,
        price_usd: priceUsd,
        bid: parseFloat(bond.px_bid) || 0,
        ask: parseFloat(bond.px_ask) || 0,
        volume: bond.v || 0,
        pct_change: bond.pct_change || 0,
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data: result, source: 'data912' }),
    };
  } catch (e) {
    console.error('Soberanos fetch error:', e);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Failed to fetch sovereign bond data' }) };
  }
};

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON from ' + url)); }
      });
    }).on('error', reject);
  });
}
