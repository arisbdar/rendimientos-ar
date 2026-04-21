const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const CONFIG_PATH = path.join(PUBLIC_DIR, 'config.json');

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
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://www.googletagmanager.com",
      "connect-src 'self' https://api.argentinadatos.com https://data912.com https://api.bcra.gob.ar https://www.google-analytics.com https://analytics.google.com https://*.google-analytics.com https://*.googletagmanager.com https://api.comparapix.ar",
      "object-src 'none'",
    ].join('; ')
  );
  next();
});

function sendPublicIndex(res, ...segments) {
  const filePath = path.join(PUBLIC_DIR, ...segments);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Not Found');
  }
  const html = fs.readFileSync(filePath, 'utf-8');
  res.type('html').send(html);
}

app.get('/cedears', (req, res) => {
  sendPublicIndex(res, 'cedears', 'index.html');
});

app.get('/cedears/', (req, res) => {
  sendPublicIndex(res, 'cedears', 'index.html');
});

app.get('/earnings', (req, res) => {
  sendPublicIndex(res, 'earnings', 'index.html');
});

app.get('/earnings/', (req, res) => {
  sendPublicIndex(res, 'earnings', 'index.html');
});

app.use(express.static(PUBLIC_DIR));

// Fallback: si express.static no delega o falta la ruta anterior, servir los HTML estáticos.
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const bare = {
    '/cedears': ['cedears', 'index.html'],
    '/earnings': ['earnings', 'index.html'],
  };
  const segments = bare[req.path];
  if (segments) return sendPublicIndex(res, ...segments);
  next();
});

// --- Config API ---

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

// Public read
app.get('/api/config', (req, res) => {
  res.json(readConfig());
});

app.get('/api/cedears', async (req, res) => {
  try {
    const response = await fetch('https://data912.com/live/arg_cedears', {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      throw new Error(`data912 error: ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Invalid data912 API response format');
    }

    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ data, source: 'data912' });
  } catch (err) {
    console.error('CEDEARs proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch cedears data' });
  }
});

app.get('/api/usa-stocks', async (req, res) => {
  try {
    const response = await fetch('https://data912.com/live/usa_stocks', {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      throw new Error(`data912 error: ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Invalid data912 API response format');
    }

    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ data, source: 'data912' });
  } catch (err) {
    console.error('USA stocks proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch usa stocks data' });
  }
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

// --- Soberanos USD Prices (data912 proxy) ---

app.get('/api/soberanos', async (req, res) => {
  try {
    const response = await fetch('https://data912.com/live/arg_bonds');
    if (!response.ok) {
      throw new Error(`data912 API error: ${response.status}`);
    }
    const data = await response.json();
    
    if (!Array.isArray(data)) {
      throw new Error('Invalid data912 API response format');
    }

    const TICKERS_USD = ['BPD7D','AO27D','AN29D','AL29D','AL30D','AL35D','AE38D','AL41D','GD29D','GD30D','GD35D','GD38D','GD41D'];
    
    const result = [];
    for (const bond of data) {
      if (!TICKERS_USD.includes(bond.symbol)) continue;
      const priceUsd = parseFloat(bond.c) || 0;
      if (priceUsd <= 0) continue;
      const baseSymbol = bond.symbol.replace(/D$/, '');
      result.push({
        symbol: baseSymbol,
        price_usd: priceUsd,
        bid: parseFloat(bond.px_bid) || 0,
        ask: parseFloat(bond.px_ask) || 0,
        volume: bond.v || 0,
        pct_change: bond.pct_change || 0,
      });
    }

    res.json({ data: result, source: 'data912' });
  } catch (err) {
    console.error('Soberanos proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch soberanos data' });
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

// --- CER Data (via BCRA API) ---

app.get('/api/cer', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Leer serie histórica de CER
    const cerPath = path.join(__dirname, 'data_base', 'CER_serie.csv');
    const cerData = fs.readFileSync(cerPath, 'utf-8');
    const lines = cerData.trim().split('\n').slice(1); // Skip header
    
    // Parsear CSV
    const cerSerie = lines.map(line => {
      const [fecha, valor] = line.split(',');
      return { fecha, valor: parseFloat(valor) };
    });
    
    // Calcular fecha T-10 (10 días hábiles antes del settlement T+1)
    // Aproximación: restar 14 días calendario desde hoy
    const hoy = new Date();
    const t1 = new Date(hoy);
    t1.setDate(t1.getDate() + 1); // Settlement T+1
    const fc = new Date(t1);
    fc.setDate(fc.getDate() - 14); // T-10 aproximado
    
    const fcStr = fc.toISOString().split('T')[0];
    
    // Buscar CER más cercano a fc (T-10)
    let cerT10 = null;
    for (let i = cerSerie.length - 1; i >= 0; i--) {
      if (cerSerie[i].fecha <= fcStr) {
        cerT10 = cerSerie[i];
        break;
      }
    }
    
    if (!cerT10) {
      // Fallback: usar el último disponible
      cerT10 = cerSerie[cerSerie.length - 1];
    }
    
    res.json({
      cer: cerT10.valor,
      fecha: cerT10.fecha,
      fuente: 'Serie histórica CER'
    });
  } catch (err) {
    console.error('CER proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch CER data' });
  }
});

