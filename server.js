const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const CONFIG_PATH = path.join(__dirname, 'data', 'config.json');

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

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
