// AI Chat assistant powered by Claude Haiku
// Fetches live data from internal APIs and uses it as context for Claude
const https = require('https');

// ─── Rate Limiting (in-memory, resets on cold start) ───
const DAILY_LIMIT = 50;
const rateMap = new Map(); // ip -> { count, date }

function checkRateLimit(ip) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const entry = rateMap.get(ip);
  if (!entry || entry.date !== today) {
    rateMap.set(ip, { count: 1, date: today });
    return { allowed: true, remaining: DAILY_LIMIT - 1 };
  }
  if (entry.count >= DAILY_LIMIT) {
    return { allowed: false, remaining: 0 };
  }
  entry.count++;
  return { allowed: true, remaining: DAILY_LIMIT - entry.count };
}

function getClientIP(event) {
  return event.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || event.headers['client-ip']
    || event.headers['x-real-ip']
    || 'unknown';
}

function fetchJSON(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchJSON(res.headers.location, timeout));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON from ' + url)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout: ' + url)); });
  });
}

async function gatherContext() {
  const parts = [];

  // 1. Cotizaciones (dólar, riesgo país)
  try {
    const [bonds, riesgo, yahoo] = await Promise.allSettled([
      fetchJSON('https://data912.com/live/arg_bonds'),
      fetchJSON('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo'),
      fetchJSON('https://query1.finance.yahoo.com/v8/finance/chart/ARS%3DX?interval=1d&range=5d'),
    ]);

    let oficial = null;
    if (yahoo.status === 'fulfilled') {
      try { oficial = yahoo.value.chart.result[0].meta.regularMarketPrice; } catch (e) {}
    }

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
    if (riesgo.status === 'fulfilled' && riesgo.value && riesgo.value.valor != null) {
      rp = riesgo.value.valor;
    }

    if (oficial || ccl || mep || rp) {
      parts.push(`COTIZACIONES HOY:
- Dólar Oficial: ${oficial ? '$' + oficial : 'N/D'}
- Dólar CCL (Contado con Liqui): ${ccl ? '$' + ccl : 'N/D'}
- Dólar MEP: ${mep ? '$' + mep : 'N/D'}
- Riesgo País: ${rp || 'N/D'} puntos`);
    }
  } catch (e) {
    console.log('Context: cotizaciones error:', e.message);
  }

  // 2. Config: billeteras, cuentas, LECAPs, bonos CER, soberanos
  try {
    const config = await fetchJSON('https://rendimientos.co/config.json');

    if (config.garantizados) {
      const activos = config.garantizados.filter(g => g.activo !== false).sort((a, b) => b.tna - a.tna);
      const lines = activos.map(g => `- ${g.nombre} (${g.tipo}): TNA ${g.tna}% | Límite: ${g.limite || 'Sin límite'} | Vigente desde: ${g.vigente_desde || 'N/D'}`);
      parts.push(`BILLETERAS Y CUENTAS REMUNERADAS:\n${lines.join('\n')}`);
    }

    if (config.especiales) {
      const esp = config.especiales.filter(g => g.activo !== false);
      if (esp.length > 0) {
        const lines = esp.map(g => `- ${g.nombre}: TNA ${g.tna}% | ${g.descripcion || ''} | Límite: ${g.limite || 'Sin límite'}`);
        parts.push(`CUENTAS ESPECIALES (con condiciones):\n${lines.join('\n')}`);
      }
    }

    if (config.lecaps) {
      const lecaps = Object.entries(config.lecaps).map(([ticker, data]) => {
        const tipo = data.tipo || (ticker.startsWith('S') ? 'LECAP' : 'BONCAP');
        return `- ${ticker} (${tipo}): vence ${data.vencimiento}, pago final $${data.pago_final} por cada $100 VN`;
      });
      parts.push(`LECAPs y BONCAPs (instrumentos de renta fija en pesos):\n${lecaps.join('\n')}`);
    }

    if (config.soberanos) {
      const lines = Object.entries(config.soberanos).map(([ticker, data]) => {
        return `- ${ticker}: Ley ${data.ley || 'N/D'}, vence ${data.vencimiento || 'N/D'}`;
      });
      parts.push(`BONOS SOBERANOS EN USD:\n${lines.join('\n')}`);
    }

    if (config.cer_bonds) {
      const lines = Object.entries(config.cer_bonds).map(([ticker, data]) => {
        return `- ${ticker}: vence ${data.vencimiento || 'N/D'}`;
      });
      parts.push(`BONOS CER (ajustan por inflación):\n${lines.join('\n')}`);
    }
  } catch (e) {
    console.log('Context: config error:', e.message);
  }

  // 3. Plazo fijo
  try {
    const pfData = await fetchJSON('https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo/');
    if (Array.isArray(pfData) && pfData.length > 0) {
      const top = pfData.sort((a, b) => b.tnaClientes - a.tnaClientes).slice(0, 10);
      const lines = top.map(p => {
        // API returns decimals (0.29 = 29%), convert to percentage
        const tna = p.tnaClientes < 1 ? (p.tnaClientes * 100).toFixed(1) : p.tnaClientes;
        return `- ${p.entidad}: TNA ${tna}%`;
      });
      parts.push(`PLAZO FIJO (top 10 bancos, $100K a 30 días):\n${lines.join('\n')}`);
    }
  } catch (e) {
    console.log('Context: plazo fijo error:', e.message);
  }

  // 4. LECAPs precios live
  try {
    const lecapData = await fetchJSON('https://data912.com/live/arg_lecap');
    if (Array.isArray(lecapData) && lecapData.length > 0) {
      const lines = lecapData.slice(0, 15).map(l => `- ${l.symbol}: precio $${l.c || l.last || 'N/D'}`);
      parts.push(`PRECIOS LIVE LECAPs/BONCAPs:\n${lines.join('\n')}`);
    }
  } catch (e) {
    console.log('Context: lecaps live error:', e.message);
  }

  console.log('Context gathered, parts:', parts.length, 'total chars:', parts.join('').length);
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

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Rate limit check
  const clientIP = getClientIP(event);
  const { allowed, remaining } = checkRateLimit(clientIP);
  if (!allowed) {
    return { statusCode: 429, headers, body: JSON.stringify({ error: 'Alcanzaste el límite de 50 consultas por día. Volvé mañana!' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  try {
    const { message, history } = JSON.parse(event.body);
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Message required' }) };
    }

    if (message.length > 500) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Mensaje muy largo (máx 500 caracteres)' }) };
    }

    // Gather live data context
    const context = await gatherContext();

    const systemPrompt = `${SYSTEM_PROMPT}\n\nDATOS ACTUALES DE RENDIMIENTOS.CO (${new Date().toLocaleDateString('es-AR')}):\n\n${context || 'No se pudieron cargar datos en este momento.'}`;

    console.log('System prompt length:', systemPrompt.length);

    // Build messages array
    const messages = [];
    if (Array.isArray(history)) {
      const recentHistory = history.slice(-6);
      for (const h of recentHistory) {
        if (h.role === 'user' || h.role === 'assistant') {
          messages.push({ role: h.role, content: h.content });
        }
      }
    }
    messages.push({ role: 'user', content: message });

    // Call Claude API
    const reply = await new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: systemPrompt,
        messages,
      });
      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(payload),
        },
      }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              console.error('Anthropic API error:', res.statusCode, data);
              return reject(new Error('API error ' + res.statusCode));
            }
            const json = JSON.parse(data);
            resolve(json.content[0].text);
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.setTimeout(25000, () => { req.destroy(); reject(new Error('timeout')); });
      req.write(payload);
      req.end();
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ response: reply }),
    };
  } catch (e) {
    console.error('Chat error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error interno del asistente' }) };
  }
};
