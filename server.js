const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const CONFIG_PATH = path.join(__dirname, 'data', 'config.json');
const PUBLIC_CONFIG_PATH = path.join(__dirname, 'public', 'config.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_ENABLED = ADMIN_PASSWORD.length >= 12;
const COOKIE_NAME = 'admin_token';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const LOGIN_WINDOW_MS = 1000 * 60 * 15;
const LOGIN_MAX_ATTEMPTS = 10;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const SECTION_SCHEMAS = {
  garantizados: {
    required: ['id', 'nombre', 'tipo', 'tna', 'limite', 'vigente_desde', 'logo', 'logo_bg', 'activo'],
    fields: {
      id: validateSlug,
      nombre: validateNonEmptyString,
      tipo: value => validateEnum(value, ['Cuenta Remunerada', 'Billetera']),
      tna: validateNumber,
      limite: validateNonEmptyString,
      vigente_desde: validateDateString,
      logo: validateShortString,
      logo_bg: validateHexColor,
      activo: validateBoolean,
    },
  },
  especiales: {
    required: ['id', 'nombre', 'tipo', 'tna', 'limite', 'vigente_desde', 'logo', 'logo_bg', 'activo'],
    fields: {
      id: validateSlug,
      nombre: validateNonEmptyString,
      descripcion: validateOptionalString,
      tipo: value => validateEnum(value, ['Cuenta Remunerada', 'Billetera']),
      tna: validateNumber,
      limite: validateNonEmptyString,
      vigente_desde: validateDateString,
      logo: validateShortString,
      logo_bg: validateHexColor,
      activo: validateBoolean,
    },
  },
  fcis: {
    required: ['id', 'nombre', 'entidad', 'categoria', 'fondo_id', 'clase_id', 'activo'],
    fields: {
      id: validateSlug,
      nombre: validateNonEmptyString,
      entidad: validateNonEmptyString,
      categoria: value => validateEnum(value, ['Money Market', 'Renta Fija', 'Renta Variable', 'Renta Mixta']),
      fondo_id: validatePositiveInteger,
      clase_id: validatePositiveInteger,
      activo: validateBoolean,
    },
  },
};

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "connect-src 'self' https://api.argentinadatos.com",
    "object-src 'none'",
  ].join('; '));
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// --- Auth ---

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

const validTokens = new Map();
const loginAttempts = new Map();

function parseCookies(req) {
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const [k, v] = c.trim().split('=');
    if (k) cookies[k] = decodeURIComponent(v || '');
  });
  return cookies;
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(ip || 'unknown').digest('hex');
}

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [token, expiresAt] of validTokens.entries()) {
    if (expiresAt <= now) validTokens.delete(token);
  }
}

function hasValidSession(token) {
  pruneExpiredSessions();
  const expiresAt = validTokens.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    validTokens.delete(token);
    return false;
  }
  return true;
}

function isRateLimited(ip) {
  const key = hashIp(ip);
  const now = Date.now();
  const attempts = (loginAttempts.get(key) || []).filter(ts => now - ts < LOGIN_WINDOW_MS);
  loginAttempts.set(key, attempts);
  return attempts.length >= LOGIN_MAX_ATTEMPTS;
}

function recordFailedAttempt(ip) {
  const key = hashIp(ip);
  const now = Date.now();
  const attempts = (loginAttempts.get(key) || []).filter(ts => now - ts < LOGIN_WINDOW_MS);
  attempts.push(now);
  loginAttempts.set(key, attempts);
}

function clearFailedAttempts(ip) {
  loginAttempts.delete(hashIp(ip));
}

function setAuthCookie(res, token) {
  const cookieParts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (IS_PRODUCTION) cookieParts.push('Secure');
  res.setHeader('Set-Cookie', cookieParts.join('; '));
}

function clearAuthCookie(res) {
  const cookieParts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ];
  if (IS_PRODUCTION) cookieParts.push('Secure');
  res.setHeader('Set-Cookie', cookieParts.join('; '));
}

function safeEqual(a, b) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function requireAdminEnabled(req, res, next) {
  if (ADMIN_ENABLED) return next();
  return res.status(503).send('Admin deshabilitado: definí ADMIN_PASSWORD en el entorno.');
}

function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  if (cookies[COOKIE_NAME] && hasValidSession(cookies[COOKIE_NAME])) {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.redirect('/admin/login');
}

