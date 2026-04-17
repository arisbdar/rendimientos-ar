export default async function handler(req, res) {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end query params required' });

  try {
    const url = `https://api.savvytrader.com/pricing/assets/earnings/calendar/daily?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`SavvyTrader API error: ${resp.status}`);
    const data = await resp.json();

    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
    res.json(data);
  } catch (err) {
    console.error('Earnings proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch earnings data' });
  }
}
