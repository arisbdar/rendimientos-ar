// Intradiario BYMA via open.bymadata (datos públicos con demora).
//   GET /api/intradiario                         → lista de instrumentos operados hoy (24hs)
//   GET /api/intradiario?symbol=GGAL&plazo=24hs  → velas de 1 minuto del día (plazo: 24hs | ci)
const BYMA = 'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free';
const PANELS = [
  { id: 'lideres',  path: 'leading-equity',         label: 'líderes' },
  { id: 'general',  path: 'general-equity',         label: 'general' },
  { id: 'cedears',  path: 'cedears',                label: 'cedears' },
  { id: 'bonos',    path: 'public-bonds',           label: 'bonos' },
  { id: 'ons',      path: 'negociable-obligations', label: 'ons' },
  { id: 'letras',   path: 'lebacs',                 label: 'letras' },
];

async function bymaPost(path, body) {
  const r = await fetch(`${BYMA}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`BYMA ${path} → ${r.status}`);
  return r.json();
}

async function listInstruments() {
  const results = await Promise.all(PANELS.map(async (p) => {
    const res = await bymaPost(p.path, { excludeZeroPxAndQty: true, T0: false, T1: true, T2: false, page_size: 5000 });
    // cedears y ONs vienen como array; el resto como { data: [...] }.
    const rows = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
    return rows.map(r => ({
      symbol: r.symbol,
      panel: p.id,
      last: r.trade,
      prevClose: r.previousClosingPrice,
      chg: r.previousClosingPrice ? ((r.trade - r.previousClosingPrice) / r.previousClosingPrice) * 100 : null,
      volumeAmount: r.volumeAmount,
      ccy: r.denominationCcy,
    }));
  }));
  // Un símbolo puede aparecer en líderes y general: nos quedamos con el primero.
  const seen = new Set();
  const data = [];
  for (const row of results.flat()) {
    if (!row.symbol || seen.has(row.symbol)) continue;
    seen.add(row.symbol);
    data.push(row);
  }
  return { data, panels: PANELS.map(({ id, label }) => ({ id, label })) };
}

async function intraday(symbol, plazo) {
  const rows = await bymaPost('chart/historical-series-intra-day/intraday', {
    symbol, settlementType: plazo === 'ci' ? '1' : '2', quantity: '100000',
  });
  // Viene del más nuevo al más viejo, con volumen acumulado → lo pasamos a trades y luego a velas de 1 minuto.
  const sorted = (Array.isArray(rows) ? rows : []).slice().sort((a, b) => a.time.localeCompare(b.time));
  const candles = [];
  let prevVol = 0, trades = 0;
  for (const r of sorted) {
    const qty = r.volume - prevVol;
    if (!r.volume || qty <= 0) continue; // pre-apertura / registros sin operación
    prevVol = r.volume;
    trades++;
    const minute = r.time.slice(0, 16); // YYYY-MM-DDTHH:MM (hora Argentina)
    const px = r.trade;
    const c = candles[candles.length - 1];
    if (c && c[0] === minute) {
      c[2] = Math.max(c[2], px); c[3] = Math.min(c[3], px); c[4] = px; c[5] += qty;
    } else {
      candles.push([minute, px, px, px, px, qty]);
    }
  }
  const last = sorted[sorted.length - 1];
  return {
    symbol, plazo,
    date: last ? last.time.slice(0, 10) : null,
    candles, // [t, open, high, low, close, volume]
    open: candles[0]?.[1] ?? null,
    high: candles.length ? Math.max(...candles.map(c => c[2])) : null,
    low: candles.length ? Math.min(...candles.map(c => c[3])) : null,
    last: candles.length ? candles[candles.length - 1][4] : null,
    volume: prevVol,
    trades,
  };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const symbol = String(req.query?.symbol || '').trim().toUpperCase();
  const plazo = String(req.query?.plazo || '24hs').toLowerCase() === 'ci' ? 'ci' : '24hs';

  try {
    if (!symbol) {
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.status(200).json({ ...(await listInstruments()), source: 'byma' });
    }
    if (!/^[A-Z0-9]{1,12}$/.test(symbol)) return res.status(400).json({ error: 'Símbolo inválido' });
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).json({ ...(await intraday(symbol, plazo)), source: 'byma' });
  } catch (error) {
    console.error('Intradiario API error:', error);
    res.status(502).json({ error: 'Failed to fetch BYMA intraday data' });
  }
}
