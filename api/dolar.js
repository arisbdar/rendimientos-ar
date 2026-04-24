// Aggregates dollar exchange rates from comparadolar.ar (USD billete) +
// criptoya.com (USDT/USDC — feed más fresco y con más exchanges).
const COMPARADOLAR_BASE = 'https://api.comparadolar.ar';
const CRIPTOYA_BASE = 'https://criptoya.com/api';

// Providers to exclude entirely
const BLACKLIST = new Set(['brubank']);
// Providers that only belong in crypto tabs, not USD billete
const USD_EXCLUDE = new Set(['wallbit', 'global66', 'astropay']);
// Criptoya exchange slugs que no queremos mostrar (P2P agregados, wallets raros, etc.)
const CRYPTO_EXCLUDE = new Set(['binancep2p', 'okexp2p', 'huobip2p', 'paxfulp2p', 'bybitp2p', 'universalcoins']);

// Pretty-name + logo map para criptoya (keyed by criptoya slug).
// Los slugs que no estén acá caen al fallback basado en metadata de comparadolar.
const CRYPTO_META = {
  belo:          { name: 'Belo',          logo: 'https://api.argentinadatos.com/static/logos/belo.png' },
  buenbit:       { name: 'Buenbit',       logo: 'https://api.argentinadatos.com/static/logos/buenbit.png' },
  cocoscrypto:   { name: 'Cocos Crypto',  logo: 'https://api.argentinadatos.com/static/logos/cocos.png' },
  decrypto:      { name: 'Decrypto',      logo: 'https://api.argentinadatos.com/static/logos/decrypto.png' },
  fiwind:        { name: 'Fiwind',        logo: 'https://api.argentinadatos.com/static/logos/fiwind.png' },
  lemoncash:     { name: 'Lemon',         logo: 'https://api.argentinadatos.com/static/logos/lemoncash.png' },
  letsbit:       { name: 'LB Finanzas',   logo: 'https://api.argentinadatos.com/static/logos/letsbit.png' },
  pluscrypto:    { name: 'Plus Crypto',   logo: 'https://api.argentinadatos.com/static/logos/pluscrypto.png' },
  ripio:         { name: 'Ripio',         logo: 'https://api.argentinadatos.com/static/logos/ripio.png' },
  ripioexchange: { name: 'Ripio Exchange', logo: 'https://api.argentinadatos.com/static/logos/ripio.png' },
  satoshitango:  { name: 'Satoshi Tango', logo: 'https://api.argentinadatos.com/static/logos/satoshitango.png' },
  tiendacrypto:  { name: 'TiendaCrypto',  logo: 'https://api.argentinadatos.com/static/logos/tiendacrypto.png' },
  vitawallet:    { name: 'Vita Wallet',   logo: null },
  binance:       { name: 'Binance',       logo: null },
  bybit:         { name: 'Bybit',         logo: null },
  coinbase:      { name: 'Coinbase',      logo: null },
  kraken:        { name: 'Kraken',        logo: null },
  astropay:      { name: 'Astropay',      logo: null },
  wallbit:       { name: 'Wallbit',       logo: null },
};

async function fetchJSON(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'rendimientos.co/1.0' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
  return r.json();
}

// Normalizador para el shape de comparadolar (fallback legacy para USDC)
function normalizeCryptoExchange(entry) {
  const slug = entry.slug || entry.id;
  const ask = parseFloat(entry.ask) || parseFloat(entry.totalAsk) || 0;
  const bid = parseFloat(entry.bid) || parseFloat(entry.totalBid) || 0;
  if (ask <= 0 || bid <= 0) return null;
  const spread = ((ask - bid) / bid) * 100;
  if (spread > 12) return null;
  return {
    id: slug,
    name: entry.prettyName || slug,
    ask, bid,
    spread: Math.round(spread * 100) / 100,
    logoUrl: entry.logo || entry.logoUrl || null,
    url: entry.url || null,
  };
}

