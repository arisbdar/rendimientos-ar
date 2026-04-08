// Fetches exchange rates: Dólar Oficial (Yahoo), CCL & MEP (data912), Riesgo País (ArgentinaDatos)
async function fetchJSON(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60');

  try {
    const [yahooData, bonds, riesgo] = await Promise.allSettled([
      fetchJSON('https://query1.finance.yahoo.com/v8/finance/chart/ARS%3DX?interval=1d&range=5d'),
      fetchJSON('https://data912.com/live/arg_bonds'),
      fetchJSON('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo'),
    ]);

    let oficial = null;
    if (yahooData.status === 'fulfilled') {
      try {
        const meta = yahooData.value.chart.result[0].meta;
        oficial = { price: meta.regularMarketPrice, prevClose: meta.chartPreviousClose || meta.previousClose || 0 };
      } catch (e) { /* ignore */ }
    }

    let ccl = null, mep = null;
    if (bonds.status === 'fulfilled' && Array.isArray(bonds.value)) {
      const al30 = bonds.value.find(b => b.symbol === 'AL30');
      const al30d = bonds.value.find(b => b.symbol === 'AL30D');
      const al30c = bonds.value.find(b => b.symbol === 'AL30C');
      const arsPrice = al30 ? parseFloat(al30.c) : 0;
      if (al30c && arsPrice > 0) { const u = parseFloat(al30c.c); if (u > 0) ccl = { price: Math.round((arsPrice / u) * 100) / 100 }; }
      if (al30d && arsPrice > 0) { const u = parseFloat(al30d.c); if (u > 0) mep = { price: Math.round((arsPrice / u) * 100) / 100 }; }
    }

    let riesgoPais = null;
    if (riesgo.status === 'fulfilled' && riesgo.value?.valor != null) {
      riesgoPais = { value: riesgo.value.valor };
    }

    res.status(200).json({ oficial, ccl, mep, riesgoPais, updated: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
