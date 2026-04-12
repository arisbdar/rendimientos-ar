// AI Chat assistant powered by Claude Haiku
// Fetches live data from internal APIs and uses it as context for Claude

// Rate Limiting (in-memory, resets on cold start)
const DAILY_LIMIT = 50;
const rateMap = new Map();

function checkRateLimit(ip) {
  const today = new Date().toISOString().slice(0, 10);
  const entry = rateMap.get(ip);
  if (!entry || entry.date !== today) { rateMap.set(ip, { count: 1, date: today }); return { allowed: true, remaining: DAILY_LIMIT - 1 }; }
  if (entry.count >= DAILY_LIMIT) return { allowed: false, remaining: 0 };
  entry.count++;
  return { allowed: true, remaining: DAILY_LIMIT - entry.count };
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['client-ip'] || req.headers['x-real-ip'] || 'unknown';
}

// Per-minute rate limiting
const chatRateLimit = new Map();
const CHAT_RATE_LIMIT = 10;       // max requests
const CHAT_RATE_WINDOW = 60000;   // per 60 seconds

function checkChatRateLimit(ip) {
  const now = Date.now();
  const entry = chatRateLimit.get(ip);
  if (!entry || now - entry.start > CHAT_RATE_WINDOW) {
    chatRateLimit.set(ip, { start: now, count: 1 });
    return true;
  }
  if (entry.count >= CHAT_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of chatRateLimit) {
    if (now - entry.start > CHAT_RATE_WINDOW * 2) chatRateLimit.delete(ip);
  }
}, 300000);

async function fetchJSON(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow', signal: AbortSignal.timeout(10000) });
  return r.json();
}

async function gatherContext() {
  const parts = [];

  try {
    const [bonds, riesgo, yahoo] = await Promise.allSettled([
      fetchJSON('https://data912.com/live/arg_bonds'),
      fetchJSON('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo'),
      fetchJSON('https://query1.finance.yahoo.com/v8/finance/chart/ARS%3DX?interval=1d&range=5d'),
    ]);
    let oficial = null;
    if (yahoo.status === 'fulfilled') { try { oficial = yahoo.value.chart.result[0].meta.regularMarketPrice; } catch (e) {} }
    let ccl = null, mep = null;
    if (bonds.status === 'fulfilled' && Array.isArray(bonds.value)) {
      const al30 = bonds.value.find(b => b.symbol === 'AL30');
      const al30d = bonds.value.find(b => b.symbol === 'AL30D');
      const al30c = bonds.value.find(b => b.symbol === 'AL30C');
      const ars = al30 ? parseFloat(al30.c) : 0;
      if (al30c && ars > 0) { const u = parseFloat(al30c.c); if (u > 0) ccl = Math.round((ars / u) * 100) / 100; }
      if (al30d && ars > 0) { const u = parseFloat(al30d.c); if (u > 0) mep = Math.round((ars / u) * 100) / 100; }
    }
    let rp = null;
    if (riesgo.status === 'fulfilled' && riesgo.value?.valor != null) rp = riesgo.value.valor;
    if (oficial || ccl || mep || rp) {
      parts.push(`COTIZACIONES HOY:\n- Dólar Oficial: ${oficial ? '$' + oficial : 'N/D'}\n- Dólar CCL (Contado con Liqui): ${ccl ? '$' + ccl : 'N/D'}\n- Dólar MEP: ${mep ? '$' + mep : 'N/D'}\n- Riesgo País: ${rp || 'N/D'} puntos`);
    }
  } catch (e) { console.log('Context: cotizaciones error:', e.message); }

  try {
    const config = await fetchJSON('https://rendimientos.co/config.json');
    if (config.garantizados) {
      const activos = config.garantizados.filter(g => g.activo !== false).sort((a, b) => b.tna - a.tna);
      const lines = activos.map(g => `- ${g.nombre} (${g.tipo}): TNA ${g.tna}% | Límite: ${g.limite || 'Sin límite'} | Vigente desde: ${g.vigente_desde || 'N/D'}`);
      parts.push(`BILLETERAS Y CUENTAS REMUNERADAS:\n${lines.join('\n')}`);
    }
    if (config.especiales) {
      const esp = config.especiales.filter(g => g.activo !== false);
      if (esp.length > 0) { const lines = esp.map(g => `- ${g.nombre}: TNA ${g.tna}% | ${g.descripcion || ''} | Límite: ${g.limite || 'Sin límite'}`); parts.push(`CUENTAS ESPECIALES (con condiciones):\n${lines.join('\n')}`); }
    }
    if (config.lecaps) {
      const lecaps = Object.entries(config.lecaps).map(([ticker, data]) => { const tipo = data.tipo || (ticker.startsWith('S') ? 'LECAP' : 'BONCAP'); return `- ${ticker} (${tipo}): vence ${data.vencimiento}, pago final $${data.pago_final} por cada $100 VN`; });
      parts.push(`LECAPs y BONCAPs (instrumentos de renta fija en pesos):\n${lecaps.join('\n')}`);
    }
    if (config.soberanos) {
      const lines = Object.entries(config.soberanos).map(([ticker, data]) => `- ${ticker}: Ley ${data.ley || 'N/D'}, vence ${data.vencimiento || 'N/D'}`);
      parts.push(`BONOS SOBERANOS EN USD:\n${lines.join('\n')}`);
    }
    if (config.cer_bonds) {
      const lines = Object.entries(config.cer_bonds).map(([ticker, data]) => `- ${ticker}: vence ${data.vencimiento || 'N/D'}`);
      parts.push(`BONOS CER (ajustan por inflación):\n${lines.join('\n')}`);
    }
  } catch (e) { console.log('Context: config error:', e.message); }

  try {
    const pfData = await fetchJSON('https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo/');
    if (Array.isArray(pfData) && pfData.length > 0) {
      const top = pfData.sort((a, b) => b.tnaClientes - a.tnaClientes).slice(0, 10);
      const lines = top.map(p => { const tna = p.tnaClientes < 1 ? (p.tnaClientes * 100).toFixed(1) : p.tnaClientes; return `- ${p.entidad}: TNA ${tna}%`; });
      parts.push(`PLAZO FIJO (top 10 bancos, $100K a 30 días):\n${lines.join('\n')}`);
    }
  } catch (e) { console.log('Context: plazo fijo error:', e.message); }

  try {
    const lecapData = await fetchJSON('https://data912.com/live/arg_lecap');
    if (Array.isArray(lecapData) && lecapData.length > 0) {
      const lines = lecapData.slice(0, 15).map(l => `- ${l.symbol}: precio $${l.c || l.last || 'N/D'}`);
      parts.push(`PRECIOS LIVE LECAPs/BONCAPs:\n${lines.join('\n')}`);
    }
  } catch (e) { console.log('Context: lecaps live error:', e.message); }

  return parts.join('\n\n');
}

