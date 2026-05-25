// =============================================================================
// CONFIG — update column names / labels / colours to match stock-data.json
// =============================================================================
const CONFIG = {
  DATE_COL: 'date',

  // Benchmark line (dashed)
  BENCHMARK: {
    col:   'osebx',
    label: 'OSEBX',
    color: '#94a3b8',
    dash:  [6, 3],
  },

  // Model lines — add / remove entries to match your JSON keys
  MODELS: [
    { col: 'nn',   label: 'Neural Network', color: '#6c63ff' },
    { col: 'lgbm', label: 'LightGBM',       color: '#10b981' },
    { col: 'rf',   label: 'Random Forest',  color: '#f59e0b' },
  ],
};
// =============================================================================

let chart        = null;
let allData      = [];
let activePeriod = 'Full';
let activeModels = new Set();

// --------------- Period filter ---------------
function filterByPeriod(data, period) {
  if (period === 'Full' || !data.length) return data;
  // Use the last data point as reference so slicers work even on historical/example data
  const last = new Date(data[data.length - 1][CONFIG.DATE_COL]);
  let cutoff;
  if      (period === '1M')  cutoff = new Date(last.getFullYear(), last.getMonth() - 1,  last.getDate());
  else if (period === '3M')  cutoff = new Date(last.getFullYear(), last.getMonth() - 3,  last.getDate());
  else if (period === '6M')  cutoff = new Date(last.getFullYear(), last.getMonth() - 6,  last.getDate());
  else if (period === 'YTD') cutoff = new Date(last.getFullYear(), 0, 1);
  return data.filter(row => new Date(row[CONFIG.DATE_COL]) >= cutoff);
}

// Converts an array of monthly % returns → cumulative % from 0
function toCumulative(returns) {
  let cum = 0;
  return returns.map(r => {
    const v = parseFloat(r);
    if (isNaN(v)) return null;
    cum = (1 + cum / 100) * (1 + v / 100) * 100 - 100;
    return Math.round(cum * 100) / 100;
  });
}

// --------------- Chart ---------------
function buildDatasets(data) {
  const labels  = data.map(row => {
    const d = new Date(row[CONFIG.DATE_COL]);
    return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  });
  const sparse   = data.length > 36;
  const datasets = [];

  CONFIG.MODELS.forEach(m => {
    if (!activeModels.has(m.col)) return;
    if (!data.length || !(m.col in data[0])) return;
    datasets.push({
      label:            m.label,
      data:             toCumulative(data.map(row => row[m.col])),
      borderColor:      m.color,
      backgroundColor:  m.color + '18',
      fill:             false,
      borderWidth:      2.5,
      pointRadius:      sparse ? 0 : 3,
      pointHoverRadius: 5,
      tension:          0.35,
    });
  });

  if (activeModels.has(CONFIG.BENCHMARK.col) && data.length && CONFIG.BENCHMARK.col in data[0]) {
    datasets.push({
      label:            CONFIG.BENCHMARK.label,
      data:             toCumulative(data.map(row => row[CONFIG.BENCHMARK.col])),
      borderColor:      CONFIG.BENCHMARK.color,
      backgroundColor:  'transparent',
      fill:             false,
      borderWidth:      2,
      borderDash:       CONFIG.BENCHMARK.dash,
      pointRadius:      sparse ? 0 : 3,
      pointHoverRadius: 5,
      tension:          0.35,
    });
  }

  return { labels, datasets };
}

function renderChart(data) {
  const { labels, datasets } = buildDatasets(data);
  const canvas = document.getElementById('performanceChart');
  canvas.style.display = 'block';

  if (chart) {
    chart.data.labels   = labels;
    chart.data.datasets = datasets;
    chart.update('none');
    return;
  }

  chart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      aspectRatio:         window.innerWidth < 600 ? 1.3 : 2.2,
      interaction:         { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15,23,42,0.92)',
          titleFont:  { size: 12, weight: '600' },
          bodyFont:   { size: 12 },
          padding:    12,
          callbacks: {
            label: ctx =>
              ` ${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y.toFixed(2) + '%' : '—'}`,
          },
        },
      },
      scales: {
        x: {
          grid:  { color: '#f1f5f9' },
          ticks: { font: { size: 11 }, color: '#64748b', maxTicksLimit: 14 },
        },
        y: {
          grid:  { color: '#f1f5f9' },
          ticks: {
            font:     { size: 11 },
            color:    '#64748b',
            callback: v => v.toFixed(1) + '%',
          },
          title: {
            display: true,
            text:    'Cumulative Return (%)',
            color:   '#64748b',
            font:    { size: 12, weight: '500' },
          },
        },
      },
    },
  });
}

function update() {
  renderChart(filterByPeriod(allData, activePeriod));
}

// --------------- Model toggle buttons (built from CONFIG) ---------------
function buildToggles() {
  const container = document.getElementById('modelToggles');
  const allSeries = [
    ...CONFIG.MODELS.map(m => ({ col: m.col, label: m.label, color: m.color })),
    { col: CONFIG.BENCHMARK.col, label: CONFIG.BENCHMARK.label, color: CONFIG.BENCHMARK.color },
  ];

  allSeries.forEach(s => {
    activeModels.add(s.col);
    const btn = document.createElement('button');
    btn.className     = 'model-toggle active';
    btn.dataset.model = s.col;
    btn.textContent   = s.label;
    btn.style.setProperty('--toggle-color', s.color);
    btn.addEventListener('click', () => {
      if (activeModels.has(s.col) && activeModels.size > 1) {
        activeModels.delete(s.col);
        btn.classList.remove('active');
      } else if (!activeModels.has(s.col)) {
        activeModels.add(s.col);
        btn.classList.add('active');
      }
      update();
    });
    container.appendChild(btn);
  });
}

// --------------- Data loading ---------------
async function loadData() {
  const loadingEl = document.getElementById('chartLoading');
  const errorEl   = document.getElementById('chartError');

  try {
    const res = await fetch('stock-data.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allData = await res.json();
    if (!Array.isArray(allData) || !allData.length) throw new Error('Empty dataset');
    loadingEl.style.display = 'none';
    update();
  } catch (err) {
    console.error('Data load failed:', err);
    loadingEl.style.display = 'none';
    errorEl.style.display   = 'block';
  }
}

// --------------- Period buttons ---------------
document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activePeriod = btn.dataset.period;
    update();
  });
});

// --------------- Nav & footer ---------------
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

const hamburger  = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');
hamburger?.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  mobileMenu.classList.toggle('open');
});

document.getElementById('year').textContent = new Date().getFullYear();

buildToggles();
loadData();
