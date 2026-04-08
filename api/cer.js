export default async function handler(req, res) {
  try {
    const bcraUrl = 'https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/30';

    const response = await fetch(bcraUrl, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`BCRA API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.results || !data.results[0] || !data.results[0].detalle) {
      throw new Error('Invalid BCRA API response format');
    }

    const detalle = data.results[0].detalle;

    if (detalle.length === 0) {
      throw new Error('No CER data available');
    }

    // Calcular fecha T-10 (10 dias habiles antes del settlement T+1)
    // Aproximacion: restar 14 dias calendario desde hoy
    const hoy = new Date();
    const t1 = new Date(hoy);
    t1.setDate(t1.getDate() + 1); // Settlement T+1
    const fc = new Date(t1);
    fc.setDate(fc.getDate() - 14); // T-10 aproximado

    const fcStr = fc.toISOString().split('T')[0];

    // BCRA retorna datos en orden descendente (mas reciente primero)
    // Buscar el CER mas cercano a fc (T-10) que sea <= fc
    let cerT10 = null;
    for (let i = 0; i < detalle.length; i++) {
      if (detalle[i].fecha <= fcStr) {
        cerT10 = detalle[i];
        break;
      }
    }

    // Si no se encuentra, usar el mas antiguo disponible
    if (!cerT10) {
      cerT10 = detalle[detalle.length - 1];
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).json({
      cer: cerT10.valor,
      fecha: cerT10.fecha,
      fuente: 'BCRA (T-10)',
    });
  } catch (error) {
    console.error('Error fetching CER:', error);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({
      error: 'Failed to fetch CER data',
      message: error.message,
    });
  }
}
