// Proxies Yahoo Finance to check if global markets are currently open
const SYMBOLS = {
  '1': '^GSPC', // NY (S&P 500)
  '2': '^FTSE', // London
  '3': '^GDAXI', // Frankfurt
  '4': '^N225', // Tokyo
  '5': '^HSI', // Hong Kong
  '6': '^MERV', // Buenos Aires
  '7': '^AXJO', // Sydney
  '8': '^FCHI', // Paris
  '9': '^IBEX', // Madrid
  '10': '^GSPTSE', // Toronto
  '11': '^BVSP', // Sao Paulo
  '12': '^SSMI', // Zurich
  '13': '000001.SS', // Shanghai
  '14': '^KS11', // Seoul
  '15': '^STI', // Singapore
  '16': '^BSESN', // Mumbai
  '17': 'DFMGI.AE', // Dubai
  '18': '^J203.JO', // Johannesburg
  '19': '^MXX', // Mexico
  '20': 'IMOEX.ME', // Moscow
};

async function fetchMarketStatus(id, symbolEncoded) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbolEncoded}?interval=1d&range=1d`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
    const json = await r.json();
    const meta = json.chart.result[0].meta;
    
    // Check if current time falls within regular trading hours
    const now = Math.floor(Date.now() / 1000);
    const regular = meta.currentTradingPeriod?.regular;
    
    let isOpen = false;
    if (regular && regular.start && regular.end) {
      isOpen = (now >= regular.start && now <= regular.end);
    }
    
    return { id, isOpen };
  } catch (e) {
    return { id, isOpen: false, error: true };
  }
}

export default async function handler(req, res) {
  try {
    const entries = Object.entries(SYMBOLS);
    const results = await Promise.allSettled(entries.map(([id, sym]) => fetchMarketStatus(id, sym)));
    
    const statusMap = {};
    results.forEach(r => {
      if (r.status === 'fulfilled') {
        statusMap[r.value.id] = r.value.isOpen;
      }
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=120'); // Cache for 2 minutes to respect rate limits
    res.status(200).json({ data: statusMap, updated: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
