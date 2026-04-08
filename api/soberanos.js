const TICKERS_USD = ['BPD7D','AO27D','AO28D','AN29D','AL29D','AL30D','AL35D','AE38D','AL41D','GD29D','GD30D','GD35D','GD38D','GD41D'];

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');

  try {
    const response = await fetch('https://data912.com/live/arg_bonds', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) throw new Error(`data912 error: ${response.status}`);
    const bonds = await response.json();

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

    res.status(200).json({ data: result, source: 'data912' });
  } catch (e) {
    console.error('Soberanos fetch error:', e);
    res.status(502).json({ error: 'Failed to fetch sovereign bond data' });
  }
}