const SYSTEM_PROMPT = `Sos el asistente financiero de Rendimientos.co, el comparador de inversiones de Argentina.

Tu rol:
- Respondés preguntas sobre productos financieros argentinos: billeteras virtuales, cuentas remuneradas, plazos fijos, LECAPs, BONCAPs, bonos CER, bonos soberanos y obligaciones negociables.
- Usás los DATOS ACTUALES que te doy abajo para dar respuestas precisas con números reales.
- Respondés en español argentino, de forma concisa y clara.
- NO das consejos de inversión ni recomendaciones personalizadas. Presentás datos comparativos para que el usuario decida.
- Si no tenés el dato, decí que no lo tenés y sugerí dónde encontrarlo en la web de Rendimientos.co.
- Sé breve: respuestas de 2-4 oraciones salvo que el usuario pida más detalle.
- Podés usar formato con bullets o negritas para mayor claridad.
- Aclarás siempre que los datos son informativos y pueden tener delay.
- Cuando hables de LECAPs/BONCAPs, mencioná el ticker, el vencimiento y el pago final.
- Cuando compares billeteras, mencioná la TNA y el límite.

IMPORTANTE: No inventes datos. Solo usá los que te proporciono en el contexto. Tenés datos reales y actualizados — usalos.`;

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || req.ip || 'unknown';
  if (!checkChatRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Demasiadas consultas. Esperá un minuto.' });
  }

  const clientIP = getClientIP(req);
  const { allowed, remaining } = checkRateLimit(clientIP);
  if (!allowed) return res.status(429).json({ error: 'Alcanzaste el límite de 50 consultas por día. Volvé mañana!' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { message, history } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) return res.status(400).json({ error: 'Message required' });
    if (message.length > 500) return res.status(400).json({ error: 'Mensaje muy largo (máx 500 caracteres)' });

    const context = await gatherContext();
    const systemPrompt = `${SYSTEM_PROMPT}\n\nDATOS ACTUALES DE RENDIMIENTOS.CO (${new Date().toLocaleDateString('es-AR')}):\n\n${context || 'No se pudieron cargar datos en este momento.'}`;

    const messages = [];
    if (Array.isArray(history)) {
      for (const h of history.slice(-6)) {
        if (h.role === 'user' || h.role === 'assistant') messages.push({ role: h.role, content: h.content });
      }
    }
    messages.push({ role: 'user', content: message });

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, system: systemPrompt, messages }),
      signal: AbortSignal.timeout(25000),
    });

    if (!anthropicRes.ok) {
      console.error('Anthropic API error:', anthropicRes.status);
      throw new Error('API error ' + anthropicRes.status);
    }

    const json = await anthropicRes.json();
    res.status(200).json({ response: json.content[0].text });
  } catch (e) {
    console.error('Chat error:', e);
    res.status(500).json({ error: 'Error interno del asistente' });
  }
}
