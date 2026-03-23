const puppeteer = require('puppeteer');
const fs = require('fs');

const PUENTE_URL = 'https://www.puentenet.com/puente/actionCalculadoraBonosPublica!calculadoraBonosPublica.action';

// ONs we want to scrape (data912 ticker without D -> Puente ID)
const ONS_TO_SCRAPE = [
  { d912: 'MGCOD', puente: 'MGCOO', nombre: 'Pampa Energía 2034' },
  { d912: 'YMCID', puente: 'YMCIO', nombre: 'YPF Clase 2' },
  { d912: 'YMCXD', puente: 'YMCXO', nombre: 'YPF 8.75% 2031' },
  { d912: 'BACGD', puente: 'BACGO', nombre: 'Banco Macro 2029' },
  { d912: 'BACHD', puente: 'BACHO', nombre: 'Banco Macro 2031' },
  { d912: 'DNC5D', puente: 'DNC5O', nombre: 'Edenor 2028' },
  { d912: 'DNC7D', puente: 'DNC7D', nombre: 'Edenor 2030' },
  { d912: 'IRCFD', puente: 'IRCFO', nombre: 'IRSA 2028' },
  { d912: 'CS47D', puente: 'CS47O', nombre: 'Cresud 2028' },
  { d912: 'CP38D', puente: 'CP38O', nombre: 'CGC 2031' },
  { d912: 'GN49D', puente: 'GN49O', nombre: 'Genneia 2033' },
  { d912: 'TLCMD', puente: 'TLCMO', nombre: 'Telecom 2031' },
  { d912: 'TGCID', puente: 'TGCIO', nombre: 'TGS 2031' },
  { d912: 'PAC3D', puente: 'PAC3O', nombre: 'Pampa 2029' },
  { d912: 'HVS1D', puente: 'HVS1O', nombre: 'Havanna 2028' },
  { d912: 'CLSID', puente: 'CLSIO', nombre: 'CLISA 2034' },
  { d912: 'GN47D', puente: 'GN47', nombre: 'Genneia 2028' },
  { d912: 'AERBD', puente: 'AERBO', nombre: 'AA2000 2026' },
  { d912: 'BYCHD', puente: 'BYCHO', nombre: 'Galicia 2028' },
  { d912: 'LDCGD', puente: 'LDCGO', nombre: 'Ledesma 2028' },
];

async function scrapeFlows(page, puenteId) {
  try {
    // Select bond
    await page.select('#idBono', `BONO_${puenteId}`);
    await new Promise(r => setTimeout(r, 1500));
    
    // Set calculation type and price
    await page.select('#tipoCalculoSelection', 'precioVR');
    await page.evaluate(() => {
      document.getElementById('precioVR').value = '100';
      document.getElementById('fechaLiquidacion').value = '25/03/2026';
      document.getElementById('cantidadVN').value = '100';
    });
    
    // Click calculate
    await page.click('#botonCalcular');
    await new Promise(r => setTimeout(r, 3000));
    
    // Extract flows from the result table
    const flows = await page.evaluate(() => {
      const rows = document.querySelectorAll('#tablaFlujos tr, .tabla-flujos tr, table.flujos tr');
      if (rows.length === 0) {
        // Try to find any table with dates
        const allRows = document.querySelectorAll('tr');
        const result = [];
        for (const row of allRows) {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            const text = cells[0].textContent.trim();
            if (/\d{2}\/\d{2}\/\d{4}/.test(text)) {
              const lastCell = cells[cells.length - 2] || cells[cells.length - 1];
              result.push({
                fecha: text,
                monto: lastCell.textContent.trim()
              });
            }
          }
        }
        return result;
      }
      return Array.from(rows).map(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) return null;
        return {
          fecha: cells[0].textContent.trim(),
          monto: cells[cells.length - 2].textContent.trim()
        };
      }).filter(Boolean);
    });
    
    return flows;
  } catch (err) {
    console.error(`Error scraping ${puenteId}:`, err.message);
    return [];
  }
}

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
  
  console.log('Loading Puente calculator...');
  await page.goto(PUENTE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  
  // Select category 18 (Corporativos)
  await page.select('#idCategoria', '18');
  await new Promise(r => setTimeout(r, 2000));
  
  const results = {};
  
  for (const on of ONS_TO_SCRAPE) {
    console.log(`Scraping ${on.nombre} (${on.puente})...`);
    const flows = await scrapeFlows(page, on.puente);
    
    // Parse flows
    const parsedFlows = [];
    for (const f of flows) {
      try {
        const [d, m, y] = f.fecha.split('/');
        const date = new Date(y, m - 1, d);
        if (date > new Date('2026-03-22')) {
          const monto = parseFloat(f.monto.replace(/\./g, '').replace(',', '.'));
          if (monto > 0) {
            parsedFlows.push({
              fecha: `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`,
              monto: Math.round(monto * 10000) / 10000
            });
          }
        }
      } catch(e) {}
    }
    
    if (parsedFlows.length > 0) {
      results[on.d912.replace('D', '')] = {
        nombre: on.nombre,
        ticker_d912: on.d912,
        vencimiento: parsedFlows[parsedFlows.length - 1].fecha,
        flujos: parsedFlows
      };
      console.log(`  → ${parsedFlows.length} future flows, total: ${parsedFlows.reduce((s, f) => s + f.monto, 0).toFixed(2)}`);
    } else {
      console.log(`  → No flows found, trying screenshot debug...`);
      await page.screenshot({ path: `/tmp/puente_debug_${on.puente}.png` });
    }
  }
  
  // Save to config
  const configPath = './public/config.json';
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.ons = results;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  
  console.log(`\nSaved ${Object.keys(results).length} ONs to config.json`);
  
  await browser.close();
})();
