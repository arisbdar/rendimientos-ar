// Fetches hipotecarios UVA data from Google Sheets (published CSV)
const https = require('https');

const SHEET_ID = '1h191b61YRkAI9Xv3_dDuNf7ejst_ziw9kacfJsnvLoM';
const GID = '1120229027';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  try {
    const csv = await fetchText(CSV_URL);
    const rows = parseCSV(csv);

    if (rows.length < 2) {
      return { statusCode: 200, headers, body: JSON.stringify({ data: [], source: 'google-sheets' }) };
    }

    // Skip header row, parse data
    const data = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 5 || !row[0].trim()) continue;

      const banco = row[0].trim();
      const tna = parseFloat(row[1].replace('%', '').replace(',', '.')) || 0;
      const plazoMax = parseInt(row[2], 10) || 0;
      const cuotaIngreso = row[3].trim();
      const financiamiento = row[4].trim();

      if (tna <= 0) continue;

      data.push({
        banco,
        tna,
        plazo_max_anios: plazoMax,
        relacion_cuota_ingreso: cuotaIngreso,
        financiamiento,
      });
    }

    // Sort by TNA ascending (lower = better for borrower)
    data.sort((a, b) => a.tna - b.tna);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data, source: 'google-sheets', updated: new Date().toISOString() }),
    };
  } catch (e) {
    console.error('Hipotecarios fetch error:', e);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Failed to fetch hipotecarios data' }) };
  }
};

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      // Follow redirects (Google Sheets export redirects)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchText(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
  });
}

function parseCSV(text) {
  const rows = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Simple CSV parse (handles quoted fields)
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cells.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current);
    rows.push(cells);
  }
  return rows;
}
