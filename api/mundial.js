// Proxies football-data.org API for FIFA World Cup 2026
const BASE = 'https://api.football-data.org/v4/competitions/WC';

async function fetchAPI(path) {
  const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
  const r = await fetch(`${BASE}${path}`, { headers: { 'X-Auth-Token': API_KEY } });
  if (!r.ok) throw new Error(`API ${r.status}: ${await r.text()}`);
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=120');

  if (!process.env.FOOTBALL_DATA_API_KEY) {
    return res.status(500).json({ error: 'FOOTBALL_DATA_API_KEY not configured' });
  }

  try {
    const type = req.query?.type || 'all';
    if (type === 'standings') return res.status(200).json(await fetchAPI('/standings'));
    if (type === 'matches') return res.status(200).json(await fetchAPI('/matches'));
    const [standings, matches] = await Promise.all([fetchAPI('/standings'), fetchAPI('/matches')]);
    res.status(200).json({ standings, matches });
  } catch (err) {
    console.error('Mundial API error:', err.message);
    res.status(502).json({ error: 'Failed to fetch World Cup data', detail: err.message });
  }
}
