#!/usr/bin/env node
// Scrapes plazo fijo rates from BCRA and updates config.json
// Usage: node scrape_bcra_pf.js [--dry-run]

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

// Name mapping: BCRA full name → our short name in config
const NAME_MAP = {
  'BANCO DE LA NACION ARGENTINA': 'Banco Nación',
  'BANCO SANTANDER ARGENTINA S.A.': 'Banco Santander',
  'BANCO DE GALICIA Y BUENOS AIRES S.A.': 'Banco Galicia',
  'BANCO DE LA PROVINCIA DE BUENOS AIRES': 'Banco de la Prov. de Buenos Aires',
  'BANCO BBVA ARGENTINA S.A.': 'BBVA Argentina',
  'BANCO MACRO S.A.': 'Banco Macro',
  'BANCO CREDICOOP COOPERATIVO LIMITADO': 'Banco Credicoop',
  'INDUSTRIAL AND COMMERCIAL BANK OF CHINA (ARGENTINA) S.A.U.': 'ICBC Argentina',
  'BANCO DE LA CIUDAD DE BUENOS AIRES': 'Banco Ciudad',
  'BANCO BICA S.A.': 'Banco BICA',
  'BANCO CMF S.A.': 'Banco CMF',
  'BANCO COMAFI SOCIEDAD ANONIMA': 'Banco Comafi',
  'BANCO DE COMERCIO S.A.': 'Banco de Comercio',
  'BANCO DE CORRIENTES S.A.': 'Banco de Corrientes',
  'BANCO DE FORMOSA S.A.': 'Banco de Formosa',
  'BANCO DE LA PROVINCIA DE CORDOBA S.A.': 'Banco de la Prov. de Córdoba',
  'BANCO DEL CHUBUT S.A.': 'Banco del Chubut',
  'BANCO DEL SOL S.A.': 'Banco del Sol',
  'BANCO DINO S.A.': 'Banco Dino',
  'BANCO HIPOTECARIO S.A.': 'Banco Hipotecario',
  'BANCO JULIO SOCIEDAD ANONIMA': 'Banco Julio',
  'BANCO MARIVA S.A.': 'Banco Mariva',
  'BANCO MASVENTAS S.A.': 'Banco Masventas',
  'BANCO MERIDIAN S.A.': 'Banco Meridian',
  'BANCO PROVINCIA DE TIERRA DEL FUEGO': 'Banco Prov. Tierra del Fuego',
  'BANCO VOII S.A.': 'Banco Voii',
  'BIBANK S.A.': 'Bibank',
  'CRÉDITO REGIONAL COMPAÑÍA FINANCIERA S.A.U.': 'Crédito Regional',
  'REBA COMPAÑIA FINANCIERA S.A.': 'Reba Compañía Financiera',
};

function parseRate(text) {
  if (!text || text === '-') return null;
  const match = text.match(/([\d.]+)\s*%/);
  return match ? parseFloat(match[1]) : null;
}

(async () => {
  console.log('Scraping BCRA plazo fijo rates...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();

  await page.goto('https://www.bcra.gob.ar/plazos-fijos-online/', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  await page.waitForSelector('table tbody tr', { timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));

  const scraped = await page.evaluate(() => {
    const rows = document.querySelectorAll('table tbody tr');
    const results = [];
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 4) {
        results.push({
          nombre_bcra: cells[0].textContent.trim(),
          tna_clientes: cells[2]?.textContent.trim(),
          tna_no_clientes: cells[3]?.textContent.trim(),
        });
      }
    });
    return results;
  });

  await browser.close();

  console.log(`Found ${scraped.length} banks from BCRA\n`);

  // Load current config
  const configPath = path.join(__dirname, 'public', 'config.json');
  const dataConfigPath = path.join(__dirname, 'data', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

  // Build lookup of existing banks by name
  const existingByName = {};
  config.plazos_fijos.bancos.forEach(b => { existingByName[b.nombre] = b; });

  // Update rates
  let updated = 0;
  let added = 0;
  for (const s of scraped) {
    const ourName = NAME_MAP[s.nombre_bcra];
    if (!ourName) {
      console.log(`  UNKNOWN: "${s.nombre_bcra}" — add to NAME_MAP if needed`);
      continue;
    }

    const tnaC = parseRate(s.tna_clientes);
    const tnaNc = parseRate(s.tna_no_clientes);

    if (existingByName[ourName]) {
      const bank = existingByName[ourName];
      const oldC = bank.tna_clientes;
      const oldNc = bank.tna_no_clientes;
      if (tnaC !== null && tnaC !== oldC) {
        console.log(`  ${ourName}: clientes ${oldC} → ${tnaC}`);
        bank.tna_clientes = tnaC;
        updated++;
      }
      if (tnaNc !== null && tnaNc !== oldNc) {
        console.log(`  ${ourName}: no_clientes ${oldNc} → ${tnaNc}`);
        bank.tna_no_clientes = tnaNc;
        updated++;
      } else if (tnaNc === null && oldNc !== null) {
        // BCRA stopped reporting no_clientes
      }
    } else {
      console.log(`  NEW: ${ourName} (clientes: ${tnaC}, no_clientes: ${tnaNc})`);
      added++;
    }
  }

  // Sort by tna_clientes descending
  config.plazos_fijos.bancos.sort((a, b) => (b.tna_clientes || 0) - (a.tna_clientes || 0));
  config.plazos_fijos.actualizado = dateStr;

  console.log(`\n${updated} rates updated, ${added} new banks found`);
  console.log(`Date: ${dateStr}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No files written.');
  } else {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    // Also update data/config.json
    if (fs.existsSync(dataConfigPath)) {
      const dataConfig = JSON.parse(fs.readFileSync(dataConfigPath, 'utf8'));
      dataConfig.plazos_fijos = config.plazos_fijos;
      fs.writeFileSync(dataConfigPath, JSON.stringify(dataConfig, null, 2));
    }
    console.log('\nConfig files updated!');
  }
})();
