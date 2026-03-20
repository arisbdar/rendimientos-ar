// Fetches FCI data from ArgentinaDatos API and calculates TNA from VCP changes
exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  try {
    // Fetch money market (ultimo + penultimo) and renta mixta in parallel
    const [mmLatest, mmPrevious, rmLatest, rmPrevious] = await Promise.all([
      fetchJSON('https://api.argentinadatos.com/v1/finanzas/fci/mercadoDinero/ultimo'),
      fetchJSON('https://api.argentinadatos.com/v1/finanzas/fci/mercadoDinero/penultimo'),
      fetchJSON('https://api.argentinadatos.com/v1/finanzas/fci/rentaMixta/ultimo'),
      fetchJSON('https://api.argentinadatos.com/v1/finanzas/fci/rentaMixta/penultimo'),
    ]);

    // Combine all categories
    const allLatest = [...filterValid(mmLatest), ...filterValid(rmLatest)];
    const allPrevious = [...filterValid(mmPrevious), ...filterValid(rmPrevious)];

    // Build a map of previous VCPs by fund name
    const prevMap = {};
    for (const f of allPrevious) {
      prevMap[f.fondo] = f;
    }

    // Calculate TNA for each fund
    const results = [];
    for (const fund of allLatest) {
      const prev = prevMap[fund.fondo];
      if (!prev || !prev.vcp || !fund.vcp) continue;

      const days = daysBetween(fund.fecha, prev.fecha);
      if (days <= 0) continue;

      const dailyReturn = (fund.vcp - prev.vcp) / prev.vcp / days;
      const tna = dailyReturn * 365 * 100; // as percentage

      results.push({
        nombre: fund.fondo,
        tna: Math.round(tna * 100) / 100,
        patrimonio: fund.patrimonio,
        fechaDesde: prev.fecha,
        fechaHasta: fund.fecha,
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data: results }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch FCI data', detail: err.message }),
    };
  }
};

async function fetchJSON(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
  return resp.json();
}

function filterValid(data) {
  return data.filter(d => d.fecha && d.vcp);
}

function daysBetween(a, b) {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return Math.abs(Math.round((d1 - d2) / (1000 * 60 * 60 * 24)));
}
