// Fetches top 10 BTC treasury public companies from CoinGecko + Yahoo Finance sparklines
const COINGECKO_URL = 'https://api.coingecko.com/api/v3/companies/public_treasury/bitcoin';
const TOP_N = 10;

async function fetchYahooSparkline(ticker) {
  const encoded = encodeURIComponent(ticker);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=5m&range=1d`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
  const json = await r.json();
  const result = json.chart.result[0];
  const meta = result.meta;
  const closes = (result.indicators.quote[0].close || []).filter(v => v !== null);
  // If too few points (market closed), try 5d
  if (closes.length < 10) {
    const url2 = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=15m&range=5d`;
    const r2 = await fetch(url2, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
    const json2 = await r2.json();
    const result2 = json2.chart.result[0];
    const meta2 = result2.meta;
    const closes2 = (result2.indicators.quote[0].close || []).filter(v => v !== null);
    return { price: meta2.regularMarketPrice, prevClose: meta2.chartPreviousClose || meta2.previousClose || 0, sparkline: closes2 };
  }
  return { price: meta.regularMarketPrice, prevClose: meta.chartPreviousClose || meta.previousClose || 0, sparkline: closes };
}

function normalizeSymbol(cgSymbol) {
  // CoinGecko returns symbols like "MSTR.US", "3350.T" — extract the base ticker
  // For Japanese stocks like 3350.T, keep as-is for Yahoo Finance
  if (cgSymbol.endsWith('.T')) return cgSymbol;
  return cgSymbol.replace(/\.\w+$/, '');
}

export default async function handler(req, res) {
  try {
    // Fetch top companies from CoinGecko
    const cgRes = await fetch(COINGECKO_URL, { signal: AbortSignal.timeout(10000) });
    if (!cgRes.ok) throw new Error(`CoinGecko error: ${cgRes.status}`);
    const cgData = await cgRes.json();

    const top = cgData.companies.slice(0, TOP_N);

    // Fetch Yahoo Finance data for each company in parallel
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

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).json({ data, updated: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
