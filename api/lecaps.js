const LECAP_TICKERS = ['S17A6', 'S30A6', 'S15Y6', 'S29Y6', 'S17L6', 'S31L6', 'S31G6', 'S30S6', 'S30O6', 'S30N6'];
const BONCAP_TICKERS = ['T30J6', 'T15E7', 'T30A7', 'T31Y7', 'T30J7'];

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');

  try {
    const [notesRes, bondsRes] = await Promise.all([
      fetch('https://data912.com/live/arg_notes', {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      }),
      fetch('https://data912.com/live/arg_bonds', {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      }),
    ]);

    if (!notesRes.ok || !bondsRes.ok) throw new Error('data912 API error');

    const [notes, bonds] = await Promise.all([notesRes.json(), bondsRes.json()]);

    const result = [];

    for (const item of notes) {
      if (!LECAP_TICKERS.includes(item.symbol)) continue;
      const price = parseFloat(item.c) || 0;
      if (price <= 0) continue;
      result.push({
        symbol: item.symbol,
        price,
        bid: parseFloat(item.px_bid) || 0,
        ask: parseFloat(item.px_ask) || 0,
        type: 'LECAP',
      });
    }

    for (const item of bonds) {
      if (!BONCAP_TICKERS.includes(item.symbol)) continue;
      const price = parseFloat(item.c) || 0;
      if (price <= 0) continue;
      result.push({
        symbol: item.symbol,
        price,
        bid: parseFloat(item.px_bid) || 0,
        ask: parseFloat(item.px_ask) || 0,
        type: 'BONCAP',
      });
    }

    res.status(200).json({ data: result, source: 'data912' });
  } catch (e) {
    console.error('data912 fetch error:', e);
    res.status(502).json({ error: 'Failed to fetch data912 data' });
  }
}
