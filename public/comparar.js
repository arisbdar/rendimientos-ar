document.addEventListener('DOMContentLoaded', init);

let chartInstance = null;

async function init() {
  const config = await fetch('/api/config').then(r => r.json());
  const fcis = config.fcis.filter(i => i.activo);

  const selectA = document.getElementById('fund-a');
  const selectB = document.getElementById('fund-b');

  fcis.forEach((fci, idx) => {
    const optA = new Option(`${fci.nombre} (${fci.entidad})`, idx);
    const optB = new Option(`${fci.nombre} (${fci.entidad})`, idx);
    selectA.add(optA);
    selectB.add(optB);
  });

  // Default: first two different funds
  if (fcis.length >= 2) selectB.value = 1;

  document.getElementById('compare-btn').addEventListener('click', () => {
    compare(fcis);
  });

  // Auto-compare on load
  compare(fcis);
}

const PERIOD_LABELS = {
  day: 'Diario',
  month: 'Mensual',
  year: 'YTD',
  oneYear: '1 Año',
  threeYears: '3 Años',
  fiveYears: '5 Años'
};

const PERIOD_KEYS = ['day', 'month', 'year', 'oneYear', 'threeYears', 'fiveYears'];

async function fetchFicha(fci) {
  const resp = await fetch(`/api/cafci/ficha/${fci.fondo_id}/${fci.clase_id}`);
  const data = await resp.json();
  return data.data;
}

async function compare(fcis) {
  const idxA = parseInt(document.getElementById('fund-a').value);
  const idxB = parseInt(document.getElementById('fund-b').value);
  const fciA = fcis[idxA];
  const fciB = fcis[idxB];

  const loading = document.getElementById('compare-loading');
  const error = document.getElementById('compare-error');
  const chartContainer = document.getElementById('chart-container');

  loading.style.display = '';
  error.style.display = 'none';
  chartContainer.style.display = 'none';

  try {
    const [fichaA, fichaB] = await Promise.all([fetchFicha(fciA), fetchFicha(fciB)]);

    const rendA = fichaA.info.diaria.rendimientos;
    const rendB = fichaB.info.diaria.rendimientos;

    // Collect periods that have TNA data for at least one fund
    const labels = [];
    const dataA = [];
    const dataB = [];

    for (const key of PERIOD_KEYS) {
      const valA = rendA[key]?.tna ? parseFloat(rendA[key].tna) : null;
      const valB = rendB[key]?.tna ? parseFloat(rendB[key].tna) : null;

      if (valA !== null || valB !== null) {
        labels.push(PERIOD_LABELS[key]);
        dataA.push(valA);
        dataB.push(valB);
      }
    }

    if (labels.length === 0) {
      loading.style.display = 'none';
      error.style.display = '';
      error.textContent = 'No hay datos de rendimiento disponibles para estos fondos.';
      return;
    }

    loading.style.display = 'none';
    chartContainer.style.display = '';

    renderChart(labels, dataA, dataB, fciA.nombre, fciB.nombre);
    renderDetails(rendA, rendB, fciA, fciB);

  } catch (e) {
    console.error(e);
    loading.style.display = 'none';
    error.style.display = '';
    error.textContent = 'Error al cargar datos de CAFCI.';
  }
}

function renderChart(labels, dataA, dataB, nameA, nameB) {
  const ctx = document.getElementById('compare-chart').getContext('2d');

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: nameA,
          data: dataA,
          backgroundColor: '#2563eb',
          borderRadius: 6,
          barPercentage: 0.7,
          categoryPercentage: 0.6
        },
        {
          label: nameB,
          data: dataB,
          backgroundColor: '#f59e0b',
          borderRadius: 6,
          barPercentage: 0.7,
          categoryPercentage: 0.6
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { font: { size: 13, weight: 600 }, padding: 20 }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed.y;
              return val !== null ? `${ctx.dataset.label}: ${val.toFixed(2)}% TNA` : `${ctx.dataset.label}: sin datos`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => v + '%',
            font: { size: 12 }
          },
          grid: { color: '#f4f4f5' }
        },
        x: {
          ticks: { font: { size: 12, weight: 500 } },
          grid: { display: false }
        }
      }
    }
  });
}

function renderDetails(rendA, rendB, fciA, fciB) {
  const container = document.getElementById('compare-details');

  let rows = '';
  for (const key of PERIOD_KEYS) {
    const valA = rendA[key]?.rendimiento || '—';
    const valB = rendB[key]?.rendimiento || '—';
    const tnaA = rendA[key]?.tna || '—';
    const tnaB = rendB[key]?.tna || '—';

    rows += `<tr>
      <td>${PERIOD_LABELS[key]}</td>
      <td>${valA !== '—' ? valA + '%' : '—'}</td>
      <td>${tnaA !== '—' ? tnaA + '%' : '—'}</td>
      <td>${valB !== '—' ? valB + '%' : '—'}</td>
      <td>${tnaB !== '—' ? tnaB + '%' : '—'}</td>
    </tr>`;
  }

  container.innerHTML = `
    <table class="compare-table">
      <thead>
        <tr>
          <th>Período</th>
          <th colspan="2">${fciA.nombre}</th>
          <th colspan="2">${fciB.nombre}</th>
        </tr>
        <tr>
          <th></th>
          <th>Rend.</th>
          <th>TNA</th>
          <th>Rend.</th>
          <th>TNA</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}