// --- Último CER publicado (para mostrar en UI) ---

app.get('/api/cer-ultimo', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Leer serie histórica de CER
    const cerPath = path.join(__dirname, 'data_base', 'CER_serie.csv');
    const cerData = fs.readFileSync(cerPath, 'utf-8');
    const lines = cerData.trim().split('\n').slice(1); // Skip header
    
    // Último CER es la última línea
    const lastLine = lines[lines.length - 1];
    const [fecha, valor] = lastLine.split(',');
    
    res.json({
      cer: parseFloat(valor),
      fecha: fecha,
      fuente: 'Serie histórica CER'
    });
  } catch (err) {
    console.error('CER último proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch CER data' });
  }
});

// --- CER Bond Prices (via data912) ---

app.get('/api/cer-precios', async (req, res) => {
  try {
    const response = await fetch('https://data912.com/live/arg_bonds');
    const data = await response.json();
    
    const TICKERS_CER = ['TZX26', 'TZXO6', 'TX26', 'TZXD6', 'TZXM7', 'TZX27', 'TZXD7', 'TZX28', 'TX28', 'TX31', 'DICP', 'PARP'];
    
    const bondsArray = Array.isArray(data) ? data : (data.data || []);
    const bonosCER = bondsArray.filter(bond => TICKERS_CER.includes(bond.symbol));
    
    res.json({
      data: bonosCER,
      timestamp: new Date().toISOString(),
      count: bonosCER.length
    });
  } catch (err) {
    console.error('CER prices proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch CER bond prices' });
  }
});

// --- Hot US Movers (Yahoo Finance proxy) ---

app.get('/api/hot-movers', async (req, res) => {
  const POOL = [
    'AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA','AMD','NFLX','COIN',
    'PLTR','SMCI','MSTR','AVGO','CRM','UBER','SNOW','SQ','SHOP','RIVN',
    'SOFI','HOOD','INTC','BA','DIS','NKE','PYPL','BABA','JPM','V',
  ];

  try {
    const results = await Promise.allSettled(POOL.map(async (symbol) => {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const json = await r.json();
      const result = json.chart.result[0];
      const meta = result.meta;
      const price = meta.regularMarketPrice;
      const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
      const change = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
      return { symbol: meta.symbol || symbol, name: meta.shortName || meta.longName || symbol, price, change: Math.round(change * 100) / 100 };
    }));

    const data = results
      .map(r => r.status === 'fulfilled' ? r.value : null)
      .filter(q => q && q.price != null && q.change != null)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 5);

    res.json({ data, updated: new Date().toISOString() });
  } catch (err) {
    console.error('Hot movers proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch hot movers data' });
  }
});

// --- Hipotecarios UVA (Google Sheets) ---

