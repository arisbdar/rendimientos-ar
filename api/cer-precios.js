const TICKERS_BONDS = ['TZX26', 'TZXO6', 'TX26', 'TZXD6', 'TZXM7', 'TZX27', 'TZXD7', 'TZX28', 'TX28', 'DICP', 'PARP'];
const TICKERS_NOTES = ['X15Y6', 'X29Y6', 'X31L6', 'X30S6', 'X30N6'];

export default async function handler(req, res) {
  try {
    const [bondsRes, notesRes] = await Promise.all([
      fetch('https://data912.com/live/arg_bonds', {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      }),
      fetch('https://data912.com/live/arg_notes', {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      }),
    ]);

    if (!bondsRes.ok || !notesRes.ok) throw new Error('data912 API error');

    const [bondsData, notesData] = await Promise.all([bondsRes.json(), notesRes.json()]);

    const fromBonds = Array.isArray(bondsData) ? bondsData.filter(b => TICKERS_BONDS.includes(b.symbol)) : [];
    const fromNotes = Array.isArray(notesData) ? notesData.filter(b => TICKERS_NOTES.includes(b.symbol)) : [];
    const bonosCER = [...fromBonds, ...fromNotes];

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json({
      data: bonosCER,
      timestamp: new Date().toISOString(),
      count: bonosCER.length,
    });
  } catch (error) {
    console.error('Error fetching CER bond prices:', error);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({
      error: 'Failed to fetch CER bond prices',
      message: error.message,
    });
  }
}
