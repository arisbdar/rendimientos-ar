// Proxies Yahoo Finance for global market data with intraday sparklines
const https = require('https');

const SYMBOLS = [
  { id: 'spx', symbol: 'ES%3DF', name: 'S&P 500', icon: '📈' },
  { id: 'nasdaq', symbol: 'NQ%3DF', name: 'Nasdaq 100', icon: '💻' },
  { id: 'oil', symbol: 'CL%3DF', name: 'Petróleo WTI', icon: '🛢️' },
  { id: 'tnx', symbol: '%5ETNX', name: 'Tasa 10Y USA', icon: '🏛️' },
  { id: 'gold', symbol: 'GC%3DF', name: 'Oro', icon: '🥇' },
  { id: 'btc', symbol: 'BTC-USD', name: 'Bitcoin', icon: '₿' },
  { id: 'eth', symbol: 'ETH-USD', name: 'Ethereum', icon: 'Ξ' },
  { id: 'eurusd', symbol: 'EURUSD%3DX', name: 'EUR/USD', icon: '🇪🇺' },
];

function fetchYahoo(symbolEncoded) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbolEncoded}?interval=5m&range=1d`;
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const result = json.chart.result[0];
          const meta = result.meta;
          const closes = result.indicators.quote[0].close || [];
          // Filter out nulls and keep last ~50 points for sparkline
          const spark = closes.filter(v => v !== null);
          resolve({
            price: meta.regularMarketPrice,
            prevClose: meta.chartPreviousClose || meta.previousClose || 0,
            sparkline: spark,
          });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

exports.handler = async () => {
  try {
    const results = await Promise.allSettled(
      SYMBOLS.map(s => fetchYahoo(s.symbol))
    );

    const data = SYMBOLS.map((s, i) => {
      const r = results[i];
      if (r.status === 'fulfilled') {
        const { price, prevClose, sparkline } = r.value;
        const change = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
        return { ...s, price, prevClose, change: Math.round(change * 100) / 100, sparkline };
      }
      return { ...s, price: null, prevClose: null, change: null, sparkline: [], error: true };
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60',
      },
      body: JSON.stringify({ data, updated: new Date().toISOString() }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
