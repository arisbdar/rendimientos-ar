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

    // Último CER publicado
    const ultimoCER = detalle[0];
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400'
      },
      body: JSON.stringify({
        cer: ultimoCER.valor,
        fecha: ultimoCER.fecha,
        fuente: 'BCRA'
      })
    };
  } catch (error) {
    console.error('Error fetching último CER:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Failed to fetch último CER data' })
    };
  }
};
