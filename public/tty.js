/* ============================================================
 * rendimientos*.co // tty — vanilla terminal
 * ============================================================ */

// ─── State ────────────────────────────────────────────────────
const STATE = {
  section: { main: 'mundo', sub: null },
  palette: 'amber',
  scanlines: 'on',
  density: 'medium',
};

const LS = {
  section: 'rndmt_section',
  palette: 'rndmt_palette',
  scanlines: 'rndmt_scanlines',
  density: 'rndmt_density',
};

// Nav structure — must match README order
const NAV = [
  { k: 'mundo',       label: 'mundo',       key: 'm' },
  { k: 'earnings',    label: 'earnings',    key: 'e', href: '/earnings' },
  { k: 'cedears',     label: 'cedears',     key: 'c' },
  { k: 'ars',         label: 'ars',         key: 'a',
    subs: [
      { k: 'billeteras',       label: 'billeteras' },
      { k: 'plazofijo',        label: 'plazofijo' },
      { k: 'plazofijoperiod',  label: 'plazofijo periódico' },
      { k: 'lecaps',           label: 'lecaps' },
      { k: 'cer',              label: 'cer' },
      { k: 'comparador',       label: 'comparador' },
    ]
  },
  { k: 'bonos',        label: 'bonos',        key: 'b' },
  { k: 'ons',          label: 'ons',          key: 'o' },
  { k: 'hipotecarios', label: 'hipotecarios', key: 'h' },
  { k: 'dolar',        label: 'dólar',        key: 'd' },
  { k: 'pix',          label: 'pix',          key: 'p' },
  { k: 'bcra',         label: 'bcra',         key: 'r' },
  { k: 'mundial',      label: 'mundial',      key: 'w' },
];

// ─── Helpers ───────────────────────────────────────────────────
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fmt(n, d) {
  if (n == null || isNaN(n)) return '—';
  const digits = d == null ? (Math.abs(n) < 10 ? 2 : Math.abs(n) < 1000 ? 1 : 0) : d;
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtPct(n, d = 2) {
  if (n == null || isNaN(n)) return '—';
  const s = n > 0 ? '+' : '';
  return `${s}${Number(n).toFixed(d)}%`;
}
function fmtPctPlain(n, d = 2) {
  if (n == null || isNaN(n)) return '—';
  return `${Number(n).toFixed(d)}%`;
}
function arrow(n) { return n > 0 ? '▲' : n < 0 ? '▼' : '·'; }
function signClass(n) { return n > 0 ? 'up' : n < 0 ? 'down' : 'dim'; }

function parseLocalDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Next business day (Argentina holidays)
function getSettlementDate(from) {
  const holidays = [
    '2026-03-23', '2026-03-24', '2026-04-02', '2026-04-03',
    '2026-05-01', '2026-05-25', '2026-06-15', '2026-06-20',
    '2026-07-09', '2026-08-17', '2026-10-12', '2026-11-23',
    '2026-12-07', '2026-12-08', '2026-12-25', '2027-01-01',
  ];
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let steps = 0;
  while (steps < 1) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (holidays.includes(iso)) continue;
    steps++;
  }
  return d;
}

// Newton-Raphson YTM (reused from app.js)
function calcYTM(price, flows, settlementDate) {
  const MS = 365.25 * 24 * 60 * 60 * 1000;
  let r = 0.10;
  for (let i = 0; i < 100; i++) {
    let pv = 0, dpv = 0;
    for (const f of flows) {
      const t = (f.fecha - settlementDate) / MS;
      if (t <= 0) continue;
      const disc = Math.pow(1 + r, t);
      pv += f.monto / disc;
      dpv -= t * f.monto / (disc * (1 + r));
    }
    const diff = pv - price;
    if (Math.abs(diff) < 0.0001) break;
    if (Math.abs(dpv) < 1e-12) break;
    r -= diff / dpv;
    if (r < -0.5) r = -0.5;
    if (r > 2) r = 2;
  }
  return r * 100;
}

function calcDuration(price, flows, settlementDate, ytmPct) {
  const MS = 365.25 * 24 * 60 * 60 * 1000;
  const r = ytmPct / 100;
  let num = 0, pv = 0;
  for (const f of flows) {
    const t = (f.fecha - settlementDate) / MS;
    if (t <= 0) continue;
    const disc = Math.pow(1 + r, t);
    const pvf = f.monto / disc;
    pv += pvf;
    num += t * pvf;
  }
  return pv > 0 ? num / pv : 0;
}

// ─── Logo map ──────────────────────────────────────────────────
// Only names whose image file actually exists in public/logos/ — others
// render as initials on a branded background color (BILLETERA_BG).
const LOGO_IMG = {
  'Ualá': '/logos/Uala.svg',
  'Uala': '/logos/Uala.svg',
  'Reba': '/logos/Reba_Compañía_Financiera.png',
  'Brubank': '/logos/Brubank.svg',
  'Banco Nación': '/logos/Banco_Nación.png',
  'BNA': '/logos/Banco_Nación.png',
  'Banco Galicia': '/logos/Banco_Galicia.png',
  'Galicia': '/logos/Banco_Galicia.png',
  'Banco Santander': '/logos/Banco_Santander.png',
  'Santander': '/logos/Banco_Santander.png',
  'Banco Ciudad': '/logos/Banco_Ciudad.png',
  'Ciudad': '/logos/Banco_Ciudad.png',
  'Banco Hipotecario': '/logos/Banco_Hipotecario.png',
  'Hipotecario': '/logos/Banco_Hipotecario.png',
  'ICBC': '/logos/ICBC_Argentina.png',
  'Banco Macro': '/logos/Banco_Macro.png',
  'Macro': '/logos/Banco_Macro.png',
  'BBVA': '/logos/BBVA_Argentina.png',
  'BBVA Argentina': '/logos/BBVA_Argentina.png',
  'Banco Comafi': '/logos/Banco_Comafi.png',
  'Comafi': '/logos/Banco_Comafi.png',
  'Banco Credicoop': '/logos/Banco_Credicoop.png',
  'Credicoop': '/logos/Banco_Credicoop.png',
  'Banco Supervielle': '/logos/Banco_Supervielle.svg',
  'Supervielle': '/logos/Banco_Supervielle.svg',
  'Banco Voii': '/logos/Banco_Voii.png',
  'Voii': '/logos/Banco_Voii.png',
  'Banco Bica': '/logos/Banco_BICA.svg',
  'Banco BICA': '/logos/Banco_BICA.svg',
  'Banco CMF': '/logos/Banco_CMF.png',
  'CMF': '/logos/Banco_CMF.png',
  'Banco Meridian': '/logos/Banco_Meridian.png',
  'Meridian': '/logos/Banco_Meridian.png',
  'Banco Patagonia': '/logos/Banco_Patagonia.svg',
  'Patagonia': '/logos/Banco_Patagonia.svg',
  'Banco del Sol': '/logos/Banco_del_Sol.svg',
  'BANCOR': '/logos/BANCOR.svg',
  'Banco de Córdoba': '/logos/BANCOR.svg',
};

// Brand background color for billeteras/fintechs without SVG in /logos
const BILLETERA_BG = {
  'Carrefour Banco': '#004a9f',
  'Naranja X': '#ff6600',
  'Mercado Pago': '#00b0ff',
  'Mercado Fondo': '#00b0ff',
  'Personal Pay': '#d60036',
  'Cocos': '#0ab386',
  'Cocos Capital': '#0ab386',
  'Cocos Ahorro': '#0ab386',
  'Lemon': '#00c897',
  'Lemon Cash': '#00c897',
  'Prex': '#5e50ff',
  'Adcap': '#1a1a6c',
  'Balanz': '#1f3a93',
  'IEB+': '#0066cc',
  'IEB': '#0066cc',
  'Fiwind': '#ff9900',
  'Delta': '#e40046',
  'LB Finanzas': '#0a2e5c',
  'Claro Pay': '#e30613',
  'Pellegrini': '#5f3c20',
  'SBS': '#005caa',
};

// Logos. Only paths that actually exist in public/logos/ are listed —
// others fall through to initials (which is fine on the terminal aesthetic).
const PLAZO_FIJO_LOGOS = {
  'Banco Nación': '/logos/Banco_Nación.png',
  'Banco De La Nación Argentina': '/logos/Banco_Nación.png',
  'Banco Santander': '/logos/Banco_Santander.png',
  'Banco Santander Argentina': '/logos/Banco_Santander.png',
  'Banco Galicia': '/logos/Banco_Galicia.png',
  'Banco Galicia Argentina': '/logos/Banco_Galicia.png',
  'Banco Provincia': '/logos/Banco_Provincia.svg',
  'BBVA Argentina': '/logos/BBVA_Argentina.png',
  'Banco BBVA Argentina': '/logos/BBVA_Argentina.png',
  'Banco Macro': '/logos/Banco_Macro.png',
  'Banco Credicoop': '/logos/Banco_Credicoop.png',
  'ICBC': '/logos/ICBC_Argentina.png',
  'ICBC Argentina': '/logos/ICBC_Argentina.png',
  'Industrial And Commercial Bank Of China': '/logos/ICBC_Argentina.png',
  'Banco Ciudad': '/logos/Banco_Ciudad.png',
  'Banco De La Ciudad De Buenos Aires': '/logos/Banco_Ciudad.png',
  'Banco Comafi': '/logos/Banco_Comafi.png',
  'Banco de Corrientes': '/logos/Banco_de_Corrientes.svg',
  'Banco de Córdoba': '/logos/BANCOR.svg',
  'Banco del Chubut': '/logos/Banco_del_Chubut.png',
  'Banco del Sol': '/logos/Banco_del_Sol.svg',
  'Banco Hipotecario': '/logos/Banco_Hipotecario.png',
  'Banco Voii': '/logos/Banco_Voii.png',
  'Bibank': '/logos/Bibank.png',
  'Ualá': '/logos/Uala.svg',
  'Uala': '/logos/Uala.svg',
  'Reba': '/logos/Reba_Compañía_Financiera.png',
  'Banco BICA': '/logos/Banco_BICA.svg',
  'Banco Bica': '/logos/Banco_BICA.svg',
  'Banco Supervielle': '/logos/Banco_Supervielle.svg',
  'Banco Tierra del Fuego': '/logos/Banco_Prov__Tierra_del_Fuego.png',
  'Banco de Formosa': '/logos/Banco_de_Formosa.png',
  'Banco Dino': '/logos/Banco_Dino.png',
  'Banco Julio': '/logos/Banco_Julio.png',
  'Banco Mariva': '/logos/Banco_Mariva.png',
  'Banco Masventas': '/logos/Banco_Masventas.png',
  'Banco Meridian': '/logos/Banco_Meridian.png',
  'Banco CMF': '/logos/Banco_CMF.png',
  'Banco de Comercio': '/logos/Banco_de_Comercio.png',
  'Crédito Regional': '/logos/Crédito_Regional.png',
  'Brubank': '/logos/Brubank.svg',
  'Banco Patagonia': '/logos/Banco_Patagonia.svg',
  'Patagonia': '/logos/Banco_Patagonia.svg',
};

// Hipotecarios UVA bank logos
const HIPOTECARIO_LOGOS = {
  'Hipotecario': '/logos/Banco_Hipotecario.png',
  'Ciudad': '/logos/Banco_Ciudad.png',
  'ICBC': '/logos/ICBC_Argentina.png',
  'BNA': '/logos/Banco_Nación.png',
  'Santander': '/logos/Banco_Santander.png',
  'Macro': '/logos/Banco_Macro.png',
  'BBVA': '/logos/BBVA_Argentina.png',
  'Galicia': '/logos/Banco_Galicia.png',
  'Credicoop': '/logos/Banco_Credicoop.png',
  'Comafi': '/logos/Banco_Comafi.png',
  'Banco de Chubut': '/logos/Banco_del_Chubut.png',
  'Banco de la Provincia': '/logos/Banco_de_la_Prov__de_Buenos_Aires.png',
  'Supervielle': '/logos/Banco_Supervielle.svg',
  'Brubank': '/logos/Brubank.svg',
  'Patagonia': '/logos/Banco_Patagonia.svg',
  'Banco del Sol': '/logos/Banco_del_Sol.svg',
  'BANCOR': '/logos/BANCOR.svg',
  'Banco de Corrientes': '/logos/Banco_de_Corrientes.svg',
  'Grupo Petersen': '/logos/Grupo_Petersen.svg',
};

function lookupLogoURL(name) {
  if (!name) return null;
  if (LOGO_IMG[name]) return LOGO_IMG[name];
  if (PLAZO_FIJO_LOGOS[name]) return PLAZO_FIJO_LOGOS[name];
  if (HIPOTECARIO_LOGOS[name]) return HIPOTECARIO_LOGOS[name];
  // Try case-insensitive lookup across all sources
  const lower = name.toLowerCase();
  for (const map of [LOGO_IMG, PLAZO_FIJO_LOGOS, HIPOTECARIO_LOGOS]) {
    for (const k of Object.keys(map)) {
      if (k.toLowerCase() === lower) return map[k];
    }
  }
  return null;
}

function initials(name) {
  if (!name) return '·';
  return name.replace(/^(Banco\s+)/i, '').split(/[\s-]+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '·';
}
function logoHTML(name, sm = false) {
  const src = lookupLogoURL(name);
  const cls = 'logo' + (sm ? ' sm' : '');
  const init = esc(initials(name));
  if (src) return `<span class="${cls}" data-initials="${init}"><img src="${esc(src)}" alt="${esc(name || '')}" onerror="this.remove(); this.parentNode.textContent=this.parentNode.dataset.initials||'·'"></span>`;
  const bg = BILLETERA_BG[name];
  if (bg) return `<span class="${cls}" style="background:${esc(bg)};color:#fff;border-color:${esc(bg)}">${init}</span>`;
  return `<span class="${cls}">${init}</span>`;
}

// ─── SVG helpers ───────────────────────────────────────────────

// Catmull-Rom → cubic Bézier: given [[x,y],...] → smooth SVG path (M ... C ...)
function smoothPath(points) {
  if (!points || points.length < 2) return '';
  const p = points.map(([x, y]) => [+x, +y]);
  if (p.length === 2) return `M${p[0][0].toFixed(2)},${p[0][1].toFixed(2)} L${p[1][0].toFixed(2)},${p[1][1].toFixed(2)}`;
  const out = [`M${p[0][0].toFixed(2)},${p[0][1].toFixed(2)}`];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i === 0 ? 0 : i - 1];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2 < p.length ? i + 2 : i + 1];
    const t = 0.2; // tension; lower = smoother
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    out.push(`C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`);
  }
  return out.join(' ');
}

// Polynomial least-squares fit (for the yield-curve trend line).
// xs/ys: raw data arrays. degree=2 → quadratic. Returns a function f(x)→y.
function polyFit(xs, ys, degree = 2) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const deg = Math.min(degree, n - 1);
  const m = deg + 1;
  // Build X (n x m) with x^j, then solve normal equations (X^T X) a = X^T y
  const A = Array.from({length: m}, () => new Array(m).fill(0));
  const b = new Array(m).fill(0);
  for (let i = 0; i < n; i++) {
    const xi = xs[i], yi = ys[i];
    for (let j = 0; j < m; j++) {
      b[j] += Math.pow(xi, j) * yi;
      for (let k = 0; k < m; k++) A[j][k] += Math.pow(xi, j + k);
    }
  }
  // Gauss-Jordan solve
  for (let i = 0; i < m; i++) {
    // pivot
    let piv = i;
    for (let r = i + 1; r < m; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    if (piv !== i) { [A[i], A[piv]] = [A[piv], A[i]]; [b[i], b[piv]] = [b[piv], b[i]]; }
    const d = A[i][i];
    if (!d) return null;
    for (let k = 0; k < m; k++) A[i][k] /= d;
    b[i] /= d;
    for (let r = 0; r < m; r++) {
      if (r === i) continue;
      const f = A[r][i];
      for (let k = 0; k < m; k++) A[r][k] -= f * A[i][k];
      b[r] -= f * b[i];
    }
  }
  const coeffs = b; // a0 + a1*x + a2*x^2 + ...
  return (x) => {
    let y = 0, p = 1;
    for (let i = 0; i < m; i++) { y += coeffs[i] * p; p *= x; }
    return y;
  };
}

