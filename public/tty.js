/* ============================================================
 * rendimientos*.co // tty — vanilla terminal
 * ============================================================ */

// ─── State ────────────────────────────────────────────────────
const STATE = {
  section: { main: 'monitor', sub: 'mundo' },
  palette: 'white',
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
// Orden del nav por prioridad. `tier: 'sec'` = secundario (más dim, después del separador).
const NAV = [
  // ── primarios (más importantes) ──
  { k: 'monitor',     label: 'monitor',     key: 'm',
    subs: [
      { k: 'mundo',  label: 'mundo'  },
      { k: 'argy',   label: 'argy'   },
    ]
  },
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
  { k: 'dolar',        label: 'dólar',        key: 'd' },
  { k: 'pix',          label: 'pix',          key: 'p' },
  { k: 'remesas',      label: 'remesas',      key: 's' },
  // ── secundarios (menos importantes) ──
  { k: 'earnings',    label: 'earnings',     key: 'e', href: '/earnings', tier: 'sec' },
  { k: 'cedears',     label: 'cedears',      key: 'c', tier: 'sec' },
  { k: 'hipotecarios',label: 'hipotecarios', key: 'h', tier: 'sec' },
  { k: 'bcra',        label: 'bcra',         key: 'r', tier: 'sec' },
  { k: 'mundial',     label: 'mundial',      key: 'w', tier: 'sec' },
  { k: 'cuotas',      label: 'cuotas',       key: 'q', tier: 'sec' },
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

// Brand logos inlined as base64 SVG (rescatados del editorial app.js).
// Cubren las billeteras y FCIs que no tienen archivo en /logos/.
const ENTITY_LOGOS = {
  "Banco Voii": "/logos/Banco_Voii.png",
  "Naranja X": "data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTggMTgiIHN0eWxlPSJ3aWR0aDogNDBweDsgaGVpZ2h0OiA0MHB4OyI+PHJlY3Qgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBzdHlsZT0iZmlsbDogcmdiKDI1MCwgMjUwLCAyNTApOyIvPjxnPjxwYXRoIGQ9Ik0zLjAxLDEyLjM1di02LjdzLjA0LS4wOS4wOS0uMDloLjkzcy4wNS4wMS4wNy4wM2wzLjQsNC41M2MuMDUuMDcuMTUuMDMuMTUtLjA1di00LjQzcy4wNC0uMDkuMDktLjA5aDEuMDRzLjA5LjA0LjA5LjA5djYuN3MtLjA0LjA5LS4wOS4wOWgtLjkycy0uMDUtLjAxLS4wNy0uMDNsLTMuNC00LjUzYy0uMDUtLjA3LS4xNS0uMDMtLjE1LjA1djQuNDNzLS4wNC4wOS0uMDkuMDloLTEuMDVzLS4wOS0uMDQtLjA5LS4wOVoiIHN0eWxlPSJmaWxsOiByZ2IoMjU0LCA4MCwgMCk7Ii8+PGc+PHBhdGggZD0iTTEyLjcxLDguODJsLTIuMDQtMy4xNmMtLjA0LS4wNi0uMS0uMDktLjE3LS4wOWgtMS4zNnMtLjA3LjAzLS4wNy4wN2MwLC4wMSwwLC4wMi4wMS4wM2wyLjEyLDMuM3MuMDEuMDUsMCwuMDdsLTIuMTIsMy4yOXMtLjAxLjA3LjAyLjA5Yy4wMSwwLC4wMi4wMS4wNC4wMWgxLjM2Yy4wNywwLC4xMy0uMDMuMTctLjA5bDIuMDQtMy4xNWMuMDctLjExLjA3LS4yNiwwLS4zN2gwWiIgc3R5bGU9ImZpbGw6IHJnYigyNTQsIDgwLCAwKTsiLz48cGF0aCBkPSJNMTMuMTMsOS40NnMtLjA2LS4wNC0uMDktLjAyYzAsMC0uMDEuMDEtLjAyLjAybC0uNTYuODdjLS4xMS4xNy0uMTEuMzksMCwuNTVsLjk1LDEuNDdzLjA5LjA4LjE0LjA4aDEuNDFzLjA1LS4wMi4wNS0uMDVjMCwwLDAtLjAyLDAtLjAzbC0xLjg3LTIuODlaIiBzdHlsZT0iZmlsbDogcmdiKDgwLCAwLCAxMjcpOyIvPjxwYXRoIGQ9Ik0xMy4wMiw4LjUzcy4wNi4wNC4wOS4wMmMwLDAsLjAxLS4wMS4wMi0uMDJsMS44Ny0yLjg5czAtLjA2LS4wMi0uMDdjMCwwLS4wMiwwLS4wMywwaC0xLjQxYy0uMDYsMC0uMTEuMDMtLjE0LjA4bC0uOTUsMS40N2MtLjExLjE3LS4xMS4zOSwwLC41NWwuNTYuODZaIiBzdHlsZT0iZmlsbDogcmdiKDgwLCAwLCAxMjcpOyIvPjwvZz48L2c+PC9zdmc+",
  "Fiwind": "data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTggMTgiIHN0eWxlPSJ3aWR0aDogNDBweDsgaGVpZ2h0OiA0MHB4OyI+PHJlY3Qgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBzdHlsZT0iZmlsbDogcmdiKDEwLCAxMCwgMTApOyIvPjxnPjxwYXRoIGQ9Ik03LjkyLDkuNThoLTEuNTdjLS4yLDAtLjM2LS4xNi0uMzYtLjM2cy4xNi0uMzYuMzYtLjM2aDEuNTdjLjIsMCwuMzYuMTYuMzYuMzZzLS4xNi4zNi0uMzYuMzZaTTYuMzYsNy45NmMtLjIsMC0uMzYtLjE2LS4zNi0uMzZzLjE2LS4zNi4zNi0uMzZoMi4wNWMuMiwwLC4zNi4xNi4zNi4zNnMtLjE2LjM2LS4zNi4zNmgtMi4wNVpNOC43LDExLjQ4Yy0uMTktLjA2LS4zLS4yNi0uMjQtLjQ1bDEuMS0zLjYxYy4wNi0uMTkuMjYtLjMuNDUtLjI0LjE5LjA2LjMuMjYuMjQuNDVsLTEuMSwzLjYxYy0uMDYuMTktLjI2LjMtLjQ1LjI0Wk0xMS44OSw3LjYzbC0xLjEsMy42MWMtLjA2LjE5LS4yNi4zLS40NS4yNC0uMTktLjA2LS4zLS4yNi0uMjQtLjQ1bDEuMS0zLjYxYy4wNi0uMTkuMjYtLjMuNDUtLjI0LjE5LjA2LjMuMjYuMjQuNDVaIiBzdHlsZT0iZmlsbDogcmdiKDIzOSwgMTgwLCAyOSk7Ii8+PHBhdGggZD0iTTksMTQuMDFjLTIuNzYsMC01LTIuMjUtNS01LjAxczIuMjQtNS4wMSw1LTUuMDEsNSwyLjI1LDUsNS4wMS0yLjI0LDUuMDEtNSw1LjAxWk05LDQuNjJjLTIuNDEsMC00LjM3LDEuOTYtNC4zNyw0LjM3czEuOTYsNC4zNyw0LjM3LDQuMzcsNC4zNy0xLjk2LDQuMzctNC4zNy0xLjk2LTQuMzctNC4zNy00LjM3WiIgc3R5bGU9ImZpbGw6IHJnYigyMzksIDE4MCwgMjkpOyIvPjwvZz48L3N2Zz4=",
  "Ualá": "data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTggMTgiIHN0eWxlPSJ3aWR0aDogNDBweDsgaGVpZ2h0OiA0MHB4OyI+PHJlY3Qgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBzdHlsZT0iZmlsbDogcmdiKDIsIDQyLCAxNTUpOyIvPjxnIGlkPSJudWV2byI+PHBhdGggZD0iTTYuODEsMTIuMDVjLTEuODcsMC0zLjgtMS41Ny0zLjgtMy43MSwwLS41NS4zOS0xLjIxLDEuMTItMS4yMXMxLjA5LjQzLDEuMTQsMS4yMWMuMDksMS4yNC41OCwyLjE5LjY3LDIuMzgsMCwuMDEuMDEuMDIuMDEuMDMuMjkuNTkuODcuOTYsMS41Ny45Ni40NiwwLC44NS0uMTcsMS4xOS0uNDYtLjU5LjU3LTEuMjIuODEtMS45LjgxWiIgc3R5bGU9ImZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsiLz48cGF0aCBkPSJNMTEuMjEsNS45NWMxLjg3LDAsMy44LDEuNTcsMy44LDMuNzEsMCwuNTUtLjM5LDEuMjEtMS4xMiwxLjIxcy0xLjA5LS40My0xLjE0LTEuMjFjLS4xLTEuMzQtLjY2LTIuMzUtLjY5LTIuNC0uMy0uNTctLjg5LS45Ni0xLjU3LS45Ni0uNDYsMC0uODUuMTctMS4xOS40Ni41OS0uNTcsMS4yMi0uODEsMS45LS44MVoiIHN0eWxlPSJmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7Ii8+PHBhdGggZD0iTTEyLjA2LDcuMjZjLS4zLS41Ny0uODktLjk1LTEuNTctLjk1LS40NiwwLS44NS4xNy0xLjE5LjQ2aDBjLTEuMzIsMS4xOS0yLjA3LDMuNDItMy4zNiwzLjk1LDAsLjAxLjAxLjAyLjAxLjAzLjI5LjU5Ljg3Ljk2LDEuNTcuOTYuNDYsMCwuODUtLjE3LDEuMTktLjQ2LDEuMzctMS4yMiwxLjk3LTMuMzUsMy4zNS0zLjk4WiIgc3R5bGU9ImZpbGw6IHJnYigyNTUsIDg4LCAxMTYpOyIvPjwvZz48L3N2Zz4=",
  "COCOS": "data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTggMTgiIHN0eWxlPSJ3aWR0aDogNDBweDsgaGVpZ2h0OiA0MHB4OyI+PHJlY3Qgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBzdHlsZT0iZmlsbDogcmdiKDAsIDk4LCAyMjUpOyIvPjxnPjxwYXRoIGQ9Ik03LjQ5LDExLjYyYy0xLjM2LjAxLTIuNjEtLjY0LTMuMTgtMS44Mi0uMi0uNDMtLjMxLS45LS4zMS0xLjM3cy4xLS45NC4zMS0xLjM3Yy40MS0uOTEsMS4xMy0xLjY0LDIuMDMtMi4wN2wuNjYtLjMyLjY0LDEuMzMtLjY2LjMyYy0uNTguMjctMS4wNS43NS0xLjMzLDEuMzMtLjIyLjQ3LS4yMywxLjAyLS4wMSwxLjUuNDcuOTcsMS44NSwxLjI4LDMuMDcuNjlsLjY2LS4zMi42NCwxLjMzLS42Ni4zMmMtLjU4LjI4LTEuMjEuNDQtMS44Ni40NCIgc3R5bGU9ImZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsiLz48cGF0aCBkPSJNMTEuMDgsMTMuMzRsLS42Ny0xLjMxLjY1LS4zNGMxLjItLjYyLDEuNzgtMS45MSwxLjI4LTIuODdzLTEuODgtMS4yNS0zLjA4LS42M2wtLjY1LjM0LS42Ny0xLjMxLjY1LS4zNGMxLjkzLTEsNC4yLS40Miw1LjA3LDEuMjYuODcsMS42OSwwLDMuODctMS45Miw0Ljg3bC0uNjUuMzRoMFoiIHN0eWxlPSJmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7Ii8+PC9nPjwvc3ZnPg==",
  "Supervielle": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxOCAxOCIgc3R5bGU9IndpZHRoOiA0MHB4OyBoZWlnaHQ6IDQwcHg7Ij48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHN0eWxlPSJmaWxsOiByZ2IoMjUwLCAyNTAsIDI1MCk7Ii8+PGc+PHBhdGggZD0iTTMuNDMsMy41N2MuNzksMi4wOSwxLjcsNi4zMi0uNDMsMTAuOTgtLjAyLjA2LjA1LjExLjEzLjA2LDIuNTUtMS43LDQuNzctNC45Niw1LjUtNy42Mi0yLjUzLTEuMzItNC4wNi0yLjY5LTQuOTgtMy41Ni0uMTItLjEyLS4yNy4wMS0uMjIuMTRaIiBzdHlsZT0iZmlsbDogcmdiKDIzNywgMjgsIDM2KTsiLz48cGF0aCBkPSJNMTQuOSw5LjA1Yy0yLjExLS4zNC00LjE2LTEuMDQtNS41LTEuNjktLjc3LDIuMDctMi4yNyw0LjI5LTMuODMsNS44MS0uMDkuMDctLjAyLjIuMTIuMSwzLjM0LTIuMzYsNi44My0zLjQ5LDkuMjItMy45Ni4xMy0uMDMuMTMtLjIzLDAtLjI2WiIgc3R5bGU9ImZpbGw6IHJnYigxMzIsIDAsIDY1KTsiLz48L2c+PC9zdmc+",
  "Prex": "data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgdmlld0JveD0iMCAwIDE4IDE4IiBzdHlsZT0id2lkdGg6IDQwcHg7IGhlaWdodDogNDBweDsiPjxkZWZzPjxtYXNrIGlkPSJtYXNrIiB4PSIzLjAxIiB5PSI1LjYxIiB3aWR0aD0iMTEuODgiIGhlaWdodD0iNi42NSIgbWFza1VuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PGcgaWQ9Im1hc2stMiIgZGF0YS1uYW1lPSJtYXNrIj48cmVjdCB4PSIzLjAxIiB5PSI1LjYxIiB3aWR0aD0iMTEuODgiIGhlaWdodD0iNi42NSIgc3R5bGU9ImZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsiLz48cGF0aCBkPSJNMTQuODksNy44NWgtMy4xOGwuMywxLjUtLjMsMS41aDMuMTh2LS4wMmgtLjk0bC0uNTUtLjc2LjQ2LS42MSwxLjAzLDEuMzdNMTEuNzYsNy45MWguOTRsLjU1Ljc3LS40Ni42MS0xLjAzLTEuMzdoMFpNMTIuNjMsMTAuODRoLS44NmwyLjI3LTIuOTNoLjg1cy0yLjI2LDIuOTMtMi4yNiwyLjkzWiIvPjwvZz48L21hc2s+PC9kZWZzPjxyZWN0IHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgc3R5bGU9ImZpbGw6IHJnYig5MCwgODAsIDI0OSk7Ii8+PGc+PHBhdGggZD0iTTQuNjksOS4wM2MuMDksMCwuMTcsMCwuMjUtLjA0cy4xNS0uMDcuMjItLjEzYy4wNi0uMDYuMTEtLjEzLjE1LS4ycy4wNS0uMTYuMDUtLjI0LS4wMi0uMTctLjA1LS4yNGMtLjAzLS4wOC0uMDgtLjE1LS4xNS0uMi0uMDYtLjA2LS4xNC0uMS0uMjItLjEzcy0uMTctLjA0LS4yNS0uMDRoLS44NnYxLjI0aC44NlpNMy4wMSw3LjFoMS42OGMuOTEsMCwxLjUuNTYsMS41LDEuMzJzLS41OSwxLjMtMS41LDEuM2gtLjg2djEuMTJoLS44MXYtMy43NFoiIHN0eWxlPSJmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7Ii8+PHBhdGggZD0iTTYuNTEsOS4yNmMwLTEuNTQsMS40NS0xLjQ5LDEuOTktMS4zNmwtLjA5LjY5Yy0uNjUtLjE5LTEuMTQuMDktMS4xNC42djEuNjVoLS43N3YtMS41OFoiIHN0eWxlPSJmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7Ii8+PHBhdGggZD0iTTEwLjk0LDkuMDdjLS4wNS0uMTctLjE1LS4zMi0uMjktLjQyLS4xNC0uMTEtLjMyLS4xNi0uNS0uMTZzLS4zNS4wNi0uNS4xNmMtLjE0LjExLS4yNC4yNS0uMjkuNDJoMS41N1pNMTAuMTUsNy44NWMxLjAxLDAsMS43Mi44MSwxLjU2LDEuNzhoLTIuMzZjLjA0LjE4LjE1LjM1LjMxLjQ2cy4zNS4xNy41NC4xNmMuMTYsMCwuMzEtLjAzLjQ1LS4xMS4xNC0uMDcuMjUtLjE5LjMzLS4zMmwuNjMuMjdjLS4xNC4yNC0uMzUuNDUtLjYuNTktLjI1LjE0LS41NC4yMS0uODMuMi0uOTIsMC0xLjYyLS42Ni0xLjYyLTEuNTMsMC0uMi4wNC0uNC4xMi0uNTlzLjItLjM2LjM0LS41LjMyLS4yNS41Mi0uMzNjLjE5LS4wNy40LS4xMS42MS0uMTEiIHN0eWxlPSJmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7Ii8+PGcgc3R5bGU9Im1hc2s6IHVybCgmcXVvdDsjbWFzayZxdW90Oyk7Ij48cGF0aCBkPSJNMTIuODcsOS4zOWwtMS4xMS0xLjQ4aC45NGwuNjQuODkuNjUtLjg5aC44OWwtMS4xMSwxLjQ1LDEuMTEsMS40OGgtLjk0bC0uNjQtLjg5LS42NS44OWgtLjg5bDEuMTEtMS40NWgwWiIgc3R5bGU9ImZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsiLz48L2c+PC9nPjwvc3ZnPg==",
  "ICBC": "data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTggMTgiIHN0eWxlPSJ3aWR0aDogNDBweDsgaGVpZ2h0OiA0MHB4OyI+PHJlY3Qgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBzdHlsZT0iZmlsbDogcmdiKDI1MCwgMjUwLCAyNTApOyIvPjxnPjxwYXRoIGlkPSJMYXllciIgZD0iTTMuMDEsOS4wMWMwLTMuMzMsMi42OC02LjAxLDYuMDEtNi4wMXM1Ljk5LDIuNjgsNS45OSw2LjAxLTIuNyw1Ljk5LTUuOTksNS45OS02LjAxLTIuNy02LjAxLTUuOTlaTTMuOSw5LjAxYzAsLjY4LjEyLDEuMzMuMzksMS45Ni4yNy42LjYzLDEuMTgsMS4xMSwxLjY0LjQ4LjQ4LDEuMDQuODcsMS42NywxLjExLjYuMjcsMS4yOC4zOSwxLjk2LjM5LDIuNzgsMCw1LjA1LTIuMjcsNS4wNS01LjA5cy0yLjI3LTUuMTItNS4wNS01LjEyYy0uNjgsMC0xLjM1LjE0LTEuOTYuMzktLjYzLjI3LTEuMTguNjMtMS42NywxLjExcy0uODUsMS4wNC0xLjExLDEuNjdjLS4yNy42LS4zOSwxLjI4LS4zOSwxLjk2aDBaIiBzdHlsZT0iZmlsbDogcmdiKDE4NCwgMzAsIDQ1KTsgZmlsbC1ydWxlOiBldmVub2RkOyIvPjxwYXRoIGlkPSJMYXllci0yIiBkYXRhLW5hbWU9IkxheWVyIiBkPSJNNS44MiwxMi4yaDIuOTJ2LS44NWgtMi4wOHYtMS4wMWgxLjg2di0yLjY2aC0xLjg2di0xLjAxaDIuMDh2LS44NWgtMi45MnYyLjc1aDEuODZ2Ljk0aC0xLjg2djIuNjhaTTEyLjIsOS40OWgtMS45MXYtLjk0aDEuOTF2LTIuNzVoLTIuOTV2Ljg1aDIuMXYxLjAxaC0xLjkxdjIuNjhoMS45MXYxLjAxaC0yLjF2Ljg1aDIuOTV2LTIuN1oiIHN0eWxlPSJmaWxsOiByZ2IoMTg0LCAzMCwgNDUpOyBmaWxsLXJ1bGU6IGV2ZW5vZGQ7Ii8+PC9nPjwvc3ZnPg==",
  "Adcap": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyOCAyOCIgc3R5bGU9IndpZHRoOiA0MHB4OyBoZWlnaHQ6IDQwcHg7Ij48cmVjdCB3aWR0aD0iMjgiIGhlaWdodD0iMjgiLz48Zz48cGF0aCBkPSJNMTMuMzQsMTguNjlsLTEuMDMtMi4wOWgtNS4zMWwtMS4wMywyLjA5aC0xLjQ2bDQuNDEtOC45OWgxLjYxbDQuMzQsOC45OWgtMS41MlpNOC45NywxMi41NmwtMS4zLDIuNzFoNC4wMWwtMS4zNC0yLjczYy0uMTMtLjI0LS4yNC0uNDktLjMzLS43LS4xMy0uMjItLjIyLS40OS0uMzMtLjczLS4xMy4yNy0uMjIuNTEtLjMzLjc2LS4xMy4yMi0uMjQuNDYtLjM3LjdaIiBmaWxsPSIjZmZmIi8+PHBhdGggZD0iTTIyLjQ4LDkuMTl2OS41aC0xLjN2LTEuMTVjLS4xOC4yMi0uNDIuNDItLjc2LjY0LS4zMy4xOC0uNy4zNy0xLjEyLjQ5LS40Mi4xMy0uODUuMTgtMS4zLjE4LS44MiwwLTEuNTItLjE1LTIuMTItLjQ2cy0xLjA2LS43LTEuMzktMS4yNWMtLjMzLS41MS0uNDktMS4xMi0uNDktMS44M3MuMTgtMS4yOC41MS0xLjgzYy4zMy0uNTEuODItLjk0LDEuNDMtMS4yNXMxLjMtLjQ2LDIuMTItLjQ2Yy43LDAsMS4zLjEzLDEuODUuMzMuNTUuMjIuOTcuNDksMS4yNS43OXYtMy43NGgxLjM0bC0uMDIuMDNaTTE4LjI5LDE3LjZjLjU4LDAsMS4xLS4wOSwxLjU1LS4zMS40Mi0uMjIuNzktLjQ5LDEuMDMtLjgycy4zNy0uNzMuMzctMS4xNS0uMTMtLjgyLS4zNy0xLjE1LS41OC0uNjEtMS4wMy0uODJjLS40Mi0uMTgtLjk0LS4zMS0xLjU1LS4zMXMtMS4xLjA5LTEuNTIuMzFjLS40Ni4xOC0uNzkuNDYtMS4wMy44Mi0uMjQuMzMtLjM3LjczLS4zNywxLjE1cy4xMy44Mi4zNywxLjE1Yy4yNC4zMy42MS42MSwxLjAzLjgyLjQyLjIyLjk0LjMxLDEuNTIuMzFaIiBmaWxsPSIjZmZmIi8+PC9nPjwvc3ZnPg==",
  "IEB+": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyOCAyOCIgc3R5bGU9IndpZHRoOiA0MHB4OyBoZWlnaHQ6IDQwcHg7Ij48cmVjdCB3aWR0aD0iMjgiIGhlaWdodD0iMjgiIHN0eWxlPSJmaWxsOiByZ2IoMTAsIDEwLCAxMCk7Ii8+PGc+PHBhdGggZD0iTTIzLjc5LDguNDdoLTUuODZjLS4wNiwwLS4wOS4wMy0uMTMuMDZsLTIuNTYsMi41M2MtLjA2LjA2LS4wNi4xMy0uMDMuMTguMDMuMDYuMDkuMTMuMTUuMTNoNC41NHY3Ljk4YzAsLjA2LjAzLjEzLjEzLjE1aC4wNnMuMDktLjAzLjEzLS4wNmwzLjctMy43cy4wNi0uMDkuMDYtLjEzdi02Ljk3Yy0uMDMtLjEyLS4xMi0uMTgtLjIxLS4xOFpNMjMuNiw4Ljh2Mi4xNmgtMy4zNXYtMi4xNmgzLjM1Wk0xNS44LDExbDIuMTktMi4xNmgxLjg4djIuMTZoLTQuMDZaTTIwLjI3LDE4Ljkydi03LjU4aDMuMzV2NC4yM2wtMy4zNSwzLjM1WiIgc3R5bGU9ImZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsiLz48cGF0aCBkPSJNNCwxOS41MXYtNi4zOWgxLjQ1djYuNDFoLTEuNDV2LS4wM1oiIHN0eWxlPSJmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7Ii8+PHBhdGggZD0iTTYuNzQsMTMuMTJoNC44NXYxLjIzaC0zLjM5djEuM2gzLjJ2MS4yM2gtMy4ydjEuNDFoMy4zOXYxLjIzaC00Ljg1di02LjQxWiIgc3R5bGU9ImZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsiLz48cGF0aCBkPSJNMTIuNjIsMTkuNTF2LTYuMzloMy4zYzEuMjEsMCwyLjAxLjc1LDIuMDEsMS43OSwwLC41NS0uMjIuOTUtLjU5LDEuMjMuNDkuMjguODQuNzcuODQsMS41MiwwLDEuMTEtLjg0LDEuODgtMi4wNywxLjg4aC0zLjQ4di0uMDNaTTE1Ljg0LDE1LjYxYy40LDAsLjY0LS4yMi42NC0uNjQsMC0uNC0uMjItLjY0LS42NC0uNjRoLTEuNzJ2MS4zaDEuNzJaTTE1Ljk1LDE4LjI3Yy41NSwwLC43NS0uMzEuNzUtLjc1LDAtLjQtLjIyLS43NS0uNzUtLjc1aC0xLjg4djEuNDVoMS44OHYuMDRaIiBzdHlsZT0iZmlsbDogcmdiKDI1NSwgMjU1LCAyNTUpOyIvPjwvZz48L3N2Zz4=",
  "Balanz": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyOCAyOCIgc3R5bGU9IndpZHRoOiA0MHB4OyBoZWlnaHQ6IDQwcHg7Ij48cmVjdCB3aWR0aD0iMjgiIGhlaWdodD0iMjgiIHN0eWxlPSJmaWxsOiByZ2IoMTMsIDMyLCA4NSk7Ii8+PGcgaWQ9IkdydXBvXzU1NiI+PHBhdGggaWQ9IlRyYXphZG9fMTM2NyIgZD0iTTExLjQzLDE4LjY2aDMuMzVjMS4yMywwLDIuMzQtLjM5LDIuMzQtMS45cy0uOTUtMi4wNi0yLjI5LTIuMDZoLTMuNHYzLjk2Wk0xMS40MywxMi42M2gzLjE4YzEuMTIsMCwxLjk1LS41LDEuOTUtMS43MywwLTEuMzQtMS4wNi0xLjYyLTIuMTgtMS42MmgtMi45NnYzLjM1Wk04LjI1LDYuODNoNi43NWMyLjczLDAsNC41Ny44OSw0LjU3LDMuNTcuMDYsMS4yOC0uNzMsMi41MS0xLjk1LDMuMDEsMS42Mi4zOSwyLjczLDEuOTUsMi42MiwzLjYzLDAsMi45LTIuNDUsNC4xMy01LjA0LDQuMTNoLTYuOTJWNi44M1oiIHN0eWxlPSJmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7Ii8+PC9nPjwvc3ZnPg==",
  "Galicia": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxOCAxOCIgc3R5bGU9IndpZHRoOiA0MHB4OyBoZWlnaHQ6IDQwcHg7Ij48ZyBjbGlwLXBhdGg9InVybCgjYSkiPjxwYXRoIGZpbGw9IiNFODZFMkMiIGQ9Ik0wIDBoMTh2MThIMFYwWiIvPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik0xMS42ODYgNi40NDhhLjA2MS4wNjEgMCAwIDEtLjAzNi0uMDEyIDIuMTk3IDIuMTk3IDAgMCAwLS40NTctLjE4NGMtLjM1LS4xMDYtLjk2LS4yMzctMS44OTUtLjI2LjA1My45OTkuMjMgMS41NzcuMzMyIDEuODMybC4wMTMuMDMxYy4wNTkuMTM4LjIyNC40NjYuNDgzLjU0MmEuMDYyLjA2MiAwIDAgMSAuMDQyLjA3NGwtMS4xMDMgNy41MDRhLjA2My4wNjMgMCAwIDEtLjA2Mi4wNTQuMDYzLjA2MyAwIDAgMS0uMDYyLS4wNTRsLTEuMTA4LTcuNWEuMDYyLjA2MiAwIDAgMSAuMDQxLS4wNzhjLjI1OC0uMDc1LjQyMy0uNDAyLjQ4MS0uNTM4LjEwNy0uMjYuMjkxLS44NDIuMzQ2LTEuODY4LS45MzUuMDIzLTEuNTQ1LjE1NC0xLjg5NC4yNjFhMi4wMyAyLjAzIDAgMCAwLS40NTcuMTg2LjA2LjA2IDAgMCAxLS4wMjIuMDA5Ljc0NC43NDQgMCAxIDEtLjAxNC0xLjQ4NmMuMDAzIDAgLjAwNyAwIC4wMTEuMDAyYS4wNjMuMDYzIDAgMCAxIC4wMjUuMDA5cy4xNC4wODguNDU2LjE4NWMuMzUxLjEwOC45NjYuMjQgMS45MDguMjYyLS4wMjQtLjkzNi0uMTU1LTEuNTQ0LS4yNjItMS44OTFhMi4xMDQgMi4xMDQgMCAwIDAtLjE4Ni0uNDU0LjA2LjA2IDAgMCAxLS4wMDUtLjA0OS43MzUuNzM1IDAgMCAxIC40NTYtLjY2OC43MzUuNzM1IDAgMCAxIC4yODQtLjA1Ni43Mi43MiAwIDAgMSAuNzQuNzMyLjA2OC4wNjggMCAwIDEtLjAxLjA0NiAyIDIgMCAwIDAtLjE4Mi40NWMtLjEwNy4zNDctLjIzOC45NTUtLjI2MyAxLjg5Ljk0MS0uMDIyIDEuNTU0LS4xNTIgMS45MDUtLjI1OS4yODctLjA4OC40MjgtLjE2OC40NTYtLjE4NWEuMDYyLjA2MiAwIDAgMSAuMDQtLjAxNC43NDUuNzQ1IDAgMCAxIDAgMS40ODdaIi8+PC9nPjxkZWZzPjxjbGlwUGF0aCBpZD0iYSI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTAgMGgxOHYxOEgweiIvPjwvY2xpcFBhdGg+PC9kZWZzPjwvc3ZnPg==",
  "Cocos Ahorro": "data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTggMTgiIHN0eWxlPSJ3aWR0aDogNDBweDsgaGVpZ2h0OiA0MHB4OyI+PHJlY3Qgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBzdHlsZT0iZmlsbDogcmdiKDAsIDk4LCAyMjUpOyIvPjxnPjxwYXRoIGQ9Ik03LjQ5LDExLjYyYy0xLjM2LjAxLTIuNjEtLjY0LTMuMTgtMS44Mi0uMi0uNDMtLjMxLS45LS4zMS0xLjM3cy4xLS45NC4zMS0xLjM3Yy40MS0uOTEsMS4xMy0xLjY0LDIuMDMtMi4wN2wuNjYtLjMyLjY0LDEuMzMtLjY2LjMyYy0uNTguMjctMS4wNS43NS0xLjMzLDEuMzMtLjIyLjQ3LS4yMywxLjAyLS4wMSwxLjUuNDcuOTcsMS44NSwxLjI4LDMuMDcuNjlsLjY2LS4zMi42NCwxLjMzLS42Ni4zMmMtLjU4LjI4LTEuMjEuNDQtMS44Ni40NCIgc3R5bGU9ImZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsiLz48cGF0aCBkPSJNMTEuMDgsMTMuMzRsLS42Ny0xLjMxLjY1LS4zNGMxLjItLjYyLDEuNzgtMS45MSwxLjI4LTIuODdzLTEuODgtMS4yNS0zLjA4LS42M2wtLjY1LjM0LS42Ny0xLjMxLjY1LS4zNGMxLjkzLTEsNC4yLS40Miw1LjA3LDEuMjYuODcsMS42OSwwLDMuODctMS45Miw0Ljg3bC0uNjUuMzRoMFoiIHN0eWxlPSJmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7Ii8+PC9nPjwvc3ZnPg==",
  "Cocos": "data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTggMTgiIHN0eWxlPSJ3aWR0aDogNDBweDsgaGVpZ2h0OiA0MHB4OyI+PHJlY3Qgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBzdHlsZT0iZmlsbDogcmdiKDAsIDk4LCAyMjUpOyIvPjxnPjxwYXRoIGQ9Ik03LjQ5LDExLjYyYy0xLjM2LjAxLTIuNjEtLjY0LTMuMTgtMS44Mi0uMi0uNDMtLjMxLS45LS4zMS0xLjM3cy4xLS45NC4zMS0xLjM3Yy40MS0uOTEsMS4xMy0xLjY0LDIuMDMtMi4wN2wuNjYtLjMyLjY0LDEuMzMtLjY2LjMyYy0uNTguMjctMS4wNS43NS0xLjMzLDEuMzMtLjIyLjQ3LS4yMywxLjAyLS4wMSwxLjUuNDcuOTcsMS44NSwxLjI4LDMuMDcuNjlsLjY2LS4zMi42NCwxLjMzLS42Ni4zMmMtLjU4LjI4LTEuMjEuNDQtMS44Ni40NCIgc3R5bGU9ImZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsiLz48cGF0aCBkPSJNMTEuMDgsMTMuMzRsLS42Ny0xLjMxLjY1LS4zNGMxLjItLjYyLDEuNzgtMS45MSwxLjI4LTIuODdzLTEuODgtMS4yNS0zLjA4LS42M2wtLjY1LjM0LS42Ny0xLjMxLjY1LS4zNGMxLjkzLTEsNC4yLS40Miw1LjA3LDEuMjYuODcsMS42OSwwLDMuODctMS45Miw0Ljg3bC0uNjUuMzRoMFoiIHN0eWxlPSJmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7Ii8+PC9nPjwvc3ZnPg==",
  "Claro Pay": "data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTggMTgiIHN0eWxlPSJ3aWR0aDogNDBweDsgaGVpZ2h0OiA0MHB4OyI+PHJlY3Qgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBzdHlsZT0iZmlsbDogcmdiKDI1MCwgMjUwLCAyNTApOyIvPjxnPjxwYXRoIGQ9Ik0xMS44NCw1LjA5bC0yLjg1LDIuODYuNzUuNzUsMi44NS0yLjg2LS43NS0uNzVaIiBzdHlsZT0iZmlsbDogcmdiKDIzNSwgNTksIDQ3KTsiLz48cGF0aCBkPSJNNy43NCw0LjVoLTEuMDZ2My4wNmgxLjA2di0zLjA2WiIgc3R5bGU9ImZpbGw6IHJnYigyMzUsIDU5LCA0Nyk7Ii8+PHBhdGggZD0iTTcuMDcsOC41MmMtLjY3LDAtMS4yNS4yNC0xLjczLjczLS40OS40OS0uNzMsMS4wOC0uNzMsMS43NnMuMjQsMS4yOC43MywxLjc1Yy40OC40OSwxLjA2Ljc0LDEuNzMuNzRzMS4yNi0uMjUsMS43NS0uNzRjLjQ4LS40OC43Mi0xLjA3LjcyLTEuNzVzLS4yNC0xLjI4LS43Mi0xLjc2Yy0uNDktLjQ5LTEuMDgtLjczLTEuNzUtLjczWk03Ljk5LDExLjkzYy0uMjUuMjYtLjU2LjM4LS45Mi4zOHMtLjY2LS4xMy0uOTEtLjM4Yy0uMjUtLjI2LS4zOS0uNTctLjM5LS45MnMuMTQtLjY4LjM5LS45M2MuMjUtLjI2LjU2LS4zOS45MS0uMzguMzYtLjAxLjY3LjExLjkzLjM4LjI0LjI1LjM3LjU2LjM4LjkzLS4wMi4zNS0uMTQuNjYtLjM5LjkyWiIgc3R5bGU9ImZpbGw6IHJnYigyMzUsIDU5LCA0Nyk7Ii8+PHBhdGggZD0iTTEzLjM5LDEwLjJ2LS4zMWgtMy4xM3YxLjA2aDMuMTN2LS43NFoiIHN0eWxlPSJmaWxsOiByZ2IoMjM1LCA1OSwgNDcpOyIvPjwvZz48L3N2Zz4=",
  "SBS": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2aWV3Qm94PSIwIDAgMjggMjgiIHN0eWxlPSJ3aWR0aDogNDBweDsgaGVpZ2h0OiA0MHB4OyI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJsaW5lYXItZ3JhZGllbnQiIHgxPSI2LjkzIiB5MT0iOC45MyIgeDI9IjIxLjA3IiB5Mj0iMjMuMDciIGdyYWRpZW50VHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCAzMCkgc2NhbGUoMSAtMSkiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiNhMDZhMjgiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNmZGRlOGEiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iMjgiIGhlaWdodD0iMjgiLz48Zz48Zz48cGF0aCBkPSJNMTEuMDgsMTUuMDNjMC0uMTUtLjA2LS4yOS0uMTgtLjM4cy0uMzItLjE4LS42Mi0uMjZjLS4yOS0uMDktLjUzLS4xOC0uNy0uMjktLjQ3LS4yNi0uNy0uNTktLjctMS4wMywwLS4yMy4wNi0uNDEuMTgtLjU5cy4yOS0uMzIuNTMtLjQxLjUtLjE1Ljc5LS4xNS41Ni4wNi43OS4xNWMuMjMuMTIuNDEuMjYuNTMuNDQuMTIuMjEuMjEuNDEuMjEuNjhoLS44NWMwLS4xOC0uMDYtLjMyLS4xOC0uNDRzLS4yOS0uMTUtLjUtLjE1LS4zOC4wNi0uNS4xNWMtLjEyLjA5LS4xOC4yMS0uMTguMzVzLjA2LjIzLjIxLjM1Yy4xNS4wOS4zMi4xOC41OS4yNi41LjE1Ljg1LjMyLDEuMDYuNTMuMjMuMjEuMzIuNS4zMi43OSwwLC4zNS0uMTUuNjUtLjQxLjg1cy0uNjUuMjktMS4wOS4yOWMtLjMyLDAtLjYyLS4wNi0uODgtLjE4LS4yNi0uMTItLjQ3LS4yNi0uNTktLjQ3cy0uMjEtLjQ0LS4yMS0uN2guODVjMCwuNDcuMjYuNjguODIuNjguMjEsMCwuMzUtLjAzLjQ3LS4xMi4xOC0uMDkuMjMtLjIxLjIzLS4zNVoiIGZpbGw9IiNmZmYiLz48cGF0aCBkPSJNMTIuNTIsMTYuMTF2LTQuMTRoMS40NGMuNSwwLC44OC4wOSwxLjE1LjI5cy4zOC40Ny4zOC44NWMwLC4yMS0uMDYuMzgtLjE1LjUzLS4xMi4xNS0uMjMuMjYtLjQ0LjM1LjIxLjA2LjM4LjE1LjUuMzIuMTIuMTUuMTguMzUuMTguNTksMCwuNDEtLjEyLjctLjM4LjkxLS4yNi4yMS0uNjIuMzItMS4wOS4zMmgtMS41OXYtLjAzWk0xMy4zNywxMy43MWguNjJjLjQ0LDAsLjY1LS4xOC42NS0uNTMsMC0uMTgtLjA2LS4zMi0uMTgtLjQxLS4xMi0uMDktLjI5LS4xMi0uNTMtLjEyaC0uNTl2MS4wNmguMDNaTTEzLjM3LDE0LjI5djEuMTJoLjczYy4yMSwwLC4zNS0uMDYuNDctLjE1LjEyLS4wOS4xOC0uMjMuMTgtLjM4LDAtLjM4LS4yMS0uNTYtLjU5LS41OWgtLjc5WiIgZmlsbD0iI2ZmZiIvPjxwYXRoIGQ9Ik0xOC4zNiwxNS4wM2MwLS4xNS0uMDYtLjI5LS4xOC0uMzgtLjEyLS4wOS0uMzItLjE4LS42Mi0uMjYtLjI5LS4wOS0uNTMtLjE4LS43LS4yOS0uNDctLjI2LS43LS41OS0uNy0xLjAzLDAtLjIzLjA2LS40MS4xOC0uNTkuMTItLjE4LjI5LS4zMi41My0uNDFzLjUtLjE1Ljc5LS4xNS41Ni4wNi43OS4xNWMuMjMuMTIuNDEuMjYuNTMuNDQuMTIuMjEuMjEuNDEuMjEuNjhoLS44NWMwLS4xOC0uMDYtLjMyLS4xOC0uNDQtLjEyLS4xMi0uMjktLjE1LS41LS4xNXMtLjM4LjA2LS41LjE1LS4xOC4yMS0uMTguMzUuMDYuMjMuMjEuMzVjLjE1LjA5LjMyLjE4LjU5LjI2LjUuMTUuODUuMzIsMS4wNi41My4yMy4yMS4zMi41LjMyLjc5LDAsLjM1LS4xNS42NS0uNDEuODVzLS42NS4yOS0xLjA5LjI5Yy0uMzIsMC0uNjItLjA2LS44OC0uMTgtLjI2LS4xMi0uNDctLjI2LS41OS0uNDctLjE1LS4yMS0uMjEtLjQ0LS4yMS0uN2guODVjMCwuNDcuMjYuNjguODIuNjguMjEsMCwuMzUtLjAzLjQ3LS4xMi4xOC0uMDkuMjMtLjIxLjIzLS4zNVoiIGZpbGw9IiNmZmYiLz48L2c+PHBhdGggZD0iTTEzLjk5LDMuOTl2MS43M2MyLjIsMCw0LjI5Ljg1LDUuODQsMi40NHMyLjQ0LDMuNjQsMi40NCw1Ljg0LS44NSw0LjI5LTIuNDQsNS44NC0zLjY0LDIuNDQtNS44NCwyLjQ0LTQuMjktLjg1LTUuODQtMi40NC0yLjQxLTMuNjQtMi40MS01Ljg0Ljg1LTQuMjksMi40NC01Ljg0YzEuNTYtMS41NiwzLjY0LTIuNDQsNS44NC0yLjQ0di0xLjczTTEzLjk5LDMuOTljLTUuNTIsMC05Ljk5LDQuNDktOS45OSwxMC4wMXM0LjQ5LDEwLjAxLDEwLjAxLDEwLjAxLDkuOTktNC40OSw5Ljk5LTEwLjAxUzE5LjUxLDMuOTksMTMuOTksMy45OWgwWiIgZmlsbD0idXJsKCNsaW5lYXItZ3JhZGllbnQpIi8+PC9nPjwvc3ZnPg==",
  "Delta": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyOCAyOCIgc3R5bGU9IndpZHRoOiA0MHB4OyBoZWlnaHQ6IDQwcHg7Ij48cmVjdCB3aWR0aD0iMjgiIGhlaWdodD0iMjgiIGZpbGw9IiMwOTQxYTUiLz48cGF0aCBkPSJNMTcuODcsOS43M2MtMS4yMS4zLTIuNDMuNi0zLjY0LjktMi4zNC41OC00LjY5LDEuMTUtNy4wMiwxLjc2LS41My4xNC0uNzEuMDYtLjctLjUxLjAyLTEuNTkuMDItMy4xOCwwLTQuNzcsMC0uNS4xOC0uNjMuNjUtLjYyLDIuNDkuMDIsNC45OC0uMDIsNy40Ny4wMiwzLjQ0LjA1LDYuMywyLjY2LDYuNzgsNi4xMi4zNiwyLjY0LS4xOSw1LTIuMTIsNi45Mi0xLjI4LDEuMjgtMi44OCwxLjkxLTQuNjcsMS45NC0yLjQuMDQtNC44LjAxLTcuMTksMC0uMTksMC0uMzgtLjEtLjU2LS4xNS4xLS4xOS4xNy0uNDEuMzEtLjU2LDMuNDUtMy40Niw2LjkxLTYuOTIsMTAuMzYtMTAuMzguMTYtLjE2LjMtLjM1LjQ2LS41Mi0uMDMtLjA1LS4wNy0uMS0uMS0uMTZaIiBmaWxsPSIjZmZmIi8+PC9zdmc+",
  "Carrefour Banco": "https://api.argentinadatos.com/static/logos/carrefour-banco.png",
  "Mercado Fondo": "https://api.argentinadatos.com/static/logos/mercado-pago.png",
  "Global66": "https://api.argentinadatos.com/static/logos/global66.svg",
  "LB Finanzas": "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTggMTgiPgogIDxyZWN0IHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgc3R5bGU9ImZpbGw6ICM1MjIzOTg7Ii8+CiAgPGc+CiAgICA8cGF0aCBkPSJNNi43MSw3Ljc3bC4zOS40OWMuNTIuNjQsMS4xMS45NiwxLjc1Ljk2LDEuMTksMCwyLjI3LTEuMTIsMi4zOS0xLjMxLDAsLjAyLDAsMCwuMDMtLjA1LTEuNDUtLjkyLTIuODktMS44NC00LjMzLTIuNzctLjI0LS4xNS0uNDgtLjIzLS43Mi0uMDUtLjI0LjE5LS4yMi40My0uMTQuNy4yMi42OC40MywxLjM1LjYzLDIuMDNaIiBzdHlsZT0iZmlsbDogI2ZmZjsiLz4KICAgIDxwYXRoIGQ9Ik0xMiw5LjExYzAsLjM2LS4yLjctLjUxLjg4LTEuNDcuOTUtMi45NiwxLjg5LTQuNDMsMi44NC0uMDcuMDUtLjE0LjA5LS4yMi4xNC0uMTguMTQtLjQ0LjE0LS42MiwwLS4xOS0uMTQtLjI2LS4zOS0uMTgtLjYxLjExLS40LjIzLS43OS4zNi0xLjE5LjE4LS41Ny4zOC0xLjEyLjUtMS43LjA3LS4zLjA3LS42MSwwLS45MSwyLjExLDIuNTksNC42OS0uMzYsNC41OS0uNDMuMzQuMjIuNTEuNTMuNTEuOThaIiBzdHlsZT0iZmlsbDogI2ZmZjsiLz4KICA8L2c+Cjwvc3ZnPg==",
  "Pellegrini": "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTggMTgiPgogIDxyZWN0IHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgc3R5bGU9ImZpbGw6ICMwMDVmODY7Ii8+CiAgPGc+CiAgICA8cGF0aCBkPSJNOSw0Yy0yLjc2LDAtNSwyLjI0LTUsNXMyLjI0LDUsNSw1LDUtMi4yNCw1LTUtMi4yNC01LTUtNVpNMTEuODIsMTEuOXMwLC4wMS0uMDEuMDFoLTUuNnMtLjAxLDAtLjAxLS4wMXYtLjU2czAtLjAxLjAxLS4wMWg1LjZzLjAxLDAsLjAxLjAxdi41NmgwWk04LjA0LDEwLjQzdi0yLjg0aC42NHYyLjg0aC42M3YtMi44NGguNjR2Mi44NGguNjR2LTIuODRoLjY0djIuODRoLjI5di41OHMwLC4wMS0uMDEuMDFoLTUuMDJzLS4wMSwwLS4wMS0uMDF2LS41OGguMjh2LTIuODRoLjY0djIuODRoLjY0LDBaTTEyLjAxLDYuOTlsLS4xOC4zMXMtLjAyLjAyLS4wMy4wMmgtNS41OXMtLjAyLDAtLjAzLS4wMmwtLjE4LS4zMXMwLS4wMiwwLS4wM2wyLjk4LTEuNThzLjAzLDAsLjA0LDBsMi45OCwxLjU4cy4wMS4wMiwwLC4wM2gwWiIgc3R5bGU9ImZpbGw6ICNmZmY7Ii8+CiAgICA8cGF0aCBkPSJNMTAuNDQsNi43OGwtMS40LS42OHMtLjAyLS4wMS0uMDMtLjAxYzAsMC0uMDIsMC0uMDMsMGwtMS40Mi42OXMwLDAsMCwwaDIuODhzLjAxLDAsMCwwWiIgc3R5bGU9ImZpbGw6ICNmZmY7Ii8+CiAgPC9nPgo8L3N2Zz4=",
};

function lookupLogoURL(name) {
  if (!name) return null;
  if (ENTITY_LOGOS[name]) return ENTITY_LOGOS[name];
  if (LOGO_IMG[name]) return LOGO_IMG[name];
  if (PLAZO_FIJO_LOGOS[name]) return PLAZO_FIJO_LOGOS[name];
  if (HIPOTECARIO_LOGOS[name]) return HIPOTECARIO_LOGOS[name];
  // Case-insensitive exact match
  const lower = name.toLowerCase();
  for (const map of [ENTITY_LOGOS, LOGO_IMG, PLAZO_FIJO_LOGOS, HIPOTECARIO_LOGOS]) {
    for (const k of Object.keys(map)) {
      if (k.toLowerCase() === lower) return map[k];
    }
  }
  // Partial brand matches (handles "Cocos Ahorro" → "Cocos", "Ualá Plus 2" → "Ualá", etc.)
  if (lower.startsWith('ualá') || lower.startsWith('uala')) return ENTITY_LOGOS['Ualá'];
  if (lower.includes('cocos ahorro')) return ENTITY_LOGOS['Cocos Ahorro'];
  if (lower.includes('cocos')) return ENTITY_LOGOS['Cocos'];
  if (lower.includes('fiwind')) return ENTITY_LOGOS['Fiwind'];
  if (lower.includes('mercado')) return ENTITY_LOGOS['Mercado Fondo'];
  if (lower.includes('pellegrini') || /naci[oó]n/.test(lower)) return ENTITY_LOGOS['Pellegrini'];
  if (lower.includes('global66')) return ENTITY_LOGOS['Global66'];
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
  const parts = [];
  let sepInserted = false;
  for (const item of NAV) {
    // Separador visual justo antes del primer item secundario
    if (item.tier === 'sec' && !sepInserted) {
      parts.push('<span class="nav-sep" aria-hidden="true">│</span>');
      sepInserted = true;
    }
    const secCls = item.tier === 'sec' ? ' sec' : '';
    if (item.href) {
      parts.push(`<a href="${esc(item.href)}" class="tty-nav-ext${secCls}"><button>${esc(item.label)}</button></a>`);
    } else {
      const onCls = STATE.section.main === item.k ? ' on' : '';
      parts.push(`<button data-nav="${esc(item.k)}" class="${(onCls + secCls).trim()}">${esc(item.label)}</button>`);
    }
  }
  nav.innerHTML = parts.join('');
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
  // Backward-compat: '#mundo' y '#mundo.xxx' del diseño anterior → 'monitor.mundo'
  if (main === 'mundo') return { main: 'monitor', sub: 'mundo' };
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
// Orden de categorías para Mundo (de más "core" a más "riesgo"):
// equity → rates → commodities → FX → crypto. Energía/Metales/Agro separados
// para que BRENT + WTI queden juntos en su propia sección.
const MUNDO_CATEGORIES = ['Índices', 'Tasas', 'Energía', 'Metales', 'Agro', 'Monedas', 'Crypto'];

// Prioridad de orden DENTRO de cada categoría. Menor número = primero.
// Items sin entrada caen a 99 (se ordenan después, alfabéticamente por sym como tie-break).
const MUNDO_ORDER = {
  // Índices — por capitalización/relevancia
  SPX: 0, NASDAQ: 1, DOW: 2,
  // Tasas — por tenor ascendente (5Y → 10Y → 30Y)
  US5Y: 0, TNX: 1, US10Y: 1, US30Y: 2,
  // Energía — crudo juntos, después refinados
  OIL: 0, WTI: 0, BRENT: 1, GASOLINE: 2,
  // Metales — preciosos primero, industriales después
  GOLD: 0, SILVER: 1, COPPER: 2,
  // Agro — granos core
  SOY: 0, WHEAT: 1, CORN: 2,
  // Monedas — EUR mayor, después LatAm
  EURUSD: 0, USDMXN: 1, USDBRL: 2,
  // Crypto — por capitalización
  BTC: 0, ETH: 1, AVAX: 2,
};

// ─── Monitor router: mundo (internacional) | argy (argentina) ──
async function screenMonitor(main, sub) {
  const current = sub || 'mundo';
  if (current === 'argy') return screenArgy(main);
  return screenMundo(main);
}

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
  // Default sort 'ord' = orden natural configurado en MUNDO_ORDER (WTI antes que BRENT, etc.)
  const state = { sort: { k: 'ord', dir: 'asc' }, sel: null };

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
        const dir = state.sort.dir === 'asc' ? 1 : -1;
        let cmp;
        if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
        else cmp = String(va || '').localeCompare(String(vb || ''));
        // Tiebreaker por sym asc para orden estable (útil cuando hay muchos 'ord'=99)
        if (cmp === 0 && state.sort.k !== 'sym') {
          return String(a.sym || '').localeCompare(String(b.sym || ''));
        }
        return dir * cmp;
      });
      rows.push(`<tr class="cat"><td colspan="5">── ${cat.toLowerCase()} <span class="line">────────────────────────────────────────────────────</span></td></tr>`);
      for (const r of items) {
        const isSel = state.sel === r.sym;
        rows.push(`<tr class="clickable${isSel ? ' sel' : ''}" data-sym="${esc(r.sym)}">
          <td class="mundo-ins"><span class="hot">${esc(r.sym)}</span> <span class="dim ins-name">${esc(r.name)}</span></td>
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
        <th data-col="sym" style="text-align:left">instrumento ${arr('sym')}</th>
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
    'Índices': 'Índices',
    'Indices': 'Índices',
    'Tasas': 'Tasas',
    'Rates': 'Tasas',
    'Monedas': 'Monedas',
    'FX': 'Monedas',
    'Energía': 'Energía',
    'Energy': 'Energía',
    'Metales': 'Metales',
    'Metals': 'Metales',
    'Agro': 'Agro',
    // Fallback para fuentes viejas que mandan todo como Commodities:
    // lo ruteamos a Energía por default (WTI/Brent son los principales) y
    // dejamos que el reorder las separe si hace falta
    'Commodities': 'Energía',
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
  // Tasas (UST 10Y, UST 30Y, etc.) are already in % → render as "4.27%" not "4.27"
  const pct = bucket === 'Tasas' || !!a.pct;
  // Decimals hint: crypto & tasas use 2; monedas (FX) uses 4; default 2
  let d = a.d;
  if (d == null) {
    if (bucket === 'Monedas') d = 4;
    else if (bucket === 'Tasas') d = 2;
    else if (Math.abs(last) >= 1000) d = 0;
    else if (Math.abs(last) >= 100) d = 1;
    else d = 2;
  }
  // Orden natural dentro de la categoría (ver MUNDO_ORDER). Items sin entry → 99.
  const ord = MUNDO_ORDER[sym] != null ? MUNDO_ORDER[sym] : 99;
  return { sym, name, last, chg, ytd, sp: sp || [], pct, d, ord };
}

// ─── Screen: Argy — Monitor Argentina (FX, tasas, macro) ────────
// Curated dashboard con las variables que más se miran: dólar (mayorista,
// minorista, MEP, CCL, blue, cripto), tasas (TAMAR, BADLAR, depósitos,
// préstamos), macro (riesgo país, inflación, reservas) y monetario.
// Fuente: /api/cotizaciones (oficial+MEP+CCL+riesgo), /api/dolar
// (blue/cripto/USDT), /api/bcra (todo lo demás).
async function screenArgy(main) {
  main.innerHTML = pHd('monitor · argy',
    'Monitor Argentina',
    'Cotizaciones, tasas y macro de Argentina en una sola pantalla. Datos BCRA + comparadolar + argentinadatos.')
    + `<section class="s"><h2><span>pulse · hoy</span><span class="line"></span></h2><div id="argy-hero" class="argy-hero"><div class="loading-row"> cargando…</div></div></section>`
    + `<section class="s"><h2><span>dólar · brecha vs oficial</span><span class="line"></span></h2><div id="argy-fx"><div class="loading-row"> cargando…</div></div></section>`
    + `<section class="s"><h2><span>tasas · rendimiento pesos</span><span class="line"></span></h2><div id="argy-rates"><div class="loading-row"> cargando…</div></div></section>`
    + `<section class="s"><h2><span>macro</span><span class="line"></span></h2><div id="argy-macro"><div class="loading-row"> cargando…</div></div></section>`
    + `<section class="s"><h2><span>monetario</span><span class="line"></span></h2><div id="argy-mon" class="kline"><div class="loading-row"> cargando…</div></div></section>`
    + `<p class="hint" style="margin-top:12px">Fuentes: BCRA (tasas, inflación, reservas, monetario) · argentinadatos (riesgo país, MEP, CCL) · comparadolar (blue, cripto/USDT). Actualizados cada 5 min.</p>`;

  try {
    const [cot, bcra, dol] = await Promise.all([
      fetchCached('/api/cotizaciones', 60_000).catch(() => ({})),
      fetchCached('/api/bcra', 300_000).catch(() => ({ data: [] })),
      fetchCached('/api/dolar', 60_000).catch(() => ({ exchanges: {} })),
    ]);

    const bcraList = Array.isArray(bcra.data) ? bcra.data : [];
    const findVar = (q) => bcraList.find(v => String(v.nombre || '').toLowerCase().includes(q.toLowerCase()));
    // % change entre valor actual y anterior (BCRA trae ambos)
    const varPct = (v) => {
      if (!v) return null;
      const cur = +v.valor, prev = +v.valorAnterior;
      if (!isFinite(cur) || !isFinite(prev) || prev === 0) return null;
      return (cur - prev) / Math.abs(prev) * 100;
    };
    // Cambio en puntos porcentuales (para tasas e inflación que ya vienen en %)
    const varPP = (v) => {
      if (!v) return null;
      const cur = +v.valor, prev = +v.valorAnterior;
      if (!isFinite(cur) || !isFinite(prev)) return null;
      return cur - prev;
    };
    const chgCell = (pct, digits = 2) => {
      if (pct == null) return '<td class="num dim">—</td>';
      return `<td class="num ${signClass(pct)}">${arrow(pct)} ${fmtPct(pct, digits)}</td>`;
    };

    // ─── Dólar: calcular todas las cotizaciones ───
    const usdArr = (dol.exchanges && dol.exchanges.usd) || [];
    const usdtArr = (dol.exchanges && dol.exchanges.usdt) || [];
    const nonBanks = usdArr.filter(e => !e.isBank && e.is24x7 && e.ask > 0);
    const avgBlueAsk = nonBanks.length ? nonBanks.reduce((a, b) => a + b.ask, 0) / nonBanks.length : null;
    const usdtValid = usdtArr.filter(e => e.ask > 0);
    const avgUsdt = usdtValid.length ? usdtValid.reduce((a, b) => a + b.ask, 0) / usdtValid.length : null;

    const mayoristaVar = findVar('mayorista');
    const minoristaVar = findVar('minorista');
    const cot_oficial = (cot.oficial && cot.oficial.price) || (mayoristaVar ? +mayoristaVar.valor : null);
    const prev_oficial = cot.oficial && cot.oficial.prevClose;
    const chgOficial = (cot_oficial && prev_oficial) ? ((cot_oficial - prev_oficial) / prev_oficial) * 100 : varPct(mayoristaVar);
    const cot_mep = cot.mep && cot.mep.price;
    const cot_ccl = cot.ccl && cot.ccl.price;
    const brecha = (v) => (v && cot_oficial) ? ((v / cot_oficial - 1) * 100) : null;

    // ─── Hero strip: 3 números que todos miran ───
    const riesgo = (cot.riesgoPais && cot.riesgoPais.value) || null;
    const inflMes = findVar('Inflación Mensual');
    const heroCard = (lbl, val, sub, cls = '') => `<div class="argy-hero-card ${cls}">
      <div class="lbl">${esc(lbl)}</div>
      <div class="val">${val}</div>
      <div class="sub">${sub}</div>
    </div>`;
    const brechaMep = brecha(cot_mep);
    $('#argy-hero').innerHTML = [
      heroCard('dólar MEP',
        cot_mep ? '$' + fmt(cot_mep, 2) : '—',
        brechaMep != null ? `brecha oficial ${fmtPct(brechaMep, 1)}` : 'AL30 / AL30D'),
      heroCard('riesgo país',
        riesgo != null ? fmt(riesgo, 0) + ' <small>bps</small>' : '—',
        'EMBI Argentina'),
      heroCard('inflación mensual',
        inflMes ? fmt(+inflMes.valor, 1) + '%' : '—',
        inflMes ? 'IPC · ' + esc(inflMes.fecha || '') : 'IPC'),
    ].join('');

    // ─── Tabla dólar ───
    const fxRows = [
      { name: 'Mayorista', sub: 'BCRA referencia', price: cot_oficial, chg: chgOficial, brechaRaw: 0 },
      { name: 'Minorista', sub: 'BCRA vendedor', price: minoristaVar ? +minoristaVar.valor : null, chg: varPct(minoristaVar), brechaRaw: brecha(minoristaVar ? +minoristaVar.valor : null) },
      { name: 'MEP', sub: 'AL30 / AL30D', price: cot_mep, chg: null, brechaRaw: brecha(cot_mep) },
      { name: 'CCL', sub: 'AL30 / AL30C', price: cot_ccl, chg: null, brechaRaw: brecha(cot_ccl) },
      { name: 'Blue', sub: nonBanks.length ? `promedio ${nonBanks.length} exch.` : 'sin datos', price: avgBlueAsk, chg: null, brechaRaw: brecha(avgBlueAsk) },
      { name: 'Cripto · USDT', sub: usdtValid.length ? `promedio ${usdtValid.length} exch.` : 'sin datos', price: avgUsdt, chg: null, brechaRaw: brecha(avgUsdt) },
    ];
    $('#argy-fx').innerHTML = `<table class="t">
      <thead><tr>
        <th style="text-align:left">tipo</th>
        <th>cotización</th>
        <th>var día</th>
        <th>brecha oficial</th>
      </tr></thead>
      <tbody>${fxRows.map(r => `<tr>
        <td><span class="hot">${esc(r.name)}</span> <span class="dim" style="margin-left:6px;font-size:11px">${esc(r.sub)}</span></td>
        <td class="num">${r.price != null ? '$' + fmt(r.price, 2) : '—'}</td>
        ${chgCell(r.chg, 2)}
        <td class="num ${r.brechaRaw == null ? 'dim' : r.brechaRaw === 0 ? 'dim' : 'hot'}">${r.brechaRaw == null ? '—' : r.brechaRaw === 0 ? 'baseline' : fmtPct(r.brechaRaw, 1)}</td>
      </tr>`).join('')}</tbody>
    </table>`;

    // ─── Tabla tasas ───
    const tamarTna = findVar('TAMAR Privados (TNA)');
    const tamarTea = findVar('TAMAR Privados (TEA)');
    const badlarTna = findVar('BADLAR Privados (TNA)');
    const badlarTea = findVar('BADLAR Privados (TEA)');
    const dep30 = findVar('Depósitos 30');
    const presPer = findVar('Préstamos Personales');
    const adelCC = findVar('Adelantos');
    const baibar = findVar('BAIBAR');

    const rateRow = (name, sub, tna, tea) => ({
      name, sub,
      tnaVal: tna ? +tna.valor : null,
      teaVal: tea ? +tea.valor : null,
      chg: varPP(tna),
    });
    const rateRows = [
      rateRow('TAMAR', 'privados · plazo fijo mayorista', tamarTna, tamarTea),
      rateRow('BADLAR', 'privados · plazo fijo >1M', badlarTna, badlarTea),
      rateRow('Caución · BAIBAR', 'interbancaria', baibar, null),
      rateRow('Depósitos 30d', 'promedio sistema', dep30, null),
      rateRow('Préstamos personales', 'promedio sistema', presPer, null),
      rateRow('Adelantos cta cte', 'promedio sistema', adelCC, null),
    ];
    $('#argy-rates').innerHTML = `<table class="t">
      <thead><tr>
        <th style="text-align:left">tasa</th>
        <th>TNA</th>
        <th>TEA</th>
        <th>var día (pp)</th>
      </tr></thead>
      <tbody>${rateRows.map(r => `<tr>
        <td><span class="hot">${esc(r.name)}</span> <span class="dim" style="margin-left:6px;font-size:11px">${esc(r.sub)}</span></td>
        <td class="num">${r.tnaVal != null ? fmt(r.tnaVal, 2) + '%' : '—'}</td>
        <td class="num ${r.teaVal != null ? '' : 'dim'}">${r.teaVal != null ? fmt(r.teaVal, 2) + '%' : '—'}</td>
        ${r.chg == null ? '<td class="num dim">—</td>' : `<td class="num ${signClass(r.chg)}">${arrow(r.chg)} ${fmt(r.chg, 2)} pp</td>`}
      </tr>`).join('')}</tbody>
    </table>`;

    // ─── Tabla macro ───
    const inflYoY = findVar('Inflación Interanual');
    const inflEsp = findVar('Inflación Esperada');
    const reservas = findVar('Reservas Internacionales');
    const reservasMUsd = reservas ? +reservas.valor : null;

    $('#argy-macro').innerHTML = `<table class="t">
      <thead><tr>
        <th style="text-align:left">variable</th>
        <th>valor</th>
        <th>var</th>
        <th style="text-align:left">actualizado</th>
      </tr></thead>
      <tbody>
        <tr>
          <td><span class="hot">Riesgo país</span> <span class="dim" style="margin-left:6px;font-size:11px">EMBI Argentina</span></td>
          <td class="num">${riesgo != null ? fmt(riesgo, 0) + ' bps' : '—'}</td>
          <td class="num dim">—</td>
          <td class="dim">hoy · argentinadatos</td>
        </tr>
        <tr>
          <td><span class="hot">Inflación mensual</span> <span class="dim" style="margin-left:6px;font-size:11px">IPC INDEC</span></td>
          <td class="num">${inflMes ? fmt(+inflMes.valor, 1) + '%' : '—'}</td>
          ${(() => { const pp = varPP(inflMes); return pp == null ? '<td class="num dim">—</td>' : `<td class="num ${signClass(pp)}">${arrow(pp)} ${fmt(pp, 1)} pp</td>`; })()}
          <td class="dim">${inflMes ? esc(inflMes.fecha || '') : '—'}</td>
        </tr>
        <tr>
          <td><span class="hot">Inflación interanual</span> <span class="dim" style="margin-left:6px;font-size:11px">IPC YoY</span></td>
          <td class="num">${inflYoY ? fmt(+inflYoY.valor, 1) + '%' : '—'}</td>
          ${(() => { const pp = varPP(inflYoY); return pp == null ? '<td class="num dim">—</td>' : `<td class="num ${signClass(pp)}">${arrow(pp)} ${fmt(pp, 1)} pp</td>`; })()}
          <td class="dim">${inflYoY ? esc(inflYoY.fecha || '') : '—'}</td>
        </tr>
        <tr>
          <td><span class="hot">Expectativa 12m</span> <span class="dim" style="margin-left:6px;font-size:11px">REM · relevamiento</span></td>
          <td class="num">${inflEsp ? fmt(+inflEsp.valor, 1) + '%' : '—'}</td>
          ${(() => { const pp = varPP(inflEsp); return pp == null ? '<td class="num dim">—</td>' : `<td class="num ${signClass(pp)}">${arrow(pp)} ${fmt(pp, 1)} pp</td>`; })()}
          <td class="dim">${inflEsp ? esc(inflEsp.fecha || '') : '—'}</td>
        </tr>
        <tr>
          <td><span class="hot">Reservas brutas</span> <span class="dim" style="margin-left:6px;font-size:11px">BCRA</span></td>
          <td class="num">${reservasMUsd != null ? 'USD ' + fmt(reservasMUsd / 1000, 1) + ' MM' : '—'}</td>
          ${chgCell(varPct(reservas), 2)}
          <td class="dim">${reservas ? esc(reservas.fecha || '') : '—'}</td>
        </tr>
      </tbody>
    </table>`;

    // ─── Monetario (kline compacto) ───
    const baseMon = findVar('Base Monetaria');
    const deps = findVar('Depósitos en EF');
    const prestSP = findVar('Préstamos al Sector Privado');
    const m2Yoy = findVar('M2 Privado');
    const fmtARS = (v) => v >= 1e6 ? '$' + fmt(v / 1e6, 2) + ' B' : '$' + fmt(v / 1000, 1) + ' M';
    const klineK = (lbl, val, chgTxt, chgCls) => `<div class="k">
      <div class="lbl">${esc(lbl)}</div>
      <div class="val">${val}</div>
      <div class="chg ${chgCls || 'dim'}">${chgTxt}</div>
    </div>`;
    const klineChg = (v) => {
      const p = varPct(v);
      if (p == null) return { txt: '—', cls: 'dim' };
      return { txt: `${arrow(p)} ${fmtPct(p, 2)}`, cls: signClass(p) };
    };
    const ch1 = klineChg(baseMon);
    const ch2 = klineChg(deps);
    const ch3 = klineChg(prestSP);
    $('#argy-mon').innerHTML = [
      klineK('base monetaria', baseMon ? fmtARS(+baseMon.valor) : '—', ch1.txt, ch1.cls),
      klineK('depósitos EF', deps ? fmtARS(+deps.valor) : '—', ch2.txt, ch2.cls),
      klineK('préstamos S. priv.', prestSP ? fmtARS(+prestSP.valor) : '—', ch3.txt, ch3.cls),
      klineK('M2 priv. YoY', m2Yoy ? fmt(+m2Yoy.valor, 1) + '%' : '—', 'var. interanual', 'dim'),
    ].join('');
  } catch (e) {
    $('#argy-hero').innerHTML = `<div class="empty-state"><span class="down">ERROR</span> ${esc(e.message)}</div>`;
  }
}

// ─── Stubs (overridable per phase) ────────────────────────────
function stubScreen(main, { tag, title, sub, message = 'En construcción — próxima fase.' }) {
  main.innerHTML = pHd(tag, title, sub) + `<div class="empty-state">${esc(message)}</div>`;
}

// Logos de US stocks via svvytrdr CDN (compartido por Mundo, CEDEARs y /earnings)
const SVVY_LOGO = (sym) => `https://static.svvytrdr.com/logos/${encodeURIComponent(sym)}.webp`;

// ─── Screen: CEDEARs (MEP / CCL implícito, tabla completa) ────
// Helpers para sort/export de CEDEARs (portados de PR #30).
function _cmpNullable(a, b, dir) {
  const aV = typeof a === 'number' && Number.isFinite(a);
  const bV = typeof b === 'number' && Number.isFinite(b);
  if (!aV && !bV) return 0;
  if (!aV) return 1;       // nulls last siempre
  if (!bV) return -1;
  if (a === b) return 0;
  return a < b ? -dir : dir;
}
function _parseRatio(ratio) {
  if (ratio == null) return null;
  const raw = String(ratio).trim();
  if (!raw) return null;
  if (raw.includes(':')) {
    const [l, r] = raw.split(':');
    const ln = Number(l), rn = Number(r);
    if (Number.isFinite(ln) && Number.isFinite(rn) && rn !== 0) return ln / rn;
  }
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function _csvEscape(v) {
  const raw = v == null ? '' : String(v);
  return `"${raw.replace(/"/g, '""')}"`;
}
function _csvNum(v) {
  return Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : '';
}

async function screenCedears(main) {
  main.innerHTML = pHd('cedears · byma', 'CEDEARs', 'Acciones USA listadas en BYMA. Precio ARS + especie D (MEP) + especie C (CCL) + subyacente USD → MEP y CCL implícitos.')
    + `<section class="s"><h2><span>implícitos promedio</span><span class="line"></span></h2><div id="ced-impl" class="kline"><div class="loading-row"> calculando…</div></div></section>`
    + `<section class="s"><h2><span>tabla completa</span><span class="line"></span><span class="count" id="ced-count">…</span></h2>
        <div class="dol-controls">
          <input id="ced-search" placeholder="buscar ticker o empresa…" class="ced-search"/>
          <button type="button" id="ced-csv" class="ced-csv" disabled>↓ csv</button>
        </div>
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
          tickerD: x.ticker_d || null, tickerC: x.ticker_c || null, tickerUsa: x.ticker_usa || null,
          priceArs, priceD, priceC, priceUsd,
          impliedMep: priceD ? priceArs / priceD : null,
          impliedCcl: priceC ? priceArs / priceC : null,
        };
      })
      .filter(Boolean);

    const NUMERIC_KEYS = new Set(['priceArs','priceD','priceC','priceUsd','impliedMep','impliedCcl']);
    const state = { filter: '', sortKey: 'ticker', sortDir: 'asc', lastVisible: [] };

    function sortList(list) {
      const dir = state.sortDir === 'desc' ? -1 : 1;
      const arr = list.slice();
      const k = state.sortKey;
      arr.sort((a, b) => {
        if (k === 'ticker') return dir * String(a.ticker || '').localeCompare(String(b.ticker || ''), 'en-US');
        if (k === 'ratio') {
          const c = _cmpNullable(_parseRatio(a.ratio), _parseRatio(b.ratio), dir);
          if (c !== 0) return c;
          return dir * String(a.ratio || '').localeCompare(String(b.ratio || ''), 'en-US');
        }
        if (NUMERIC_KEYS.has(k)) {
          const c = _cmpNullable(a[k], b[k], dir);
          if (c !== 0) return c;
          return String(a.ticker || '').localeCompare(String(b.ticker || ''), 'en-US');
        }
        return dir * String(a.ticker || '').localeCompare(String(b.ticker || ''), 'en-US');
      });
      return arr;
    }

    function compute() {
      const f = state.filter.trim().toUpperCase();
      const filtered = f ? items.filter(r => r.ticker.toUpperCase().includes(f) || String(r.name || '').toUpperCase().includes(f)) : items;
      return sortList(filtered);
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

    function arrow(k) {
      if (state.sortKey !== k) return '<span class="ced-arr"></span>';
      return `<span class="ced-arr act">${state.sortDir === 'asc' ? '▲' : '▼'}</span>`;
    }

    function renderTable() {
      const list = compute();
      state.lastVisible = list;
      $('#ced-count').textContent = list.length;
      renderImpl(list);
      const csvBtn = $('#ced-csv');
      if (csvBtn) csvBtn.disabled = !list.length;
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
      $('#ced-tbl').innerHTML = `<table class="t ced-sortable">
        <thead><tr>
          <th style="text-align:left"><button type="button" class="ced-th" data-sk="ticker">activo ${arrow('ticker')}</button></th>
          <th><button type="button" class="ced-th right" data-sk="priceArs">ars ${arrow('priceArs')}</button></th>
          <th><button type="button" class="ced-th right" data-sk="priceD">d (usd) ${arrow('priceD')}</button></th>
          <th><button type="button" class="ced-th right" data-sk="priceC">c (usd) ${arrow('priceC')}</button></th>
          <th><button type="button" class="ced-th right" data-sk="priceUsd">subyac. ${arrow('priceUsd')}</button></th>
          <th><button type="button" class="ced-th right" data-sk="impliedMep">mep impl. ${arrow('impliedMep')}</button></th>
          <th><button type="button" class="ced-th right" data-sk="impliedCcl">ccl impl. ${arrow('impliedCcl')}</button></th>
          <th><button type="button" class="ced-th right" data-sk="ratio">ratio ${arrow('ratio')}</button></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>${list.length > 400 ? `<div class="hint" style="margin-top:8px">mostrando primeros 400 de ${list.length} — usá la búsqueda para filtrar</div>` : ''}`;
    }

    function downloadCsv() {
      const list = state.lastVisible;
      if (!list || !list.length) return;
      const headers = ['ticker','name','ratio','price_ars','price_d','price_c','price_usa','implied_mep_ars','implied_ccl_ars','ticker_d','ticker_c','ticker_usa'];
      const body = list.map(r => [
        r.ticker, r.name, r.ratio,
        _csvNum(r.priceArs), _csvNum(r.priceD), _csvNum(r.priceC), _csvNum(r.priceUsd),
        _csvNum(r.impliedMep), _csvNum(r.impliedCcl),
        r.tickerD || '', r.tickerC || '', r.tickerUsa || '',
      ]);
      const csv = [headers, ...body].map(row => row.map(_csvEscape).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url; a.download = `cedears-${date}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    $('#ced-search').addEventListener('input', (e) => { state.filter = e.target.value || ''; renderTable(); });
    // Event delegation para los botones de header sortables (sobrevive re-renders)
    document.getElementById('ced-tbl').addEventListener('click', (ev) => {
      const btn = ev.target.closest('.ced-th[data-sk]');
      if (!btn) return;
      const k = btn.getAttribute('data-sk');
      if (state.sortKey === k) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = k;
        state.sortDir = 'asc';
      }
      renderTable();
    });
    $('#ced-csv').addEventListener('click', downloadCsv);

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

/** ArgentinaDatos `/fci/variables/ultimo`: `nombre` entidad + `fondo` clase, o legado solo `fondo` entidad. */
function fciVariableEntityKey(r) {
  return String((r && (r.nombre || r.fondo)) || '').trim();
}
function fciVariableBarName(r) {
  const key = fciVariableEntityKey(r);
  if (!key) return '';
  const u = key.toUpperCase();
  const inst = u === 'GLOBAL66' ? 'Global66' : key;
  const fund = String(r.fondo || '').trim();
  if (r.nombre && fund && fund.toUpperCase() !== key.toUpperCase()) return `${inst} · ${fund}`;
  return inst;
}

// 3a. Billeteras — cuentas remuneradas + FCIs curados (Cocos, MP, Ualá, etc.) + otros MM
ARS_SUBS.billeteras = async function(main) {
  main.innerHTML = pHd('ars · billeteras', 'Billeteras', 'Cuentas remuneradas (tasa fija) + FCIs money market de las fintechs más populares + ranking general de money market.')
    + `<section class="s"><h2><span>cuentas remuneradas y billeteras</span><span class="line"></span><span class="count" id="bil-count">…</span></h2><div id="bil-bars"><div class="loading-row"> cargando…</div></div></section>`
    + `<section class="s"><h2><span>money market · fintechs populares</span><span class="line"></span><span class="count" id="fci-curados-count">…</span></h2><div id="fci-curados-bars"><div class="loading-row"> cargando fcis…</div></div></section>`
    + `<section class="s"><h2><span>otros money market · cafci</span><span class="line"></span><span class="count" id="fci-otros-count">…</span></h2><div id="fci-otros-bars"><div class="loading-row"> cargando resto…</div></div></section>`;
  try {
    const [cfg, fciRes, varUltimo] = await Promise.all([
      fetchCached('/api/config', 120_000),
      fetchCached('/api/cafci', 300_000).catch(() => ({ data: [] })),
      fetch('https://api.argentinadatos.com/v1/finanzas/fci/variables/ultimo').then(r => (r.ok ? r.json() : [])).catch(() => []),
    ]);

    // Sección 1: cuentas remuneradas (garantizados)
    const billeteras = (cfg.garantizados || []).filter(g => g.activo !== false)
      .map(g => ({ name: g.nombre, tna: +g.tna || 0, tag: g.tipo || '', limit: g.limite || '' }))
      .sort((a, b) => b.tna - a.tna);
    const varRows = Array.isArray(varUltimo) ? varUltimo : [];
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
    for (const r of varRows) {
      if (!r || r.tna == null || !Number.isFinite(Number(r.tna)) || Number(r.tna) <= 0) continue;
      const name = fciVariableBarName(r);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const cc = (r.condicionesCorto || '').trim();
      const tipo = (r.tipo || '').toLowerCase() === 'billetera' ? 'billetera' : (r.tipo || 'variable');
      const lim = r.tope != null && r.tope > 0 ? `límite ${r.tope}` : '';
      const tag = ['argentinadatos · ' + tipo, lim, cc].filter(Boolean).join(' · ');
      otros.push({ name, tna: Number(r.tna) * 100, tag });
    }
    otros.sort((a, b) => b.tna - a.tna);
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
        xKey: 'days', yKey: 'tea', labelKey: 'sym',
        xLabel: 'dtm (días)', yLabel: 'tea',
        yFmt: v => v.toFixed(1) + '%', xFmt: v => v + 'd',
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
            <td class="num">${r.tna.toFixed(1)}%</td>
            <td class="num hot">${r.tea.toFixed(1)}%</td>
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
    const [cfg, fciRes, pfRes, varUltimo] = await Promise.all([
      fetchCached('/api/config', 120_000),
      fetchCached('/api/cafci', 300_000).catch(() => ({ data: [] })),
      fetch('https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo').then(r => r.json()).catch(() => []),
      fetch('https://api.argentinadatos.com/v1/finanzas/fci/variables/ultimo').then(r => (r.ok ? r.json() : [])).catch(() => []),
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
    for (const row of (Array.isArray(varUltimo) ? varUltimo : [])) {
      if (!row || row.tna == null || !Number.isFinite(Number(row.tna))) continue;
      const name = fciVariableBarName(row);
      if (!name) continue;
      const tag = [row.tipo === 'billetera' ? 'billetera' : '', (row.condicionesCorto || '').trim()]
        .filter(Boolean)
        .join(' · ');
      unified.push({
        name,
        type: 'Renta variable',
        tna: Number(row.tna) * 100,
        tag,
      });
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

    // Proveedores excluidos del listado completo (restricciones regulatorias)
    const EXCLUDED = new Set(['binance']);
    // Bid poco confiable — publican compra muy alta pero no la honran en la práctica.
    // Los escondemos del cálculo de 'mejor para vender' y del sort por venta.
    const BID_UNRELIABLE = new Set(['banco-credicoop', 'banco-santander']);
    function getList() {
      if (state.coin === 'usd') {
        const all = (exchanges.usd || []).filter(e => e.ask > 0 && e.bid > 0 && !EXCLUDED.has(e.id));
        return state.only24x7 ? all.filter(e => e.is24x7) : all;
      }
      return (exchanges[state.coin] || []).filter(e => e.ask > 0 && e.bid > 0 && !EXCLUDED.has(e.id));
    }
    // Lista para calcular "mejor para vender" / sort por bid. Filtramos BID_UNRELIABLE.
    const sellList = () => getList().filter(e => !BID_UNRELIABLE.has(e.id));

    function renderBest() {
      const list = getList();
      const sList = sellList();
      if (!list.length) { $('#dol-best').innerHTML = '<div class="empty-state">sin proveedores</div>'; return; }
      const bestBuy = list.reduce((a, b) => a.ask < b.ask ? a : b);
      const bestSell = (sList.length ? sList : list).reduce((a, b) => a.bid > b.bid ? a : b);
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
      // Cuando sorteás por 'mejor venta' escondemos los bancos con bid irreal
      // (credicoop/santander) del listado — si no aparecen #1 con un precio
      // inflado que no van a honrar
      const list = state.sort === 'sell' ? sellList() : getList();
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

    // Event delegation — más robusto que attach individual (sobrevive re-renders
    // y tolera que el botón tenga hijos con pointer-events problemáticos)
    const coinBar = document.getElementById('dol-coin');
    if (coinBar) coinBar.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-coin]');
      if (!btn || !coinBar.contains(btn)) return;
      $$('#dol-coin button').forEach(x => x.classList.remove('on'));
      btn.classList.add('on');
      state.coin = btn.getAttribute('data-coin');
      show24x7(); renderBest(); renderTable();
    });
    const sortBar = document.getElementById('dol-sort');
    if (sortBar) sortBar.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-sort]');
      if (!btn || !sortBar.contains(btn)) return;
      $$('#dol-sort button').forEach(x => x.classList.remove('on'));
      btn.classList.add('on');
      state.sort = btn.getAttribute('data-sort');
      renderTable();
    });
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

// ─── Screen: Remesas — cobrar en USD desde el exterior ───────
// Datos approx + Cocos confirmado por el usuario. Fuente dolarito.ar/remotito.
const REMESAS = [
  {
    name: 'Cocos',
    logoKey: 'Cocos',
    fee: 0.50,
    aperturaFree: true,
    mantenimientoFree: true,
    feeMin: 2.50,
    checking: true,
    subnominada: true,
    card: true,
    android: true,
    apple: true,
    url: 'https://cocos.capital',
    note: 'todo gratis · wire/ach',
  },
  {
    name: 'Wallbit',
    logoKey: 'Wallbit',
    fee: 0,
    aperturaFree: true,
    mantenimientoFree: true,
    feeMin: 0,
    checking: true,
    subnominada: true,
    card: true,
    android: true,
    apple: true,
    url: 'https://wallbit.io',
    note: 'sin costo · checking account',
  },
  {
    name: 'Grabr Fi',
    logoKey: 'Grabr',
    fee: 1.00,
    aperturaFree: true,
    mantenimientoFree: true,
    feeMin: 3.00,
    checking: true,
    subnominada: true,
    card: true,
    android: true,
    apple: true,
    url: 'https://grabr.fi',
    note: 'checking account',
  },
  {
    name: 'Lemon',
    logoKey: 'Lemon',
    fee: 1.00,
    aperturaFree: true,
    mantenimientoFree: true,
    feeMin: 2.50,
    checking: false,
    subnominada: true,
    card: true,
    android: true,
    apple: true,
    url: 'https://lemon.me',
    note: 'lemon card · cripto',
  },
  {
    name: 'Takenos',
    logoKey: 'Takenos',
    fee: 0,
    aperturaFree: true,
    mantenimientoFree: true,
    feeMin: 0,
    checking: false,
    subnominada: true,
    card: false,
    android: true,
    apple: true,
    url: 'https://takenos.com',
    note: 'sin costo · link de cobro',
  },
  {
    name: 'Payoneer',
    logoKey: 'Payoneer',
    fee: 1.00,
    aperturaFree: true,
    mantenimientoFree: true,
    feeMin: 1.50,
    checking: true,
    subnominada: false,
    card: true,
    android: true,
    apple: true,
    url: 'https://payoneer.com',
    note: 'global account',
  },
  {
    name: 'Arq',
    logoKey: 'Arq',
    fee: 0,
    feeFlat: 3.00,       // USD flat por transferencia (no es %)
    aperturaFree: true,
    mantenimientoFree: true,
    feeMin: 3.00,
    checking: true,
    subnominada: true,
    card: true,
    android: true,
    apple: true,
    url: 'https://arq.app',
    note: 'USD 3 flat · checking account',
  },
  {
    name: 'Astropay',
    logoKey: 'Astropay',
    fee: 1.00,
    aperturaFree: true,
    mantenimientoFree: true,
    feeMin: null,
    checking: false,
    subnominada: true,
    card: true,
    android: true,
    apple: true,
    url: 'https://astropay.com',
    note: 'wallet · spread implícito',
  },
  {
    name: 'Airtm',
    logoKey: 'Airtm',
    fee: 3.50,
    aperturaFree: true,
    mantenimientoFree: true,
    feeMin: null,
    checking: false,
    subnominada: true,
    card: false,
    android: true,
    apple: true,
    url: 'https://airtm.com',
    note: 'p2p · spread variable',
  },
  {
    name: 'Wise',
    logoKey: 'Wise',
    fee: null,
    aperturaFree: null,
    mantenimientoFree: null,
    feeMin: null,
    checking: null,
    subnominada: null,
    card: null,
    android: null,
    apple: null,
    url: 'https://wise.com',
    note: 'no disponible en argentina',
    unavailable: true,
  },
];

// Logos de cada proveedor de remesas. Fuentes:
// 1. Archivos reales en /logos/exchanges/ (wallbit, lemon, takenos, astropay,
//    dolarapp→arq, airtm, payoneer, grabr)
// 2. Cocos usa ENTITY_LOGOS (base64 inline) de la sección ARS billeteras
// 3. Wise sigue con monograma base64 hasta tener SVG oficial
const REMESAS_LOGO = {
  Cocos: undefined, // lookupLogoURL → ENTITY_LOGOS['Cocos']
  Wallbit: '/logos/exchanges/wallbit.svg',
  Lemon: '/logos/exchanges/lemon.svg',
  'Grabr Fi': '/logos/exchanges/grabr.svg',
  Takenos: '/logos/exchanges/takenos.svg',
  Payoneer: '/logos/exchanges/payoneer.svg',
  Arq: '/logos/exchanges/dolarapp.svg',
  Astropay: '/logos/exchanges/astropay.svg',
  Airtm: '/logos/exchanges/airtm.svg',
  Wise: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyOCAyOCI+PHJlY3Qgd2lkdGg9IjI4IiBoZWlnaHQ9IjI4IiBmaWxsPSIjOWZlODcwIi8+PHRleHQgeD0iMTQiIHk9IjE4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0idWktc2Fucy1zZXJpZixzeXN0ZW0tdWksLWFwcGxlLXN5c3RlbSxzYW5zLXNlcmlmIiBmb250LXNpemU9IjE0IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjMTYzMzAwIiA+VzwvdGV4dD48L3N2Zz4=',
};

function remesaLogoHTML(name, sm = false) {
  const src = REMESAS_LOGO[name] !== undefined ? REMESAS_LOGO[name] : lookupLogoURL(name);
  const cls = 'logo' + (sm ? ' sm' : '');
  const init = esc(initials(name));
  if (src) return `<span class="${cls}" data-initials="${init}"><img src="${esc(src)}" alt="${esc(name)}" onerror="this.remove(); this.parentNode.textContent=this.parentNode.dataset.initials||'·'"></span>`;
  return `<span class="${cls}">${init}</span>`;
}

const check = () => '<span class="up" style="font-family:var(--font-mono)">●</span>';
const cross = () => '<span class="down" style="font-family:var(--font-mono);opacity:0.6">○</span>';
const dash = () => '<span class="dim">—</span>';

async function screenRemesas(main) {
  // Costo efectivo sobre USD 1000 — considera fee %, mínimo y flat.
  const effectiveCost = (r, amount = 1000) => {
    const pct = (r.fee || 0) * amount / 100;
    const min = r.feeMin || 0;
    const flat = r.feeFlat || 0;
    // Si hay flat, se suma al % (Arq: 0% + USD 3); mínimo aplica como piso del %
    return Math.max(pct, min) + flat;
  };
  // Sort por costo efectivo asc sobre USD 1000 (más barato primero)
  const rows = REMESAS.slice().sort((a, b) => {
    if (a.unavailable && !b.unavailable) return 1;
    if (!a.unavailable && b.unavailable) return -1;
    return effectiveCost(a) - effectiveCost(b);
  });

  const best = rows.filter(r => !r.unavailable)[0];

  // Formato legible del costo para la best card: "gratis", "USD 3 flat" o "X%"
  const feeLabel = (r) => {
    if (r.feeFlat) return 'USD ' + r.feeFlat.toFixed(0) + ' flat';
    if ((r.fee || 0) === 0 && (r.feeMin || 0) === 0) return 'gratis';
    return r.fee.toFixed(2) + '%';
  };
  const bestNet = 1000 - effectiveCost(best);

  main.innerHTML = pHd('remesas · cobrar usd del exterior', 'Remesas',
    'Comparador de apps para cobrar en dólares desde el exterior (freelance, remoto, exportación). Fee %, apertura, fee mínimo y features por proveedor.')
    + `<section class="s">
        <h2><span>mejor del momento</span><span class="line"></span></h2>
        <div class="dol-best-row">
          <div class="dol-best-card">
            <div class="lbl">menor costo</div>
            <div class="with-logo">${remesaLogoHTML(best.name)}<div class="txt"><b>${esc(best.name)}</b><small>${esc(best.note)}</small></div></div>
            <div class="val hot">${feeLabel(best)}</div>
          </div>
          <div class="dol-best-card">
            <div class="lbl">fee mínimo</div>
            <div class="with-logo">${remesaLogoHTML(best.name)}<div class="txt"><b>${esc(best.name)}</b><small>por transferencia</small></div></div>
            <div class="val hot">${best.feeMin != null && best.feeMin > 0 ? 'USD ' + best.feeMin.toFixed(2) : '—'}</div>
          </div>
          <div class="dol-best-card">
            <div class="lbl">ejemplo · usd 1.000</div>
            <div class="with-logo"><div class="txt"><b>recibís</b><small>neto de comisión</small></div></div>
            <div class="val hot">USD ${bestNet.toFixed(2)}</div>
          </div>
        </div>
      </section>
      <section class="s">
        <h2><span>proveedores</span><span class="line"></span><span class="count">${rows.length}</span></h2>
        <div id="remesas-tbl"></div>
        <div class="hint" style="margin-top:10px">
          datos de referencia · fuente: <a href="https://www.dolarito.ar/remotito" target="_blank" rel="noopener" style="color:var(--hot)">dolarito.ar/remotito</a> · cocos confirmado por el equipo.
          los porcentajes pueden variar según promociones vigentes de cada app.
        </div>
      </section>`;

  const tbl = $('#remesas-tbl');
  tbl.innerHTML = `<table class="t">
    <thead><tr>
      <th style="text-align:left">#</th>
      <th style="text-align:left">proveedor</th>
      <th>fee</th>
      <th>fee mín</th>
      <th>apertura</th>
      <th>mantenim.</th>
      <th>checking</th>
      <th>tarjeta</th>
      <th>android / ios</th>
      <th>usd 1.000 neto</th>
    </tr></thead>
    <tbody>${rows.map((r, i) => {
      if (r.unavailable) {
        return `<tr style="opacity:0.5">
          <td class="dim">${String(i + 1).padStart(2, '0')}</td>
          <td>${remesaLogoHTML(r.name, true)} <span>${esc(r.name)}</span></td>
          <td class="num dim">—</td>
          <td class="num dim">—</td>
          <td class="dim">—</td>
          <td class="dim">—</td>
          <td class="dim">—</td>
          <td class="dim">—</td>
          <td class="dim">—</td>
          <td class="num down" style="text-align:left">${esc(r.note)}</td>
        </tr>`;
      }
      const net = 1000 - effectiveCost(r);
      const bestMark = i === 0;
      // Display del fee: "gratis" si 0% + 0 min; "flat X" si tiene feeFlat; si no, "X%"
      let feeCell;
      if (r.feeFlat) {
        feeCell = `<span class="${bestMark ? 'hot' : ''}">USD ${r.feeFlat.toFixed(0)} flat</span>`;
      } else if ((r.fee || 0) === 0 && (r.feeMin || 0) === 0) {
        feeCell = `<span class="up">gratis</span>`;
      } else {
        feeCell = `<span class="${bestMark ? 'hot' : ''}">${r.fee.toFixed(2)}%</span>`;
      }
      return `<tr${r.name === 'Cocos' ? ' style="background:var(--bg-1)"' : ''}>
        <td class="${bestMark ? 'hot' : 'dim'}">${String(i + 1).padStart(2, '0')}</td>
        <td>${remesaLogoHTML(r.name, true)} <span class="${bestMark ? 'hot' : ''}">${esc(r.name)}</span> <small class="dim" style="margin-left:4px">${esc(r.note)}</small></td>
        <td class="num">${feeCell}</td>
        <td class="num dim">${r.feeMin != null && r.feeMin > 0 ? 'USD ' + r.feeMin.toFixed(2) : '—'}</td>
        <td>${r.aperturaFree ? check() : dash()}</td>
        <td>${r.mantenimientoFree ? check() : dash()}</td>
        <td>${r.checking ? check() : cross()}</td>
        <td>${r.card ? check() : cross()}</td>
        <td class="dim">${(r.android || r.apple) ? (r.android ? 'A' : '—') + ' / ' + (r.apple ? 'i' : '—') : '—'}</td>
        <td class="num ${bestMark ? 'hot' : ''}">USD ${fmt(net, 2)}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

// ─── Screen: Mundial ──────────────────────────────────────────
const MUNDIAL_START = new Date(2026, 5, 11); // 11 jun 2026 (inicio oficial)

function renderMundialCountdown() {
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addMonths = (d, m) => {
    const n = new Date(d);
    const orig = n.getDate();
    n.setDate(1);
    n.setMonth(n.getMonth() + m);
    n.setDate(Math.min(orig, new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()));
    return n;
  };
  const unit = (n, s, p) => `${n} ${n === 1 ? s : p}`;

  const today = startOfDay(new Date());
  const target = startOfDay(MUNDIAL_START);
  const msDay = 86400000;
  const totalDays = Math.max(0, Math.ceil((target - today) / msDay));
  let months = 0;
  while (addMonths(today, months + 1) <= target) months++;
  const anchor = addMonths(today, months);
  const days = Math.max(0, Math.ceil((target - anchor) / msDay));

  let summary;
  if (totalDays === 0) summary = 'HOY · ARRANCA EL MUNDIAL';
  else {
    const parts = [];
    if (months > 0) parts.push(unit(months, 'mes', 'meses'));
    if (days > 0) parts.push(unit(days, 'día', 'días'));
    summary = 'FALTAN ' + (parts.join(' y ') || unit(totalDays, 'día', 'días')).toUpperCase();
  }

  return `<div class="tty-countdown">
    <div class="tty-countdown-head">
      <div>
        <div class="tty-countdown-kicker">MUNDIAL 2026 · CUENTA REGRESIVA</div>
        <div class="tty-countdown-summary">${esc(summary)}</div>
        <div class="tty-countdown-date">inicio · 11 de junio de 2026 · méxico / usa / canadá</div>
      </div>
      <div class="tty-countdown-stats">
        <div class="tty-countdown-stat">
          <div class="tty-countdown-value">${String(months).padStart(2, '0')}</div>
          <div class="tty-countdown-label">${months === 1 ? 'mes' : 'meses'}</div>
        </div>
        <div class="tty-countdown-stat">
          <div class="tty-countdown-value">${String(days).padStart(2, '0')}</div>
          <div class="tty-countdown-label">${days === 1 ? 'día' : 'días'}</div>
        </div>
        <div class="tty-countdown-stat">
          <div class="tty-countdown-value">${totalDays}</div>
          <div class="tty-countdown-label">días totales</div>
        </div>
      </div>
    </div>
  </div>`;
}

// Mundial 2026 — static data (grupos + banderas + tags + partidos).
// Compatible con /api/mundial: si la API trae standings updated, se mergea por nombre.
const MUNDIAL_GROUPS = [
  { letter: 'A', venue: 'Mexico', teams: [
    { name: 'Mexico', flag: '🇲🇽', tag: 'sede', apiName: 'Mexico' },
    { name: 'Corea del Sur', flag: '🇰🇷', apiName: 'South Korea' },
    { name: 'Sudáfrica', flag: '🇿🇦', apiName: 'South Africa' },
    { name: 'Rep. Checa', flag: '🇨🇿', apiName: 'Czech Republic' },
  ], matches: [
    { date: '11 Jun', t1: 'Mexico', t2: 'Sudáfrica', city: 'Mexico City' },
    { date: '12 Jun', t1: 'Corea del Sur', t2: 'Rep. Checa', city: 'Guadalajara' },
    { date: '16 Jun', t1: 'Mexico', t2: 'Corea del Sur', city: 'Mexico City' },
    { date: '16 Jun', t1: 'Sudáfrica', t2: 'Rep. Checa', city: 'Guadalajara' },
    { date: '20 Jun', t1: 'Sudáfrica', t2: 'Corea del Sur', city: 'Monterrey' },
    { date: '20 Jun', t1: 'Rep. Checa', t2: 'Mexico', city: 'Mexico City' },
  ]},
  { letter: 'B', venue: 'Canada', teams: [
    { name: 'Canada', flag: '🇨🇦', tag: 'sede', apiName: 'Canada' },
    { name: 'Suiza', flag: '🇨🇭', apiName: 'Switzerland' },
    { name: 'Qatar', flag: '🇶🇦', apiName: 'Qatar' },
    { name: 'Bosnia y Herz.', flag: '🇧🇦', apiName: 'Bosnia and Herzegovina' },
  ], matches: [
    { date: '12 Jun', t1: 'Canada', t2: 'Qatar', city: 'Vancouver' },
    { date: '12 Jun', t1: 'Suiza', t2: 'Bosnia y Herz.', city: 'Toronto' },
    { date: '17 Jun', t1: 'Canada', t2: 'Suiza', city: 'Vancouver' },
    { date: '17 Jun', t1: 'Qatar', t2: 'Bosnia y Herz.', city: 'Toronto' },
    { date: '21 Jun', t1: 'Qatar', t2: 'Suiza', city: 'Toronto' },
    { date: '21 Jun', t1: 'Bosnia y Herz.', t2: 'Canada', city: 'Vancouver' },
  ]},
  { letter: 'C', venue: 'USA West', teams: [
    { name: 'Brasil', flag: '🇧🇷', apiName: 'Brazil' },
    { name: 'Marruecos', flag: '🇲🇦', apiName: 'Morocco' },
    { name: 'Escocia', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', apiName: 'Scotland' },
    { name: 'Haiti', flag: '🇭🇹', apiName: 'Haiti' },
  ], matches: [
    { date: '13 Jun', t1: 'Brasil', t2: 'Marruecos', city: 'Los Angeles' },
    { date: '13 Jun', t1: 'Haiti', t2: 'Escocia', city: 'San Francisco' },
    { date: '17 Jun', t1: 'Brasil', t2: 'Haiti', city: 'Los Angeles' },
    { date: '18 Jun', t1: 'Marruecos', t2: 'Escocia', city: 'San Francisco' },
    { date: '22 Jun', t1: 'Escocia', t2: 'Brasil', city: 'Los Angeles' },
    { date: '22 Jun', t1: 'Marruecos', t2: 'Haiti', city: 'San Francisco' },
  ]},
  { letter: 'D', venue: 'USA East', teams: [
    { name: 'Estados Unidos', flag: '🇺🇸', tag: 'sede', apiName: 'United States' },
    { name: 'Paraguay', flag: '🇵🇾', apiName: 'Paraguay' },
    { name: 'Australia', flag: '🇦🇺', apiName: 'Australia' },
    { name: 'Turquía', flag: '🇹🇷', apiName: 'Turkey' },
  ], matches: [
    { date: '12 Jun', t1: 'Estados Unidos', t2: 'Australia', city: 'Philadelphia' },
    { date: '13 Jun', t1: 'Paraguay', t2: 'Turquía', city: 'Houston' },
    { date: '17 Jun', t1: 'Estados Unidos', t2: 'Paraguay', city: 'New York/NJ' },
    { date: '17 Jun', t1: 'Australia', t2: 'Turquía', city: 'Houston' },
    { date: '21 Jun', t1: 'Australia', t2: 'Paraguay', city: 'Houston' },
    { date: '21 Jun', t1: 'Turquía', t2: 'Estados Unidos', city: 'Philadelphia' },
  ]},
  { letter: 'E', venue: 'USA South', teams: [
    { name: 'Alemania', flag: '🇩🇪', apiName: 'Germany' },
    { name: 'Costa de Marfil', flag: '🇨🇮', apiName: "Côte d'Ivoire" },
    { name: 'Ecuador', flag: '🇪🇨', apiName: 'Ecuador' },
    { name: 'Curazao', flag: '🇨🇼', apiName: 'Curaçao' },
  ], matches: [
    { date: '13 Jun', t1: 'Alemania', t2: 'Costa de Marfil', city: 'Atlanta' },
    { date: '14 Jun', t1: 'Ecuador', t2: 'Curazao', city: 'Miami' },
    { date: '18 Jun', t1: 'Alemania', t2: 'Ecuador', city: 'Atlanta' },
    { date: '18 Jun', t1: 'Costa de Marfil', t2: 'Curazao', city: 'Miami' },
    { date: '22 Jun', t1: 'Curazao', t2: 'Alemania', city: 'Atlanta' },
    { date: '22 Jun', t1: 'Costa de Marfil', t2: 'Ecuador', city: 'Miami' },
  ]},
  { letter: 'F', venue: 'USA', teams: [
    { name: 'Países Bajos', flag: '🇳🇱', apiName: 'Netherlands' },
    { name: 'Japón', flag: '🇯🇵', apiName: 'Japan' },
    { name: 'Túnez', flag: '🇹🇳', apiName: 'Tunisia' },
    { name: 'Suecia', flag: '🇸🇪', apiName: 'Sweden' },
  ], matches: [
    { date: '14 Jun', t1: 'Países Bajos', t2: 'Suecia', city: 'Boston' },
    { date: '14 Jun', t1: 'Túnez', t2: 'Japón', city: 'Kansas City' },
    { date: '18 Jun', t1: 'Países Bajos', t2: 'Túnez', city: 'Boston' },
    { date: '19 Jun', t1: 'Japón', t2: 'Suecia', city: 'Kansas City' },
    { date: '23 Jun', t1: 'Japón', t2: 'Países Bajos', city: 'Kansas City' },
    { date: '23 Jun', t1: 'Suecia', t2: 'Túnez', city: 'Boston' },
  ]},
  { letter: 'G', venue: 'USA', teams: [
    { name: 'Bélgica', flag: '🇧🇪', apiName: 'Belgium' },
    { name: 'Egipto', flag: '🇪🇬', apiName: 'Egypt' },
    { name: 'Irán', flag: '🇮🇷', apiName: 'Iran' },
    { name: 'Nueva Zelanda', flag: '🇳🇿', apiName: 'New Zealand' },
  ], matches: [
    { date: '14 Jun', t1: 'Bélgica', t2: 'Egipto', city: 'Dallas' },
    { date: '15 Jun', t1: 'Irán', t2: 'Nueva Zelanda', city: 'Seattle' },
    { date: '19 Jun', t1: 'Bélgica', t2: 'Irán', city: 'Dallas' },
    { date: '19 Jun', t1: 'Egipto', t2: 'Nueva Zelanda', city: 'Seattle' },
    { date: '23 Jun', t1: 'Nueva Zelanda', t2: 'Bélgica', city: 'Dallas' },
    { date: '23 Jun', t1: 'Egipto', t2: 'Irán', city: 'Seattle' },
  ]},
  { letter: 'H', venue: 'USA East', teams: [
    { name: 'España', flag: '🇪🇸', apiName: 'Spain' },
    { name: 'Uruguay', flag: '🇺🇾', apiName: 'Uruguay' },
    { name: 'Arabia Saudita', flag: '🇸🇦', apiName: 'Saudi Arabia' },
    { name: 'Cabo Verde', flag: '🇨🇻', apiName: 'Cape Verde' },
  ], matches: [
    { date: '15 Jun', t1: 'España', t2: 'Cabo Verde', city: 'New York/NJ' },
    { date: '15 Jun', t1: 'Arabia Saudita', t2: 'Uruguay', city: 'Philadelphia' },
    { date: '19 Jun', t1: 'España', t2: 'Arabia Saudita', city: 'New York/NJ' },
    { date: '20 Jun', t1: 'Uruguay', t2: 'Cabo Verde', city: 'Philadelphia' },
    { date: '24 Jun', t1: 'Uruguay', t2: 'España', city: 'New York/NJ' },
    { date: '24 Jun', t1: 'Cabo Verde', t2: 'Arabia Saudita', city: 'Philadelphia' },
  ]},
  { letter: 'I', venue: 'USA/Mexico', teams: [
    { name: 'Francia', flag: '🇫🇷', apiName: 'France' },
    { name: 'Senegal', flag: '🇸🇳', apiName: 'Senegal' },
    { name: 'Noruega', flag: '🇳🇴', apiName: 'Norway' },
    { name: 'Irak', flag: '🇮🇶', apiName: 'Iraq' },
  ], matches: [
    { date: '15 Jun', t1: 'Francia', t2: 'Noruega', city: 'Los Angeles' },
    { date: '16 Jun', t1: 'Senegal', t2: 'Irak', city: 'Monterrey' },
    { date: '20 Jun', t1: 'Francia', t2: 'Senegal', city: 'Los Angeles' },
    { date: '20 Jun', t1: 'Noruega', t2: 'Irak', city: 'Monterrey' },
    { date: '24 Jun', t1: 'Irak', t2: 'Francia', city: 'Los Angeles' },
    { date: '24 Jun', t1: 'Noruega', t2: 'Senegal', city: 'Monterrey' },
  ]},
  { letter: 'J', venue: 'USA South', teams: [
    { name: 'Argentina', flag: '🇦🇷', apiName: 'Argentina' },
    { name: 'Argelia', flag: '🇩🇿', apiName: 'Algeria' },
    { name: 'Austria', flag: '🇦🇹', apiName: 'Austria' },
    { name: 'Jordania', flag: '🇯🇴', apiName: 'Jordan' },
  ], matches: [
    { date: '16 Jun', t1: 'Argentina', t2: 'Austria', city: 'Miami' },
    { date: '16 Jun', t1: 'Jordania', t2: 'Argelia', city: 'Atlanta' },
    { date: '21 Jun', t1: 'Argentina', t2: 'Jordania', city: 'Miami' },
    { date: '21 Jun', t1: 'Austria', t2: 'Argelia', city: 'Atlanta' },
    { date: '25 Jun', t1: 'Argelia', t2: 'Argentina', city: 'Miami' },
    { date: '25 Jun', t1: 'Austria', t2: 'Jordania', city: 'Atlanta' },
  ]},
  { letter: 'K', venue: 'USA', teams: [
    { name: 'Portugal', flag: '🇵🇹', apiName: 'Portugal' },
    { name: 'Colombia', flag: '🇨🇴', apiName: 'Colombia' },
    { name: 'Uzbekistán', flag: '🇺🇿', apiName: 'Uzbekistan' },
    { name: 'RD Congo', flag: '🇨🇩', apiName: 'DR Congo' },
  ], matches: [
    { date: '14 Jun', t1: 'Portugal', t2: 'Colombia', city: 'Houston' },
    { date: '15 Jun', t1: 'Uzbekistán', t2: 'RD Congo', city: 'Dallas' },
    { date: '19 Jun', t1: 'Portugal', t2: 'Uzbekistán', city: 'Houston' },
    { date: '19 Jun', t1: 'Colombia', t2: 'RD Congo', city: 'Dallas' },
    { date: '23 Jun', t1: 'RD Congo', t2: 'Portugal', city: 'Houston' },
    { date: '23 Jun', t1: 'Colombia', t2: 'Uzbekistán', city: 'Dallas' },
  ]},
  { letter: 'L', venue: 'USA', teams: [
    { name: 'Inglaterra', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', apiName: 'England' },
    { name: 'Croacia', flag: '🇭🇷', apiName: 'Croatia' },
    { name: 'Ghana', flag: '🇬🇭', apiName: 'Ghana' },
    { name: 'Panamá', flag: '🇵🇦', apiName: 'Panama' },
  ], matches: [
    { date: '15 Jun', t1: 'Inglaterra', t2: 'Croacia', city: 'Boston' },
    { date: '16 Jun', t1: 'Ghana', t2: 'Panamá', city: 'Seattle' },
    { date: '20 Jun', t1: 'Inglaterra', t2: 'Ghana', city: 'Boston' },
    { date: '20 Jun', t1: 'Croacia', t2: 'Panamá', city: 'Seattle' },
    { date: '24 Jun', t1: 'Panamá', t2: 'Inglaterra', city: 'Boston' },
    { date: '24 Jun', t1: 'Croacia', t2: 'Ghana', city: 'Seattle' },
  ]},
];

const MUNDIAL_KNOCKOUT = [
  { name: 'Octavos de final', dates: '28 Jun - 2 Jul', matches: 16 },
  { name: 'Cuartos de final', dates: '4 - 5 Jul', matches: 8 },
  { name: 'Semifinales', dates: '8 - 9 Jul', matches: 4 },
  { name: 'Tercer puesto', dates: '18 Jul', matches: 1 },
  { name: 'Final', dates: '19 Jul · MetLife Stadium, New York/NJ', matches: 1 },
];

// ─── Screen: Cuotas vs Contado (infleta-style) ────────────────
// Compara pagar contado vs financiar en cuotas descontando por inflación.
// Fórmulas:
//   PV = C · [1 − (1+i_m)^−n] / i_m   (valor presente de n cuotas C a tasa mensual i_m)
//   TIR mensual r: P_cash = PV(r, C, n)  — buscamos r vía bisección
//   Conviene cuotas si  PV(inflación) < P_cash   ⇔   TIR < inflación mensual
function pvAnnuity(C, n, r) {
  if (!n) return 0;
  if (Math.abs(r) < 1e-12) return C * n;
  return C * (1 - Math.pow(1 + r, -n)) / r;
}
function implicitMonthlyRate(P_cash, P_total, n) {
  // Devuelve r mensual tal que PV(r) = P_cash. Si no hay costo financiero, 0.
  if (P_total <= P_cash || n <= 0 || P_cash <= 0) return 0;
  const C = P_total / n;
  let lo = 1e-9, hi = 5; // hasta 500% mensual
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const pv = pvAnnuity(C, n, mid);
    if (pv > P_cash) lo = mid; else hi = mid;
    if (hi - lo < 1e-10) break;
  }
  return (lo + hi) / 2;
}

async function screenCuotas(main) {
  main.innerHTML = pHd('cuotas vs contado · inflación', 'Cuotas vs Contado',
    'Calculadora estilo infleta.com.ar. Descontando el valor del peso por inflación, averiguá si conviene pagar en cuotas (aunque sea más caro nominal) o cash.')
    + `<section class="s">
        <h2><span>inputs</span><span class="line"></span></h2>
        <div class="cuotas-grid">
          <label class="cq-field">
            <span>precio contado (ARS)</span>
            <input type="text" id="cq-cash" inputmode="decimal" value="100000">
          </label>
          <label class="cq-field">
            <span>precio total en cuotas (ARS)</span>
            <input type="text" id="cq-total" inputmode="decimal" value="120000">
          </label>
          <label class="cq-field">
            <span>inflación mensual esperada (%)</span>
            <input type="text" id="cq-infl" inputmode="decimal" value="2.5">
          </label>
          <label class="cq-field">
            <span>cantidad de cuotas</span>
            <input type="number" id="cq-n" min="1" max="60" value="12">
          </label>
        </div>
        <div class="cq-presets">
          <span class="cq-presets-lbl">cuotas:</span>
          <div class="dol-seg" id="cq-n-presets">
            <button type="button" data-n="3">3</button>
            <button type="button" data-n="6">6</button>
            <button type="button" data-n="12" class="on">12</button>
            <button type="button" data-n="18">18</button>
            <button type="button" data-n="24">24</button>
            <button type="button" data-n="36">36</button>
          </div>
        </div>
        <div class="cq-presets">
          <span class="cq-presets-lbl">inflación:</span>
          <div class="dol-seg" id="cq-i-presets">
            <button type="button" data-i="2.0">2.0%</button>
            <button type="button" data-i="2.5" class="on">2.5%</button>
            <button type="button" data-i="3.0">3.0%</button>
            <button type="button" data-i="3.5">3.5%</button>
            <button type="button" data-i="4.0">4.0%</button>
          </div>
        </div>
      </section>
      <section class="s">
        <h2><span>resultado</span><span class="line"></span></h2>
        <div id="cq-verdict" class="cq-verdict"></div>
        <div id="cq-stats" class="cq-stats"></div>
        <div id="cq-flow"></div>
        <p class="hint" style="margin-top:10px">
          Fórmula: <b>PV = C · [1 − (1 + i)<sup>−n</sup>] / i</b> · TIR vía bisección ·
          Conviene cuotas si la TNA implícita es menor que la inflación anualizada equivalente.
        </p>
      </section>`;

  const S = { cash: 100000, total: 120000, infl: 0.025, n: 12 };
  const parseNum = (v) => {
    if (typeof v !== 'string') return +v;
    return parseFloat(v.replace(/\./g, '').replace(/,/g, '.').replace(/[^0-9.\-]/g, '')) || 0;
  };
  const readInputs = () => {
    S.cash = parseNum($('#cq-cash').value);
    S.total = parseNum($('#cq-total').value);
    S.infl = parseNum($('#cq-infl').value) / 100;
    S.n = Math.max(1, Math.min(60, parseInt($('#cq-n').value) || 1));
  };

  function render() {
    const { cash, total, infl, n } = S;
    const C = total / n;
    const pvInfl = pvAnnuity(C, n, infl);
    const savingNominal = cash - total;          // + si contado es más caro (raro)
    const savingReal = cash - pvInfl;             // + si cuotas conviene (PV < cash)
    const rMensual = implicitMonthlyRate(cash, total, n);
    const tna = rMensual * 12;
    const tea = Math.pow(1 + rMensual, 12) - 1;
    const inflAnual = Math.pow(1 + infl, 12) - 1;
    const conviene = pvInfl < cash;
    const pctAhorro = cash > 0 ? (savingReal / cash) * 100 : 0;

    const verdict = conviene
      ? `<div class="cq-big up">
          <div class="cq-big-lbl">veredicto</div>
          <div class="cq-big-val">CUOTAS</div>
          <div class="cq-big-sub">pagás ${fmtPctPlain(Math.abs(pctAhorro), 2)} menos en términos reales</div>
        </div>`
      : `<div class="cq-big down">
          <div class="cq-big-lbl">veredicto</div>
          <div class="cq-big-val">CONTADO</div>
          <div class="cq-big-sub">cuotas te salen ${fmtPctPlain(Math.abs(pctAhorro), 2)} más caro en términos reales</div>
        </div>`;
    $('#cq-verdict').innerHTML = verdict;

    const fmtARS = (v) => '$' + fmt(v, 0);
    $('#cq-stats').innerHTML = `
      <div class="cq-stat">
        <div class="lbl">cuota mensual</div>
        <div class="val">${fmtARS(C)}</div>
      </div>
      <div class="cq-stat">
        <div class="lbl">sobreprecio nominal</div>
        <div class="val ${total > cash ? 'down' : 'up'}">${total === cash ? '—' : fmtARS(total - cash) + ' (' + fmtPctPlain((total-cash)/cash*100, 1) + ')'}</div>
      </div>
      <div class="cq-stat">
        <div class="lbl">valor presente de cuotas</div>
        <div class="val">${fmtARS(pvInfl)}</div>
      </div>
      <div class="cq-stat">
        <div class="lbl">ahorro real (cash − PV)</div>
        <div class="val ${conviene ? 'up' : 'down'}">${fmtARS(savingReal)}</div>
      </div>
      <div class="cq-stat">
        <div class="lbl">TIR mensual implícita</div>
        <div class="val">${fmtPctPlain(rMensual * 100, 2)}</div>
      </div>
      <div class="cq-stat">
        <div class="lbl">TNA implícita</div>
        <div class="val">${fmtPctPlain(tna * 100, 2)}</div>
      </div>
      <div class="cq-stat">
        <div class="lbl">TEA implícita</div>
        <div class="val">${fmtPctPlain(tea * 100, 2)}</div>
      </div>
      <div class="cq-stat">
        <div class="lbl">inflación anualizada</div>
        <div class="val">${fmtPctPlain(inflAnual * 100, 2)}</div>
      </div>`;

    // Tabla de flujo mes a mes (valor presente acumulado)
    const rows = [];
    let pvAcum = 0;
    for (let k = 1; k <= n; k++) {
      const pvK = C / Math.pow(1 + infl, k);
      pvAcum += pvK;
      rows.push(`<tr>
        <td class="dim">${String(k).padStart(2, '0')}</td>
        <td class="num">${fmtARS(C)}</td>
        <td class="num dim">${fmtARS(pvK)}</td>
        <td class="num">${fmtARS(pvAcum)}</td>
      </tr>`);
    }
    $('#cq-flow').innerHTML = `<details class="cq-flow"><summary>ver flujo mes a mes</summary>
      <table class="t" style="margin-top:10px">
        <thead><tr>
          <th style="text-align:left">#</th>
          <th>cuota nominal</th>
          <th>PV cuota</th>
          <th>PV acumulado</th>
        </tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table></details>`;
  }

  // Wire inputs
  ['#cq-cash', '#cq-total', '#cq-infl'].forEach(sel => {
    $(sel).addEventListener('input', () => { readInputs(); render(); });
  });
  $('#cq-n').addEventListener('input', () => {
    readInputs();
    $$('#cq-n-presets button').forEach(b => b.classList.toggle('on', +b.dataset.n === S.n));
    render();
  });
  document.getElementById('cq-n-presets').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-n]');
    if (!btn) return;
    $$('#cq-n-presets button').forEach(x => x.classList.remove('on'));
    btn.classList.add('on');
    $('#cq-n').value = btn.dataset.n;
    readInputs(); render();
  });
  document.getElementById('cq-i-presets').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-i]');
    if (!btn) return;
    $$('#cq-i-presets button').forEach(x => x.classList.remove('on'));
    btn.classList.add('on');
    $('#cq-infl').value = btn.dataset.i;
    readInputs(); render();
  });

  readInputs();
  render();
}