app.get('/api/hipotecarios', async (req, res) => {
  const SHEET_ID = '1h191b61YRkAI9Xv3_dDuNf7ejst_ziw9kacfJsnvLoM';
  const GID = '1120229027';
  const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

  try {
    const resp = await fetch(csvUrl, { redirect: 'follow' });
    if (!resp.ok) throw new Error(`Google Sheets export error: ${resp.status}`);
    const csv = await resp.text();

    const rows = csv.split('\n').filter(l => l.trim());
    const data = [];
    for (let i = 1; i < rows.length; i++) {
      const cells = parseCSVRow(rows[i]);
      if (cells.length < 5 || !cells[0].trim()) continue;
      const tna = parseFloat(cells[1].replace('%', '').replace(',', '.')) || 0;
      if (tna <= 0) continue;
      data.push({
        banco: cells[0].trim(),
        tna,
        plazo_max_anios: parseInt(cells[2], 10) || 0,
        relacion_cuota_ingreso: cells[3].trim(),
        financiamiento: cells[4].trim(),
      });
    }
    data.sort((a, b) => a.tna - b.tna);
    res.json({ data, source: 'google-sheets', updated: new Date().toISOString() });
  } catch (err) {
    console.error('Hipotecarios proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch hipotecarios data' });
  }
});

function parseCSVRow(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { cells.push(current); current = ''; }
    else { current += ch; }
  }
  cells.push(current);
  return cells;
}

// --- BCRA Indicators ---

const BCRA_VARS = [
  { id: 1,  key: 'reservas',              nombre: 'Reservas Internacionales',          unidad: 'MM USD', categoria: 'Cambiario', formato: 'numero' },
  { id: 4,  key: 'usd_minorista',         nombre: 'Dólar Minorista (vendedor)',        unidad: '$/USD',  categoria: 'Cambiario', formato: 'numero' },
  { id: 5,  key: 'usd_mayorista',         nombre: 'Dólar Mayorista (referencia)',      unidad: '$/USD',  categoria: 'Cambiario', formato: 'numero' },
  { id: 7,  key: 'badlar_tna',            nombre: 'BADLAR Privados (TNA)',             unidad: '% TNA',  categoria: 'Tasas',     formato: 'pct' },
  { id: 35, key: 'badlar_tea',            nombre: 'BADLAR Privados (TEA)',             unidad: '% TEA',  categoria: 'Tasas',     formato: 'pct' },
  { id: 8,  key: 'tm20',                  nombre: 'TM20 Privados',                     unidad: '% TNA',  categoria: 'Tasas',     formato: 'pct' },
  { id: 44, key: 'tamar_tna',             nombre: 'TAMAR Privados (TNA)',              unidad: '% TNA',  categoria: 'Tasas',     formato: 'pct' },
  { id: 45, key: 'tamar_tea',             nombre: 'TAMAR Privados (TEA)',              unidad: '% TEA',  categoria: 'Tasas',     formato: 'pct' },
  { id: 11, key: 'baibar',               nombre: 'BAIBAR (interbancaria)',            unidad: '% TNA',  categoria: 'Tasas',     formato: 'pct' },
  { id: 12, key: 'tasa_depositos_30d',   nombre: 'Depósitos 30 días',                unidad: '% TNA',  categoria: 'Tasas',     formato: 'pct' },
  { id: 13, key: 'tasa_adelantos',       nombre: 'Adelantos Cta Cte',                unidad: '% TNA',  categoria: 'Tasas',     formato: 'pct' },
  { id: 14, key: 'tasa_prestamos',       nombre: 'Préstamos Personales',             unidad: '% TNA',  categoria: 'Tasas',     formato: 'pct' },
  { id: 43, key: 'tasa_justicia',        nombre: 'Tasa Uso de Justicia (P 14.290)',  unidad: '% anual',categoria: 'Tasas',     formato: 'pct' },
  { id: 15, key: 'base_monetaria',       nombre: 'Base Monetaria',                   unidad: 'MM $',   categoria: 'Monetario', formato: 'numero' },
  { id: 16, key: 'circulacion',          nombre: 'Circulación Monetaria',            unidad: 'MM $',   categoria: 'Monetario', formato: 'numero' },
  { id: 17, key: 'billetes_publico',     nombre: 'Billetes en poder del Público',    unidad: 'MM $',   categoria: 'Monetario', formato: 'numero' },
  { id: 18, key: 'efectivo_entidades',   nombre: 'Efectivo en Entidades',            unidad: 'MM $',   categoria: 'Monetario', formato: 'numero' },
  { id: 19, key: 'dep_cta_cte_bcra',    nombre: 'Depósitos Cta Cte en BCRA',        unidad: 'MM $',   categoria: 'Monetario', formato: 'numero' },
  { id: 21, key: 'depositos_total',      nombre: 'Depósitos en EF (total)',          unidad: 'MM $',   categoria: 'Monetario', formato: 'numero' },
  { id: 22, key: 'depositos_cc',         nombre: 'Depósitos en Cta Cte',            unidad: 'MM $',   categoria: 'Monetario', formato: 'numero' },
  { id: 23, key: 'depositos_ca',         nombre: 'Depósitos en Caja de Ahorro',     unidad: 'MM $',   categoria: 'Monetario', formato: 'numero' },
  { id: 24, key: 'depositos_plazo',      nombre: 'Depósitos a Plazo',               unidad: 'MM $',   categoria: 'Monetario', formato: 'numero' },
  { id: 25, key: 'm2_var_ia',            nombre: 'M2 Privado (var. interanual)',     unidad: '%',      categoria: 'Monetario', formato: 'pct' },
  { id: 26, key: 'prestamos_privado',    nombre: 'Préstamos al Sector Privado',     unidad: 'MM $',   categoria: 'Monetario', formato: 'numero' },
  { id: 27, key: 'inflacion_mensual',    nombre: 'Inflación Mensual (IPC)',          unidad: '%',      categoria: 'Inflación', formato: 'pct' },
  { id: 28, key: 'inflacion_interanual', nombre: 'Inflación Interanual (IPC)',       unidad: '%',      categoria: 'Inflación', formato: 'pct' },
  { id: 29, key: 'inflacion_esperada',   nombre: 'Inflación Esperada (próx. 12m)',   unidad: '%',      categoria: 'Inflación', formato: 'pct' },
  { id: 30, key: 'cer',                  nombre: 'CER',                              unidad: 'índice', categoria: 'Índices',   formato: 'numero' },
  { id: 31, key: 'uva',                  nombre: 'UVA',                              unidad: '$',      categoria: 'Índices',   formato: 'numero' },
  { id: 32, key: 'uvi',                  nombre: 'UVI',                              unidad: '$',      categoria: 'Índices',   formato: 'numero' },
  { id: 40, key: 'icl',                  nombre: 'ICL (Contratos de Locación)',      unidad: 'índice', categoria: 'Índices',   formato: 'numero' },
];

