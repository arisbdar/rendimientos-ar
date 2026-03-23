const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const CONFIG_PATH = path.join(__dirname, 'public', 'config.json');

app.disable('x-powered-by');
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "connect-src 'self' https://api.argentinadatos.com",
      "object-src 'none'",
    ].join('; ')
  );
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// --- Config API ---

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

// Public read
app.get('/api/config', (req, res) => {
  res.json(readConfig());
});

// --- FCI Data (via ArgentinaDatos) ---

app.get('/api/fci', async (req, res) => {
  try {
    const [mmLatest, mmPrevious, rmLatest, rmPrevious] = await Promise.all([
      fetch('https://api.argentinadatos.com/v1/finanzas/fci/mercadoDinero/ultimo').then(r => r.json()),
      fetch('https://api.argentinadatos.com/v1/finanzas/fci/mercadoDinero/penultimo').then(r => r.json()),
      fetch('https://api.argentinadatos.com/v1/finanzas/fci/rentaMixta/ultimo').then(r => r.json()),
      fetch('https://api.argentinadatos.com/v1/finanzas/fci/rentaMixta/penultimo').then(r => r.json()),
    ]);
    const filterValid = d => d.filter(x => x.fecha && x.vcp);
    const allLatest = [...filterValid(mmLatest), ...filterValid(rmLatest)];
    const allPrevious = [...filterValid(mmPrevious), ...filterValid(rmPrevious)];
    const prevMap = {};
    for (const f of allPrevious) prevMap[f.fondo] = f;
    const results = [];
    for (const fund of allLatest) {
      const prev = prevMap[fund.fondo];
      if (!prev || !prev.vcp || !fund.vcp) continue;
      const days = Math.abs(Math.round((new Date(fund.fecha) - new Date(prev.fecha)) / 86400000));
      if (days <= 0) continue;
      const tna = Math.round(((fund.vcp - prev.vcp) / prev.vcp / days) * 365 * 100 * 100) / 100;
      results.push({ nombre: fund.fondo, tna, patrimonio: fund.patrimonio, fechaDesde: prev.fecha, fechaHasta: fund.fecha });
    }
    res.json({ data: results });
  } catch (err) {
    console.error('FCI proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch FCI data' });
  }
});

// --- CAFCI Ficha Proxy (for comparar.html) ---

app.get('/api/cafci/ficha/:fondoId/:claseId', async (req, res) => {
  const { fondoId, claseId } = req.params;
  const url = `https://api.cafci.org.ar/estadisticas/informacion/diaria/ficha/${encodeURIComponent(fondoId)}/${encodeURIComponent(claseId)}`;
  try {
    const resp = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Referer': 'https://www.cafci.org.ar/',
        'Origin': 'https://www.cafci.org.ar',
      }
    });
    if (!resp.ok) throw new Error(`CAFCI API returned ${resp.status}`);
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    console.error('CAFCI ficha proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch CAFCI ficha data' });
  }
});

// --- LECAP/BONCAP Prices (data912 proxy) ---

app.get('/api/lecaps', async (req, res) => {
  try {
    const [notes, bonds] = await Promise.all([
      fetch('https://data912.com/live/arg_notes').then(r => r.json()),
      fetch('https://data912.com/live/arg_bonds').then(r => r.json()),
    ]);
    const LECAP_TICKERS = ['S17A6','S30A6','S15Y6','S29Y6','S31L6','S31G6','S30S6','S30O6','S30N6'];
    const BONCAP_TICKERS = ['T30J6','T15E7','T30A7','T31Y7','T30J7'];
    const result = [];
    for (const item of notes) {
      if (!LECAP_TICKERS.includes(item.symbol)) continue;
      if (parseFloat(item.c) <= 0) continue;
      result.push({ symbol: item.symbol, price: item.c, bid: item.px_bid || 0, ask: item.px_ask || 0, type: 'LECAP' });
    }
    for (const item of bonds) {
      if (!BONCAP_TICKERS.includes(item.symbol)) continue;
      if (parseFloat(item.c) <= 0) continue;
      result.push({ symbol: item.symbol, price: item.c, bid: item.px_bid || 0, ask: item.px_ask || 0, type: 'BONCAP' });
    }
    res.json({ data: result, source: 'data912' });
  } catch (err) {
    console.error('LECAP proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch LECAP data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
