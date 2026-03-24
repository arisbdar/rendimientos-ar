const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  try {
    const bcraUrl = 'https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/30';
    
    const response = await fetch(bcraUrl, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`BCRA API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.results || !data.results[0] || !data.results[0].detalle) {
      throw new Error('Invalid BCRA API response format');
    }

    const detalle = data.results[0].detalle;
    
    if (detalle.length === 0) {
      throw new Error('No CER data available');
    }

    // Calcular fecha T-10 (10 días hábiles antes del settlement T+1)
    // Aproximación: restar 14 días calendario desde hoy
    const hoy = new Date();
    const t1 = new Date(hoy);
    t1.setDate(t1.getDate() + 1); // Settlement T+1
    const fc = new Date(t1);
    fc.setDate(fc.getDate() - 14); // T-10 aproximado
    
    const fcStr = fc.toISOString().split('T')[0];
    
    // BCRA retorna datos en orden descendente (más reciente primero)
    // Buscar el CER más cercano a fc (T-10) que sea <= fc
    let cerT10 = null;
    for (let i = 0; i < detalle.length; i++) {
      if (detalle[i].fecha <= fcStr) {
        cerT10 = detalle[i];
        break;
      }
    }
    
    // Si no se encuentra, usar el más antiguo disponible
    if (!cerT10) {
      cerT10 = detalle[detalle.length - 1];
    }
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      },
      body: JSON.stringify({
        cer: cerT10.valor,
        fecha: cerT10.fecha,
        fuente: 'BCRA (T-10)'
      })
    };
  } catch (error) {
    console.error('Error fetching CER:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Failed to fetch CER data',
        message: error.message
      })
    };
  }
};