function sparkSVG(data, { positive = true, width = 80, height = 20 } = {}) {
  if (!data || data.length < 2) return '<span class="spark"></span>';
  const min = Math.min(...data), max = Math.max(...data), r = (max - min) || 1;
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => [i * step, height - ((v - min) / r) * height]);
  const linePath = smoothPath(pts);
  const fillPath = `M${pts[0][0].toFixed(2)},${height} L${linePath.replace(/^M/, '')} L${pts[pts.length - 1][0].toFixed(2)},${height} Z`;
  const color = positive ? 'var(--up)' : 'var(--down)';
  const fill = positive ? 'rgba(74,222,128,0.10)' : 'rgba(255,90,78,0.10)';
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="none">
    <path d="${fillPath}" fill="${fill}" stroke="none"/>
    <path d="${linePath}" fill="none" stroke="${color}" stroke-width="1.3"/>
  </svg>`;
}

// Logo helpers for assorted sources
function logoImgHTML(url, name, sm = false) {
  if (!url) return logoHTML(name, sm);
  const cls = 'logo' + (sm ? ' sm' : '');
  const init = esc(initials(name));
  return `<span class="${cls}" data-initials="${init}"><img src="${esc(url)}" alt="${esc(name || '')}" onerror="this.remove(); this.parentNode.textContent=this.parentNode.dataset.initials||'·'"></span>`;
}

function lineChartHTML(data, { label = '', valFmt = (v) => fmt(v, 2), pctFmt = (v) => fmtPct(v, 2) } = {}) {
  if (!data || data.length < 2) return `<div class="chart"><div class="hd"><div><div>${esc(label)}</div><div class="big num">—</div></div><div class="dim">sin datos</div></div></div>`;
  const W = 600, H = 160, P = { l: 8, r: 8, t: 24, b: 8 };
  const min = Math.min(...data), max = Math.max(...data), r = (max - min) || 1;
  const step = (W - P.l - P.r) / (data.length - 1);
  const pts = data.map((v, i) => [P.l + i * step, P.t + (H - P.t - P.b) - ((v - min) / r) * (H - P.t - P.b)]);
  const linePath = smoothPath(pts);
  const last = data[data.length - 1];
  const first = data[0];
  const chg = first ? ((last - first) / first) * 100 : 0;
  const up = chg >= 0;
  const gridLines = [0.25, 0.5, 0.75].map(f => {
    const y = (P.t + f * (H - P.t - P.b)).toFixed(1);
    return `<line class="grid-line" x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}"/>`;
  }).join('');
  const fillPath = `M${P.l},${H - P.b} L${linePath.replace(/^M/, '')} L${(W - P.r).toFixed(2)},${H - P.b} Z`;
  return `<div class="chart">
    <div class="hd">
      <div>
        <div>${esc(label)}</div>
        <div class="big num">${valFmt(last)}</div>
      </div>
      <div class="${signClass(chg)}">${arrow(chg)} ${pctFmt(chg)}</div>
    </div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      ${gridLines}
      <path d="${fillPath}" fill="${up ? 'rgba(74,222,128,0.10)' : 'rgba(255,90,78,0.10)'}" stroke="none"/>
      <path d="${linePath}" fill="none" stroke="${up ? 'var(--up)' : 'var(--down)'}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>`;
}

function scatterSVG(data, { xKey, yKey, labelKey, xLabel, yLabel, yFmt = (v) => fmt(v, 2), xFmt = (v) => fmt(v, 0), selected = null, onSelect = null, targetId }) {
  if (!data || !data.length) return '<div class="chart chart-scatter"><div class="hd"><div>sin datos</div></div></div>';
  // Near-square viewBox matches the tbl-left right-column shape (~1:0.9),
  // so preserveAspectRatio lets the chart fill the container without
  // letterboxing. Text intrinsic sizes read well at any screen width.
  const W = 720, H = 640, P = { l: 72, r: 28, t: 36, b: 56 };
  const xs = data.map(d => d[xKey]);
  const ys = data.map(d => d[yKey]);
  const xRange = Math.max(...xs) - Math.min(...xs);
  const yRange = Math.max(...ys) - Math.min(...ys);
  const xMin = Math.min(...xs) - xRange * 0.05;
  const xMax = Math.max(...xs) + xRange * 0.05;
  const yMin = Math.min(...ys) - Math.max(yRange * 0.15, 0.5);
  const yMax = Math.max(...ys) + Math.max(yRange * 0.15, 0.5);
  const x = v => P.l + ((v - xMin) / (xMax - xMin)) * (W - P.l - P.r);
  const y = v => H - P.b - ((v - yMin) / (yMax - yMin)) * (H - P.t - P.b);

  // Trend line: quadratic regression over all points (if ≥ 3) else linear spline
  const fit = data.length >= 3 ? polyFit(xs, ys, 2) : null;
  let curvePath = '';
  if (fit) {
    const steps = 80;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const xv = xMin + (i / steps) * (xMax - xMin);
      pts.push([x(xv), y(fit(xv))]);
    }
    curvePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  } else {
    const sorted = [...data].sort((a, b) => a[xKey] - b[xKey]);
    curvePath = smoothPath(sorted.map(d => [x(d[xKey]), y(d[yKey])]));
  }

  // Y-axis: 6 ticks with labels, horizontal grid lines
  let grid = '';
  const yTicks = 6;
  for (let i = 0; i < yTicks; i++) {
    const v = yMin + (i * (yMax - yMin) / (yTicks - 1));
    grid += `<line class="grid-line" x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}"/>
      <text x="${P.l - 12}" y="${y(v)}" text-anchor="end" dominant-baseline="middle" fill="var(--fg-faint)" font-size="18" font-family="var(--font-mono)">${esc(yFmt(v))}</text>`;
  }
  // X-axis: 6 ticks
  const xTicks = 6;
  for (let i = 0; i < xTicks; i++) {
    const v = xMin + (i * (xMax - xMin) / (xTicks - 1));
    grid += `<line class="grid-line" x1="${x(v)}" x2="${x(v)}" y1="${P.t}" y2="${H - P.b}"/>
      <text x="${x(v)}" y="${H - P.b + 26}" text-anchor="middle" fill="var(--fg-faint)" font-size="18" font-family="var(--font-mono)">${esc(xFmt(Math.round(v)))}</text>`;
  }
  // Axis labels on the outside
  grid += `<text x="${P.l}" y="${P.t - 14}" fill="var(--fg-faint)" font-size="15" font-family="var(--font-mono)" letter-spacing="0.08em">${esc(yLabel.toUpperCase())}</text>`;
  grid += `<text x="${W - P.r}" y="${H - 10}" text-anchor="end" fill="var(--fg-faint)" font-size="15" font-family="var(--font-mono)" letter-spacing="0.08em">${esc(xLabel.toUpperCase())}</text>`;

  const axes = `<line x1="${P.l}" y1="${P.t}" x2="${P.l}" y2="${H - P.b}" stroke="var(--rule-hi)" stroke-width="1.2"/>
    <line x1="${P.l}" y1="${H - P.b}" x2="${W - P.r}" y2="${H - P.b}" stroke="var(--rule-hi)" stroke-width="1.2"/>`;
  const curve = `<path d="${curvePath}" fill="none" stroke="var(--fg-dim)" stroke-width="1.6" stroke-dasharray="6 4" stroke-linecap="round"/>`;

  // Points — bigger, readable labels, nudged so they don't overlap the point
  const points = data.map(d => {
    const isSel = selected === d[labelKey];
    const cx = x(d[xKey]);
    const cy = y(d[yKey]);
    const r = isSel ? 8 : 6;
    return `<g data-sym="${esc(d[labelKey])}" class="scatter-pt${isSel ? ' sel' : ''}" style="cursor:pointer">
      <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${isSel ? 'var(--hot)' : 'var(--fg)'}" stroke="var(--bg)" stroke-width="2.5"/>
      <text x="${(cx + 11).toFixed(1)}" y="${(cy - 10).toFixed(1)}" fill="${isSel ? 'var(--hot)' : 'var(--fg)'}" font-size="16" font-family="var(--font-mono)" font-weight="500" stroke="var(--bg)" stroke-width="4" paint-order="stroke">${esc(d[labelKey])}</text>
    </g>`;
  }).join('');
  return `<div class="chart chart-scatter">
    <div class="hd"><div>${esc(yLabel)} × ${esc(xLabel)}</div><div class="dim" style="font-size:10px">curva: regresión cuadrática · ${data.length} puntos</div></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" ${targetId ? `data-scatter="${esc(targetId)}"` : ''}>${grid}${axes}${curve}${points}</svg>
  </div>`;
}

function wireScatterClicks(containerEl, onSelect) {
  $$('g.scatter-pt', containerEl).forEach(g => {
    g.addEventListener('click', () => {
      const sym = g.getAttribute('data-sym');
      onSelect(sym);
    });
  });
}

// ─── Page header ──────────────────────────────────────────────
function pHd(tag, title, sub) {
  return `<div class="phd">
    <div class="tag">${esc(tag)}</div>
    <h1>${title}</h1>
    ${sub ? `<p>${sub}</p>` : ''}
  </div>`;
}
function secHead(label, count, opts = {}) {
  return `<h2><span>${esc(label)}</span><span class="line"></span>${count != null ? `<span class="count">${esc(count)}</span>` : ''}</h2>${opts.sub ? `<div class="sub2">${esc(opts.sub)}</div>` : ''}`;
}

// ─── Top bar + nav ────────────────────────────────────────────
function renderTopBar() {
  const top = $('#topbar');
  if (!top) return;
  top.innerHTML = `
    <div class="wrap">
      <div class="row1">
        <a href="/" class="brand">rendimientos<i>*</i>.co <span class="faint" style="margin-left:4px">// tty</span></a>
        <div class="meta">
          <span><b>UTC-3</b> <span id="tty-time">--:--:--</span></span>
          <span id="tty-date" class="dim"></span>
          <span class="live">LIVE</span>
        </div>
      </div>
      <nav class="primary" id="tty-nav-primary"></nav>
    </div>
    <div id="tty-subnav-wrap"></div>
  `;
  renderNav();
  tickClock();
  setInterval(tickClock, 1000);
}

function renderNav() {
  const nav = $('#tty-nav-primary');
  if (!nav) return;
  nav.innerHTML = NAV.map(item => {
    if (item.href) {
      // External page link (e.g. /earnings, /cedears in other pages)
      return `<a href="${esc(item.href)}" class="tty-nav-ext"><button>${esc(item.label)}</button></a>`;
    }
    return `<button data-nav="${esc(item.k)}" class="${STATE.section.main === item.k ? 'on' : ''}">${esc(item.label)}</button>`;
  }).join('');
  $$('button[data-nav]', nav).forEach(b => {
    b.addEventListener('click', () => goTo(b.getAttribute('data-nav'), null));
  });
  renderSubnav();
}

function renderSubnav() {
  const wrap = $('#tty-subnav-wrap');
  if (!wrap) return;
  const item = NAV.find(n => n.k === STATE.section.main);
  if (!item || !item.subs) { wrap.innerHTML = ''; return; }
  const currentSub = STATE.section.sub || item.subs[0].k;
  wrap.innerHTML = `<div class="wrap"><nav class="sub" id="tty-nav-sub">${item.subs.map(s => `
    <button data-sub="${s.k}" class="${currentSub === s.k ? 'on' : ''}">${esc(s.label)}</button>
  `).join('')}</nav></div>`;
  $$('button[data-sub]', wrap).forEach(b => {
    b.addEventListener('click', () => goTo(STATE.section.main, b.getAttribute('data-sub')));
  });
}

function tickClock() {
  const now = new Date();
  // Convert to UTC-3 (Argentina has no DST)
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const ar = new Date(utc - 3 * 60 * 60 * 1000);
  const t = `${String(ar.getHours()).padStart(2,'0')}:${String(ar.getMinutes()).padStart(2,'0')}:${String(ar.getSeconds()).padStart(2,'0')}`;
  const MES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const d = `${String(ar.getDate()).padStart(2,'0')} ${MES[ar.getMonth()]} ${ar.getFullYear()}`;
  const te = $('#tty-time'); if (te) te.textContent = t;
  const de = $('#tty-date'); if (de) de.textContent = d.toUpperCase();
}

// ─── Router ───────────────────────────────────────────────────
function goTo(main, sub) {
  STATE.section = { main, sub: sub || null };
  try { localStorage.setItem(LS.section, JSON.stringify(STATE.section)); } catch (e) {}
  const hash = sub ? `#${main}.${sub}` : `#${main}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
  document.title = `rendimientos*.co // ${main}${sub ? ' · ' + sub : ''}`;
  renderNav();
  updateStatusbarSection();
  renderScreen();
}

