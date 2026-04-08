const SHEET_ID = '1h191b61YRkAI9Xv3_dDuNf7ejst_ziw9kacfJsnvLoM';
const GID = '1120229027';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');

  try {
    const response = await fetch(CSV_URL, { redirect: 'follow' });
    if (!response.ok) throw new Error(`Google Sheets error: ${response.status}`);
    const csv = await response.text();
    const rows = parseCSV(csv);

    if (rows.length < 2) {
      return res.status(200).json({ data: [], source: 'google-sheets' });
    }

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

    res.status(200).json({ data, source: 'google-sheets', updated: new Date().toISOString() });
  } catch (e) {
    console.error('Hipotecarios fetch error:', e);
    res.status(502).json({ error: 'Failed to fetch hipotecarios data' });
  }
}

function parseCSV(text) {
  const rows = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
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
