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
const LOGO_IMG = {
  'Ualá': '/logos/uala.svg',
  'Naranja X': '/logos/naranja-x.svg',
  'Mercado Pago': '/logos/mercado-pago.svg',
  'Personal Pay': '/logos/personal-pay.svg',
  'Cocos': '/logos/cocos-logo.png',
  'Cocos Capital': '/logos/cocos-logo.png',
  'Reba': '/logos/reba.png',
  'Prex': '/logos/prex.svg',
  'Brubank': '/logos/Brubank.svg',
  'Lemon': '/logos/Lemon_Cash.svg',
  'Carrefour Banco': '/logos/carrefour_banco.svg',
  'Banco Nación': '/logos/Banco_Nación.png',
  'BNA': '/logos/Banco_Nación.png',
  'Banco Galicia': '/logos/Banco_Galicia.svg',
  'Galicia': '/logos/Banco_Galicia.svg',
  'Banco Santander': '/logos/Banco_Santander.svg',
  'Santander': '/logos/Banco_Santander.svg',
  'Banco Ciudad': '/logos/Banco_Ciudad.png',
  'Ciudad': '/logos/Banco_Ciudad.png',
  'Banco Hipotecario': '/logos/Banco_Hipotecario.png',
  'Hipotecario': '/logos/Banco_Hipotecario.png',
  'ICBC': '/logos/ICBC_Argentina.png',
  'Banco Macro': '/logos/Banco_Macro.svg',
  'Macro': '/logos/Banco_Macro.svg',
  'Banco BBVA': '/logos/BBVA_(ARG).svg',
  'BBVA': '/logos/BBVA_(ARG).svg',
  'Banco Comafi': '/logos/Banco_Comafi.png',
  'Comafi': '/logos/Banco_Comafi.png',
  'Banco Credicoop': '/logos/Banco_Credicoop.png',
  'Credicoop': '/logos/Banco_Credicoop.png',
  'Banco Supervielle': '/logos/Banco_Supervielle.svg',
  'Supervielle': '/logos/Banco_Supervielle.svg',
  'Banco Voii': '/logos/Banco_Voii.png',
  'Voii': '/logos/Banco_Voii.png',
  'Banco Bica': '/logos/Banco_Bica.png',
  'Bica': '/logos/Banco_Bica.png',
  'Banco CMF': '/logos/Banco_CMF.png',
  'CMF': '/logos/Banco_CMF.png',
  'Banco Meridian': '/logos/Banco_Meridian.png',
  'Meridian': '/logos/Banco_Meridian.png',
};

