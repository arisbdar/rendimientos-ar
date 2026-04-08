// Returns top 5 US stocks with biggest absolute % change (day movers)
const POOL = [
  'AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA','AMD','NFLX','COIN',
  'PLTR','SMCI','MSTR','AVGO','CRM','UBER','SNOW','SQ','SHOP','RIVN',
  'SOFI','HOOD','INTC','BA','DIS','NKE','PYPL','BABA','JPM','V',
  'WMT','COST','MCD','PEP','KO','ABNB','RBLX','ROKU','SNAP','PINS',
  'DELL','ORCL','IBM','GS','MS','C','WFC','BAC','XOM','CVX',
];

async function fetchQuote(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) });
    const json = await r.json();
    const meta = json.chart.result[0].meta;
    const price = meta.regularMarketPrice;
    const prevClose = meta.previousClose || meta.chartPreviousClose || 0;
    const change = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
    return { symbol: meta.symbol || symbol, name: meta.shortName || meta.longName || symbol, price, change: Math.round(change * 100) / 100 };
  } catch { return null; }
}

export default async function handler(req, res) {
  try {
    const results = await Promise.allSettled(POOL.map(s => fetchQuote(s)));
    const data = results
      .map(r => r.status === 'fulfilled' ? r.value : null)
      .filter(q => q && q.price != null && q.change != null)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 5);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.status(200).json({ data, updated: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
