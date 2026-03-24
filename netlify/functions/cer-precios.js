const fetch = require('node-fetch');

const TICKERS_CER = ['TZX26', 'TZXO6', 'TX26', 'TZXD6', 'TZXM7', 'TZX27', 'TZXD7', 'TZX28', 'TX28', 'DICP', 'PARP'];

exports.handler = async (event, context) => {
  try {
    const response = await fetch('https://data912.com/live/arg_bonds', {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      }
    });

    if (!response.ok) {
      throw new Error(`data912 API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('Invalid data912 API response format');
    }

    const bonosCER = data.data.filter(bond => 
      TICKERS_CER.includes(bond.symbol)
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
      },
      body: JSON.stringify({
        data: bonosCER,
        timestamp: new Date().toISOString(),
        count: bonosCER.length
      })
    };
  } catch (error) {
    console.error('Error fetching CER bond prices:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Failed to fetch CER bond prices',
        message: error.message
      })
    };
  }
};
