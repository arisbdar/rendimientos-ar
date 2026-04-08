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

    const ultimoCER = detalle[0];

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).json({
      cer: ultimoCER.valor,
      fecha: ultimoCER.fecha,
      fuente: 'BCRA',
    });
  } catch (error) {
    console.error('Error fetching ultimo CER:', error);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: 'Failed to fetch ultimo CER data' });
  }
}
