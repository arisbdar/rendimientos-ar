// Proxies Yahoo Finance for global market data with intraday sparklines
const SYMBOLS = [
  { id: 'spx', symbol: 'ES%3DF', name: 'S&P 500', icon: '📈', group: 'Índices' },
  { id: 'nasdaq', symbol: 'NQ%3DF', name: 'Nasdaq 100', icon: '💻', group: 'Índices' },
  { id: 'dow', symbol: 'YM%3DF', name: 'Dow Jones', icon: '🏦', group: 'Índices' },
  { id: 'tnx', symbol: '%5ETNX', name: 'UST 10Y', icon: '🇺🇸', group: 'Tasas' },
  { id: 'us30y', symbol: '%5ETYX', name: 'UST 30Y', icon: '🇺🇸', group: 'Tasas' },
  { id: 'us5y', symbol: '%5EFVX', name: 'UST 5Y', icon: '🇺🇸', group: 'Tasas' },
  { id: 'oil', symbol: 'CL%3DF', name: 'WTI', icon: '🛢️', group: 'Energía' },
  { id: 'brent', symbol: 'BZ%3DF', name: 'Brent', icon: '🛢️', group: 'Energía' },
  { id: 'gasoline', symbol: 'RB%3DF', name: 'Gasolina', icon: '⛽', group: 'Energía' },
  { id: 'gold', symbol: 'GC%3DF', name: 'Oro', icon: '🥇', group: 'Metales' },
  { id: 'silver', symbol: 'SI%3DF', name: 'Plata', icon: '🥈', group: 'Metales' },
  { id: 'copper', symbol: 'HG%3DF', name: 'Cobre', icon: '🔶', group: 'Metales' },
  { id: 'soy', symbol: 'ZS%3DF', name: 'Soja', icon: '🌱', group: 'Agro', toTon: 36.7437 / 100 },
  { id: 'wheat', symbol: 'ZW%3DF', name: 'Trigo', icon: '🌾', group: 'Agro', toTon: 36.7437 / 100 },
  { id: 'corn', symbol: 'ZC%3DF', name: 'Maíz', icon: '🌽', group: 'Agro', toTon: 39.3679 / 100 },
  { id: 'btc', symbol: 'BTC-USD', name: 'Bitcoin', icon: '₿', group: 'Crypto' },
  { id: 'eth', symbol: 'ETH-USD', name: 'Ethereum', icon: 'Ξ', group: 'Crypto' },
  { id: 'avax', symbol: 'AVAX-USD', name: 'Avalanche', icon: '🔺', group: 'Crypto' },
  // BTC Treasury — Top 10 public companies by BTC holdings
  { id: 'mstr', symbol: 'MSTR', name: 'Strategy', icon: '₿', group: 'BTC Treasury' },
  { id: 'xxi', symbol: 'XXI', name: 'Twenty One', icon: '₿', group: 'BTC Treasury' },
  { id: 'metaplanet', symbol: '3350.T', name: 'Metaplanet', icon: '₿', group: 'BTC Treasury' },
  { id: 'mara', symbol: 'MARA', name: 'MARA Holdings', icon: '₿', group: 'BTC Treasury' },
  { id: 'riot', symbol: 'RIOT', name: 'Riot Platforms', icon: '₿', group: 'BTC Treasury' },
  { id: 'coin', symbol: 'COIN', name: 'Coinbase', icon: '₿', group: 'BTC Treasury' },
  { id: 'clsk', symbol: 'CLSK', name: 'CleanSpark', icon: '₿', group: 'BTC Treasury' },
  { id: 'tsla', symbol: 'TSLA', name: 'Tesla', icon: '₿', group: 'BTC Treasury' },
  { id: 'hut', symbol: 'HUT', name: 'Hut 8', icon: '₿', group: 'BTC Treasury' },
  { id: 'glxy', symbol: 'GLXY.TO', name: 'Galaxy Digital', icon: '₿', group: 'BTC Treasury' },
  { id: 'eurusd', symbol: 'EURUSD%3DX', name: 'EUR/USD', icon: '🇪🇺', group: 'Monedas' },
  { id: 'usdmxn', symbol: 'MXN%3DX', name: 'USD/MXN', icon: '🇲🇽', group: 'Monedas' },
  { id: 'usdbrl', symbol: 'BRL%3DX', name: 'USD/BRL', icon: '🇧🇷', group: 'Monedas' },
];

async function fetchYahooRaw(symbolEncoded, interval, range) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbolEncoded}?interval=${interval}&range=${range}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
  const json = await r.json();
  const result = json.chart.result[0];
  const meta = result.meta;
  const closes = result.indicators.quote[0].close || [];
  return { price: meta.regularMarketPrice, prevClose: meta.chartPreviousClose || meta.previousClose || 0, sparkline: closes.filter(v => v !== null) };
}

async function fetchYahoo(symbolEncoded) {
  const result = await fetchYahooRaw(symbolEncoded, '5m', '1d');
  if (result.sparkline.length < 10) return fetchYahooRaw(symbolEncoded, '15m', '5d');
  return result;
}

async function fetchYahooChart(symbolEncoded, interval, range) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbolEncoded}?interval=${interval}&range=${range}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
  const json = await r.json();
  const result = json.chart.result[0];
  const timestamps = result.timestamp || [];
  const closes = result.indicators.quote[0].close || [];
  const points = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] !== null) points.push({ t: timestamps[i] * 1000, v: closes[i] });
  }
  return points;
}

export default async function handler(req, res) {
  const qs = req.query || {};

  // Detail mode
  if (qs.symbol || qs.ticker) {
    try {
      let symEncoded, id, name, icon;
      if (qs.ticker) {
        const ticker = qs.ticker.toUpperCase();
        symEncoded = encodeURIComponent(ticker);
        id = ticker.toLowerCase();
        name = qs.name || ticker;
        icon = '';
      } else {
        const sym = SYMBOLS.find(s => s.id === qs.symbol);
        if (!sym) return res.status(404).json({ error: 'Unknown symbol' });
        symEncoded = sym.symbol;
        id = sym.id; name = sym.name; icon = sym.icon;
      }
      let range = qs.range || '5d';
      let interval = range === '1d' ? '5m' : range === '5d' ? '15m' : range === '1mo' ? '1h' : '1d';
      let points = await fetchYahooChart(symEncoded, interval, range);
      if (points.length === 0 && range === '1d') {
        range = '5d'; interval = '15m';
        points = await fetchYahooChart(symEncoded, interval, range);
      }
      const sym = SYMBOLS.find(s => s.id === id);
      if (sym && sym.toTon) points = points.map(p => ({ t: p.t, v: p.v * sym.toTon }));
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.status(200).json({ id, name, icon, range, points });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Default: all symbols overview
  try {
    const results = await Promise.allSettled(SYMBOLS.map(s => fetchYahoo(s.symbol)));
    const data = SYMBOLS.map((s, i) => {
      const r = results[i];
      if (r.status === 'fulfilled') {
        let { price, prevClose, sparkline } = r.value;
        const change = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
        if (s.toTon) { price *= s.toTon; prevClose *= s.toTon; sparkline = sparkline.map(v => v * s.toTon); }
        return { ...s, price, prevClose, change: Math.round(change * 100) / 100, sparkline };
      }
      return { ...s, price: null, prevClose: null, change: null, sparkline: [], error: true };
    });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).json({ data, updated: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