app.get('/api/bcra', async (req, res) => {
  const { variable, desde, hasta } = req.query;
  const bcraHeaders = { 'Accept': 'application/json', 'User-Agent': 'rendimientos.co' };

  // Single variable history
  if (variable) {
    let url = `https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/${variable}?limit=3000`;
    if (desde) url += `&desde=${desde}`;
    if (hasta) url += `&hasta=${hasta}`;
    try {
      const r = await fetch(url, { headers: bcraHeaders });
      const data = await r.json();
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
    return;
  }

  // All key variables (last 2 data points each)
  try {
    const results = await Promise.allSettled(
      BCRA_VARS.map(v =>
        fetch(`https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/${v.id}?limit=2`, { headers: bcraHeaders })
          .then(r => r.json())
      )
    );
    const data = BCRA_VARS.map((varDef, i) => {
      const result = results[i];
      if (result.status === 'fulfilled' && result.value.results?.length > 0) {
        const detalle = result.value.results[0].detalle || [];
        return { ...varDef, valor: detalle[0]?.valor ?? null, fecha: detalle[0]?.fecha ?? null, valorAnterior: detalle[1]?.valor ?? null, fechaAnterior: detalle[1]?.fecha ?? null };
      }
      return { ...varDef, valor: null, fecha: null, valorAnterior: null, fechaAnterior: null };
    });
    res.json({ data, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- BCRA Cambiarias ---

const MONEDAS_DESTACADAS = ['USD', 'EUR', 'BRL', 'GBP', 'CHF', 'JPY', 'CNY', 'CLP', 'UYU', 'PYG', 'BOB', 'MXN', 'COP', 'CAD', 'AUD', 'XAU', 'XAG'];

app.get('/api/bcra-cambiarias', async (req, res) => {
  const { moneda, desde, hasta } = req.query;
  try {
    if (moneda) {
      let url = `https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones/${moneda}?limit=365`;
      if (desde) url += `&fechaDesde=${desde}`;
      if (hasta) url += `&fechaHasta=${hasta}`;
      const r = await fetch(url);
      res.json(await r.json());
      return;
    }
    const r = await fetch('https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones');
    const result = await r.json();
    const detalle = result.results?.detalle || [];
    const fecha = result.results?.fecha || null;
    const destacadas = [], otras = [];
    for (const m of detalle) {
      if (!m.tipoCotizacion || m.tipoCotizacion <= 0) continue;
      const item = { codigo: m.codigoMoneda, nombre: m.descripcion, cotizacion: m.tipoCotizacion, tipoPase: m.tipoPase, destacada: MONEDAS_DESTACADAS.includes(m.codigoMoneda) };
      if (item.destacada) destacadas.push(item); else otras.push(item);
    }
    destacadas.sort((a, b) => MONEDAS_DESTACADAS.indexOf(a.codigo) - MONEDAS_DESTACADAS.indexOf(b.codigo));
    otras.sort((a, b) => a.codigo.localeCompare(b.codigo));
    res.json({ fecha, destacadas, otras, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- Cotizaciones (Dólar Oficial, CCL, MEP, Riesgo País) ---

app.get('/api/cotizaciones', async (req, res) => {
  try {
    const [yahooResp, bondsResp, riesgoResp] = await Promise.allSettled([
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/ARS%3DX?interval=1d&range=5d', { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.json()),
      fetch('https://data912.com/live/arg_bonds').then(r => r.json()),
      fetch('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo').then(r => r.json()),
    ]);

    let oficial = null;
    if (yahooResp.status === 'fulfilled') {
      try {
        const meta = yahooResp.value.chart.result[0].meta;
        oficial = { price: meta.regularMarketPrice, prevClose: meta.chartPreviousClose || meta.previousClose || 0 };
      } catch (e) { /* ignore */ }
    }

    let ccl = null, mep = null;
    if (bondsResp.status === 'fulfilled' && Array.isArray(bondsResp.value)) {
      const al30 = bondsResp.value.find(b => b.symbol === 'AL30');
      const al30d = bondsResp.value.find(b => b.symbol === 'AL30D');
      const al30c = bondsResp.value.find(b => b.symbol === 'AL30C');
      const arsPrice = al30 ? parseFloat(al30.c) : 0;
      if (al30c && arsPrice > 0) {
        const cclUsd = parseFloat(al30c.c);
        if (cclUsd > 0) ccl = { price: Math.round((arsPrice / cclUsd) * 100) / 100 };
      }
      if (al30d && arsPrice > 0) {
        const mepUsd = parseFloat(al30d.c);
        if (mepUsd > 0) mep = { price: Math.round((arsPrice / mepUsd) * 100) / 100 };
      }
    }

    let riesgoPais = null;
    if (riesgoResp.status === 'fulfilled' && riesgoResp.value && riesgoResp.value.valor != null) {
      riesgoPais = { value: riesgoResp.value.valor };
    }

    res.json({ oficial, ccl, mep, riesgoPais, updated: new Date().toISOString() });
  } catch (err) {
    console.error('Cotizaciones proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch cotizaciones' });
  }
});

// --- Earnings Calendar (SavvyTrader proxy) ---

app.get('/api/earnings', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end query params required' });
  try {
    const url = `https://api.savvytrader.com/pricing/assets/earnings/calendar/daily?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`SavvyTrader API error: ${resp.status}`);
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    console.error('Earnings proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch earnings data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