// Login page
app.get('/admin/login', requireAdminEnabled, (req, res) => {
  const error = req.query.error ? '<p style="color:var(--red);font-size:0.82rem;margin-bottom:16px;">Contraseña incorrecta</p>' : '';
  const throttled = req.query.throttled
    ? '<p style="color:var(--red);font-size:0.82rem;margin-bottom:16px;">Demasiados intentos. Esperá unos minutos.</p>'
    : '';
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
      ${throttled}
      <form method="POST" action="/admin/login">
        <input type="password" name="password" placeholder="Contraseña" autofocus required>
        <button type="submit">Ingresar</button>
      </form>
    </div>
  </div>
</body>
</html>`);
});

app.post('/admin/login', requireAdminEnabled, (req, res) => {
  if (isRateLimited(req.ip)) {
    return res.redirect('/admin/login?throttled=1');
  }

  if (typeof req.body.password === 'string' && safeEqual(req.body.password, ADMIN_PASSWORD)) {
    const token = generateToken();
    validTokens.set(token, Date.now() + SESSION_TTL_MS);
    clearFailedAttempts(req.ip);
    setAuthCookie(res, token);
    return res.redirect('/admin');
  }
  recordFailedAttempt(req.ip);
  res.redirect('/admin/login?error=1');
});

app.get('/admin/logout', (req, res) => {
  const cookies = parseCookies(req);
  if (cookies[COOKIE_NAME]) validTokens.delete(cookies[COOKIE_NAME]);
  clearAuthCookie(res);
  res.redirect('/admin/login');
});

// --- Config API ---

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function writeConfig(config) {
  const serialized = JSON.stringify(config, null, 2);
  fs.writeFileSync(CONFIG_PATH, serialized);
  if (fs.existsSync(PUBLIC_CONFIG_PATH)) {
    fs.writeFileSync(PUBLIC_CONFIG_PATH, serialized);
  }
}

function validateNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateOptionalString(value) {
  return value === undefined || value === null || typeof value === 'string';
}

function validateShortString(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 8;
}

function validateSlug(value) {
  return typeof value === 'string' && /^[a-z0-9-]+$/.test(value);
}

function validateDateString(value) {
  return typeof value === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(value);
}

function validateHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function validateBoolean(value) {
  return typeof value === 'boolean';
}

function validateNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validatePositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function validateEnum(value, allowedValues) {
  return typeof value === 'string' && allowedValues.includes(value);
}

function sanitizeValue(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function validateSectionItem(sectionName, input, options = {}) {
  const schema = SECTION_SCHEMAS[sectionName];
  if (!schema || !input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Invalid payload' };
  }

  const keys = Object.keys(input);
  const allowedKeys = Object.keys(schema.fields);
  const data = {};

  if (!options.partial) {
    for (const requiredKey of schema.required) {
      if (!(requiredKey in input)) {
        return { ok: false, error: `Missing field: ${requiredKey}` };
      }
    }
  }

  if (keys.length === 0) {
    return { ok: false, error: 'Empty payload' };
  }

  for (const key of keys) {
    if (!allowedKeys.includes(key)) {
      return { ok: false, error: `Unknown field: ${key}` };
    }
    if (options.forbidKeys && options.forbidKeys.includes(key)) {
      return { ok: false, error: `Field is immutable: ${key}` };
    }

    const value = sanitizeValue(input[key]);
    if (!schema.fields[key](value)) {
      return { ok: false, error: `Invalid field: ${key}` };
    }
    data[key] = value;
  }

  return { ok: true, data };
}

function validateConfigShape(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
  if (!Array.isArray(config.garantizados) || !Array.isArray(config.especiales) || !Array.isArray(config.fcis)) return false;
  if (!config.plazos_fijos || typeof config.plazos_fijos !== 'object' || Array.isArray(config.plazos_fijos)) return false;

  const sections = ['garantizados', 'especiales', 'fcis'];
  for (const section of sections) {
    for (const item of config[section]) {
      if (!validateSectionItem(section, item).ok) return false;
    }
  }

  return true;
}

// Public read (no auth needed)
app.get('/api/config', (req, res) => {
  res.json(readConfig());
});

// Protected write endpoints
app.put('/api/config', requireAuth, (req, res) => {
  if (!validateConfigShape(req.body)) {
    return res.status(400).json({ error: 'Invalid config payload' });
  }
  writeConfig(req.body);
  res.json({ ok: true });
});

app.patch('/api/config/:section/:id', requireAuth, (req, res) => {
  const config = readConfig();
  const section = config[req.params.section];
  if (!section) return res.status(404).json({ error: 'Section not found' });

  const item = section.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const validation = validateSectionItem(req.params.section, req.body, { partial: true, forbidKeys: ['id'] });
  if (!validation.ok) {
    return res.status(400).json({ error: validation.error });
  }

  Object.assign(item, validation.data);
  writeConfig(config);
  res.json(item);
});

app.post('/api/config/:section', requireAuth, (req, res) => {
  const config = readConfig();
  if (!config[req.params.section]) return res.status(404).json({ error: 'Section not found' });

  const validation = validateSectionItem(req.params.section, req.body);
  if (!validation.ok) {
    return res.status(400).json({ error: validation.error });
  }

  const alreadyExists = config[req.params.section].some(item => item.id === validation.data.id);
  if (alreadyExists) {
    return res.status(409).json({ error: 'Item id already exists' });
  }

  config[req.params.section].push(validation.data);
  writeConfig(config);
  res.json(validation.data);
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
  if (!ADMIN_ENABLED) {
    console.warn('ADMIN_PASSWORD is not configured. Admin routes are disabled.');
  }
  console.log(`Server running at http://localhost:${PORT}`);
});
