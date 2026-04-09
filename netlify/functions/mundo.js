// Proxies Yahoo Finance for global market data with intraday sparklines
const https = require('https');

const SYMBOLS = [
  // Índices
  { id: 'spx', symbol: 'ES%3DF', name: 'S&P 500', icon: '📈', group: 'Índices' },
  { id: 'nasdaq', symbol: 'NQ%3DF', name: 'Nasdaq 100', icon: '💻', group: 'Índices' },
  { id: 'dow', symbol: 'YM%3DF', name: 'Dow Jones', icon: '🏦', group: 'Índices' },
  // Tasas
  { id: 'tnx', symbol: '%5ETNX', name: 'UST 10Y', icon: '🇺🇸', group: 'Tasas' },
  { id: 'us30y', symbol: '%5ETYX', name: 'UST 30Y', icon: '🇺🇸', group: 'Tasas' },
  { id: 'us5y', symbol: '%5EFVX', name: 'UST 5Y', icon: '🇺🇸', group: 'Tasas' },
  // Energía
  { id: 'oil', symbol: 'CL%3DF', name: 'WTI', icon: '🛢️', group: 'Energía' },
  { id: 'brent', symbol: 'BZ%3DF', name: 'Brent', icon: '🛢️', group: 'Energía' },
  { id: 'gasoline', symbol: 'RB%3DF', name: 'Gasolina', icon: '⛽', group: 'Energía' },
  // Metales
  { id: 'gold', symbol: 'GC%3DF', name: 'Oro', icon: '🥇', group: 'Metales' },
  { id: 'silver', symbol: 'SI%3DF', name: 'Plata', icon: '🥈', group: 'Metales' },
  { id: 'copper', symbol: 'HG%3DF', name: 'Cobre', icon: '🔶', group: 'Metales' },
  // Agro — Yahoo returns cents/bushel; convert to USD/metric-ton
  // Bushels per metric ton: soy/wheat 60 lb/bu → 36.7437, corn 56 lb/bu → 39.3679
  { id: 'soy', symbol: 'ZS%3DF', name: 'Soja', icon: '🌱', group: 'Agro', toTon: 36.7437 / 100 },
  { id: 'wheat', symbol: 'ZW%3DF', name: 'Trigo', icon: '🌾', group: 'Agro', toTon: 36.7437 / 100 },
  { id: 'corn', symbol: 'ZC%3DF', name: 'Maíz', icon: '🌽', group: 'Agro', toTon: 39.3679 / 100 },
  // Crypto
  { id: 'btc', symbol: 'BTC-USD', name: 'Bitcoin', icon: '₿', group: 'Crypto' },
  { id: 'eth', symbol: 'ETH-USD', name: 'Ethereum', icon: 'Ξ', group: 'Crypto' },
  { id: 'avax', symbol: 'AVAX-USD', name: 'Avalanche', icon: '🔺', group: 'Crypto' },
  // Monedas
  { id: 'eurusd', symbol: 'EURUSD%3DX', name: 'EUR/USD', icon: '🇪🇺', group: 'Monedas' },
  { id: 'usdmxn', symbol: 'MXN%3DX', name: 'USD/MXN', icon: '🇲🇽', group: 'Monedas' },
  { id: 'usdbrl', symbol: 'BRL%3DX', name: 'USD/BRL', icon: '🇧🇷', group: 'Monedas' },
];

async function fetchYahoo(symbolEncoded) {
  const result = await fetchYahooRaw(symbolEncoded, '5m', '1d');
  // If sparkline has <10 points (market closed/weekend), fallback to 5d
  if (result.sparkline.length < 10) {
    return fetchYahooRaw(symbolEncoded, '15m', '5d');
  }
  return result;
}

function fetchYahooRaw(symbolEncoded, interval, range) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbolEncoded}?interval=${interval}&range=${range}`;
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const result = json.chart.result[0];
          const meta = result.meta;
          const closes = result.indicators.quote[0].close || [];
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

function fetchYahooChart(symbolEncoded, interval, range) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbolEncoded}?interval=${interval}&range=${range}`;
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const result = json.chart.result[0];
          const timestamps = result.timestamp || [];
          const closes = result.indicators.quote[0].close || [];
          const points = [];
          for (let i = 0; i < timestamps.length; i++) {
            if (closes[i] !== null) points.push({ t: timestamps[i] * 1000, v: closes[i] });
          }
          resolve(points);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

exports.handler = async (event) => {
  // Detail mode: /api/mundo?symbol=btc&range=5d  OR  /api/mundo?ticker=AAPL&range=5d
  const qs = event.queryStringParameters || {};
  if (qs.symbol || qs.ticker) {
    try {
      let symEncoded, id, name, icon;
      if (qs.ticker) {
        // Direct Yahoo ticker (used by HOT movers)
        const ticker = qs.ticker.toUpperCase();
        symEncoded = encodeURIComponent(ticker);
        id = ticker.toLowerCase();
        name = qs.name || ticker;
        icon = '';
      } else {
        const sym = SYMBOLS.find(s => s.id === qs.symbol);
        if (!sym) return { statusCode: 404, body: JSON.stringify({ error: 'Unknown symbol' }) };
        symEncoded = sym.symbol;
        id = sym.id;
        name = sym.name;
        icon = sym.icon;
      }
      let range = qs.range || '5d';
      let interval = range === '1d' ? '5m' : range === '5d' ? '15m' : range === '1mo' ? '1h' : '1d';
      let points = await fetchYahooChart(symEncoded, interval, range);
      // Fallback: if 1d returns empty (market closed/weekend), try 5d
      if (points.length === 0 && range === '1d') {
        range = '5d';
        interval = '15m';
        points = await fetchYahooChart(symEncoded, interval, range);
      }
      // Convert agro detail chart to USD/metric-ton
      const sym = SYMBOLS.find(s => s.id === id);
      if (sym && sym.toTon) {
        points = points.map(p => ({ t: p.t, v: p.v * sym.toTon }));
      }
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=60' },
        body: JSON.stringify({ id, name, icon, range, points }),
      };
    } catch (e) {
      return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
  }

  // Default: all symbols overview
  try {
    const results = await Promise.allSettled(
      SYMBOLS.map(s => fetchYahoo(s.symbol))
    );

    const data = SYMBOLS.map((s, i) => {
      const r = results[i];
      if (r.status === 'fulfilled') {
        let { price, prevClose, sparkline } = r.value;
        const change = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
        // Convert agro commodities from cents/bushel to USD/metric-ton
        if (s.toTon) {
          price = price * s.toTon;
          prevClose = prevClose * s.toTon;
          sparkline = sparkline.map(v => v * s.toTon);
        }
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
