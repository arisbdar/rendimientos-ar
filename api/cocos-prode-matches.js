// Proxy a https://api.cocos.capital/api/prode/matches
// La API está detrás de Cloudflare managed challenge — usamos headers de browser
// real para intentar pasar. Si Cloudflare bloquea desde Vercel data-centers,
// devolvemos status 502 con detalle para que el frontend lo maneje.
const UPSTREAM = 'https://api.cocos.capital/api/prode/matches';

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
  // Cache 60s edge + 60s browser; los partidos cambian poco
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');

  try {
    const r = await fetch(UPSTREAM, { headers: BROWSER_HEADERS, redirect: 'follow' });
    const text = await r.text();
    // Si Cloudflare nos devuelve HTML (challenge), detectarlo y reportar
    if (!r.ok || text.trim().startsWith('<')) {
      res.status(502).json({
        error: 'upstream_blocked',
        status: r.status,
        upstream: UPSTREAM,
        hint: text.includes('Just a moment') ? 'cloudflare_managed_challenge' : 'non_json_response',
      });
      return;
    }
    res.status(200).send(text);
  } catch (e) {
    res.status(500).json({ error: 'fetch_failed', message: String(e.message || e) });
  }
}