function initials(name) {
  if (!name) return '·';
  return name.replace(/^(Banco\s+)/i, '').split(/[\s-]+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '·';
}
function logoHTML(name, sm = false) {
  const src = LOGO_IMG[name];
  const cls = 'logo' + (sm ? ' sm' : '');
  if (src) return `<span class="${cls}"><img src="${esc(src)}" alt="${esc(name || '')}"></span>`;
  return `<span class="${cls}">${esc(initials(name))}</span>`;
}

// ─── SVG helpers ───────────────────────────────────────────────
function sparkSVG(data, { positive = true, width = 80, height = 20 } = {}) {
  if (!data || data.length < 2) return '<span class="spark"></span>';
  const min = Math.min(...data), max = Math.max(...data), r = (max - min) || 1;
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = (i * step).toFixed(1);
    const y = (height - ((v - min) / r) * height).toFixed(1);
    return `${x},${y}`;
  }).join(' ');
  const color = positive ? 'var(--up)' : 'var(--down)';
  const fill = positive ? 'rgba(74,222,128,0.08)' : 'rgba(255,90,78,0.08)';
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="none">
    <polyline points="0,${height} ${pts} ${width},${height}" fill="${fill}" stroke="none"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.3"/>
  </svg>`;
}

function lineChartHTML(data, { label = '', valFmt = (v) => fmt(v, 2), pctFmt = (v) => fmtPct(v, 2) } = {}) {
  if (!data || data.length < 2) return `<div class="chart"><div class="hd"><div><div>${esc(label)}</div><div class="big num">—</div></div><div class="dim">sin datos</div></div></div>`;
  const W = 600, H = 160, P = { l: 8, r: 8, t: 24, b: 8 };
  const min = Math.min(...data), max = Math.max(...data), r = (max - min) || 1;
  const step = (W - P.l - P.r) / (data.length - 1);
  const pts = data.map((v, i) => `${(P.l + i * step).toFixed(1)},${(P.t + (H - P.t - P.b) - ((v - min) / r) * (H - P.t - P.b)).toFixed(1)}`).join(' ');
  const last = data[data.length - 1];
  const first = data[0];
  const chg = first ? ((last - first) / first) * 100 : 0;
  const up = chg >= 0;
  const gridLines = [0.25, 0.5, 0.75].map(f => {
    const y = (P.t + f * (H - P.t - P.b)).toFixed(1);
    return `<line class="grid-line" x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}"/>`;
  }).join('');
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
      <polyline points="${P.l},${H - P.b} ${pts} ${W - P.r},${H - P.b}" fill="${up ? 'rgba(74,222,128,0.08)' : 'rgba(255,90,78,0.08)'}" stroke="none"/>
      <polyline points="${pts}" fill="none" stroke="${up ? 'var(--up)' : 'var(--down)'}" stroke-width="1.3"/>
    </svg>
  </div>`;
}

function scatterSVG(data, { xKey, yKey, labelKey, xLabel, yLabel, yFmt = (v) => fmt(v, 2), xFmt = (v) => fmt(v, 0), selected = null, onSelect = null, targetId }) {
  if (!data || !data.length) return '<div class="chart" style="height:300px"><div class="hd"><div>sin datos</div></div></div>';
  const W = 620, H = 280, P = { l: 44, r: 16, t: 14, b: 30 };
  const xs = data.map(d => d[xKey]);
  const ys = data.map(d => d[yKey]);
  const xMin = Math.min(...xs) * 0.9;
  const xMax = Math.max(...xs) * 1.05;
  const yMin = Math.min(...ys) - 1;
  const yMax = Math.max(...ys) + 1;
  const x = v => P.l + ((v - xMin) / (xMax - xMin)) * (W - P.l - P.r);
  const y = v => H - P.b - ((v - yMin) / (yMax - yMin)) * (H - P.t - P.b);
  const sorted = [...data].sort((a, b) => a[xKey] - b[xKey]);
  const path = sorted.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(d[xKey]).toFixed(1)},${y(d[yKey]).toFixed(1)}`).join(' ');
  let grid = '';
  for (let i = 0; i < 5; i++) {
    const v = yMin + (i * (yMax - yMin) / 4);
    grid += `<line class="grid-line" x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}"/>
      <text x="${P.l - 6}" y="${y(v)}" text-anchor="end" dominant-baseline="middle" fill="var(--fg-faint)" font-size="9" font-family="var(--font-mono)">${esc(yFmt(v))}</text>`;
  }
  for (let i = 0; i < 5; i++) {
    const v = xMin + (i * (xMax - xMin) / 4);
    grid += `<line class="grid-line" x1="${x(v)}" x2="${x(v)}" y1="${P.t}" y2="${H - P.b}"/>
      <text x="${x(v)}" y="${H - P.b + 14}" text-anchor="middle" fill="var(--fg-faint)" font-size="9" font-family="var(--font-mono)">${esc(xFmt(Math.round(v)))}</text>`;
  }
  const axes = `<line x1="${P.l}" y1="${P.t}" x2="${P.l}" y2="${H - P.b}" stroke="var(--rule-hi)"/>
    <line x1="${P.l}" y1="${H - P.b}" x2="${W - P.r}" y2="${H - P.b}" stroke="var(--rule-hi)"/>`;
  const curve = `<path d="${path}" fill="none" stroke="var(--fg-dim)" stroke-dasharray="3 3"/>`;
  const points = data.map(d => {
    const isSel = selected === d[labelKey];
    const cx = x(d[xKey]).toFixed(1);
    const cy = y(d[yKey]).toFixed(1);
    return `<g data-sym="${esc(d[labelKey])}" class="scatter-pt${isSel ? ' sel' : ''}" style="cursor:pointer">
      <circle cx="${cx}" cy="${cy}" r="${isSel ? 5 : 3.5}" fill="${isSel ? 'var(--hot)' : 'var(--fg)'}" stroke="var(--bg)" stroke-width="1.5"/>
      <text x="${+cx + 6}" y="${+cy - 6}" fill="${isSel ? 'var(--hot)' : 'var(--fg-dim)'}" font-size="9" font-family="var(--font-mono)">${esc(d[labelKey])}</text>
    </g>`;
  }).join('');
  return `<div class="chart" style="height:300px">
    <div class="hd"><div>${esc(yLabel)} × ${esc(xLabel)}</div></div>
    <svg viewBox="0 0 ${W} ${H}" ${targetId ? `data-scatter="${esc(targetId)}"` : ''}>${grid}${axes}${curve}${points}</svg>
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
  nav.innerHTML = NAV.map(item => `
    <button data-nav="${item.k}" class="${STATE.section.main === item.k ? 'on' : ''}">${esc(item.label)}</button>
  `).join('');
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
    + `<div class="cols lg-chart"><div id="mundo-tbl"></div><div id="mundo-charts"></div></div>`;
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
}

// Normalize /api/mundo response → {Indices, Rates, FX, Commodities, Crypto}
function normalizeMundo(raw) {
  // /api/mundo devuelve un objeto agrupado por categoría con arrays de assets
  if (!raw) return {};
  const out = {};
  const map = {
    'indices': 'Indices', 'rates': 'Rates', 'fx': 'FX',
    'commodities': 'Commodities', 'crypto': 'Crypto',
    'Indices': 'Indices', 'Rates': 'Rates', 'FX': 'FX', 'Commodities': 'Commodities', 'Crypto': 'Crypto',
  };
  for (const key of Object.keys(raw)) {
    const bucket = map[key];
    if (!bucket) continue;
    const list = Array.isArray(raw[key]) ? raw[key] : [];
    out[bucket] = list.map(normalizeAsset).filter(a => a.sym);
  }
  for (const cat of MUNDO_CATEGORIES) if (!out[cat]) out[cat] = [];
  return out;
}

function normalizeAsset(a) {
  if (!a) return { sym: null };
  // Try to accommodate both {sym, name, last, chg, ytd, sp, pct} and raw yahoo-ish shapes
  const sym = a.sym || a.symbol || a.ticker;
  const name = a.name || a.shortName || a.longName || sym;
  const last = a.last != null ? +a.last : (a.price != null ? +a.price : (a.value != null ? +a.value : null));
  const chg = a.chg != null ? +a.chg : (a.pct_change != null ? +a.pct_change : (a.change != null ? +a.change : null));
  const ytd = a.ytd != null ? +a.ytd : null;
  let sp = Array.isArray(a.sp) ? a.sp : (Array.isArray(a.spark) ? a.spark : (Array.isArray(a.series) ? a.series : null));
  if (sp && sp.length && typeof sp[0] === 'object') {
    sp = sp.map(p => +(p.v != null ? p.v : p.value != null ? p.value : p.close != null ? p.close : p.price)).filter(v => !isNaN(v));
  }
  return { sym, name, last, chg, ytd, sp: sp || [], pct: !!a.pct, d: a.d };
}

// ─── Stubs for other screens ──────────────────────────────────
function stubScreen(main, { tag, title, sub, message = 'En construcción — próxima fase.' }) {
  main.innerHTML = pHd(tag, title, sub) + `<div class="empty-state">${esc(message)}</div>`;
}

async function screenCedears(main) {
  stubScreen(main, { tag: 'cedears · us stocks', title: 'CEDEARs', sub: 'Ranking de acciones USA y próximos reportes de resultados.' });
}
async function screenARS(main, sub) {
  const current = sub || 'billeteras';
  stubScreen(main, { tag: `ars · ${current}`, title: 'ARS', sub: 'Tasas en pesos: billeteras, plazos fijos, LECAPs, CER y comparador.', message: 'ars / ' + current + ' — próxima fase' });
}
async function screenBonos(main) {
  stubScreen(main, { tag: 'bonos · soberanos usd', title: 'Bonos Soberanos', sub: 'Curva de Bonares y Globales en dólares.' });
}
async function screenONs(main) {
  stubScreen(main, { tag: 'ons · corporativos', title: 'Obligaciones Negociables', sub: 'Bonos corporativos USD, YTM contra duración.' });
}
async function screenHipotecarios(main) {
  stubScreen(main, { tag: 'hipotecarios · uva', title: 'Hipotecarios', sub: 'TNA de créditos UVA por banco.' });
}
async function screenDolar(main) {
  stubScreen(main, { tag: 'dólar · cotizaciones', title: 'Dólar', sub: 'Oficial, Blue, MEP, CCL, Cripto, Tarjeta.' });
}
async function screenPix(main) {
  stubScreen(main, { tag: 'pix · ar → br', title: 'PIX', sub: 'Transferencias a Brasil vía billeteras locales.' });
}
async function screenBcra(main) {
  stubScreen(main, { tag: 'bcra · variables', title: 'BCRA', sub: 'Reservas, base monetaria, tasas de política.' });
}
async function screenMundial(main) {
  stubScreen(main, { tag: 'mundial · fifa 2026', title: 'Mundial', sub: 'Grupos, fixture y probabilidades de avance.' });
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
    const target = G_KEY[e.key.toLowerCase()];
    if (target) goTo(target, null);
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

function openCommandPalette() { /* implemented in Fase 4 */ toggleHelp(); }

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

function boot() {
  bootPersistence();
  // Hash overrides localStorage
  const fromHash = parseHash();
  if (fromHash) STATE.section = fromHash;
  renderTopBar();
  renderFooter();
  renderScreen();
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', () => {
    const h = parseHash();
    if (h && (h.main !== STATE.section.main || h.sub !== STATE.section.sub)) {
      STATE.section = h;
      renderNav();
      renderScreen();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
