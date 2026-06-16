// Proxy a https://api.cocos.capital/api/prode/predictions/matches/{id}/distribution
// Acepta ?id=N. Mismos headers de browser real que cocos-prode-matches.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
  'Referer': 'https://cocos.capital/',
  'Origin': 'https://cocos.capital',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
};

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Cache 30s — las distribuciones de votos cambian más rápido que la lista de partidos
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=60');

  const id = String(req.query?.id || '').replace(/[^0-9]/g, '');
  if (!id) {
    res.status(400).json({ error: 'missing_id', hint: 'usage: /api/cocos-prode-distribution?id=19' });
    return;
  }

  const upstream = `https://api.cocos.capital/api/prode/predictions/matches/${id}/distribution`;

  try {
    const r = await fetch(upstream, { headers: BROWSER_HEADERS, redirect: 'follow' });
    const text = await r.text();
    if (!r.ok || text.trim().startsWith('<')) {
      res.status(502).json({
        error: 'upstream_blocked',
        status: r.status,
        upstream,
        hint: text.includes('Just a moment') ? 'cloudflare_managed_challenge' : 'non_json_response',
      });
      return;
    }
    res.status(200).send(text);
  } catch (e) {
    res.status(500).json({ error: 'fetch_failed', message: String(e.message || e) });
  }
}
