// Aggregates dollar exchange rates from comparadolar.ar API
const COMPARADOLAR_BASE = 'https://api.comparadolar.ar';

// Providers to exclude entirely
const BLACKLIST = new Set(['brubank']);
// Providers that only belong in crypto tabs, not USD billete
const USD_EXCLUDE = new Set(['wallbit', 'global66', 'astropay']);

async function fetchJSON(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'rendimientos.co/1.0' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
  return r.json();
}

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
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');

  try {
    const results = await Promise.allSettled([
      fetchJSON(`${COMPARADOLAR_BASE}/usd`),
      fetchJSON(`${COMPARADOLAR_BASE}/usdt`),
      fetchJSON(`${COMPARADOLAR_BASE}/usdc`),
      fetchJSON('https://api.cocos.capital/api/v1/public/mep-prices'),
    ]);

    const usdRaw = results[0].status === 'fulfilled' ? results[0].value : [];
    const usdtRaw = results[1].status === 'fulfilled' ? results[1].value : [];
    const usdcRaw = results[2].status === 'fulfilled' ? results[2].value : [];
    const cocosRaw = results[3].status === 'fulfilled' ? results[3].value : null;

    const usd = usdRaw.map(normalizeUsdProvider).filter(e => e && !BLACKLIST.has(e.id) && !USD_EXCLUDE.has(e.id));
    const usdt = usdtRaw.map(normalizeCryptoExchange).filter(e => e && !BLACKLIST.has(e.id));
    const usdc = usdcRaw.map(normalizeCryptoExchange).filter(e => e && !BLACKLIST.has(e.id));

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