// Normalizador para criptoya: feed en tiempo real, más exchanges, per-exchange timestamps.
// El 'obj' es el dict devuelto por criptoya keyed por slug. Devuelve array para nuestro formato.
function normalizeCriptoya(obj, fallbackMeta = {}) {
  if (!obj || typeof obj !== 'object') return [];
  const out = [];
  const now = Math.floor(Date.now() / 1000);
  for (const [slug, v] of Object.entries(obj)) {
    if (!v || typeof v !== 'object') continue;
    if (CRYPTO_EXCLUDE.has(slug) || BLACKLIST.has(slug)) continue;
    const ask = parseFloat(v.ask) || 0;
    const bid = parseFloat(v.bid) || 0;
    if (ask <= 0 || bid <= 0) continue;
    const spread = ((ask - bid) / bid) * 100;
    if (spread > 12) continue;
    // Saltar entries stale (>30 min vs ahora)
    if (v.time && now - v.time > 1800) continue;
    const meta = CRYPTO_META[slug] || fallbackMeta[slug] || { name: slug, logo: null };
    out.push({
      id: slug,
      name: meta.name,
      ask, bid,
      spread: Math.round(spread * 100) / 100,
      logoUrl: meta.logo,
      url: null,
      updated: v.time ? new Date(v.time * 1000).toISOString() : null,
      ageSec: v.time ? (now - v.time) : null,
    });
  }
  return out;
}

function normalizeUsdProvider(entry) {
  const ask = parseFloat(entry.ask) || 0;
  const bid = parseFloat(entry.bid) || 0;
  if (ask <= 0 || bid <= 0) return null;
  const spread = ((ask - bid) / bid) * 100;
  if (spread > 12) return null;
  return {
    id: entry.slug,
    name: entry.prettyName || entry.name || entry.slug,
    ask, bid,
    spread: Math.round(spread * 100) / 100,
    isBank: entry.isBank || false,
    is24x7: entry.is24x7 || false,
    pctVariation: entry.pct_variation ?? null,
    logoUrl: entry.logoUrl || null,
    url: entry.url || null,
  };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');

  try {
    const results = await Promise.allSettled([
      fetchJSON(`${COMPARADOLAR_BASE}/usd`),
      fetchJSON(`${CRIPTOYA_BASE}/usdt/ars`),
      fetchJSON(`${CRIPTOYA_BASE}/usdc/ars`),
      fetchJSON('https://api.cocos.capital/api/v1/public/mep-prices'),
      // Legacy de comparadolar como fallback de metadata (logos, nombres)
      fetchJSON(`${COMPARADOLAR_BASE}/usdt`).catch(() => []),
    ]);

    const usdRaw = results[0].status === 'fulfilled' ? results[0].value : [];
    const usdtRaw = results[1].status === 'fulfilled' ? results[1].value : {};
    const usdcRaw = results[2].status === 'fulfilled' ? results[2].value : {};
    const cocosRaw = results[3].status === 'fulfilled' ? results[3].value : null;
    const cdUsdtRaw = results[4].status === 'fulfilled' ? results[4].value : [];

    // Fallback metadata: slugs de comparadolar → {name, logo} para cubrir gaps del CRYPTO_META
    const fallbackMeta = {};
    for (const e of cdUsdtRaw) {
      if (!e || !e.slug) continue;
      fallbackMeta[e.slug] = {
        name: e.prettyName || e.name || e.slug,
        logo: e.logo || e.logoUrl || null,
      };
    }

    const usd = usdRaw.map(normalizeUsdProvider).filter(e => e && !BLACKLIST.has(e.id) && !USD_EXCLUDE.has(e.id));
    const usdt = normalizeCriptoya(usdtRaw, fallbackMeta);
    const usdc = normalizeCriptoya(usdcRaw, fallbackMeta);

    // Override Cocos prices with direct cocos.capital API (more accurate / live)
    if (cocosRaw) {
      const window = ['open', 'close', 'overnight', 'fx'].map(k => cocosRaw[k]).find(w => w && w.available && w.ask > 0 && w.bid > 0);
      if (window) {
        const ask = parseFloat(window.ask);
        const bid = parseFloat(window.bid);
        const spread = ((ask - bid) / bid) * 100;
        const cocosIdx = usd.findIndex(e => e.id === 'cocos');
        const updated = {
          ask, bid,
          spread: Math.round(spread * 100) / 100,
        };
        if (cocosIdx >= 0) {
          Object.assign(usd[cocosIdx], updated);
        } else {
          usd.push({
            id: 'cocos', name: 'Cocos',
            ...updated,
            isBank: false, is24x7: true, pctVariation: null,
            logoUrl: 'https://api.argentinadatos.com/static/logos/cocos.png',
            url: 'https://cocos.capital',
          });
        }
      }
    }

    res.status(200).json({
      exchanges: { usd, usdt, usdc },
      updated: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Dolar API error:', err.message);
    res.status(502).json({ error: 'Failed to fetch dollar data' });
  }
}
