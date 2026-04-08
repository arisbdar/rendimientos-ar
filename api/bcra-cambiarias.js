// Fetches exchange rate data from BCRA Estadísticas Cambiarias API v1.0
const MONEDAS_DESTACADAS = ['USD', 'EUR', 'BRL', 'GBP', 'CHF', 'JPY', 'CNY', 'CLP', 'UYU', 'PYG', 'BOB', 'MXN', 'COP', 'CAD', 'AUD', 'XAU', 'XAG'];

async function fetchBCRA(path) {
  const r = await fetch(`https://api.bcra.gob.ar${path}`, { signal: AbortSignal.timeout(8000) });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');

  const params = req.query || {};

  // Historical for a single currency
  if (params.moneda) {
    const desde = params.desde || '';
    const hasta = params.hasta || '';
    let path = `/estadisticascambiarias/v1.0/Cotizaciones/${params.moneda}?limit=365`;
    if (desde) path += `&fechaDesde=${desde}`;
    if (hasta) path += `&fechaHasta=${hasta}`;
    try {
      const result = await fetchBCRA(path);
      return res.status(200).json(result);
    } catch (err) {
      return res.status(502).json({ error: err.message });
    }
  }

  // Default: today's cotizaciones
  try {
    const result = await fetchBCRA('/estadisticascambiarias/v1.0/Cotizaciones');
    const detalle = result.results?.detalle || [];
    const fecha = result.results?.fecha || null;

    const destacadas = [];
    const otras = [];
    for (const m of detalle) {
      if (!m.tipoCotizacion || m.tipoCotizacion <= 0) continue;
      const item = { codigo: m.codigoMoneda, nombre: m.descripcion, cotizacion: m.tipoCotizacion, tipoPase: m.tipoPase, destacada: MONEDAS_DESTACADAS.includes(m.codigoMoneda) };
      if (item.destacada) destacadas.push(item); else otras.push(item);
    }
    destacadas.sort((a, b) => MONEDAS_DESTACADAS.indexOf(a.codigo) - MONEDAS_DESTACADAS.indexOf(b.codigo));
    otras.sort((a, b) => a.codigo.localeCompare(b.codigo));

    res.status(200).json({ fecha, destacadas, otras, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(502).json({ error: 'Failed to fetch cambiarias data', message: error.message });
  }
}
