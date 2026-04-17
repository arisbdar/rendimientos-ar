let cedearsItems = [];
let currentFilteredItems = [];
let currentView = 'table';
let cedearsScatterChart = null;
let currentSortKey = 'ticker';
let currentSortDir = 'asc';
const SORTABLE_NUMERIC_FIELDS = new Set([
  'priceArs',
  'priceD',
  'priceC',
  'priceUnderlying',
  'impliedMep',
  'impliedCable',
]);

document.addEventListener('DOMContentLoaded', () => {
  setupThemeToggle();
  setupViewToggle();
  setupHeaderSorting();
  setupCsvDownload();
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

function setupViewToggle() {
  const buttons = document.querySelectorAll('.cedears-view-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      setView(btn.dataset.view || 'table');
    });
  });
}

function setupHeaderSorting() {
  const buttons = document.querySelectorAll('.cedears-sort-header');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.sortKey || 'ticker';
      if (key === currentSortKey) {
        currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        currentSortKey = key;
        currentSortDir = 'asc';
      }
      updateHeaderSortUI();
      renderFilteredList(getSearchTerm());
    });
  });

  updateHeaderSortUI();
}

function updateHeaderSortUI() {
  const buttons = document.querySelectorAll('.cedears-sort-header');
  buttons.forEach((button) => {
    const key = button.dataset.sortKey || '';
    const isActive = key === currentSortKey;
    const parentTh = button.closest('th');
    const indicator = button.querySelector('.sort-indicator');

    button.dataset.active = isActive ? 'true' : 'false';
    button.dataset.dir = isActive ? currentSortDir : '';

    if (parentTh) {
      parentTh.setAttribute('aria-sort', isActive ? (currentSortDir === 'asc' ? 'ascending' : 'descending') : 'none');
    }
    if (indicator) {
      indicator.textContent = isActive ? (currentSortDir === 'asc' ? '▲' : '▼') : '';
    }
  });
}

function setupCsvDownload() {
  const downloadButton = document.getElementById('cedears-download-csv');
  if (!downloadButton) return;

  downloadButton.disabled = true;
  downloadButton.addEventListener('click', () => {
    downloadCurrentCsv();
  });
}

