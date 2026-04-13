let cedearsItems = [];

document.addEventListener('DOMContentLoaded', () => {
  setupThemeToggle();
  loadCedears();
});

function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });
}

async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchJSONWithFallback(primaryUrl, fallbackUrl) {
  try {
    return await fetchJSON(primaryUrl);
  } catch (error) {
    if (!fallbackUrl) throw error;
    const fallbackData = await fetchJSON(fallbackUrl);
    return Array.isArray(fallbackData) ? { data: fallbackData, source: 'data912-direct' } : fallbackData;
  }
}

async function loadCedears() {
  const loading = document.getElementById('cedears-loading');
  const errorBox = document.getElementById('cedears-error');
  const table = document.getElementById('cedears-table');
  const searchInput = document.getElementById('cedears-search');

  try {
    const [catalog, liveResponse, usaResponse] = await Promise.all([
      fetchJSON('/data/cedears.json'),
      fetchJSONWithFallback('/api/cedears', 'https://data912.com/live/arg_cedears'),
      fetchJSONWithFallback('/api/usa-stocks', 'https://data912.com/live/usa_stocks'),
    ]);

    const live = Array.isArray(liveResponse.data) ? liveResponse.data : [];
    const usaLive = Array.isArray(usaResponse.data) ? usaResponse.data : [];
    cedearsItems = mergeCedears(catalog, live, usaLive);

    if (!cedearsItems.length) {
      throw new Error('No se encontraron CEDEARs con ratio conocido y precio válido.');
    }

    renderFilteredList('');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        renderFilteredList(searchInput.value || '');
      });
    }

    loading.hidden = true;
    table.hidden = false;
  } catch (error) {
    console.error('CEDEARs load error:', error);
    loading.hidden = true;
    errorBox.hidden = false;
    errorBox.textContent = 'No se pudo cargar la lista de CEDEARs en este momento.';
  }
}

function mergeCedears(catalog, live, usaLive) {
  const liveMap = new Map();
  const usaMap = new Map();

  for (const item of live) {
    if (!item || typeof item.symbol !== 'string') continue;
    liveMap.set(item.symbol, item);
  }
  for (const item of usaLive) {
    if (!item || typeof item.symbol !== 'string') continue;
    usaMap.set(item.symbol, item);
  }

  return (Array.isArray(catalog) ? catalog : [])
    .filter(item => item && item.ticker)
    .map(item => {
      const priceArs = quotePrice(liveMap.get(item.ticker));
      if (priceArs === null) return null;
      const priceD = item.ticker_d ? quotePrice(liveMap.get(item.ticker_d)) : null;
      const priceC = item.ticker_c ? quotePrice(liveMap.get(item.ticker_c)) : null;
      const priceUnderlying = item.ticker_usa ? quotePrice(usaMap.get(item.ticker_usa)) : null;

      return {
        ticker: item.ticker,
        name: item.name,
        ratio: item.ratio,
        tickerUsa: item.ticker_usa || null,
        tickerD: item.ticker_d || null,
        tickerC: item.ticker_c || null,
        priceArs,
        priceD,
        priceC,
        priceUnderlying,
        impliedMep: priceD ? priceArs / priceD : null,
        impliedCable: priceC ? priceArs / priceC : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.ticker.localeCompare(b.ticker, 'en-US'));
}

function renderFilteredList(query) {
  const term = String(query || '').trim().toUpperCase();
  const filtered = term
    ? cedearsItems.filter(item =>
      item.ticker.toUpperCase().includes(term) ||
      String(item.name || '').toUpperCase().includes(term))
    : cedearsItems;

  const list = document.getElementById('cedears-list');
  if (list) list.innerHTML = filtered.map(renderRow).join('');
  renderImplicitAverages(filtered);
}

function renderRow(item) {
  const logoUrl = `https://static.svvytrdr.com/logos/${encodeURIComponent(item.ticker)}.webp`;
  const initials = getInitials(item.ticker);

  return `
    <tr class="cedear-row">
      <td>
        <div class="cedear-asset">
          <div class="cedear-logo-shell" aria-hidden="true">
            <div class="cedear-logo-fallback">${escapeHtml(initials)}</div>
            <img class="cedear-logo" src="${logoUrl}" alt="${escapeHtml(item.ticker)}" onerror="this.remove()">
          </div>
          <div class="cedear-meta">
            <div class="cedear-symbol">${escapeHtml(item.ticker)}</div>
            <div class="cedear-name">${escapeHtml(item.name)}</div>
          </div>
        </div>
      </td>
      <td class="col-right"><span class="cedear-price">${formatArs(item.priceArs)}</span></td>
      <td class="col-right"><span class="cedear-price ${item.priceD === null ? 'muted' : ''}">${formatUsd(item.priceD)}</span></td>
      <td class="col-right"><span class="cedear-price ${item.priceC === null ? 'muted' : ''}">${formatUsd(item.priceC)}</span></td>
      <td class="col-right"><span class="cedear-price ${item.priceUnderlying === null ? 'muted' : ''}">${formatUsd(item.priceUnderlying)}</span></td>
      <td class="col-right"><span class="cedear-price ${item.impliedMep === null ? 'muted' : ''}">${formatImplicit(item.impliedMep)}</span></td>
      <td class="col-right"><span class="cedear-price ${item.impliedCable === null ? 'muted' : ''}">${formatImplicit(item.impliedCable)}</span></td>
      <td class="col-right"><span class="cedear-ratio">${escapeHtml(item.ratio)}</span></td>
    </tr>
  `;
}

function formatArs(value) {
  const maximumFractionDigits = Math.abs(value) >= 100 ? 2 : 4;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function formatUsd(value) {
  if (value === null || !Number.isFinite(value) || value <= 0) return '-';
  const maximumFractionDigits = Math.abs(value) >= 100 ? 2 : 4;
  const formatted = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
  return `US$ ${formatted}`;
}

function formatImplicit(value) {
  if (value === null || !Number.isFinite(value) || value <= 0) return '-';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function getInitials(symbol) {
  return symbol.replace(/[^A-Z0-9]/gi, '').slice(0, 2).toUpperCase() || 'CE';
}

function quotePrice(quote) {
  if (!quote) return null;
  const value = Number(quote.c);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function renderImplicitAverages(items) {
  const mepValues = items.map(item => item.impliedMep).filter(value => Number.isFinite(value) && value > 0);
  const cableValues = items.map(item => item.impliedCable).filter(value => Number.isFinite(value) && value > 0);

  const avgMep = mepValues.length ? mepValues.reduce((acc, value) => acc + value, 0) / mepValues.length : null;
  const avgCable = cableValues.length ? cableValues.reduce((acc, value) => acc + value, 0) / cableValues.length : null;

  const avgMepEl = document.getElementById('avg-mep');
  const avgCableEl = document.getElementById('avg-cable');
  const avgMetaEl = document.getElementById('avg-meta');

  if (avgMepEl) avgMepEl.textContent = formatImplicit(avgMep);
  if (avgCableEl) avgCableEl.textContent = formatImplicit(avgCable);
  if (avgMetaEl) {
    avgMetaEl.textContent = `Calculado sobre ${items.length.toLocaleString('es-AR')} activos visibles (${mepValues.length} con D, ${cableValues.length} con C).`;
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
