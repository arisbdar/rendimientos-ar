// Fetches key indicators from BCRA public API (Estadísticas Monetarias v4.0)
const https = require('https');

// Todas las Principales Variables del BCRA v4.0 (IDs verificados)
const VARIABLES = [
  // Cambiario
  { id: 1,  key: 'reservas',              nombre: 'Reservas Internacionales',          unidad: 'MM USD', categoria: 'Cambiario', formato: 'numero' },
  { id: 4,  key: 'usd_minorista',         nombre: 'Dólar Minorista (vendedor)',        unidad: '$/USD',  categoria: 'Cambiario', formato: 'numero' },
  { id: 5,  key: 'usd_mayorista',         nombre: 'Dólar Mayorista (referencia)',      unidad: '$/USD',  categoria: 'Cambiario', formato: 'numero' },
  // Tasas
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
  // Monetario
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
  // Inflación
  { id: 27, key: 'inflacion_mensual',    nombre: 'Inflación Mensual (IPC)',          unidad: '%',      categoria: 'Inflación', formato: 'pct' },
  { id: 28, key: 'inflacion_interanual', nombre: 'Inflación Interanual (IPC)',       unidad: '%',      categoria: 'Inflación', formato: 'pct' },
  { id: 29, key: 'inflacion_esperada',   nombre: 'Inflación Esperada (próx. 12m)',   unidad: '%',      categoria: 'Inflación', formato: 'pct' },
  // Índices
  { id: 30, key: 'cer',                  nombre: 'CER',                              unidad: 'índice', categoria: 'Índices',   formato: 'numero' },
  { id: 31, key: 'uva',                  nombre: 'UVA',                              unidad: '$',      categoria: 'Índices',   formato: 'numero' },
  { id: 32, key: 'uvi',                  nombre: 'UVI',                              unidad: '$',      categoria: 'Índices',   formato: 'numero' },
  { id: 40, key: 'icl',                  nombre: 'ICL (Índice Contratos Locación)',  unidad: 'índice', categoria: 'Índices',   formato: 'numero' },
];

function fetchVar(idVariable) {
  const url = `https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/${idVariable}?limit=2`;
  return new Promise((resolve, reject) => {
    const req = https.get(url, { rejectUnauthorized: false }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300'
  };

  // Support fetching history for a single variable
  const params = event.queryStringParameters || {};
  if (params.variable) {
    const id = parseInt(params.variable, 10);
    const desde = params.desde || '';
    const hasta = params.hasta || '';
    // Sin fechas = todo el histórico, usar límite máximo del API (3000)
    const limit = (desde || hasta) ? 3000 : 3000;
    let url = `https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/${id}?limit=${limit}`;
    if (desde) url += `&desde=${desde}`;
    if (hasta) url += `&hasta=${hasta}`;
    try {
      const result = await new Promise((resolve, reject) => {
        const req = https.get(url, { rejectUnauthorized: false }, res => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch (e) { reject(e); }
          });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return { statusCode: 200, headers, body: JSON.stringify(result) };
    } catch (err) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: err.message }) };
    }
  }

  // Default: fetch latest value for all key variables
  try {
    const results = await Promise.allSettled(VARIABLES.map(v => fetchVar(v.id)));
    const data = [];

    for (let i = 0; i < VARIABLES.length; i++) {
      const varDef = VARIABLES[i];
      const result = results[i];
      if (result.status === 'fulfilled' && result.value.results && result.value.results.length > 0) {
        const detalle = result.value.results[0].detalle || [];
        const latest = detalle[0];
        const prev = detalle.length > 1 ? detalle[1] : null;
        data.push({
          ...varDef,
          valor: latest ? latest.valor : null,
          fecha: latest ? latest.fecha : null,
          valorAnterior: prev ? prev.valor : null,
          fechaAnterior: prev ? prev.fecha : null,
        });
      } else {
        data.push({ ...varDef, valor: null, fecha: null, valorAnterior: null, fechaAnterior: null });
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data, timestamp: new Date().toISOString() })
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch BCRA data', message: error.message })
    };
  }
};
