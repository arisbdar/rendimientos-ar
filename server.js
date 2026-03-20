const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const CONFIG_PATH = path.join(__dirname, 'data', 'config.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '***REDACTED***';
const COOKIE_NAME = 'admin_token';

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Auth ---

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

let validTokens = new Set();

function parseCookies(req) {
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const [k, v] = c.trim().split('=');
    if (k) cookies[k] = v;
  });
  return cookies;
}

function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  if (cookies[COOKIE_NAME] && validTokens.has(cookies[COOKIE_NAME])) {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.redirect('/admin/login');
}

// Login page
app.get('/admin/login', (req, res) => {
  const error = req.query.error ? '<p style="color:var(--red);font-size:0.82rem;margin-bottom:16px;">Contraseña incorrecta</p>' : '';
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login | ComparaTasas Admin</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💰</text></svg>">
  <link rel="stylesheet" href="/styles.css">
  <style>
    .login-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .login-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 40px;
      max-width: 380px;
      width: 100%;
      box-shadow: var(--shadow);
    }
    .login-card h1 {
      font-size: 1.1rem;
      font-weight: 700;
      margin-bottom: 4px;
      letter-spacing: -0.02em;
    }
    .login-card p.sub {
      color: var(--text-tertiary);
      font-size: 0.8rem;
      margin-bottom: 24px;
    }
    .login-card input[type="password"] {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font-size: 0.88rem;
      font-family: var(--font);
      background: #fff;
      margin-bottom: 16px;
      transition: border-color 0.15s;
    }
    .login-card input[type="password"]:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
    }
    .login-card button {
      width: 100%;
      padding: 10px;
      background: var(--text);
      color: #fff;
      border: none;
      border-radius: var(--radius-sm);
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      font-family: var(--font);
      transition: opacity 0.15s;
    }
    .login-card button:hover { opacity: 0.85; }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="login-card">
      <h1>Panel Admin</h1>
      <p class="sub">Ingresá la contraseña para continuar</p>
      ${error}
      <form method="POST" action="/admin/login">
        <input type="password" name="password" placeholder="Contraseña" autofocus required>
        <button type="submit">Ingresar</button>
      </form>
    </div>
  </div>
</body>
</html>`);
});

app.post('/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    const token = generateToken();
    validTokens.add(token);
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);
    return res.redirect('/admin');
  }
  res.redirect('/admin/login?error=1');
});

app.get('/admin/logout', (req, res) => {
  const cookies = parseCookies(req);
  if (cookies[COOKIE_NAME]) validTokens.delete(cookies[COOKIE_NAME]);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`);
  res.redirect('/admin/login');
});

// --- Config API ---

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// Public read (no auth needed)
app.get('/api/config', (req, res) => {
  res.json(readConfig());
});

// Protected write endpoints
app.put('/api/config', requireAuth, (req, res) => {
  writeConfig(req.body);
  res.json({ ok: true });
});

app.patch('/api/config/:section/:id', requireAuth, (req, res) => {
  const config = readConfig();
  const section = config[req.params.section];
  if (!section) return res.status(404).json({ error: 'Section not found' });

  const item = section.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  Object.assign(item, req.body);
  writeConfig(config);
  res.json(item);
});

app.post('/api/config/:section', requireAuth, (req, res) => {
  const config = readConfig();
  if (!config[req.params.section]) return res.status(404).json({ error: 'Section not found' });

  config[req.params.section].push(req.body);
  writeConfig(config);
  res.json(req.body);
});

app.delete('/api/config/:section/:id', requireAuth, (req, res) => {
  const config = readConfig();
  const section = config[req.params.section];
  if (!section) return res.status(404).json({ error: 'Section not found' });

  config[req.params.section] = section.filter(i => i.id !== req.params.id);
  writeConfig(config);
  res.json({ ok: true });
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

// --- Serve pages ---

app.get('/admin', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
