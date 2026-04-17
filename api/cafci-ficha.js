// Proxy for CAFCI fund detail API
export default async function handler(req, res) {
  const { fondoId, claseId } = req.query;

  if (!fondoId || !claseId) {
    return res.status(400).json({ error: 'fondoId and claseId are required' });
  }

  try {
    const url = `https://api.cafci.org.ar/estadisticas/informacion/diaria/ficha/${fondoId}/${claseId}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `CAFCI API error: ${response.status}` });
    }

    const data = await response.json();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch CAFCI data', detail: err.message });
  }
}
