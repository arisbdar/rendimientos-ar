export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');

  try {
    const response = await fetch('https://data912.com/live/usa_stocks', {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) throw new Error(`data912 error: ${response.status}`);

    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('Invalid data912 API response format');

    res.status(200).json({ data, source: 'data912' });
  } catch (error) {
    console.error('USA Stocks API error:', error);
    res.status(502).json({ error: 'Failed to fetch usa stocks data' });
  }
}
