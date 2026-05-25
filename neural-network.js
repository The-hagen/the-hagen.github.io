// =============================================================================
// CONFIG — Edit this section to match your Google Sheet
// =============================================================================
const CONFIG = {
  // Paste your published Google Sheet CSV URL here.
  // In Google Sheets: File → Share → Publish to web → Comma-separated values
  // URL format: https://docs.google.com/spreadsheets/d/{SHEET_ID}/pub?output=csv
  SHEET_URL: 'YOUR_GOOGLE_SHEET_CSV_URL_HERE',

  // Column header for dates in your sheet (case-insensitive)
  DATE_COL: 'date',

  // Benchmark line (shown as a dashed grey line)
  BENCHMARK: {
    col:   'osebx',
    label: 'OSEBX',
    color: '#94a3b8',
    dash:  [6, 3],
  },

  // Model lines — add/remove/rename to match your sheet columns
  MODELS: [
    { col: 'nn',   label: 'Neural Network', color: '#6c63ff' },
    { col: 'lgbm', label: 'LightGBM',       color: '#10b981' },
    { col: 'rf',   label: 'Random Forest',  color: '#f59e0b' },
  ],
};
// =============================================================================

let chart       = null;
let allData     = [];
let activePeriod = 'Full';
let activeModels = new Set();

// --------------- CSV parsing ---------------
function parseCSV(text) {
  const lines   = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const vals = line.split(',');
      const row  = {};
      headers.forEach((h, i) => { row[h] = (vals[i] ?? '').trim().replace(/['"]/g, ''); });
      return row;
    });
}

// --------------- Period filter ---------------
function filterByPeriod(data, period) {
  if (period === 'Full' || !data.length) return data;
  const now = new Date();
  let cutoff;
  if      (period === '1M')  cutoff = new Date(now.getFullYear(), now.getMonth() - 1,  now.getDate());
  else if (period === '3M')  cutoff = new Date(now.getFullYear(), now.getMonth() - 3,  now.getDate());
  else if (period === '6M')  cutoff = new Date(now.getFullYear(), now.getMonth() - 6,  now.getDate());
  else if (period === 'YTD') cutoff = new Date(now.getFullYear(), 0, 1);
  return data.filter(row => new Date(row[CONFIG.DATE_COL]) >= cutoff);
}

// --------------- Cumulative return ---------------
// Converts monthly % returns → cumulative % from 0
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
  const labels   = data.map(row => {
    const d = new Date(row[CONFIG.DATE_COL]);
    return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  });
  const datasets = [];
  const sparse   = data.length > 36;

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
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: window.innerWidth < 600 ? 1.3 : 2.2,
      interaction: { mode: 'index', intersect: false },
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
    btn.className          = 'model-toggle active';
    btn.dataset.model      = s.col;
    btn.textContent        = s.label;
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

// --------------- Placeholder data (shown before SHEET_URL is configured) ---------------
function generateSampleData() {
  const rows = [
    [2023,  1,  2.1,  1.8,  1.5,  1.2],
    [2023,  2, -0.8, -0.5, -0.3, -1.2],
    [2023,  3,  3.5,  3.0,  2.5,  2.8],
    [2023,  4,  1.2,  1.5,  1.0,  0.6],
    [2023,  5, -1.9, -1.5, -1.2, -2.3],
    [2023,  6,  2.8,  2.3,  2.0,  1.9],
    [2023,  7,  0.5,  0.8,  0.6, -0.3],
    [2023,  8,  3.1,  2.7,  2.4,  2.0],
    [2023,  9, -0.4, -0.1,  0.2, -1.0],
    [2023, 10,  2.7,  2.2,  1.9,  1.8],
    [2023, 11,  1.8,  2.1,  1.7,  1.1],
    [2023, 12, -1.1, -0.8, -0.5, -1.5],
    [2024,  1,  3.2,  2.8,  2.4,  2.1],
    [2024,  2,  0.9,  1.2,  0.8,  0.4],
    [2024,  3,  2.4,  2.0,  1.7,  1.5],
    [2024,  4, -0.6, -0.3, -0.1, -0.9],
    [2024,  5,  1.5,  1.8,  1.4,  1.0],
    [2024,  6,  2.9,  2.5,  2.1,  1.8],
  ];
  return rows.map(([y, m, nn, lgbm, rf, osebx]) => ({
    [CONFIG.DATE_COL]:       new Date(y, m - 1, 28).toISOString().slice(0, 10),
    [CONFIG.MODELS[0].col]:  nn.toFixed(2),
    [CONFIG.MODELS[1].col]:  lgbm.toFixed(2),
    [CONFIG.MODELS[2].col]:  rf.toFixed(2),
    [CONFIG.BENCHMARK.col]:  osebx.toFixed(2),
  }));
}

// --------------- Data loading ---------------
async function loadData() {
  const loadingEl = document.getElementById('chartLoading');
  const errorEl   = document.getElementById('chartError');
  const noteEl    = document.getElementById('chartNote');

  if (CONFIG.SHEET_URL === 'YOUR_GOOGLE_SHEET_CSV_URL_HERE') {
    allData = generateSampleData();
    loadingEl.style.display = 'none';
    update();
    noteEl.textContent = '⚠️ Showing sample data. Set SHEET_URL in neural-network.js to display live results.';
    noteEl.classList.add('sample-notice');
    return;
  }

  try {
    const res = await fetch(CONFIG.SHEET_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    allData = parseCSV(text);
    if (!allData.length) throw new Error('Empty dataset');
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

// --------------- Boot ---------------
buildToggles();
loadData();
