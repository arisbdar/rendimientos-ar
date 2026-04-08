export default async function handler(req, res) {
  try {
    const response = await fetch('https://api.comparapix.ar/quotes', {
      headers: { 'User-Agent': 'rendimientos.co/1.0' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
