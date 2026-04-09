// Fetches top 10 BTC treasury public companies from CoinGecko + Yahoo Finance sparklines
const https = require('https');

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/companies/public_treasury/bitcoin';
const TOP_N = 10;

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchYahooSparkline(ticker) {
  const encoded = encodeURIComponent(ticker);
  const json = await httpsGet(`https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=5m&range=1d`);
  const result = json.chart.result[0];
  const meta = result.meta;
  const closes = (result.indicators.quote[0].close || []).filter(v => v !== null);
  if (closes.length < 10) {
    const json2 = await httpsGet(`https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=15m&range=5d`);
    const result2 = json2.chart.result[0];
    const meta2 = result2.meta;
    const closes2 = (result2.indicators.quote[0].close || []).filter(v => v !== null);
    return { price: meta2.regularMarketPrice, prevClose: meta2.chartPreviousClose || meta2.previousClose || 0, sparkline: closes2 };
  }
  return { price: meta.regularMarketPrice, prevClose: meta.chartPreviousClose || meta.previousClose || 0, sparkline: closes };
}

function normalizeSymbol(cgSymbol) {
  if (cgSymbol.endsWith('.T')) return cgSymbol;
  return cgSymbol.replace(/\.\w+$/, '');
}

exports.handler = async () => {
  try {
    const cgData = await httpsGet(COINGECKO_URL);
    const top = cgData.companies.slice(0, TOP_N);

    const results = await Promise.allSettled(
      top.map(c => fetchYahooSparkline(normalizeSymbol(c.symbol)))
    );

    const data = top.map((c, i) => {
      const ticker = normalizeSymbol(c.symbol);
      const r = results[i];
      if (r.status === 'fulfilled') {
        const { price, prevClose, sparkline } = r.value;
        const change = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
        return {
          id: ticker.toLowerCase(),
          ticker,
          name: c.name,
          icon: '₿',
          holdings: c.total_holdings,
          price,
          prevClose,
          change: Math.round(change * 100) / 100,
          sparkline,
        };
      }
      return {
        id: ticker.toLowerCase(),
        ticker,
        name: c.name,
        icon: '₿',
        holdings: c.total_holdings,
        price: null, prevClose: null, change: null, sparkline: [], error: true,
      };
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' },
      body: JSON.stringify({ data, updated: new Date().toISOString() }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