function setView(view) {
  currentView = view === 'chart' ? 'chart' : 'table';

  const tableWrap = document.getElementById('cedears-table');
  const chartWrap = document.getElementById('cedears-chart-wrap');
  if (tableWrap) tableWrap.hidden = currentView !== 'table';
  if (chartWrap) chartWrap.hidden = currentView !== 'chart';

  document.querySelectorAll('.cedears-view-btn').forEach((btn) => {
    const active = btn.dataset.view === currentView;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  if (currentView === 'chart') {
    renderScatterChart(currentFilteredItems);
  }
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

    if (loading) loading.hidden = true;
    updateCsvButtonState();
    setView('table');
  } catch (error) {
    console.error('CEDEARs load error:', error);
    if (loading) loading.hidden = true;
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = 'No se pudo cargar la lista de CEDEARs en este momento.';
    }
    updateCsvButtonState();
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
  const sorted = sortCedears(filtered);

  currentFilteredItems = sorted;
  renderTable(sorted);
  renderImplicitAverages(sorted);
  updateCsvButtonState();

  if (currentView === 'chart') {
    renderScatterChart(sorted);
  }
}

function sortCedears(items) {
  const list = Array.isArray(items) ? items.slice() : [];
  const dir = currentSortDir === 'desc' ? -1 : 1;

  return list.sort((a, b) => {
    if (currentSortKey === 'ticker') {
      return dir * String(a.ticker || '').localeCompare(String(b.ticker || ''), 'en-US');
    }

    if (currentSortKey === 'ratio') {
      const ratioCompare = compareNullableNumbers(parseRatioForSort(a.ratio), parseRatioForSort(b.ratio), dir);
      if (ratioCompare !== 0) return ratioCompare;
      return dir * String(a.ratio || '').localeCompare(String(b.ratio || ''), 'en-US');
    }

    if (SORTABLE_NUMERIC_FIELDS.has(currentSortKey)) {
      const compare = compareNullableNumbers(a[currentSortKey], b[currentSortKey], dir);
      if (compare !== 0) return compare;
      return String(a.ticker || '').localeCompare(String(b.ticker || ''), 'en-US');
    }

    return dir * String(a.ticker || '').localeCompare(String(b.ticker || ''), 'en-US');
  });
}

function compareNullableNumbers(aValue, bValue, dir) {
  const aValid = typeof aValue === 'number' && Number.isFinite(aValue);
  const bValid = typeof bValue === 'number' && Number.isFinite(bValue);

  if (!aValid && !bValid) return 0;
  if (!aValid) return 1;
  if (!bValid) return -1;
  if (aValue === bValue) return 0;

  return aValue < bValue ? -1 * dir : 1 * dir;
}

function parseRatioForSort(ratio) {
  if (ratio === null || ratio === undefined) return null;

  const raw = String(ratio).trim();
  if (!raw) return null;
  if (raw.includes(':')) {
    const [left, right] = raw.split(':');
    const leftNum = Number(left);
    const rightNum = Number(right);
    if (Number.isFinite(leftNum) && Number.isFinite(rightNum) && rightNum !== 0) {
      return leftNum / rightNum;
    }
  }

  const numeric = Number(raw.replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : null;
}

function getSearchTerm() {
  const searchInput = document.getElementById('cedears-search');
  return searchInput ? (searchInput.value || '') : '';
}

function updateCsvButtonState() {
  const downloadButton = document.getElementById('cedears-download-csv');
  if (!downloadButton) return;
  downloadButton.disabled = !currentFilteredItems.length;
}

function downloadCurrentCsv() {
  if (!currentFilteredItems.length) return;

  const headers = [
    'ticker',
    'name',
    'ratio',
    'price_ars',
    'price_d',
    'price_c',
    'price_usa',
    'implied_mep_ars',
    'implied_cable_ars',
    'ticker_d',
    'ticker_c',
    'ticker_usa',
  ];

  const rows = currentFilteredItems.map((item) => ([
    item.ticker,
    item.name,
    item.ratio,
    formatCsvNumber(item.priceArs),
    formatCsvNumber(item.priceD),
    formatCsvNumber(item.priceC),
    formatCsvNumber(item.priceUnderlying),
    formatCsvNumber(item.impliedMep),
    formatCsvNumber(item.impliedCable),
    item.tickerD,
    item.tickerC,
    item.tickerUsa,
  ]));

  const csvContent = [headers, ...rows]
    .map(row => row.map(escapeCsvValue).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const datePart = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `cedears-${datePart}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatCsvNumber(value) {
  if (!Number.isFinite(value)) return '';
  return String(Math.round(value * 1000000) / 1000000);
}

function escapeCsvValue(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
}

function renderTable(items) {
  const list = document.getElementById('cedears-list');
  if (!list) return;

  if (!items.length) {
    list.innerHTML = '<tr><td colspan="8" class="cedears-empty-cell">No hay resultados para la búsqueda actual.</td></tr>';
    return;
  }

  list.innerHTML = items.map(renderRow).join('');
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

function renderScatterChart(items) {
  const chartEmpty = document.getElementById('cedears-chart-empty');
  const canvas = document.getElementById('cedears-scatter');

  if (!chartEmpty || !canvas) return;

  if (typeof Chart === 'undefined') {
    destroyScatterChart();
    canvas.hidden = true;
    chartEmpty.hidden = false;
    chartEmpty.textContent = 'No se pudo inicializar el gráfico en este entorno.';
    return;
  }

  if (!items.length) {
    destroyScatterChart();
    canvas.hidden = true;
    chartEmpty.hidden = false;
    chartEmpty.textContent = 'No hay resultados para la búsqueda actual.';
    return;
  }

  const chartItems = items.filter(item =>
    Number.isFinite(item.impliedMep) && item.impliedMep > 0 &&
    Number.isFinite(item.impliedCable) && item.impliedCable > 0
  );

  if (!chartItems.length) {
    destroyScatterChart();
    canvas.hidden = true;
    chartEmpty.hidden = false;
    chartEmpty.textContent = 'No hay activos con MEP y CCL implícito simultáneamente para esta selección.';
    return;
  }

  canvas.hidden = false;
  chartEmpty.hidden = true;
  destroyScatterChart();

  const ctx = canvas.getContext('2d');
  cedearsScatterChart = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'CEDEARs',
          data: chartItems.map(item => ({
            x: item.impliedCable,
            y: item.impliedMep,
            ticker: item.ticker,
            name: item.name,
          })),
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#0b57d0',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            title: (context) => {
              const point = context[0]?.raw;
              if (!point) return '';
              return `${point.ticker} - ${point.name}`;
            },
            label: (context) => {
              const point = context.raw;
              return `MEP: ${formatImplicit(point.y)} | CCL: ${formatImplicit(point.x)}`;
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'CCL implícito (ARS)',
            color: '#79747e',
            font: { size: 12, weight: '600' },
          },
          ticks: {
            callback: (value) => formatAxisArs(value),
            color: '#79747e',
            font: { size: 11 },
          },
          grid: {
            color: 'rgba(121, 116, 126, 0.18)',
          },
        },
        y: {
          title: {
            display: true,
            text: 'MEP implícito (ARS)',
            color: '#79747e',
            font: { size: 12, weight: '600' },
          },
          ticks: {
            callback: (value) => formatAxisArs(value),
            color: '#79747e',
            font: { size: 11 },
          },
          grid: {
            color: 'rgba(121, 116, 126, 0.18)',
          },
        },
      },
    },
  });
}

function destroyScatterChart() {
  if (cedearsScatterChart) {
    cedearsScatterChart.destroy();
    cedearsScatterChart = null;
  }
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

function formatAxisArs(value) {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value));
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
