// Fetches CEDEAR prices (ARS) from data912 and USD prices from Yahoo Finance
// Calculates CCL implícito = (cedear_price * ratio) / usd_price
// Auto-derives ratios using CCL reference when config ratios are stale
const https = require('https');

const CEDEARS_URL = 'https://data912.com/live/arg_cedears';
const CCL_URL = 'https://data912.com/live/ccl';

// In-memory cache for USD prices (refreshed every 5 min)
let usdCache = { prices: {}, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000;

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  try {
    // Fetch config for ticker names
    const configRes = await fetchJSON('https://rendimientos.co/config.json');
    const configRatios = configRes?.cedears?.ratios || {};

    // Fetch CEDEAR ARS prices + CCL data from data912 in parallel
    const [cedears, ccl] = await Promise.all([
      fetchJSON(CEDEARS_URL),
      fetchJSON(CCL_URL),
    ]);

    // Build CEDEAR price lookup
    const cedearPrices = {};
    for (const c of cedears) {
      if (c.c > 0) {
        cedearPrices[c.symbol] = {
          price: c.c,
          volume: c.v || 0,
          pct_change: c.pct_change || 0,
        };
      }
    }

    // Get CCL reference from data912 (median of top-10 most liquid)
    const cclSorted = [...ccl]
      .filter(c => parseFloat(c.CCL_mark) > 0 && parseFloat(c.ars_volume) > 0)
      .sort((a, b) => parseFloat(b.ars_volume) - parseFloat(a.ars_volume));
    const top10ccl = cclSorted.slice(0, 10).map(c => parseFloat(c.CCL_mark)).sort((a, b) => a - b);
    const mid = Math.floor(top10ccl.length / 2);
    const cclReference = top10ccl.length % 2 === 0
      ? (top10ccl[mid - 1] + top10ccl[mid]) / 2
      : top10ccl[mid];

    // Fetch USD prices from Yahoo Finance (with cache)
    const allTickers = Object.keys(configRatios);
    const now = Date.now();
    if (now - usdCache.timestamp > CACHE_TTL || Object.keys(usdCache.prices).length === 0) {
      const yahooTickers = allTickers.map(t => {
        if (t.endsWith('3') || t.endsWith('11')) return t + '.SA';
        return t;
      });
      usdCache.prices = await fetchYahooPrices(yahooTickers);
      usdCache.timestamp = now;
    }
    const usdPrices = usdCache.prices;

    // Build result using hardcoded ratios from config.json
    const result = [];
    for (const ticker of allTickers) {
      const cedear = cedearPrices[ticker];
      if (!cedear || cedear.price <= 0) continue;

      const yahooTicker = (ticker.endsWith('3') || ticker.endsWith('11')) ? ticker + '.SA' : ticker;
      const usdPrice = usdPrices[yahooTicker] || 0;

      if (usdPrice <= 0) continue;

      const ratio = configRatios[ticker]?.ratio || 1;
      const cclImplicit = (cedear.price * ratio) / usdPrice;
      const nombre = configRatios[ticker]?.nombre || ticker;

      result.push({
        symbol: ticker,
        cedear_price: cedear.price,
        usd_price: usdPrice,
        ccl_implicit: cclImplicit,
        ratio,
        nombre,
        volume: cedear.volume,
        pct_change: cedear.pct_change,
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        data: result,
        ccl_reference: cclReference,
        source: 'data912+yahoo',
        usd_count: Object.keys(usdPrices).length,
      }),
    };
  } catch (e) {
    console.error('CEDEAR fetch error:', e);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Failed to fetch CEDEAR data: ' + e.message }) };
  }
};

// Fetch USD prices from Yahoo Finance v8/chart in parallel batches
async function fetchYahooPrices(tickers) {
  const prices = {};
  const BATCH_SIZE = 50;

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (ticker) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
        const data = await fetchWithUA(url);
        const result = data?.chart?.result?.[0];
        const price = result?.meta?.regularMarketPrice;
        if (price && price > 0) {
          prices[ticker] = price;
        }
      } catch (e) {
        // Skip failed tickers
      }
    });
    await Promise.all(promises);
  }

  return prices;
}

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

function fetchWithUA(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; rendimientos-ar/1.0)' },
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject);
  });
}