async function screenMundial(main) {
  main.innerHTML = pHd('mundial · fifa 2026', 'Mundial 2026', 'Cuenta regresiva al inicio del Mundial 2026, grupos oficiales, partidos y sedes. Copa del Mundo FIFA.')
    + renderMundialCountdown()
    + `<div id="mun-grid"><div class="loading-row"> cargando grupos…</div></div>`;
  // Re-render countdown every hour
  if (!window._mundialCdTimer) {
    window._mundialCdTimer = setInterval(() => {
      if (STATE.section.main === 'mundial') {
        const cd = $('.tty-countdown', $('#main'));
        if (cd) cd.outerHTML = renderMundialCountdown();
      }
    }, 60 * 60 * 1000);
  }

  // Pull live standings (optional); merge by apiName. If API fails or returns
  // all zeros (tournament hasn't started), we still render everything from static data.
  let apiStandings = {};
  try {
    const raw = await fetchCached('/api/mundial', 3600_000);
    apiStandings = raw.standings || {};
  } catch (e) { /* ignore — static data is enough */ }

  const cards = MUNDIAL_GROUPS.map(g => {
    // Merge API stats into each team
    const apiTeams = (apiStandings[g.letter] || []).reduce((acc, t) => { acc[t.team] = t; return acc; }, {});
    const teams = g.teams.map(t => {
      const stats = t.apiName ? apiTeams[t.apiName] : null;
      return {
        ...t,
        played: stats?.played ?? 0,
        won: stats?.won ?? 0,
        draw: stats?.draw ?? 0,
        lost: stats?.lost ?? 0,
        gf: stats?.gf ?? 0,
        ga: stats?.ga ?? 0,
        points: stats?.points ?? 0,
      };
    });
    // Sort by points desc, then GD, then GF
    teams.sort((a, b) => (b.points - a.points) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf));

    const teamRows = teams.map((t, i) => {
      const tag = t.tag === 'sede' ? '<span class="tag" style="background:var(--bg-2);color:var(--hot);border-color:var(--hot);margin-left:6px">sede</span>' :
        t.tag === 'playoff' ? '<span class="tag" style="margin-left:6px">playoff</span>' : '';
      return `<tr>
        <td class="dim">${i + 1}</td>
        <td><span style="font-size:16px;margin-right:6px">${t.flag}</span><span class="${i < 2 ? 'hot' : ''}">${esc(t.name)}</span>${tag}</td>
        <td class="num dim">${t.played}</td>
        <td class="num">${t.won}</td>
        <td class="num">${t.draw}</td>
        <td class="num">${t.lost}</td>
        <td class="num">${t.gf}</td>
        <td class="num">${t.ga}</td>
        <td class="num hot">${t.points}</td>
      </tr>`;
    }).join('');

    const matchRows = g.matches.map(m => `<tr>
      <td class="dim" style="white-space:nowrap">${esc(m.date)}</td>
      <td><span>${esc(m.t1)}</span> <span class="dim">vs</span> <span>${esc(m.t2)}</span></td>
      <td class="dim" style="text-align:right">${esc(m.city)}</td>
    </tr>`).join('');

    return `<section class="s mundial-group">
      <h2>
        <span><span class="hot">grupo ${esc(g.letter)}</span> <span class="dim">· ${esc(g.venue)}</span></span>
        <span class="line"></span>
      </h2>
      <table class="t">
        <thead><tr>
          <th style="text-align:left">#</th>
          <th style="text-align:left">selección</th>
          <th>pj</th><th>g</th><th>e</th><th>p</th><th>gf</th><th>gc</th><th>pts</th>
        </tr></thead>
        <tbody>${teamRows}</tbody>
      </table>
      <div class="mundial-matches">
        <div class="mundial-matches-head">PARTIDOS</div>
        <table class="t">
          <tbody>${matchRows}</tbody>
        </table>
      </div>
    </section>`;
  });

  // Render in 2-col grid
  const cols = [[], []];
  cards.forEach((c, i) => cols[i % 2].push(c));

  // Eliminatorias at the end
  const knockout = `<section class="s" style="margin-top:8px">
    <h2><span>eliminatorias</span><span class="line"></span></h2>
    <table class="t">
      <thead><tr>
        <th style="text-align:left">ronda</th>
        <th style="text-align:left">fechas</th>
        <th>partidos</th>
      </tr></thead>
      <tbody>${MUNDIAL_KNOCKOUT.map(k => `<tr>
        <td class="${/final\s*$/.test(k.name) ? 'hot' : ''}">${esc(k.name)}</td>
        <td class="dim">${esc(k.dates)}</td>
        <td class="num">${k.matches}</td>
      </tr>`).join('')}</tbody>
    </table>
  </section>`;

  $('#mun-grid').innerHTML = `<div class="cols two"><div>${cols[0].join('')}</div><div>${cols[1].join('')}</div></div>${knockout}`;
}

const SCREENS = {
  monitor: screenMonitor,
  cedears: screenCedears,
  remesas: screenRemesas,
  cuotas: screenCuotas,
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
const G_KEY = { m: 'monitor', c: 'cedears', s: 'remesas', q: 'cuotas', a: 'ars', b: 'bonos', o: 'ons', h: 'hipotecarios', d: 'dolar', p: 'pix', r: 'bcra', w: 'mundial' };
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
          <li><a href="#remesas">remesas</a></li>
        </ul>
      </div>
      <div>
        <h4>más</h4>
        <ul>
          <li><a href="#monitor.mundo">monitor · mundo</a></li>
          <li><a href="#monitor.argy">monitor · argy</a></li>
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