function parseHash() {
  const h = (location.hash || '').replace(/^#/, '');
  if (!h) return null;
  const [main, sub] = h.split('.');
  if (!NAV.find(n => n.k === main)) return null;
  return { main, sub: sub || null };
}

function renderScreen() {
  const main = $('#main');
  if (!main) return;
  const { main: m, sub: s } = STATE.section;
  main.innerHTML = '<div class="loading-row"> cargando…</div>';
  const renderer = SCREENS[m];
  if (!renderer) { main.innerHTML = `<div class="empty-state">Sección no encontrada: ${esc(m)}</div>`; return; }
  Promise.resolve().then(() => renderer(main, s)).catch(err => {
    console.error(err);
    main.innerHTML = `<div class="empty-state"><span class="down">ERROR</span> ${esc(err.message || String(err))}</div>`;
  });
}

// ─── Data caches ──────────────────────────────────────────────
const cache = {};
async function fetchCached(url, ttlMs = 60_000) {
  const e = cache[url];
  if (e && (Date.now() - e.ts) < ttlMs) return e.data;
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  const data = await res.json();
  cache[url] = { ts: Date.now(), data };
  return data;
}

// ─── Screen: Mundo ────────────────────────────────────────────
const MUNDO_CATEGORIES = ['Indices', 'Rates', 'FX', 'Commodities', 'Crypto'];

async function screenMundo(main) {
  main.innerHTML = pHd('mundo · monitor global', 'Monitor Global', 'Principales indicadores del mercado mundial, separados por categoría. Click en una fila para verla grande a la derecha.')
    + `<div class="cols lg-chart"><div id="mundo-tbl"></div><div id="mundo-charts"></div></div>`
    + `<section class="s" id="mundo-hot-section">
        <h2><span>hot usa · us stocks con mayor movimiento</span><span class="line"></span><span class="count" id="hot-count">…</span></h2>
        <div id="hot-grid"><div class="loading-row"> datos de mercado…</div></div>
      </section>
      <section class="s" id="mundo-earn-section">
        <h2><span>earnings · próximos reportes</span><span class="line"></span><span class="count" id="earn-count">…</span></h2>
        <div id="earn-timeline"><div class="loading-row"> próximos reportes…</div></div>
        <p style="margin-top:12px"><a href="/earnings" style="color:var(--hot);text-decoration:none;font-size:12px;text-transform:uppercase;letter-spacing:0.08em">ver calendario completo →</a></p>
      </section>`;
  $('#mundo-tbl').innerHTML = '<div class="loading-row"> datos globales…</div>';
  let res;
  try { res = await fetchCached('/api/mundo', 60_000); } catch (e) {
    $('#mundo-tbl').innerHTML = `<div class="empty-state"><span class="down">ERROR</span> ${esc(e.message)}</div>`;
    return;
  }
  const world = normalizeMundo(res);
  const state = { sort: { k: 'sym', dir: 'asc' }, sel: null };

  function render() {
    $('#mundo-tbl').innerHTML = renderTable();
    $('#mundo-charts').innerHTML = renderCharts();
    $$('th[data-col]', $('#mundo-tbl')).forEach(th => {
      th.addEventListener('click', () => {
        const k = th.getAttribute('data-col');
        if (state.sort.k === k) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
        else { state.sort.k = k; state.sort.dir = 'asc'; }
        render();
      });
    });
    $$('tr.clickable[data-sym]', $('#mundo-tbl')).forEach(tr => {
      tr.addEventListener('click', () => {
        const sym = tr.getAttribute('data-sym');
        state.sel = state.sel === sym ? null : sym;
        render();
      });
    });
  }

  function renderTable() {
    const rows = [];
    for (const cat of MUNDO_CATEGORIES) {
      const items = (world[cat] || []).slice();
      items.sort((a, b) => {
        const va = a[state.sort.k], vb = b[state.sort.k];
        if (typeof va === 'number' && typeof vb === 'number') return state.sort.dir === 'asc' ? va - vb : vb - va;
        const sa = String(va || ''), sb = String(vb || '');
        return state.sort.dir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
      });
      rows.push(`<tr class="cat"><td colspan="6">── ${cat.toLowerCase()} <span class="line">────────────────────────────────────────────────────</span></td></tr>`);
      for (const r of items) {
        const isSel = state.sel === r.sym;
        rows.push(`<tr class="clickable${isSel ? ' sel' : ''}" data-sym="${esc(r.sym)}">
          <td><span class="hot">${esc(r.sym)}</span></td>
          <td class="dim">${esc(r.name)}</td>
          <td class="num">${r.pct ? fmtPctPlain(r.last, 2) : fmt(r.last, r.d)}</td>
          <td class="num ${signClass(r.chg)}">${arrow(r.chg)} ${fmtPct(r.chg, 2)}</td>
          <td class="num ${signClass(r.ytd)}">${fmtPct(r.ytd, 1)}</td>
          <td>${sparkSVG(r.sp, { positive: r.chg >= 0 })}</td>
        </tr>`);
      }
    }
    const arr = (k) => state.sort.k === k ? `<span class="arr">${state.sort.dir === 'asc' ? '↑' : '↓'}</span>` : '';
    return `<table class="t">
      <thead><tr>
        <th data-col="sym" style="text-align:left">sym ${arr('sym')}</th>
        <th data-col="name" style="text-align:left">instrumento</th>
        <th data-col="last">último ${arr('last')}</th>
        <th data-col="chg">chg ${arr('chg')}</th>
        <th data-col="ytd">ytd ${arr('ytd')}</th>
        <th>28d</th>
      </tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
  }

  function findAsset(sym) {
    for (const cat of MUNDO_CATEGORIES) {
      const hit = (world[cat] || []).find(a => a.sym === sym);
      if (hit) return hit;
    }
    return null;
  }

  function renderCharts() {
    const sel = state.sel ? findAsset(state.sel) : null;
    const spx = findAsset('SPX') || findAsset('ES=F');
    const btc = findAsset('BTC') || findAsset('BTC-USD');
    const a = sel || spx;
    const b = sel ? null : btc;
    const out = [];
    if (a) out.push(lineChartHTML(a.sp, { label: `${a.sym} · ${a.name} · 28D` }));
    if (b) out.push(lineChartHTML(b.sp, { label: `${b.sym} · ${b.name} · 28D` }));
    if (state.sel) out.push(`<div class="hint" style="margin-top:8px;text-align:center">click de nuevo en <span class="hot">${esc(state.sel)}</span> para volver · default: SPX + BTC</div>`);
    if (!out.length) out.push('<div class="empty-state">sin charts</div>');
    return out.join('');
  }

  render();

  // Kick off hot movers + earnings timeline for the bottom sections
  loadHotMoversInto($('#hot-grid'), $('#hot-count'));
  loadEarningsTimelineInto($('#earn-timeline'), $('#earn-count'));
}

// Hot movers grid — shared between Mundo bottom section and (historically) Hot USA
async function loadHotMoversInto(grid, countEl) {
  if (!grid) return;
  try {
    const raw = await fetchCached('/api/hot-movers', 120_000);
    const list = (raw.data || []).slice(0, 20);
    if (countEl) countEl.textContent = list.length;
    if (!list.length) { grid.innerHTML = '<div class="empty-state">sin datos</div>'; return; }
    grid.innerHTML = `<div class="hot-grid">${list.map(r => {
      const isUp = r.change >= 0;
      return `<div class="hot-card">
        ${logoImgHTML(SVVY_LOGO(r.symbol), r.symbol)}
        <div class="hot-info">
          <div class="hot-symbol">${esc(r.symbol)}</div>
          <div class="hot-name dim">${esc(r.name)}</div>
        </div>
        <div class="hot-right">
          <div class="hot-price">$${fmt(r.price, 2)}</div>
          <div class="hot-change ${isUp ? 'up' : 'down'}">${arrow(r.change)} ${fmtPct(r.change, 2)}</div>
        </div>
      </div>`;
    }).join('')}</div>`;
  } catch (e) {
    grid.innerHTML = `<div class="empty-state"><span class="down">ERROR</span> ${esc(e.message)}</div>`;
  }
}

// Earnings timeline — next 7 days, top 5 per day
async function loadEarningsTimelineInto(el, countEl) {
  if (!el) return;
  try {
    const today = new Date();
    const end = new Date(today.getTime() + 14 * 86400000);
    const fd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const raw = await fetchCached(`/api/earnings?start=${fd(today)}&end=${fd(end)}`, 300_000);
    const data = typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const todayStr = fd(today);
    const days = Object.keys(data).filter(d => d >= todayStr).sort();
    const parsed = {};
    for (const day of days) {
      const items = (data[day] || []).filter(e => e.isDateConfirmed && e.marketCap > 0).sort((a, b) => b.marketCap - a.marketCap).slice(0, 5);
      if (items.length) parsed[day] = items;
    }
    const activeDays = Object.keys(parsed).sort().slice(0, 7);
    if (countEl) countEl.textContent = activeDays.reduce((s, d) => s + parsed[d].length, 0);
    if (!activeDays.length) { el.innerHTML = '<div class="empty-state">sin reportes próximos</div>'; return; }
    el.innerHTML = `<div class="earn-timeline">${activeDays.map(day => {
      const d = new Date(day + 'T00:00:00');
      const DOW = ['dom','lun','mar','mié','jue','vie','sáb'];
      const MES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
      const head = `${DOW[d.getDay()]} ${String(d.getDate()).padStart(2,'0')} ${MES[d.getMonth()]}`;
      return `<div class="earn-day">
        <div class="earn-day-head">${esc(head.toUpperCase())}</div>
        <div class="earn-day-items">${parsed[day].map(e => {
          const lbl = e.earningsTime === 'bmo' ? 'BMO' : e.earningsTime === 'amc' ? 'AMC' : '';
          return `<div class="earn-item">
            ${logoImgHTML(SVVY_LOGO(e.symbol), e.symbol, true)}
            <span class="earn-sym">${esc(e.symbol)}</span>
            <span class="earn-time dim">${esc(lbl)}</span>
          </div>`;
        }).join('')}</div>
      </div>`;
    }).join('')}</div>`;
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><span class="down">ERROR</span> ${esc(e.message)}</div>`;
  }
}

// Normalize /api/mundo response → {Indices, Rates, FX, Commodities, Crypto}
// Real shape: { data: [ {id, symbol, name, group: "Índices"|"Tasas"|"Monedas"|"Energía"|"Metales"|"Agro"|"Crypto", price, prevClose, change, sparkline[]} ], updated }
function normalizeMundo(raw) {
  if (!raw) return {};
  const GROUP_MAP = {
    'Índices': 'Indices',
    'Indices': 'Indices',
    'Tasas': 'Rates',
    'Rates': 'Rates',
    'Monedas': 'FX',
    'FX': 'FX',
    'Energía': 'Commodities',
    'Metales': 'Commodities',
    'Agro': 'Commodities',
    'Commodities': 'Commodities',
    'Crypto': 'Crypto',
  };
  const out = {};
  for (const cat of MUNDO_CATEGORIES) out[cat] = [];
  const list = Array.isArray(raw.data) ? raw.data : (Array.isArray(raw) ? raw : []);
  for (const item of list) {
    const bucket = GROUP_MAP[item.group];
    if (!bucket) continue;
    const a = normalizeAsset(item, bucket);
    if (a.sym) out[bucket].push(a);
  }
  return out;
}

function normalizeAsset(a, bucket) {
  if (!a) return { sym: null };
  // Prefer short id (e.g. "spx", "btc") uppercased over the URL-encoded yahoo symbol
  let sym = a.id || a.sym || a.symbol || a.ticker;
  if (sym) sym = String(sym).toUpperCase();
  const name = a.name || a.shortName || a.longName || sym;
  const last = a.last != null ? +a.last : (a.price != null ? +a.price : (a.value != null ? +a.value : null));
  const chg = a.chg != null ? +a.chg : (a.pct_change != null ? +a.pct_change : (a.change != null ? +a.change : null));
  let sp = Array.isArray(a.sp) ? a.sp :
    Array.isArray(a.sparkline) ? a.sparkline :
    Array.isArray(a.spark) ? a.spark :
    Array.isArray(a.series) ? a.series : null;
  if (sp && sp.length && typeof sp[0] === 'object') {
    sp = sp.map(p => +(p.v != null ? p.v : p.value != null ? p.value : p.close != null ? p.close : p.price)).filter(v => !isNaN(v));
  }
  // Derive a simple "period" % from the sparkline (first → last); approximates YTD-ish on the returned window
  let ytd = a.ytd != null ? +a.ytd : null;
  if (ytd == null && sp && sp.length >= 2) {
    const first = sp[0], lastSp = sp[sp.length - 1];
    if (first) ytd = ((lastSp - first) / first) * 100;
  }
  // Rates (UST 10Y, UST 30Y, etc.) are already in % → render as "4.27%" not "4.27"
  const pct = bucket === 'Rates' || !!a.pct;
  // Decimals hint: crypto & rates use 2; FX uses 4; default 2
  let d = a.d;
  if (d == null) {
    if (bucket === 'FX') d = 4;
    else if (bucket === 'Rates') d = 2;
    else if (Math.abs(last) >= 1000) d = 0;
    else if (Math.abs(last) >= 100) d = 1;
    else d = 2;
  }
  return { sym, name, last, chg, ytd, sp: sp || [], pct, d };
}

// ─── Stubs (overridable per phase) ────────────────────────────
function stubScreen(main, { tag, title, sub, message = 'En construcción — próxima fase.' }) {
  main.innerHTML = pHd(tag, title, sub) + `<div class="empty-state">${esc(message)}</div>`;
}

// Logos de US stocks via svvytrdr CDN (compartido por Mundo, CEDEARs y /earnings)
const SVVY_LOGO = (sym) => `https://static.svvytrdr.com/logos/${encodeURIComponent(sym)}.webp`;

// ─── Screen: CEDEARs (MEP / CCL implícito, tabla completa) ────
async function screenCedears(main) {
  main.innerHTML = pHd('cedears · byma', 'CEDEARs', 'Acciones USA listadas en BYMA. Precio ARS + especie D (MEP) + especie C (CCL) + subyacente USD → MEP y CCL implícitos.')
    + `<section class="s"><h2><span>implícitos promedio</span><span class="line"></span></h2><div id="ced-impl" class="kline"><div class="loading-row"> calculando…</div></div></section>`
    + `<section class="s"><h2><span>tabla completa</span><span class="line"></span><span class="count" id="ced-count">…</span></h2>
        <div class="dol-controls"><input id="ced-search" placeholder="buscar ticker o empresa…" class="ced-search"/></div>
        <div id="ced-tbl"><div class="loading-row"> cargando catálogo…</div></div>
      </section>`;
  try {
    const [catalog, live, usa] = await Promise.all([
      fetchCached('/data/cedears.json', 3600_000),
      fetchCached('/api/cedears', 60_000).catch(() => ({ data: [] })),
      fetchCached('/api/usa-stocks', 60_000).catch(() => ({ data: [] })),
    ]);
    const liveArr = Array.isArray(live.data) ? live.data : (Array.isArray(live) ? live : []);
    const usaArr = Array.isArray(usa.data) ? usa.data : (Array.isArray(usa) ? usa : []);
    const liveMap = {}, usaMap = {};
    for (const it of liveArr) if (it?.symbol) liveMap[it.symbol] = it;
    for (const it of usaArr) if (it?.symbol) usaMap[it.symbol] = it;
    const pricePick = (q) => {
      if (!q) return null;
      // Prefer px_ask or c (close) if > 0
      if (q.px_ask > 0) return +q.px_ask;
      if (q.c > 0) return +q.c;
      if (q.price > 0) return +q.price;
      return null;
    };
    const items = (Array.isArray(catalog) ? catalog : [])
      .filter(x => x && x.ticker)
      .map(x => {
        const priceArs = pricePick(liveMap[x.ticker]);
        if (priceArs == null) return null;
        const priceD = x.ticker_d ? pricePick(liveMap[x.ticker_d]) : null;
        const priceC = x.ticker_c ? pricePick(liveMap[x.ticker_c]) : null;
        const priceUsd = x.ticker_usa ? pricePick(usaMap[x.ticker_usa]) : null;
        return {
          ticker: x.ticker, name: x.name, ratio: x.ratio,
          priceArs, priceD, priceC, priceUsd,
          impliedMep: priceD ? priceArs / priceD : null,
          impliedCcl: priceC ? priceArs / priceC : null,
        };
      })
      .filter(Boolean);
    const state = { filter: '' };

    function compute() {
      const f = state.filter.trim().toUpperCase();
      return f ? items.filter(r => r.ticker.toUpperCase().includes(f) || String(r.name || '').toUpperCase().includes(f)) : items;
    }

    function renderImpl(list) {
      const mep = list.filter(x => x.impliedMep).map(x => x.impliedMep);
      const ccl = list.filter(x => x.impliedCcl).map(x => x.impliedCcl);
      const avgMep = mep.length ? mep.reduce((a, b) => a + b, 0) / mep.length : null;
      const avgCcl = ccl.length ? ccl.reduce((a, b) => a + b, 0) / ccl.length : null;
      $('#ced-impl').innerHTML = `
        <div class="k"><div class="lbl">mep implícito</div><div class="val hot">${avgMep != null ? '$' + fmt(avgMep, 2) : '—'}</div><div class="chg dim">promedio · ${mep.length} activos</div></div>
        <div class="k"><div class="lbl">ccl implícito</div><div class="val hot">${avgCcl != null ? '$' + fmt(avgCcl, 2) : '—'}</div><div class="chg dim">promedio · ${ccl.length} activos</div></div>
        <div class="k"><div class="lbl">total</div><div class="val hot">${list.length}</div><div class="chg dim">cedears con precio</div></div>`;
    }

    function renderTable() {
      const list = compute();
      $('#ced-count').textContent = list.length;
      renderImpl(list);
      if (!list.length) { $('#ced-tbl').innerHTML = '<div class="empty-state">sin resultados</div>'; return; }
      const rows = list.slice(0, 400).map(r => `<tr>
        <td>${logoImgHTML(SVVY_LOGO(r.ticker), r.ticker, true)} <span class="hot">${esc(r.ticker)}</span> <span class="dim" style="margin-left:6px">${esc(r.name)}</span></td>
        <td class="num">$${fmt(r.priceArs, 2)}</td>
        <td class="num ${r.priceD ? '' : 'dim'}">${r.priceD ? fmt(r.priceD, 2) : '—'}</td>
        <td class="num ${r.priceC ? '' : 'dim'}">${r.priceC ? fmt(r.priceC, 2) : '—'}</td>
        <td class="num ${r.priceUsd ? '' : 'dim'}">${r.priceUsd ? fmt(r.priceUsd, 2) : '—'}</td>
        <td class="num ${r.impliedMep ? 'hot' : 'dim'}">${r.impliedMep ? '$' + fmt(r.impliedMep, 2) : '—'}</td>
        <td class="num ${r.impliedCcl ? 'hot' : 'dim'}">${r.impliedCcl ? '$' + fmt(r.impliedCcl, 2) : '—'}</td>
        <td class="num dim">${esc(r.ratio || '')}</td>
      </tr>`).join('');
      $('#ced-tbl').innerHTML = `<table class="t">
        <thead><tr>
          <th style="text-align:left">activo</th>
          <th>ars</th>
          <th>d (usd)</th>
          <th>c (usd)</th>
          <th>subyac.</th>
          <th>mep impl.</th>
          <th>ccl impl.</th>
          <th>ratio</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>${list.length > 400 ? `<div class="hint" style="margin-top:8px">mostrando primeros 400 de ${list.length} — usá la búsqueda para filtrar</div>` : ''}`;
    }

    $('#ced-search').addEventListener('input', (e) => { state.filter = e.target.value || ''; renderTable(); });
    renderTable();
  } catch (e) {
    $('#ced-tbl').innerHTML = `<div class="empty-state"><span class="down">ERROR</span> ${esc(e.message)}</div>`;
  }
}

// ─── Screen: ARS (router into 6 subs) ─────────────────────────
async function screenARS(main, sub) {
  const current = sub || 'billeteras';
  const renderer = ARS_SUBS[current];
  if (!renderer) return stubScreen(main, { tag: `ars · ${current}`, title: 'ARS', message: 'sub desconocida' });
  return renderer(main);
}

const ARS_SUBS = {};

// 3a. Billeteras — cuentas remuneradas + FCIs curados (Cocos, MP, Ualá, etc.) + otros MM
ARS_SUBS.billeteras = async function(main) {
  main.innerHTML = pHd('ars · billeteras', 'Billeteras', 'Cuentas remuneradas (tasa fija) + FCIs money market de las fintechs más populares + ranking general de money market.')
    + `<section class="s"><h2><span>cuentas remuneradas y billeteras</span><span class="line"></span><span class="count" id="bil-count">…</span></h2><div id="bil-bars"><div class="loading-row"> cargando…</div></div></section>`
    + `<section class="s"><h2><span>money market · fintechs populares</span><span class="line"></span><span class="count" id="fci-curados-count">…</span></h2><div id="fci-curados-bars"><div class="loading-row"> cargando fcis…</div></div></section>`
    + `<section class="s"><h2><span>otros money market · cafci</span><span class="line"></span><span class="count" id="fci-otros-count">…</span></h2><div id="fci-otros-bars"><div class="loading-row"> cargando resto…</div></div></section>`;
  try {
    const [cfg, fciRes] = await Promise.all([
      fetchCached('/api/config', 120_000),
      fetchCached('/api/cafci', 300_000).catch(() => ({ data: [] })),
    ]);

    // Sección 1: cuentas remuneradas (garantizados)
    const billeteras = (cfg.garantizados || []).filter(g => g.activo !== false)
      .map(g => ({ name: g.nombre, tna: +g.tna || 0, tag: g.tipo || '', limit: g.limite || '' }))
      .sort((a, b) => b.tna - a.tna);
    $('#bil-count').textContent = billeteras.length;
    if (billeteras.length) {
      renderBars($('#bil-bars'), billeteras, {
        valFmt: v => v.toFixed(2) + '%',
        valSub: 'tna',
        subLabel: (r) => r.tag + (r.limit ? ` · ${r.limit}` : ''),
      });
    } else {
      $('#bil-bars').innerHTML = '<div class="empty-state">sin billeteras activas</div>';
    }

    // Lookup de TNAs en vivo desde CAFCI indexado por nombre exacto
    const cafciByName = {};
    for (const f of (fciRes.data || [])) {
      if (f?.nombre && f.tna != null) cafciByName[f.nombre] = +f.tna;
    }

    // Sección 2: FCIs curados del config (Cocos Rendimiento, Mercado Fondo, Ualintec, etc.)
    const curados = (cfg.fcis || []).map(f => {
      const tna = cafciByName[f.nombre];
      if (tna == null || tna <= 0) return null;
      return {
        name: f.entidad || f.nombre,
        tna,
        tag: f.nombre,
        fullName: f.nombre,
      };
    }).filter(Boolean).sort((a, b) => b.tna - a.tna);
    const curadosNames = new Set(curados.map(x => x.fullName));
    $('#fci-curados-count').textContent = curados.length;
    if (curados.length) {
      renderBars($('#fci-curados-bars'), curados, {
        valFmt: v => v.toFixed(2) + '%',
        valSub: 'tna',
        subLabel: r => r.tag,
      });
    } else {
      $('#fci-curados-bars').innerHTML = '<div class="empty-state">sin datos en cafci para los fondos curados</div>';
    }

    // Sección 3: resto de money market (top 10 excluyendo los ya listados en curados)
    const otros = [];
    const seen = new Set();
    const mmSorted = (fciRes.data || [])
      .filter(f => f.nombre && f.tna > 0 && f.tna < 40 && f.category === 'mm' && !curadosNames.has(f.nombre))
      .sort((a, b) => b.tna - a.tna);
    for (const f of mmSorted) {
      const base = f.nombre.replace(/ - Clase [A-Z].*$/, '').trim();
      if (seen.has(base)) continue;
      seen.add(base);
      otros.push({ name: base, tna: +f.tna, tag: 'cafci · money market' });
      if (otros.length >= 10) break;
    }
    $('#fci-otros-count').textContent = otros.length;
    if (otros.length) {
      renderBars($('#fci-otros-bars'), otros, {
        valFmt: v => v.toFixed(2) + '%',
        valSub: 'tna',
        subLabel: r => r.tag,
      });
    } else {
      $('#fci-otros-bars').innerHTML = '<div class="empty-state">sin más fondos</div>';
    }
  } catch (e) {
    $('#bil-bars').innerHTML = `<div class="empty-state"><span class="down">ERROR</span> ${esc(e.message)}</div>`;
  }
};

// 3b. Plazo Fijo 30d — simple, only TNA
ARS_SUBS.plazofijo = async function(main) {
  main.innerHTML = pHd('ars · plazo fijo', 'Plazo Fijo', 'Tasas a 30 días por entidad bancaria. Fuente BCRA.')
    + `<div id="pf-tbl"><div class="loading-row"> cargando bancos…</div></div>`;
  try {
    const res = await fetch('https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo');
    const rows = await res.json();
    const list = (rows || []).filter(p => p.tnaClientes > 0)
      .map(p => ({ raw: p.entidad, bank: formatBankNameTTY(p.entidad), tna: p.tnaClientes * 100 }))
      .sort((a, b) => b.tna - a.tna);
    $('#pf-tbl').innerHTML = `<table class="t">
      <thead><tr><th style="text-align:left">banco</th><th>tna</th></tr></thead>
      <tbody>${list.map((r, i) => `<tr>
        <td>${logoHTML(r.bank, true)} <span class="${i===0?'hot':''}">${esc(r.bank)}</span></td>
        <td class="num ${i===0?'hot':''}">${r.tna.toFixed(2)}%</td>
      </tr>`).join('')}</tbody></table>
      <div class="hint" style="margin-top:8px">fuente: BCRA · argentinadatos.com</div>`;
  } catch (e) {
    $('#pf-tbl').innerHTML = `<div class="empty-state"><span class="down">ERROR</span> ${esc(e.message)}</div>`;
  }
};

// Format bank name to match logo map keys (Banco Santander, Banco Nación, etc.)
function formatBankNameTTY(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  // Split into words, Title Case each
  s = s.toLowerCase().replace(/\b([a-záéíóúñ])/g, m => m.toUpperCase());
  // Fix accent: "Nacion" → "Nación"
  s = s.replace(/Nacion\b/, 'Nación').replace(/Argentina S\.?A\.?/gi, 'Argentina').replace(/\s+S\.?A\.?$/i, '');
  return s.trim();
}

// 3c. Plazo Fijo Periódico UVA — BNA tasas por tramo (el endpoint real solo devuelve BNA)
ARS_SUBS.plazofijoperiod = async function(main) {
  main.innerHTML = pHd('ars · plazo fijo periódico', 'Plazo Fijo UVA Periódico', 'Banco Nación — plazo fijo UVA con pago periódico de intereses, por tramo de plazo.')
    + `<div id="pfp-tbl"><div class="loading-row"> cargando tramos…</div></div>`;
  try {
    const rows = await fetch('https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijoUvaPagoPeriodico').then(r => r.json());
    const bna = Array.isArray(rows) ? rows.find(x => x?.id === 'bna' || /naci[oó]n/i.test(x?.entidad || '')) : null;
    const tasas = bna?.tasas || [];
    if (!tasas.length) { $('#pfp-tbl').innerHTML = '<div class="empty-state">sin tramos vigentes</div>'; return; }
    const sorted = [...tasas].sort((a, b) => (a.plazoMinDias || 0) - (b.plazoMinDias || 0));
    $('#pfp-tbl').innerHTML = `<table class="t">
      <thead><tr>
        <th style="text-align:left">tramo de plazo</th>
        <th>tna</th>
        <th>tea (aprox)</th>
      </tr></thead>
      <tbody>${sorted.map((t, i) => {
        const tna = (typeof t.tna === 'number' ? t.tna : parseFloat(t.tna)) * 100;
        const plazo = t.plazoMinDias && t.plazoMaxDias
          ? (t.plazoMinDias === t.plazoMaxDias ? `${t.plazoMinDias}d` : `${t.plazoMinDias} a ${t.plazoMaxDias}d`)
          : (t.plazoMinDias ? `${t.plazoMinDias}+d` : '—');
        const tea = (Math.pow(1 + tna/100/12, 12) - 1) * 100;
        return `<tr>
          <td>${logoHTML('Banco Nación', true)} <span class="${i===0?'hot':''}">${esc(plazo)}</span></td>
          <td class="num ${i===0?'hot':''}">${tna.toFixed(2)}%</td>
          <td class="num dim">${tea.toFixed(2)}%</td>
        </tr>`;
      }).join('')}</tbody></table>
      <div class="hint" style="margin-top:8px">fuente: BCRA · argentinadatos.com — tramos oficiales de BNA</div>`;
  } catch (e) {
    $('#pfp-tbl').innerHTML = `<div class="empty-state"><span class="down">ERROR</span> ${esc(e.message)}</div>`;
  }
};

// 3d. LECAPs — scatter + table bidirectional
ARS_SUBS.lecaps = async function(main) {
  main.innerHTML = pHd('ars · lecaps', 'LECAPs', 'Letras capitalizables del Tesoro. Click en un punto o fila para destacar.')
    + `<div class="cols tbl-left"><div><section class="s"><h2><span>detalle</span><span class="line"></span><span class="count" id="lec-count">…</span></h2><div id="lec-table"><div class="loading-row"> cargando tabla…</div></div></section></div><div id="lec-scatter"><div class="loading-row"> cargando scatter…</div></div></div>`;
  try {
    const [cfg, live] = await Promise.all([
      fetchCached('/api/config', 120_000),
      fetchCached('/api/lecaps', 60_000).catch(() => ({ data: [] })),
    ]);
    const livePrices = {};
    for (const it of (live.data || [])) livePrices[it.symbol] = { ask: +it.ask || 0, price: +it.price || 0, bid: +it.bid || 0 };
    const today = new Date();
    const settlement = getSettlementDate(today);
    const letras = (cfg.lecaps?.letras || []).filter(l => l.activo !== false);
    const items = letras.map(l => {
      const live = livePrices[l.ticker] || {};
      const price = live.ask > 0 ? live.ask : (live.price > 0 ? live.price : l.precio);
      if (!price || price <= 0) return null;
      const vto = parseLocalDate(l.fecha_vencimiento);
      const days = Math.max(1, Math.round((vto - settlement) / 86400000));
      const ganancia = l.pago_final / price;
      const tem = (Math.pow(ganancia, 30 / days) - 1) * 100;
      const tna = (ganancia - 1) * (365 / days) * 100;
      const tea = (Math.pow(ganancia, 365 / days) - 1) * 100;
      return { sym: l.ticker, days, dias: days, tem, tna, tea, tir: tea, price, vto, pagoFinal: l.pago_final };
    }).filter(Boolean).sort((a, b) => a.days - b.days);

    const state = { sel: null };
    const byId = {};
    for (const it of items) byId[it.sym] = it;

    function render() {
      $('#lec-scatter').innerHTML = scatterSVG(items, {
        xKey: 'days', yKey: 'tem', labelKey: 'sym',
        xLabel: 'dtm (días)', yLabel: 'tem',
        yFmt: v => v.toFixed(2) + '%', xFmt: v => v + 'd',
        selected: state.sel,
      });
      wireScatterClicks($('#lec-scatter'), (sym) => { state.sel = sym; render(); if (byId[sym]) openLecapCalc(byId[sym]); });
      $('#lec-count').textContent = items.length;
      $('#lec-table').innerHTML = `<table class="t">
        <thead><tr><th style="text-align:left">sym</th><th>dtm</th><th>tem</th><th>tna</th><th>tea</th><th>precio</th></tr></thead>
        <tbody>${items.map(r => {
          const s = state.sel === r.sym;
          return `<tr class="clickable${s ? ' sel' : ''}" data-sym="${esc(r.sym)}" title="click para abrir calculadora">
            <td><span class="${s ? 'hot' : ''}">${esc(r.sym)}</span></td>
            <td class="num dim">${r.days}</td>
            <td class="num">${r.tem.toFixed(2)}%</td>
            <td class="num hot">${r.tna.toFixed(1)}%</td>
            <td class="num">${r.tea.toFixed(1)}%</td>
            <td class="num">${r.price.toFixed(2)}</td>
          </tr>`;
        }).join('')}</tbody></table>
        <div class="hint" style="margin-top:8px">click en cualquier fila o punto del scatter para abrir la calculadora</div>`;
      $$('tr.clickable[data-sym]', $('#lec-table')).forEach(tr => {
        tr.addEventListener('click', () => {
          const sym = tr.getAttribute('data-sym');
          state.sel = sym;
          render();
          if (byId[sym]) openLecapCalc(byId[sym]);
        });
      });
    }
    render();
  } catch (e) {
    $('#lec-scatter').innerHTML = `<div class="empty-state"><span class="down">ERROR</span> ${esc(e.message)}</div>`;
  }
};

// 3e. CER — scatter + table bidirectional
ARS_SUBS.cer = async function(main) {
  main.innerHTML = pHd('ars · bonos cer', 'Bonos CER', 'Ajustados por CER (inflación). Rendimiento real sobre la inflación.')
    + `<div class="cols tbl-left"><div><section class="s"><h2><span>detalle</span><span class="line"></span><span class="count" id="cer-count">…</span></h2><div id="cer-table"><div class="loading-row"> cargando tabla…</div></div></section></div><div id="cer-scatter"><div class="loading-row"> cargando scatter…</div></div></div>`;
  try {
    const [cfg, cerRes, cerPriceRes] = await Promise.all([
      fetchCached('/api/config', 120_000),
      fetchCached('/api/cer', 300_000).catch(() => ({ cer: null })),
      fetchCached('/api/cer-precios', 60_000).catch(() => ({ data: [] })),
    ]);
    const cerActual = cerRes.cer || cerRes.valor || null;
    const livePrices = {};
    for (const it of (cerPriceRes.data || [])) livePrices[it.symbol || it.ticker] = +it.price || +it.c || +it.ask || 0;
    const today = new Date();
    const settlement = getSettlementDate(today);
    const bonosCer = cfg.bonos_cer || {};
    const items = Object.entries(bonosCer).map(([sym, bond]) => {
      const vto = parseLocalDate(bond.vencimiento);
      if (!vto || vto < today) return null;
      const days = Math.max(1, Math.round((vto - settlement) / 86400000));
      const dur = days / 365.25;
      const priceLive = livePrices[sym] || null;
      const price = priceLive || bond.precio || null;
      if (!price || !cerActual || !bond.cer_emision) return { sym, days, dur, price };
      // Adjusted real flows: each flujo amount is expressed per 100 VN pre-CER. Real flow = amount * (cer_actual / cer_emision)
      const cerRatio = cerActual / bond.cer_emision;
      const flows = (bond.flujos || []).map(f => ({ fecha: parseLocalDate(f.fecha), monto: f.monto * cerRatio })).filter(f => f.fecha > today);
      if (!flows.length) return { sym, days, dur, price };
      const ytm = calcYTM(price, flows, today);
      // Approximate real TIR = nominal TIR adjusted by CER drift rate of the flows themselves;
      // since flows are already CER-adjusted, ytm is a good real proxy.
      return { sym, days, dur: +dur.toFixed(2), tir: ytm, price, flujos: flows, vencimiento: bond.vencimiento };
    }).filter(x => x && x.tir != null).sort((a, b) => a.dur - b.dur);

    const state = { sel: null };
    const byId = {};
    for (const it of items) byId[it.sym] = it;

    function render() {
      $('#cer-scatter').innerHTML = scatterSVG(items, {
        xKey: 'dur', yKey: 'tir', labelKey: 'sym',
        xLabel: 'dur (años)', yLabel: 'tir real',
        yFmt: v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%', xFmt: v => v + 'y',
        selected: state.sel,
      });
      wireScatterClicks($('#cer-scatter'), (sym) => { state.sel = sym; render(); if (byId[sym]) openCerCalc(byId[sym]); });
      $('#cer-count').textContent = items.length;
      $('#cer-table').innerHTML = `<table class="t">
        <thead><tr><th style="text-align:left">sym</th><th>dtm</th><th>tir</th><th>dur</th><th>precio</th></tr></thead>
        <tbody>${items.map(r => {
          const s = state.sel === r.sym;
          return `<tr class="clickable${s ? ' sel' : ''}" data-sym="${esc(r.sym)}" title="click para abrir calculadora">
            <td><span class="${s ? 'hot' : ''}">${esc(r.sym)}</span></td>
            <td class="num dim">${r.days}d</td>
            <td class="num hot">${(r.tir >= 0 ? '+' : '') + r.tir.toFixed(2)}%</td>
            <td class="num">${r.dur.toFixed(2)}</td>
            <td class="num">${fmt(r.price, 2)}</td>
          </tr>`;
        }).join('')}</tbody></table>
        <div class="hint" style="margin-top:8px">click para abrir calculadora con flujos ajustados por cer</div>`;
      $$('tr.clickable[data-sym]', $('#cer-table')).forEach(tr => {
        tr.addEventListener('click', () => {
          const sym = tr.getAttribute('data-sym');
          state.sel = sym;
          render();
          if (byId[sym]) openCerCalc(byId[sym]);
        });
      });
    }
    if (!items.length) { $('#cer-scatter').innerHTML = '<div class="empty-state">sin bonos CER activos</div>'; $('#cer-table').innerHTML = ''; return; }
    render();
  } catch (e) {
    $('#cer-scatter').innerHTML = `<div class="empty-state"><span class="down">ERROR</span> ${esc(e.message)}</div>`;
  }
};

// 3f. Comparador — merge billeteras + FCIs + PF top, sort by TNA desc
ARS_SUBS.comparador = async function(main) {
  main.innerHTML = pHd('ars · comparador', 'Comparador', 'Billeteras, FCIs money market y plazo fijo unificados por TNA descendente.')
    + `<div id="cmp-tbl"><div class="loading-row"> cargando…</div></div>`;
  try {
    const [cfg, fciRes, pfRes] = await Promise.all([
      fetchCached('/api/config', 120_000),
      fetchCached('/api/cafci', 300_000).catch(() => ({ data: [] })),
      fetch('https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo').then(r => r.json()).catch(() => []),
    ]);
    const unified = [];
    for (const g of (cfg.garantizados || [])) {
      if (g.activo === false) continue;
      unified.push({ name: g.nombre, type: g.tipo || 'Billetera', tna: +g.tna || 0, tag: g.limite || '' });
    }
    // Comparador MM only (backend tag + cap)
    const fcis = (fciRes.data || []).filter(f => f.nombre && f.tna > 0 && f.tna < 40 && (f.category === 'mm')).sort((a, b) => b.tna - a.tna).slice(0, 10);
    for (const f of fcis) {
      unified.push({ name: f.nombre.replace(/ - Clase [A-Z]$/, ''), type: 'FCI MM', tna: +f.tna, tag: '' });
    }
    const pfTop = (pfRes || []).filter(p => p.tnaClientes > 0).sort((a, b) => b.tnaClientes - a.tnaClientes).slice(0, 5);
    for (const p of pfTop) {
      unified.push({ name: shortBank(p.entidad), type: 'Plazo fijo 30d', tna: p.tnaClientes * 100, tag: '' });
    }
    unified.sort((a, b) => b.tna - a.tna);

    $('#cmp-tbl').innerHTML = `<table class="t">
      <thead><tr><th style="text-align:left">#</th><th style="text-align:left">producto</th><th style="text-align:left">tipo</th><th>tna</th><th style="text-align:left">meta</th></tr></thead>
      <tbody>${unified.map((r, i) => `<tr>
        <td class="dim">${String(i + 1).padStart(2, '0')}</td>
        <td>${logoHTML(r.name, true)} <span class="${i===0?'hot':''}">${esc(r.name)}</span></td>
        <td class="dim">${esc(r.type)}</td>
        <td class="num ${i===0?'hot':''}">${r.tna.toFixed(2)}%</td>
        <td class="dim">${esc(r.tag)}</td>
      </tr>`).join('')}</tbody></table>`;
  } catch (e) {
    $('#cmp-tbl').innerHTML = `<div class="empty-state"><span class="down">ERROR</span> ${esc(e.message)}</div>`;
  }
};

// ─── Bars component ───────────────────────────────────────────
function renderBars(container, items, { valFmt = v => v.toFixed(2) + '%', valSub = 'tna', subLabel = null } = {}) {
  const max = Math.max(...items.map(i => i.tna || i.val || 0));
  container.innerHTML = `<div class="bars">${items.map((r, i) => {
    const v = r.tna != null ? r.tna : r.val;
    const width = max > 0 ? (v / max * 100).toFixed(1) + '%' : '0%';
    const sub = subLabel ? subLabel(r) : '';
    return `<div class="row">
      <div class="with-logo">${logoHTML(r.name)}<div class="txt"><b>${esc(r.name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div></div>
      <div class="meter"><div class="fill" style="--w:${width};width:${width}"></div></div>
      <div class="val">${valFmt(v)}<small>${esc(valSub)}</small></div>
      <div class="rk">${String(i + 1).padStart(2, '0')}</div>
    </div>`;
  }).join('')}</div>`;
}

// ─── Short bank name helper ───────────────────────────────────
function shortBank(name) {
  if (!name) return '';
  return name
    .replace(/^BANCO\s+(DE\s+)?(LA\s+)?/i, '')
    .replace(/\s+ARGENTINA(\s+S\.?A\.?)?$/i, '')
    .replace(/\s+S\.?A\.?$/i, '')
    .replace(/\s*\(.*\)\s*$/i, '')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}
// ─── Calculator modals ────────────────────────────────────────
function openCalcModal({ title, sub, render }) {
  $('.tty-modal-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'tty-modal-overlay';
  overlay.innerHTML = `<div class="tty-modal">
    <div class="hd"><span>${esc(title)}</span><button id="tty-calc-close">esc ✕</button></div>
    ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
    <div class="body" id="tty-calc-body"></div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#tty-calc-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  const onEsc = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onEsc, true); } };
  document.addEventListener('keydown', onEsc, true);
  render($('#tty-calc-body', overlay));
  return overlay;
}

// LECAP calc — price, monto, arancel, impuestos → tna/tem/tir + resumen + target tir
function openLecapCalc(item) {
  openCalcModal({
    title: `${item.sym} — calculadora lecap`,
    sub: `vence: ${fmtDateAR(item.vto)} · pago final: ${item.pagoFinal.toFixed(3)} c/100 vn · ${item.dias} días al vto`,
    render(body) {
      body.innerHTML = `
        <div class="tty-calc-inputs">
          <div class="fld"><label>precio</label><input type="number" id="c-price" value="${item.price.toFixed(2)}" step="0.01"></div>
          <div class="fld"><label>monto a invertir ($)</label><input type="number" id="c-monto" value="1000000" step="10000"></div>
          <div class="fld"><label>tna</label><div id="o-tna" class="out">${item.tna.toFixed(2)}%</div></div>
          <div class="fld"><label>tem</label><div id="o-tem" class="out">${item.tem.toFixed(2)}%</div></div>
          <div class="fld"><label>tir (tea)</label><div id="o-tir" class="out big">${item.tir.toFixed(2)}%</div></div>
          <div class="fld"><label>días</label><div class="out">${item.dias}</div></div>
        </div>
        <div class="tty-calc-strip">
          <span class="lbl">costos</span>
          <label style="display:inline-flex;align-items:center;gap:4px">arancel % <input type="number" id="c-arancel" value="0.10" step="0.01"></label>
          <label style="display:inline-flex;align-items:center;gap:4px">impuestos % <input type="number" id="c-imp" value="0.01" step="0.01"></label>
        </div>
        <div class="tty-calc-strip accent">
          <span class="lbl">tir objetivo</span>
          <label style="display:inline-flex;align-items:center;gap:4px">tir % <input type="number" id="c-ttir" placeholder="${item.tir.toFixed(1)}" step="0.1"></label>
          <span id="o-timpl" class="val dim">ingresá una tir para ver el precio implícito</span>
        </div>
        <div id="o-summary" class="tty-calc-summary"></div>
      `;
      const $p = $('#c-price', body), $m = $('#c-monto', body), $ar = $('#c-arancel', body), $im = $('#c-imp', body), $tt = $('#c-ttir', body);
      function recalc() {
        const p = parseFloat($p.value) || item.price;
        const mon = parseFloat($m.value) || 1000000;
        const ar = parseFloat($ar.value) || 0;
        const im = parseFloat($im.value) || 0;
        const ep = p * (1 + (ar + im) / 100);
        const tna = (item.pagoFinal / ep - 1) * (365 / item.dias) * 100;
        const tir = (Math.pow(item.pagoFinal / ep, 365 / item.dias) - 1) * 100;
        const meses = Math.max(item.dias / 30, 0.1);
        const tem = (Math.pow(item.pagoFinal / ep, 1 / meses) - 1) * 100;
        $('#o-tna', body).textContent = tna.toFixed(2) + '%';
        $('#o-tem', body).textContent = tem.toFixed(2) + '%';
        const tirEl = $('#o-tir', body);
        tirEl.textContent = tir.toFixed(2) + '%';
        tirEl.style.color = tir >= 0 ? 'var(--up)' : 'var(--down)';
        const nominales = (mon / ep) * 100;
        const cobro = nominales / 100 * item.pagoFinal;
        const gan = cobro - mon;
        $('#o-summary', body).innerHTML = `
          <div class="row"><span>comprás</span><b>${fmt(nominales, 0)} vn a $${fmt(p, 2)}</b></div>
          <div class="row"><span>invertís</span><b>$${fmt(mon, 2)}</b></div>
          <div class="row"><span>al vto cobrás</span><b>$${fmt(cobro, 2)}</b></div>
          <div class="row total ${gan >= 0 ? 'up' : 'down'}"><span>ganancia</span><b>${gan >= 0 ? '+' : ''}$${fmt(gan, 2)}</b></div>`;
      }
      function recalcTarget() {
        const t = parseFloat($tt.value);
        const out = $('#o-timpl', body);
        if (!t && t !== 0) { out.innerHTML = 'ingresá una tir para ver el precio implícito'; out.className = 'val dim'; return; }
        const impl = item.pagoFinal / Math.pow(1 + t / 100, item.dias / 365);
        const cur = parseFloat($p.value) || item.price;
        const upside = ((impl - cur) / cur) * 100;
        out.className = 'val';
        out.innerHTML = `precio <b class="hot">$${fmt(impl, 2)}</b> · upside <b class="${upside >= 0 ? 'up' : 'down'}">${upside >= 0 ? '+' : ''}${upside.toFixed(2)}%</b>`;
      }
      [$p, $ar, $im].forEach(el => el.addEventListener('input', () => { recalc(); recalcTarget(); }));
      $m.addEventListener('input', recalc);
      $tt.addEventListener('input', recalcTarget);
      recalc();
    }
  });
}

// CER calc — price ARS, duration, ytm real, target ytm
function openCerCalc(item) {
  openCalcModal({
    title: `${item.sym} — calculadora cer`,
    sub: `vence: ${item.vencimiento || '—'} · tir real ${item.tir.toFixed(2)}% · duration ${item.dur.toFixed(2)}y`,
    render(body) {
      body.innerHTML = `
        <div class="tty-calc-inputs">
          <div class="fld"><label>precio (ars)</label><input type="number" id="c-price" value="${item.price.toFixed(2)}" step="0.01"></div>
          <div class="fld"><label>monto a invertir ($)</label><input type="number" id="c-monto" value="1000000" step="10000"></div>
          <div class="fld"><label>tir real</label><div id="o-tir" class="out big" style="color:${item.tir >= 0 ? 'var(--up)' : 'var(--down)'}">${(item.tir >= 0 ? '+' : '') + item.tir.toFixed(2)}%</div></div>
          <div class="fld"><label>duration</label><div class="out">${item.dur.toFixed(2)}y</div></div>
        </div>
        <div class="tty-calc-strip">
          <span class="lbl">costos</span>
          <label style="display:inline-flex;align-items:center;gap:4px">arancel % <input type="number" id="c-arancel" value="0.45" step="0.01"></label>
          <label style="display:inline-flex;align-items:center;gap:4px">impuestos % <input type="number" id="c-imp" value="0.01" step="0.01"></label>
        </div>
        <div class="tty-calc-strip accent">
          <span class="lbl">tir objetivo</span>
          <label style="display:inline-flex;align-items:center;gap:4px">tir real % <input type="number" id="c-ttir" placeholder="${item.tir.toFixed(1)}" step="0.1"></label>
          <span id="o-timpl" class="val dim">ingresá una tir real para ver el precio implícito</span>
        </div>
        <div id="o-summary" class="tty-calc-summary"></div>
        <div class="hint">los flujos reales futuros dependen de cómo evolucione el cer. esta calc usa los flujos ya ajustados al cer actual.</div>
      `;
      const $p = $('#c-price', body), $m = $('#c-monto', body), $ar = $('#c-arancel', body), $im = $('#c-imp', body), $tt = $('#c-ttir', body);
      function recalc() {
        const p = parseFloat($p.value) || item.price;
        const mon = parseFloat($m.value) || 1000000;
        const ar = parseFloat($ar.value) || 0;
        const im = parseFloat($im.value) || 0;
        const ep = p * (1 + (ar + im) / 100);
        const pricePer1VN = ep / 100;
        const nominales = mon / pricePer1VN;
        const flows = item.flujos || [];
        let total = 0;
        for (const f of flows) total += f.monto * nominales;
        const gan = total - mon;
        $('#o-summary', body).innerHTML = `
          <div class="row"><span>comprás</span><b>${fmt(nominales, 0)} vn a $${fmt(pricePer1VN, 4)}/vn</b></div>
          <div class="row"><span>invertís</span><b>$${fmt(mon, 2)}</b></div>
          ${total > 0 ? `<div class="row"><span>cobrás (estimado)</span><b>$${fmt(total, 2)}</b></div>
          <div class="row total ${gan >= 0 ? 'up' : 'down'}"><span>ganancia estimada</span><b>${gan >= 0 ? '+' : ''}$${fmt(gan, 2)}</b></div>` : ''}`;
      }
      function recalcTarget() {
        const t = parseFloat($tt.value);
        const out = $('#o-timpl', body);
        if ((!t && t !== 0) || !item.flujos || !item.flujos.length) { out.innerHTML = 'ingresá una tir real para ver el precio implícito'; out.className = 'val dim'; return; }
        const today = new Date();
        const r = t / 100;
        const MS = 365.25 * 24 * 60 * 60 * 1000;
        let pv = 0;
        for (const f of item.flujos) {
          const dt = f.fecha instanceof Date ? f.fecha : new Date(f.fecha);
          const yrs = (dt - today) / MS;
          if (yrs > 0) pv += f.monto / Math.pow(1 + r, yrs);
        }
        const impl = pv * 100;
        const cur = parseFloat($p.value) || item.price;
        const upside = ((impl - cur) / cur) * 100;
        out.className = 'val';
        out.innerHTML = `precio <b class="hot">$${fmt(impl, 2)}</b> · upside <b class="${upside >= 0 ? 'up' : 'down'}">${upside >= 0 ? '+' : ''}${upside.toFixed(2)}%</b>`;
      }
      [$p, $ar, $im].forEach(el => el.addEventListener('input', () => { recalc(); recalcTarget(); }));
      $m.addEventListener('input', recalc);
      $tt.addEventListener('input', recalcTarget);
      recalc();
    }
  });
}

// Bonos soberanos calc — priceUsd, monto usd, ytm, duration, flows + target ytm
function openSovCalc(item) {
  openCalcModal({
    title: `${item.sym} — calculadora bono soberano`,
    sub: `${item.ley || 'ley local'} · vence ${item.mat || '—'} · cupón ${item.cpn || '0'}% · ytm ${item.ytm.toFixed(2)}% · dur ${item.dur.toFixed(2)}y`,
    render(body) {
      body.innerHTML = `
        <div class="tty-calc-inputs">
          <div class="fld"><label>precio (usd)</label><input type="number" id="c-price" value="${item.price.toFixed(2)}" step="0.01"></div>
          <div class="fld"><label>monto a invertir (usd)</label><input type="number" id="c-monto" value="10000" step="100"></div>
          <div class="fld"><label>ytm</label><div id="o-ytm" class="out big" style="color:${item.ytm >= 0 ? 'var(--up)' : 'var(--down)'}">${item.ytm.toFixed(2)}%</div></div>
          <div class="fld"><label>duration</label><div class="out">${item.dur.toFixed(2)}y</div></div>
        </div>
        <div class="tty-calc-strip">
          <span class="lbl">costos</span>
          <label style="display:inline-flex;align-items:center;gap:4px">arancel % <input type="number" id="c-arancel" value="0.45" step="0.01"></label>
          <label style="display:inline-flex;align-items:center;gap:4px">impuestos % <input type="number" id="c-imp" value="0.01" step="0.01"></label>
        </div>
        <div class="tty-calc-strip accent">
          <span class="lbl">ytm objetivo</span>
          <label style="display:inline-flex;align-items:center;gap:4px">ytm % <input type="number" id="c-tytm" placeholder="${item.ytm.toFixed(1)}" step="0.1"></label>
          <span id="o-timpl" class="val dim">ingresá una ytm para ver el precio implícito</span>
        </div>
        <div id="o-summary" class="tty-calc-summary"></div>
        ${item.flujos && item.flujos.length ? `<div id="o-flows"></div>` : ''}
      `;
      const $p = $('#c-price', body), $m = $('#c-monto', body), $ar = $('#c-arancel', body), $im = $('#c-imp', body), $tt = $('#c-tytm', body);
      function recalc() {
        const p = parseFloat($p.value) || item.price;
        const mon = parseFloat($m.value) || 10000;
        const ar = parseFloat($ar.value) || 0;
        const im = parseFloat($im.value) || 0;
        const ep = p * (1 + (ar + im) / 100);
        const nominales = mon / (ep / 100);
        const scale = nominales / 100;
        const flows = item.flujos || [];
        let total = 0;
        const rows = flows.map(f => {
          const scaled = f.monto * scale;
          total += scaled;
          return `<tr><td>${esc(fmtDateAR(f.fecha))}</td><td class="num">$${fmt(f.monto, 2)}</td><td class="num">$${fmt(scaled, 2)}</td></tr>`;
        }).join('');
        const gan = total - mon;
        $('#o-summary', body).innerHTML = `
          <div class="row"><span>comprás</span><b>${fmt(nominales, 0)} vn a $${fmt(p / 100, 4)}/vn</b></div>
          <div class="row"><span>invertís</span><b>usd ${fmt(mon, 2)}</b></div>
          <div class="row"><span>cobros totales</span><b>usd ${fmt(total, 2)}</b></div>
          <div class="row total ${gan >= 0 ? 'up' : 'down'}"><span>ganancia</span><b>${gan >= 0 ? '+' : ''}usd ${fmt(gan, 2)}</b></div>`;
        const flowsEl = $('#o-flows', body);
        if (flowsEl && flows.length) {
          flowsEl.innerHTML = `<h4 style="margin:6px 0 0;color:var(--fg-faint);font-size:11px;font-weight:400;text-transform:uppercase;letter-spacing:0.08em">flujos de fondos</h4>
            <table class="t" style="margin-top:6px">
              <thead><tr><th style="text-align:left">fecha</th><th>por 100 vn</th><th>tu inversión</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>`;
        }
      }
      function recalcTarget() {
        const t = parseFloat($tt.value);
        const out = $('#o-timpl', body);
        if ((!t && t !== 0) || !item.flujos || !item.flujos.length) { out.innerHTML = 'ingresá una ytm para ver el precio implícito'; out.className = 'val dim'; return; }
        const today = new Date();
        const r = t / 100;
        const MS = 365.25 * 24 * 60 * 60 * 1000;
        let pv = 0;
        for (const f of item.flujos) {
          const dt = f.fecha instanceof Date ? f.fecha : new Date(f.fecha);
          const yrs = (dt - today) / MS;
          if (yrs > 0) pv += f.monto / Math.pow(1 + r, yrs);
        }
        const cur = parseFloat($p.value) || item.price;
        const upside = ((pv - cur) / cur) * 100;
        out.className = 'val';
        out.innerHTML = `precio <b class="hot">$${fmt(pv, 2)}</b> · upside <b class="${upside >= 0 ? 'up' : 'down'}">${upside >= 0 ? '+' : ''}${upside.toFixed(2)}%</b>`;
      }
      [$p, $ar, $im].forEach(el => el.addEventListener('input', () => { recalc(); recalcTarget(); }));
      $m.addEventListener('input', recalc);
      $tt.addEventListener('input', recalcTarget);
      recalc();
    }
  });
}

// ON calc — same as sovereign but price is in / 1 VN (x100 already done upstream)
function openOnCalc(item) {
  openCalcModal({
    title: `${item.sym} — calculadora obligación negociable`,
    sub: `${item.name || ''} · vence ${item.mat || '—'} · ytm ${item.ytm.toFixed(2)}% · dur ${item.dur.toFixed(2)}y`,
    render(body) {
      body.innerHTML = `
        <div class="tty-calc-inputs">
          <div class="fld"><label>precio (usd)</label><input type="number" id="c-price" value="${item.price.toFixed(2)}" step="0.01"></div>
          <div class="fld"><label>monto a invertir (usd)</label><input type="number" id="c-monto" value="10000" step="100"></div>
          <div class="fld"><label>ytm</label><div id="o-ytm" class="out big" style="color:${item.ytm >= 0 ? 'var(--up)' : 'var(--down)'}">${item.ytm.toFixed(2)}%</div></div>
          <div class="fld"><label>duration</label><div class="out">${item.dur.toFixed(2)}y</div></div>
        </div>
        <div class="tty-calc-strip">
          <span class="lbl">costos</span>
          <label style="display:inline-flex;align-items:center;gap:4px">arancel % <input type="number" id="c-arancel" value="0.45" step="0.01"></label>
          <label style="display:inline-flex;align-items:center;gap:4px">impuestos % <input type="number" id="c-imp" value="0.01" step="0.01"></label>
        </div>
        <div class="tty-calc-strip accent">
          <span class="lbl">ytm objetivo</span>
          <label style="display:inline-flex;align-items:center;gap:4px">ytm % <input type="number" id="c-tytm" placeholder="${item.ytm.toFixed(1)}" step="0.1"></label>
          <span id="o-timpl" class="val dim">ingresá una ytm para ver el precio implícito</span>
        </div>
        <div id="o-summary" class="tty-calc-summary"></div>
        ${item.flujos && item.flujos.length ? `<div id="o-flows"></div>` : ''}
      `;
      const $p = $('#c-price', body), $m = $('#c-monto', body), $ar = $('#c-arancel', body), $im = $('#c-imp', body), $tt = $('#c-tytm', body);
      function recalc() {
        // ON prices come from data912 as per-100 VN (px_ask). Flow amounts are per-1 VN.
        const p = parseFloat($p.value) || item.price;
        const mon = parseFloat($m.value) || 10000;
        const ar = parseFloat($ar.value) || 0;
        const im = parseFloat($im.value) || 0;
        const ep = p * (1 + (ar + im) / 100);
        const pricePer1 = ep / 100;
        const nominales = mon / pricePer1;
        const flows = item.flujos || [];
        let total = 0;
        const rows = flows.map(f => {
          const scaled = f.monto * nominales;
          total += scaled;
          return `<tr><td>${esc(fmtDateAR(f.fecha))}</td><td class="num">$${fmt(f.monto, 4)}</td><td class="num">$${fmt(scaled, 2)}</td></tr>`;
        }).join('');
        const gan = total - mon;
        $('#o-summary', body).innerHTML = `
          <div class="row"><span>comprás</span><b>${fmt(nominales, 0)} vn a $${fmt(pricePer1, 4)}/vn</b></div>
          <div class="row"><span>invertís</span><b>usd ${fmt(mon, 2)}</b></div>
          <div class="row"><span>cobros totales</span><b>usd ${fmt(total, 2)}</b></div>
          <div class="row total ${gan >= 0 ? 'up' : 'down'}"><span>ganancia</span><b>${gan >= 0 ? '+' : ''}usd ${fmt(gan, 2)}</b></div>`;
        const flowsEl = $('#o-flows', body);
        if (flowsEl && flows.length) {
          flowsEl.innerHTML = `<h4 style="margin:6px 0 0;color:var(--fg-faint);font-size:11px;font-weight:400;text-transform:uppercase;letter-spacing:0.08em">flujos de fondos</h4>
            <table class="t" style="margin-top:6px">
              <thead><tr><th style="text-align:left">fecha</th><th>por 1 vn</th><th>tu inversión</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>`;
        }
      }
      function recalcTarget() {
        const t = parseFloat($tt.value);
        const out = $('#o-timpl', body);
        if ((!t && t !== 0) || !item.flujos || !item.flujos.length) { out.innerHTML = 'ingresá una ytm para ver el precio implícito'; out.className = 'val dim'; return; }
        const today = new Date();
        const r = t / 100;
        const MS = 365.25 * 24 * 60 * 60 * 1000;
        let pv = 0;
        for (const f of item.flujos) {
          const dt = f.fecha instanceof Date ? f.fecha : new Date(f.fecha);
          const yrs = (dt - today) / MS;
          if (yrs > 0) pv += f.monto / Math.pow(1 + r, yrs);
        }
        const implied100 = pv * 100;
        const cur = parseFloat($p.value) || item.price;
        const upside = ((implied100 - cur) / cur) * 100;
        out.className = 'val';
        out.innerHTML = `precio <b class="hot">$${fmt(implied100, 2)}</b> · upside <b class="${upside >= 0 ? 'up' : 'down'}">${upside >= 0 ? '+' : ''}${upside.toFixed(2)}%</b>`;
      }
      [$p, $ar, $im].forEach(el => el.addEventListener('input', () => { recalc(); recalcTarget(); }));
      $m.addEventListener('input', recalc);
      $tt.addEventListener('input', recalcTarget);
      recalc();
    }
  });
}

function fmtDateAR(d) {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return String(d);
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth() + 1).padStart(2,'0')}/${dt.getFullYear()}`;
}

// ─── Screen: Bonos soberanos ──────────────────────────────────
async function screenBonos(main) {
  main.innerHTML = pHd('bonos · soberanos usd', 'Bonos Soberanos', 'Bonares (ley local) y Globales (ley NY). YTM × duration con precios en vivo.')
    + `<div class="cols tbl-left"><div><section class="s"><h2><span>ladder</span><span class="line"></span><span class="count" id="sov-count">…</span></h2><div id="sov-table"><div class="loading-row"> cargando tabla…</div></div></section></div><div id="sov-scatter"><div class="loading-row"> cargando curva…</div></div></div>`;
  try {
    const [cfg, sovRes] = await Promise.all([
      fetchCached('/api/config', 120_000),
      fetchCached('/api/soberanos', 60_000).catch(() => ({ data: [] })),
    ]);
    const soberanos = cfg.soberanos || {};
    const prices = sovRes.data || [];
    const today = new Date();
    const items = [];
    for (const bp of prices) {
      const bc = soberanos[bp.symbol];
      if (!bc || !bc.flujos) continue;
      const priceUsd = +(bp.ask > 0 ? bp.ask : (bp.price_usd || bp.price || 0));
      if (!priceUsd || priceUsd <= 0) continue;
      const flows = bc.flujos.map(f => ({ fecha: parseLocalDate(f.fecha), monto: +f.monto })).filter(f => f.fecha && f.fecha > today);
      if (!flows.length) continue;
      const ytm = calcYTM(priceUsd, flows, today);
      if (isNaN(ytm) || !isFinite(ytm)) continue;
      const dur = calcDuration(priceUsd, flows, today, ytm);
      const cpn = (bc.flujos.length >= 2) ? (bc.flujos[0].monto * 2 / 100) * 100 : 0;
      items.push({
        sym: bp.symbol,
        ley: bc.ley || '',
        mat: bc.vencimiento || '',
        cpn: cpn.toFixed(2),
        ytm,
        dur: +dur.toFixed(2),
        price: priceUsd,
        flujos: flows,
      });
    }
    items.sort((a, b) => a.dur - b.dur);

    const state = { sel: null };
    const byId = {};
    for (const it of items) byId[it.sym] = it;

    function render() {
      $('#sov-scatter').innerHTML = scatterSVG(items, {
        xKey: 'dur', yKey: 'ytm', labelKey: 'sym',
        xLabel: 'dur', yLabel: 'ytm',
        yFmt: v => v.toFixed(1) + '%', xFmt: v => v + 'y',
        selected: state.sel,
      });
      wireScatterClicks($('#sov-scatter'), (sym) => { state.sel = sym; render(); if (byId[sym]) openSovCalc(byId[sym]); });
      $('#sov-count').textContent = items.length;
      $('#sov-table').innerHTML = `<table class="t">
        <thead><tr><th style="text-align:left">sym</th><th style="text-align:left">mat</th><th>cpn</th><th>ytm</th><th>dur</th><th>precio</th></tr></thead>
        <tbody>${items.map(r => {
          const s = state.sel === r.sym;
          return `<tr class="clickable${s ? ' sel' : ''}" data-sym="${esc(r.sym)}" title="click para abrir calculadora">
            <td><span class="${s ? 'hot' : ''}">${esc(r.sym)}</span></td>
            <td class="dim">${esc(r.mat)}</td>
            <td class="num dim">${r.cpn}%</td>
            <td class="num hot">${r.ytm.toFixed(2)}%</td>
            <td class="num">${r.dur.toFixed(2)}</td>
            <td class="num">${r.price.toFixed(2)}</td>
          </tr>`;
        }).join('')}</tbody></table>
        <div class="hint" style="margin-top:8px">click para abrir calculadora con flujos</div>`;
      $$('tr.clickable[data-sym]', $('#sov-table')).forEach(tr => {
        tr.addEventListener('click', () => {
          const sym = tr.getAttribute('data-sym');
          state.sel = sym;
          render();
          if (byId[sym]) openSovCalc(byId[sym]);
        });
      });
    }
    if (!items.length) { $('#sov-scatter').innerHTML = '<div class="empty-state">sin datos de mercado</div>'; return; }
    render();
  } catch (e) {
    $('#sov-scatter').innerHTML = `<div class="empty-state"><span class="down">ERROR</span> ${esc(e.message)}</div>`;
  }
}

// ─── Screen: ONs ──────────────────────────────────────────────
async function screenONs(main) {
  main.innerHTML = pHd('ons · corporativos', 'Obligaciones Negociables', 'Bonos corporativos USD. YTM × duration con precios en vivo (especie D).')
    + `<div class="cols tbl-left"><div><section class="s"><h2><span>ladder</span><span class="line"></span><span class="count" id="ons-count">…</span></h2><div id="ons-table"><div class="loading-row"> cargando tabla…</div></div></section></div><div id="ons-scatter"><div class="loading-row"> cargando curva…</div></div></div>`;
  try {
    const [cfg, pricesRes] = await Promise.all([
      fetchCached('/api/config', 120_000),
      fetchCached('/api/ons', 60_000).catch(() => ({ data: [] })),
    ]);
    const onsConfig = cfg.ons || {};
    const prices = pricesRes.data || [];
    const priceLookup = {};
    for (const p of prices) priceLookup[p.symbol] = p;
    const today = new Date();
    const items = [];
    for (const [key, bond] of Object.entries(onsConfig)) {
      const d912 = bond.ticker_d912;
      const pd = priceLookup[d912];
      if (!pd) continue;
      const priceRaw = +(pd.px_ask > 0 ? pd.px_ask : pd.c);
      if (!priceRaw || priceRaw <= 0) continue;
      const flows = (bond.flujos || []).map(f => ({ fecha: parseLocalDate(f.fecha), monto: +f.monto })).filter(f => f.fecha && f.fecha > today);
      if (!flows.length) continue;
      const ytm = calcYTM(priceRaw / 100, flows, today);
      if (isNaN(ytm) || !isFinite(ytm)) continue;
      const dur = calcDuration(priceRaw / 100, flows, today, ytm);
      items.push({
        sym: key,
        name: bond.nombre || '',
        d912,
        mat: bond.vencimiento || '',
        ytm,
        dur: +dur.toFixed(2),
        price: priceRaw,
        flujos: flows,
      });
    }
    items.sort((a, b) => b.ytm - a.ytm);

    const state = { sel: null };
    const byId = {};
    for (const it of items) byId[it.sym] = it;

    function render() {
      $('#ons-scatter').innerHTML = scatterSVG(items, {
        xKey: 'dur', yKey: 'ytm', labelKey: 'sym',
        xLabel: 'dur', yLabel: 'ytm',
        yFmt: v => v.toFixed(1) + '%', xFmt: v => v + 'y',
        selected: state.sel,
      });
      wireScatterClicks($('#ons-scatter'), (sym) => { state.sel = sym; render(); if (byId[sym]) openOnCalc(byId[sym]); });
      $('#ons-count').textContent = items.length;
      $('#ons-table').innerHTML = `<table class="t">
        <thead><tr><th style="text-align:left">sym</th><th style="text-align:left">emisor</th><th style="text-align:left">mat</th><th>ytm</th><th>dur</th><th>precio</th></tr></thead>
        <tbody>${items.map(r => {
          const s = state.sel === r.sym;
          return `<tr class="clickable${s ? ' sel' : ''}" data-sym="${esc(r.sym)}" title="click para abrir calculadora">
            <td><span class="${s ? 'hot' : ''}">${esc(r.sym)}</span></td>
            <td class="dim">${esc(r.name)}</td>
            <td class="dim">${esc(r.mat)}</td>
            <td class="num hot">${r.ytm.toFixed(2)}%</td>
            <td class="num">${r.dur.toFixed(2)}</td>
            <td class="num">${r.price.toFixed(2)}</td>
          </tr>`;
        }).join('')}</tbody></table>
        <div class="hint" style="margin-top:8px">click para abrir calculadora con flujos</div>`;
      $$('tr.clickable[data-sym]', $('#ons-table')).forEach(tr => {
        tr.addEventListener('click', () => {
          const sym = tr.getAttribute('data-sym');
          state.sel = sym;
          render();
          if (byId[sym]) openOnCalc(byId[sym]);
        });
      });
    }
    if (!items.length) { $('#ons-scatter').innerHTML = '<div class="empty-state">sin datos</div>'; return; }
    render();
  } catch (e) {
    $('#ons-scatter').innerHTML = `<div class="empty-state"><span class="down">ERROR</span> ${esc(e.message)}</div>`;
  }
}

// ─── Screen: Hipotecarios ─────────────────────────────────────
async function screenHipotecarios(main) {
  main.innerHTML = pHd('hipotecarios · uva', 'Hipotecarios', 'TNA de créditos hipotecarios UVA por banco (ordenadas de menor a mayor: gana la más baja). Fuente: @SalinasAndres.')
    + `<div id="hip-bars"><div class="loading-row"> cargando…</div></div>`;
  try {
    const raw = await fetchCached('/api/hipotecarios', 300_000);
    const list = (raw.data || []).filter(x => x.tna != null && x.tna > 0)
      .map(x => ({
        name: x.banco,
        tna: +x.tna,
        tag: `${x.financiamiento || ''} · ${x.plazo_max_anios || '?'}y · cuota/ingreso ${x.relacion_cuota_ingreso || ''}`.replace(/\s+·\s+·\s+/g, ' · ').trim(),
      }))
      .sort((a, b) => a.tna - b.tna);
    if (!list.length) { $('#hip-bars').innerHTML = '<div class="empty-state">sin datos</div>'; return; }
    renderBars($('#hip-bars'), list, {
      valFmt: v => v.toFixed(2) + '%',
      valSub: 'tna',
      subLabel: r => r.tag,
    });
  } catch (e) {
    $('#hip-bars').innerHTML = `<div class="empty-state"><span class="down">ERROR</span> ${esc(e.message)}</div>`;
  }
}

// ─── Screen: Dólar ────────────────────────────────────────────
async function screenDolar(main) {
  main.innerHTML = pHd('dólar · cotizaciones', 'Dólar', 'Mejor compra / venta / menor spread entre proveedores. Toggle 24/7 para filtrar los que operan fuera del horario de mercado.')
    + `<section class="s"><h2><span>mejor del momento</span><span class="line"></span></h2><div id="dol-best" class="dol-best-row"><div class="loading-row"> cargando…</div></div></section>`
    + `<section class="s"><h2><span>proveedores</span><span class="line"></span></h2>
        <div class="dol-controls">
          <div class="dol-seg" id="dol-coin">
            <button data-coin="usd" class="on">USD</button>
            <button data-coin="usdt">USDT</button>
            <button data-coin="usdc">USDC</button>
          </div>
          <div class="dol-seg" id="dol-sort">
            <button data-sort="buy" class="on">mejor compra</button>
            <button data-sort="sell">mejor venta</button>
          </div>
          <label class="dol-24x7" id="dol-24x7-wrap">
            <input type="checkbox" id="dol-24x7"> <span>solo 24/7</span>
          </label>
        </div>
        <div id="dol-tbl"><div class="loading-row"> cargando proveedores…</div></div>
      </section>`;
  try {
    const { exchanges, updated } = await fetchCached('/api/dolar', 60_000);
    // market open Mon-Fri 10-17 ART
    const now = new Date();
    const artNow = new Date(now.getTime() + (now.getTimezoneOffset() - 180) * 60000);
    const marketOpen = artNow.getDay() >= 1 && artNow.getDay() <= 5 && artNow.getHours() >= 10 && artNow.getHours() < 17;
    const state = { coin: 'usd', sort: 'buy', only24x7: !marketOpen };
    $('#dol-24x7').checked = state.only24x7;

    function getList() {
      if (state.coin === 'usd') {
        const all = (exchanges.usd || []).filter(e => e.ask > 0 && e.bid > 0);
        return state.only24x7 ? all.filter(e => e.is24x7) : all;
      }
      return (exchanges[state.coin] || []).filter(e => e.ask > 0 && e.bid > 0);
    }

    function renderBest() {
      const list = getList();
      if (!list.length) { $('#dol-best').innerHTML = '<div class="empty-state">sin proveedores</div>'; return; }
      const bestBuy = list.reduce((a, b) => a.ask < b.ask ? a : b);
      const bestSell = list.reduce((a, b) => a.bid > b.bid ? a : b);
      const bestSp = list.reduce((a, b) => (a.spread < b.spread ? a : b));
      $('#dol-best').innerHTML = `
        <div class="dol-best-card">
          <div class="lbl">mejor para vender</div>
          <div class="with-logo">${logoImgHTML(bestSell.logoUrl, bestSell.name)}<div class="txt"><b>${esc(bestSell.name)}</b><small>vendés a</small></div></div>
          <div class="val hot">$${fmt(bestSell.bid, 2)}</div>
        </div>
        <div class="dol-best-card">
          <div class="lbl">mejor para comprar</div>
          <div class="with-logo">${logoImgHTML(bestBuy.logoUrl, bestBuy.name)}<div class="txt"><b>${esc(bestBuy.name)}</b><small>comprás a</small></div></div>
          <div class="val hot">$${fmt(bestBuy.ask, 2)}</div>
        </div>
        <div class="dol-best-card">
          <div class="lbl">menor spread</div>
          <div class="with-logo">${logoImgHTML(bestSp.logoUrl, bestSp.name)}<div class="txt"><b>${esc(bestSp.name)}</b><small>compra/venta</small></div></div>
          <div class="val hot">${fmt(bestSp.spread, 2)}%</div>
        </div>`;
    }

    function renderTable() {
      const list = getList();
      const sorted = [...list].sort((a, b) => state.sort === 'buy' ? a.ask - b.ask : b.bid - a.bid);
      $('#dol-tbl').innerHTML = sorted.length ? `<table class="t">
        <thead><tr>
          <th style="text-align:left">#</th>
          <th style="text-align:left">proveedor</th>
          <th>vendés a</th>
          <th>comprás a</th>
          <th>spread</th>
          <th>var</th>
        </tr></thead>
        <tbody>${sorted.map((ex, i) => {
          const isBestBuy = state.sort === 'buy' && i === 0;
          const isBestSell = state.sort === 'sell' && i === 0;
          const tag24 = ex.is24x7 === false ? '<span class="tag neutral" style="margin-left:6px">closed</span>' : '';
          const tagBank = ex.isBank ? '<span class="tag" style="margin-left:6px">banco</span>' : '';
          const varCls = ex.pctVariation != null ? signClass(ex.pctVariation) : 'dim';
          const varTxt = ex.pctVariation != null ? fmtPct(ex.pctVariation, 2) : '—';
          return `<tr>
            <td class="dim">${String(i + 1).padStart(2, '0')}</td>
            <td>${logoImgHTML(ex.logoUrl, ex.name, true)} <span class="${i===0?'hot':''}">${esc(ex.name)}</span>${tagBank}${tag24}</td>
            <td class="num ${isBestSell?'hot':''}">$${fmt(ex.bid, 2)}</td>
            <td class="num ${isBestBuy?'hot':''}">$${fmt(ex.ask, 2)}</td>
            <td class="num dim">${fmt(ex.spread, 2)}%</td>
            <td class="num ${varCls}">${varTxt}</td>
          </tr>`;
        }).join('')}</tbody></table>
        <div class="hint" style="margin-top:8px">fuente: comparadolar.ar · ${updated ? new Date(updated).toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'}) : ''}</div>` : `<div class="empty-state">sin datos</div>`;
    }

    function show24x7() {
      const wrap = $('#dol-24x7-wrap');
      if (wrap) wrap.style.display = state.coin === 'usd' ? '' : 'none';
    }

    $$('#dol-coin button').forEach(b => b.addEventListener('click', () => {
      $$('#dol-coin button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      state.coin = b.getAttribute('data-coin');
      show24x7(); renderBest(); renderTable();
    }));
    $$('#dol-sort button').forEach(b => b.addEventListener('click', () => {
      $$('#dol-sort button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      state.sort = b.getAttribute('data-sort');
      renderTable();
    }));
    $('#dol-24x7').addEventListener('change', e => {
      state.only24x7 = e.target.checked;
      renderBest(); renderTable();
    });

    show24x7(); renderBest(); renderTable();
  } catch (e) {
    $('#dol-tbl').innerHTML = `<div class="empty-state"><span class="down">ERROR</span> ${esc(e.message)}</div>`;
  }
}

// ─── Screen: PIX ──────────────────────────────────────────────
async function screenPix(main) {
  main.innerHTML = pHd('pix · ar → br', 'PIX', 'Mejor / peor proveedor para mandar reales a Brasil desde Argentina. Ranking por precio BRL/ARS ascendente (menor = mejor).')
    + `<section class="s"><h2><span>mejor / peor</span><span class="line"></span></h2><div id="pix-best" class="dol-best-row"><div class="loading-row"> cargando…</div></div></section>`
    + `<section class="s"><h2><span>proveedores</span><span class="line"></span><span class="count" id="pix-count">…</span></h2><div id="pix-tbl"><div class="loading-row"> cargando proveedores…</div></div></section>`;
  try {
    const raw = await fetchCached('/api/pix', 180_000);
    const providers = [];
    for (const [id, info] of Object.entries(raw)) {
      if (!info || !info.isPix) continue;
      const brlArs = (info.quotes || []).find(q => q.symbol === 'BRLARS');
      if (!brlArs || !brlArs.buy) continue;
      providers.push({
        id,
        name: id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        price: +brlArs.buy,
        sell: brlArs.sell ? +brlArs.sell : null,
        spread: brlArs.spread_pct != null ? +brlArs.spread_pct : null,
        logo: info.logo || null,
        url: info.url || null,
        hasFees: !!info.hasFees,
      });
    }
    providers.sort((a, b) => a.price - b.price);
    if (!providers.length) { $('#pix-tbl').innerHTML = '<div class="empty-state">sin proveedores</div>'; return; }
    const best = providers[0], worst = providers[providers.length - 1];

    $('#pix-best').innerHTML = `
      <div class="dol-best-card">
        <div class="lbl">mejor precio</div>
        <div class="with-logo">${logoImgHTML(best.logo, best.name)}<div class="txt"><b>${esc(best.name)}</b><small>mandás a</small></div></div>
        <div class="val hot">$${fmt(best.price, 2)}</div>
      </div>
      <div class="dol-best-card">
        <div class="lbl">peor precio</div>
        <div class="with-logo">${logoImgHTML(worst.logo, worst.name)}<div class="txt"><b>${esc(worst.name)}</b><small>mandás a</small></div></div>
        <div class="val down">$${fmt(worst.price, 2)}</div>
      </div>
      <div class="dol-best-card">
        <div class="lbl">diferencia</div>
        <div class="with-logo"><div class="txt"><b>best vs worst</b><small>ars por real</small></div></div>
        <div class="val hot">$${fmt(worst.price - best.price, 2)}</div>
      </div>`;

    $('#pix-count').textContent = providers.length;
    $('#pix-tbl').innerHTML = `<table class="t">
      <thead><tr>
        <th style="text-align:left">#</th>
        <th style="text-align:left">proveedor</th>
        <th>precio ars/brl</th>
        <th>vs best</th>
        <th>spread</th>
        <th></th>
      </tr></thead>
      <tbody>${providers.map((p, i) => {
        const diff = p.price - best.price;
        const spread = p.spread != null ? p.spread.toFixed(1) + '%' : '—';
        const fees = p.hasFees ? '<span class="tag" style="margin-left:6px">+fees</span>' : '';
        return `<tr>
          <td class="dim">${String(i + 1).padStart(2, '0')}</td>
          <td>${logoImgHTML(p.logo, p.name, true)} <span class="${i===0?'hot':''}">${esc(p.name)}</span>${fees}</td>
          <td class="num ${i===0?'hot':''}">$${fmt(p.price, 2)}</td>
          <td class="num ${diff > 0 ? 'down' : 'dim'}">${diff > 0 ? '+$' + fmt(diff, 2) : '—'}</td>
          <td class="num dim">${spread}</td>
          <td>${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener" style="color:var(--hot);text-decoration:underline">ir</a>` : ''}</td>
        </tr>`;
      }).join('')}</tbody></table>
      <div class="hint" style="margin-top:8px">fuente: comparapix.ar</div>`;
  } catch (e) {
    $('#pix-tbl').innerHTML = `<div class="empty-state"><span class="down">ERROR</span> ${esc(e.message)}</div>`;
  }
}

// ─── Screen: BCRA ─────────────────────────────────────────────
async function screenBcra(main) {
  main.innerHTML = pHd('bcra · variables', 'BCRA', 'Variables monetarias y cambiarias oficiales del Banco Central de la República Argentina.')
    + `<section class="s"><h2><span>variables</span><span class="line"></span><span class="count" id="bcra-count">…</span></h2><div id="bcra-tbl"><div class="loading-row"> cargando…</div></div></section>`
    + `<section class="s"><h2><span>divisas · cotizaciones destacadas</span><span class="line"></span></h2><div id="bcra-fx"><div class="loading-row"> cargando divisas…</div></div></section>`;
  try {
    const [vars, cambios] = await Promise.all([
      fetchCached('/api/bcra', 300_000),
      fetchCached('/api/bcra-cambiarias', 300_000).catch(() => ({ destacadas: [] })),
    ]);
    const list = (vars.data || []).slice(0, 25);
    $('#bcra-count').textContent = list.length;
    $('#bcra-tbl').innerHTML = list.length ? `<table class="t">
      <thead><tr><th style="text-align:left">variable</th><th style="text-align:left">categoría</th><th>valor</th><th>anterior</th><th>var</th><th style="text-align:left">fecha</th></tr></thead>
      <tbody>${list.map(r => {
        const cur = +r.valor, prev = +r.valorAnterior;
        const chg = (prev && !isNaN(prev) && prev !== 0) ? ((cur - prev) / Math.abs(prev)) * 100 : null;
        const unidad = r.unidad ? ` <small class="dim">${esc(r.unidad)}</small>` : '';
        return `<tr>
          <td>${esc(r.nombre)}</td>
          <td class="dim">${esc(r.categoria || '')}</td>
          <td class="num hot">${fmt(cur, r.formato === 'porcentaje' ? 2 : 0)}${unidad}</td>
          <td class="num dim">${prev != null ? fmt(prev, r.formato === 'porcentaje' ? 2 : 0) : '—'}</td>
          <td class="num ${chg != null ? signClass(chg) : 'dim'}">${chg != null ? fmtPct(chg, 2) : '—'}</td>
          <td class="dim">${esc(r.fecha || '')}</td>
        </tr>`;
      }).join('')}</tbody></table>` : `<div class="empty-state">sin datos</div>`;

    const dst = [...(cambios.destacadas || []), ...(cambios.otras || []).slice(0, 10)];
    $('#bcra-fx').innerHTML = dst.length ? `<table class="t">
      <thead><tr><th style="text-align:left">moneda</th><th style="text-align:left">código</th><th>cotización</th><th>pase</th></tr></thead>
      <tbody>${dst.map(r => `<tr>
        <td>${esc(r.nombre)}</td>
        <td class="dim">${esc(r.codigo)}</td>
        <td class="num hot">${fmt(+r.cotizacion, 4)}</td>
        <td class="num dim">${r.tipoPase ? fmt(+r.tipoPase, 4) : '—'}</td>
      </tr>`).join('')}</tbody></table>` : `<div class="empty-state">sin divisas</div>`;
  } catch (e) {
    $('#bcra-tbl').innerHTML = `<div class="empty-state"><span class="down">ERROR</span> ${esc(e.message)}</div>`;
  }
}

// ─── Screen: Mundial ──────────────────────────────────────────
async function screenMundial(main) {
  main.innerHTML = pHd('mundial · fifa 2026', 'Mundial 2026', 'Grupos de la Copa del Mundo FIFA 2026. Orden por puntos, luego diferencia de goles.')
    + `<div id="mun-grid"><div class="loading-row"> cargando grupos…</div></div>`;
  try {
    const raw = await fetchCached('/api/mundial', 3600_000);
    const standings = raw.standings || {};
    const groups = Object.keys(standings).sort();
    if (!groups.length) { $('#mun-grid').innerHTML = '<div class="empty-state">sin datos</div>'; return; }
    const rows = groups.map(g => {
      const teams = [...standings[g]].sort((a, b) => (b.points - a.points) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf));
      return `<section class="s"><h2><span>grupo ${esc(g)}</span><span class="line"></span></h2>
        <table class="t">
          <thead><tr><th style="text-align:left">#</th><th style="text-align:left">selección</th><th>pj</th><th>g</th><th>e</th><th>p</th><th>gf</th><th>gc</th><th>pts</th></tr></thead>
          <tbody>${teams.map((t, i) => `<tr>
            <td class="dim">${i + 1}</td>
            <td><span class="${i<2?'hot':''}">${esc(t.team)}</span></td>
            <td class="num dim">${t.played}</td>
            <td class="num">${t.won}</td>
            <td class="num">${t.draw}</td>
            <td class="num">${t.lost}</td>
            <td class="num">${t.gf}</td>
            <td class="num">${t.ga}</td>
            <td class="num hot">${t.points}</td>
          </tr>`).join('')}</tbody>
        </table>
      </section>`;
    });
    // 2-col grid
    const cols = [[], []];
    rows.forEach((r, i) => cols[i % 2].push(r));
    $('#mun-grid').innerHTML = `<div class="cols two"><div>${cols[0].join('')}</div><div>${cols[1].join('')}</div></div>`;
  } catch (e) {
    $('#mun-grid').innerHTML = `<div class="empty-state"><span class="down">ERROR</span> ${esc(e.message)}</div>`;
  }
}

const SCREENS = {
  mundo: screenMundo,
  cedears: screenCedears,
  ars: screenARS,
  bonos: screenBonos,
  ons: screenONs,
  hipotecarios: screenHipotecarios,
  dolar: screenDolar,
  pix: screenPix,
  bcra: screenBcra,
  mundial: screenMundial,
};

// ─── Keyboard ─────────────────────────────────────────────────
let _gMode = false, _gTimer = null;
const G_KEY = { m: 'mundo', c: 'cedears', a: 'ars', b: 'bonos', o: 'ons', h: 'hipotecarios', d: 'dolar', p: 'pix', r: 'bcra', w: 'mundial' };
const G_EXT = { e: '/earnings' };

function onKey(e) {
  // Ignore if user is typing in input/textarea
  const t = e.target;
  const tag = t && t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;

  if (e.key === 'Escape') {
    _gMode = false;
    closeOverlays();
    return;
  }

  if (_gMode) {
    e.preventDefault();
    const key = e.key.toLowerCase();
    const target = G_KEY[key];
    const ext = G_EXT[key];
    if (target) goTo(target, null);
    else if (ext) location.href = ext;
    _gMode = false;
    clearTimeout(_gTimer);
    return;
  }

  if (e.key === 'g') {
    _gMode = true;
    _gTimer = setTimeout(() => { _gMode = false; }, 1200);
    e.preventDefault();
    return;
  }

  if (e.key === '?') {
    toggleHelp();
    e.preventDefault();
    return;
  }

  if (e.key === '/') {
    openCommandPalette();
    e.preventDefault();
    return;
  }
}

function closeOverlays() {
  $$('.overlay').forEach(o => o.remove());
}

function toggleHelp() {
  if ($('#help-overlay')) { $('#help-overlay').remove(); return; }
  const div = document.createElement('div');
  div.id = 'help-overlay';
  div.className = 'overlay';
  div.innerHTML = `
    <div class="palette">
      <div class="hd"><span>? · atajos de teclado</span><span>esc</span></div>
      <ul>
        <li><span>saltar a sección</span><span class="k">g + m/c/a/b/o/h/d/p/r/w</span></li>
        <li><span>abrir command palette</span><span class="k">/</span></li>
        <li><span>esta ayuda</span><span class="k">?</span></li>
        <li><span>cerrar overlays</span><span class="k">esc</span></li>
        <li><span>ordenar tabla</span><span class="k">click header</span></li>
        <li><span>seleccionar fila (mundo) / punto (scatter)</span><span class="k">click</span></li>
      </ul>
    </div>
  `;
  document.body.appendChild(div);
  div.addEventListener('click', (e) => { if (e.target === div) div.remove(); });
}

// ─── Command palette ──────────────────────────────────────────
function buildPaletteItems() {
  const items = [];
  for (const n of NAV) {
    items.push({ k: `go ${n.k}`, label: `GO · ${n.label}`, hint: n.key ? `g ${n.key}` : '', act: () => goTo(n.k, null) });
    if (n.subs) for (const s of n.subs) {
      items.push({ k: `go ${n.k} ${s.k}`, label: `GO · ${n.label} › ${s.label}`, hint: '', act: () => goTo(n.k, s.k) });
    }
  }
  items.push(
    { k: 'theme amber', label: 'THEME · amber', hint: '', act: () => setPalette('amber') },
    { k: 'theme green', label: 'THEME · green', hint: '', act: () => setPalette('green') },
    { k: 'theme white mono', label: 'THEME · white / mono', hint: '', act: () => setPalette('white') },
    { k: 'scanlines toggle', label: 'TOGGLE · scanlines', hint: '', act: () => setScanlines(STATE.scanlines === 'on' ? 'off' : 'on') },
    { k: 'density compact', label: 'DENSITY · compact', hint: '', act: () => setDensity('compact') },
    { k: 'density medium', label: 'DENSITY · medium', hint: '', act: () => setDensity('medium') },
    { k: 'density comfortable', label: 'DENSITY · comfortable', hint: '', act: () => setDensity('comfortable') },
    { k: 'help', label: 'HELP · keyboard shortcuts', hint: '?', act: () => { closeOverlays(); toggleHelp(); } },
  );
  return items;
}

function openCommandPalette() {
  if ($('#palette-overlay')) return;
  const items = buildPaletteItems();
  const overlay = document.createElement('div');
  overlay.id = 'palette-overlay';
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="palette">
      <div class="hd"><span>/ · command palette</span><span>esc</span></div>
      <input id="palette-input" placeholder="go mundo · theme green · scanlines…" autocomplete="off" spellcheck="false"/>
      <ul id="palette-list"></ul>
    </div>
  `;
  document.body.appendChild(overlay);
  const input = $('#palette-input');
  const list = $('#palette-list');
  let sel = 0;
  function render(filter = '') {
    const f = filter.toLowerCase().trim();
    const scored = items.map(it => {
      if (!f) return { it, score: 0 };
      // simple fuzzy: every character of filter must appear in order in label
      const label = (it.label + ' ' + it.k).toLowerCase();
      let pos = 0, score = 0;
      for (const ch of f) {
        const idx = label.indexOf(ch, pos);
        if (idx === -1) return null;
        score += idx - pos;
        pos = idx + 1;
      }
      return { it, score };
    }).filter(Boolean);
    scored.sort((a, b) => a.score - b.score);
    const visible = scored.slice(0, 30);
    list.innerHTML = visible.map((x, i) => `<li class="${i === sel ? 'on' : ''}" data-idx="${i}"><span>${esc(x.it.label)}</span><span class="k">${esc(x.it.hint)}</span></li>`).join('');
    $$('li[data-idx]', list).forEach(li => {
      li.addEventListener('mouseenter', () => { sel = +li.getAttribute('data-idx'); $$('li', list).forEach(x => x.classList.remove('on')); li.classList.add('on'); });
      li.addEventListener('click', () => {
        const x = visible[+li.getAttribute('data-idx')];
        if (x) { overlay.remove(); x.it.act(); }
      });
    });
    return visible;
  }
  let current = render('');
  input.addEventListener('input', () => { sel = 0; current = render(input.value); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, current.length - 1); e.preventDefault(); render(input.value); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); e.preventDefault(); render(input.value); }
    else if (e.key === 'Enter') { const x = current[sel]; if (x) { overlay.remove(); x.it.act(); } }
    else if (e.key === 'Escape') { overlay.remove(); }
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  setTimeout(() => input.focus(), 10);
}

// ─── Tweaks / settings ────────────────────────────────────────
function setPalette(v) {
  STATE.palette = v;
  document.body.dataset.palette = v;
  try { localStorage.setItem(LS.palette, v); } catch (e) {}
  refreshTweaksPanel();
}
function setScanlines(v) {
  STATE.scanlines = v;
  document.body.dataset.scanlines = v;
  try { localStorage.setItem(LS.scanlines, v); } catch (e) {}
  refreshTweaksPanel();
}
function setDensity(v) {
  STATE.density = v;
  document.body.dataset.density = v;
  try { localStorage.setItem(LS.density, v); } catch (e) {}
  refreshTweaksPanel();
}

function toggleTweaksPanel() {
  if ($('#tweaks-panel')) { $('#tweaks-panel').remove(); return; }
  const div = document.createElement('div');
  div.id = 'tweaks-panel';
  div.className = 'tweaks';
  document.body.appendChild(div);
  refreshTweaksPanel();
}

function refreshTweaksPanel() {
  const div = $('#tweaks-panel');
  if (!div) return;
  const seg = (name, options, current, cb) => options.map(([v, label]) =>
    `<button class="${current === v ? 'on' : ''}" data-seg="${name}" data-v="${v}">${esc(label)}</button>`).join('');
  div.innerHTML = `
    <div class="hd"><span>tweaks</span><button id="tw-close" style="color:var(--inv-fg)">✕</button></div>
    <div class="bd">
      <div class="row"><span class="lbl">palette</span><div class="seg">${seg('palette', [['amber','amber'],['green','green'],['white','mono']], STATE.palette)}</div></div>
      <div class="row"><span class="lbl">scanlines</span><div class="seg">${seg('scanlines', [['on','on'],['off','off']], STATE.scanlines)}</div></div>
      <div class="row"><span class="lbl">density</span><div class="seg">${seg('density', [['compact','compact'],['medium','medium'],['comfortable','comfortable']], STATE.density)}</div></div>
    </div>
  `;
  $$('button[data-seg]', div).forEach(b => {
    b.addEventListener('click', () => {
      const n = b.getAttribute('data-seg'), v = b.getAttribute('data-v');
      if (n === 'palette') setPalette(v);
      else if (n === 'scanlines') setScanlines(v);
      else if (n === 'density') setDensity(v);
    });
  });
  $('#tw-close', div).addEventListener('click', () => div.remove());
}

// ─── Footer ───────────────────────────────────────────────────
function renderFooter() {
  const f = $('#site-footer');
  if (!f) return;
  f.innerHTML = `<div class="wrap">
    <div class="cols-f">
      <div>
        <h4>rendimientos*.co // tty</h4>
        <p class="tagline">Terminal de finanzas argentinas. Tasas en pesos y dólares, bonos, ONs, CEDEARs y monitor global — todo en una sola pantalla.</p>
      </div>
      <div>
        <h4>en pesos</h4>
        <ul>
          <li><a href="#ars.billeteras">billeteras</a></li>
          <li><a href="#ars.plazofijo">plazo fijo</a></li>
          <li><a href="#ars.lecaps">lecaps</a></li>
          <li><a href="#ars.cer">bonos cer</a></li>
          <li><a href="#ars.comparador">comparador</a></li>
        </ul>
      </div>
      <div>
        <h4>en dólares</h4>
        <ul>
          <li><a href="#bonos">soberanos</a></li>
          <li><a href="#ons">ons</a></li>
          <li><a href="#cedears">cedears</a></li>
          <li><a href="/earnings">earnings</a></li>
          <li><a href="#dolar">dólar</a></li>
        </ul>
      </div>
      <div>
        <h4>más</h4>
        <ul>
          <li><a href="#mundo">mundo</a></li>
          <li><a href="#hipotecarios">hipotecarios</a></li>
          <li><a href="#pix">pix</a></li>
          <li><a href="#bcra">bcra</a></li>
          <li><a href="#mundial">mundial</a></li>
        </ul>
      </div>
    </div>
    <div class="fine">
      <span>datos: cafci · bcra · byma · data912 · argentinadatos · yahoo finance</span>
      <span>hecho en buenos aires</span>
    </div>
  </div>`;
}

// ─── Boot ─────────────────────────────────────────────────────
function bootPersistence() {
  try {
    const pal = localStorage.getItem(LS.palette);
    if (pal && ['amber', 'green', 'white'].includes(pal)) STATE.palette = pal;
    const sc = localStorage.getItem(LS.scanlines);
    if (sc && ['on', 'off'].includes(sc)) STATE.scanlines = sc;
    const den = localStorage.getItem(LS.density);
    if (den && ['compact', 'medium', 'comfortable'].includes(den)) STATE.density = den;
    const sec = localStorage.getItem(LS.section);
    if (sec) {
      try {
        const parsed = JSON.parse(sec);
        if (parsed && parsed.main) STATE.section = parsed;
      } catch (e) {}
    }
  } catch (e) {}
  document.body.dataset.palette = STATE.palette;
  document.body.dataset.scanlines = STATE.scanlines;
  document.body.dataset.density = STATE.density;
}

function renderStatusbar() {
  let sb = $('#tty-statusbar');
  if (!sb) {
    sb = document.createElement('div');
    sb.id = 'tty-statusbar';
    sb.className = 'statusbar';
    document.body.appendChild(sb);
  }
  sb.innerHTML = `<div class="wrap"><div class="inner">
    <span class="live">live</span>
    <span>section: <b id="sb-section">${esc(STATE.section.main)}${STATE.section.sub ? ' · ' + esc(STATE.section.sub) : ''}</b></span>
    <span class="sp"></span>
    <button id="sb-palette">/ palette</button>
    <button id="sb-help">? help</button>
    <button id="sb-tweaks">⚙ tweaks</button>
  </div></div>`;
  $('#sb-palette', sb).addEventListener('click', openCommandPalette);
  $('#sb-help', sb).addEventListener('click', toggleHelp);
  $('#sb-tweaks', sb).addEventListener('click', toggleTweaksPanel);
}

function updateStatusbarSection() {
  const el = $('#sb-section');
  if (el) el.textContent = STATE.section.main + (STATE.section.sub ? ' · ' + STATE.section.sub : '');
}

function boot() {
  bootPersistence();
  const fromHash = parseHash();
  if (fromHash) STATE.section = fromHash;
  renderTopBar();
  renderFooter();
  renderStatusbar();
  renderScreen();
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', () => {
    const h = parseHash();
    if (h && (h.main !== STATE.section.main || h.sub !== STATE.section.sub)) {
      STATE.section = h;
      renderNav();
      updateStatusbarSection();
      renderScreen();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
