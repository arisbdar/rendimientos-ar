export default async function handler(req, res) {
  try {
    const response = await fetch('https://data912.com/live/arg_corp', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) throw new Error(`data912 error: ${response.status}`);
    const allBonds = await response.json();

    // Filter USD bonds (ending in D) with valid prices
    const usdBonds = allBonds.filter(b => b.symbol.endsWith('D') && b.c > 0);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json({ data: usdBonds, timestamp: new Date().toISOString() });
  } catch (error) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: 'Failed to fetch ON prices', message: error.message });
  }
}
