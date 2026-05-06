import { api } from '../../api.js';

// API thật dự kiến:
// GET /admin/reports?range=&startDate=&endDate=&role=&category=&location=
// GET /admin/reports/export?format=&table=&range=&...
const endpoint = '/admin/reports';

const state = {
  range: '30d',
  startDate: '',
  endDate: '',
  role: '',
  category: '',
  location: '',
  tableType: 'users',
  searchTimer: null,
  reportData: null
};

export async function init() {
  bindEvents();
  renderLoading();
  await loadReports();
}

function bindEvents() {
  document.querySelectorAll('.reportRangeButton').forEach((button) => {
    button.addEventListener('click', () => {
      state.range = button.dataset.range;
      state.startDate = '';
      state.endDate = '';
      setActiveRangeButton();
      loadReports();
    });
  });

  document.getElementById('btnApplyReportDate')?.addEventListener('click', () => {
    state.range = 'custom';
    state.startDate = document.getElementById('reportStartDate')?.value || '';
    state.endDate = document.getElementById('reportEndDate')?.value || '';
    setActiveRangeButton();
    loadReports();
  });

  document.getElementById('reportRoleFilter')?.addEventListener('change', (event) => {
    state.role = event.target.value;
    loadReports();
  });

  document.getElementById('reportCategoryFilter')?.addEventListener('input', debounceFilter('category'));
  document.getElementById('reportLocationFilter')?.addEventListener('input', debounceFilter('location'));
  document.getElementById('btnReloadReports')?.addEventListener('click', () => loadReports());
  document.getElementById('reportTableType')?.addEventListener('change', (event) => {
    state.tableType = event.target.value;
    renderTable(state.reportData?.tables || {});
  });
  document.querySelectorAll('.reportExportButton').forEach((button) => {
    button.addEventListener('click', () => exportReport(button.dataset.format));
  });
}

function debounceFilter(key) {
  return (event) => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      state[key] = event.target.value.trim();
      loadReports();
    }, 250);
  };
}

async function loadReports() {
  setText('reportsPageSubtitle', 'Loading dữ liệu report từ backend...');

  try {
    const payload = await api.get(`${endpoint}?${buildQuery()}`);
    const data = normalizeReports(payload);
    state.reportData = data;
    renderReports(data);
    setText('reportsPageSubtitle', 'Dữ liệu báo cáo được tải theo bộ lọc hiện tại.');
  } catch (err) {
    console.error('Admin reports error:', err);
    const data = normalizeReports({});
    state.reportData = data;
    renderReports(data);
    setText(
      'reportsPageSubtitle',
      err?.status === 404
        ? 'Backend chưa có endpoint /admin/reports. Frontend đã sẵn sàng để nối dữ liệu thật.'
        : 'Không tải được dữ liệu báo cáo từ backend.'
    );
  }
}

function renderLoading() {
  renderList('reportTableBody', '<tr><td class="px-4 py-8 text-center text-sm font-bold text-slate-400">Loading báo cáo...</td></tr>');
}

function normalizeReports(payload = {}) {
  const overview = payload.overview || payload.stats || {};
  const charts = payload.charts || {};
  const modules = payload.modules || payload.moduleReports || {};
  const ranking = payload.ranking || payload.top || {};

  return {
    overview: {
      totalUsers: numberValue(overview.totalUsers ?? payload.totalUsers),
      totalJobs: numberValue(overview.totalJobs ?? payload.totalJobs),
      totalApplications: numberValue(overview.totalApplications ?? payload.totalApplications),
      growth: numberValue(overview.growth ?? overview.growthRate ?? payload.growth)
    },
    charts: {
      userGrowth: normalizeSeries(charts.userGrowth || payload.userGrowth),
      jobsPosted: normalizeSeries(charts.jobsPosted || payload.jobsPosted),
      applicationsTrend: normalizeSeries(charts.applicationsTrend || payload.applicationsTrend)
    },
    modules: {
      users: modules.users || payload.userReports || {},
      jobs: modules.jobs || payload.jobReports || {},
      applications: modules.applications || payload.applicationReports || {},
      search: modules.search || payload.searchReports || {}
    },
    ranking: {
      companies: normalizeArray(ranking.companies || ranking.topCompanies || payload.topCompanies),
      jobs: normalizeArray(ranking.jobs || ranking.topJobs || payload.topJobs),
      users: normalizeArray(ranking.users || ranking.topUsers || payload.topUsers)
    },
    comparison: normalizeArray(payload.comparison || payload.compare),
    insights: normalizeArray(payload.insights || payload.alerts),
    tables: payload.tables || payload.tableData || {}
  };
}

function renderReports(data) {
  renderOverview(data.overview);
  renderCharts(data.charts);
  renderModules(data.modules);
  renderRankings(data.ranking);
  renderComparison(data.comparison);
  renderInsights(data.insights);
  renderTable(data.tables);
}

// Render overview metrics.
function renderOverview(overview) {
  setText('reportTotalUsers', formatNumber(overview.totalUsers));
  setText('reportTotalJobs', formatNumber(overview.totalJobs));
  setText('reportTotalApplications', formatNumber(overview.totalApplications));
  setText('reportGrowth', formatPercent(overview.growth));
}

// Render 3 biểu đồ chính bằng SVG.
function renderCharts(charts) {
  renderLineChart('userGrowthChart', 'userGrowthEmpty', charts.userGrowth, '#2563eb');
  renderLineChart('jobsPostedChart', 'jobsPostedEmpty', charts.jobsPosted, '#0891b2');
  renderLineChart('applicationsTrendChart', 'applicationsTrendEmpty', charts.applicationsTrend, '#16a34a');
}

function renderLineChart(svgId, emptyId, series, color) {
  const svg = document.getElementById(svgId);
  const empty = document.getElementById(emptyId);
  if (!svg || !empty) return;

  svg.innerHTML = '';
  const points = series.filter((item) => Number.isFinite(item.value));
  const hasData = points.length > 0;
  empty.classList.toggle('hidden', hasData);
  empty.classList.toggle('flex', !hasData);
  if (!hasData) return;

  const width = 420;
  const height = 190;
  const max = Math.max(...points.map((item) => item.value), 1);
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const coords = points.map((item, index) => ({
    x: points.length > 1 ? index * step : width / 2,
    y: height - (item.value / max) * 145 - 20,
    ...item
  }));
  const grid = [40, 80, 120, 160].map((y) => `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#e2e8f0" />`).join('');
  svg.innerHTML = `
    ${grid}
    <polyline fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${coords.map((point) => `${point.x},${point.y}`).join(' ')}" />
    ${coords.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="4" fill="${color}"><title>${escapeHtml(point.label)}: ${formatNumber(point.value)}</title></circle>`).join('')}
  `;
}

// Render reports theo từng module.
function renderModules(modules) {
  renderMetricList('userReportsList', [
    ['Users mới', modules.users.newUsers],
    ['Users hoạt động', modules.users.activeUsers],
    ['Users theo role', modules.users.usersByRole]
  ]);
  renderMetricList('jobReportsList', [
    ['Jobs theo category', modules.jobs.jobsByCategory],
    ['Jobs đang hoạt động / expired', modules.jobs.activeExpired],
    ['Top job', modules.jobs.topJob]
  ]);
  renderMetricList('applicationReportsList', [
    ['CV theo job', modules.applications.cvByJob],
    ['Tỷ lệ ứng tuyển', modules.applications.applyRate],
    ['Conversion rate', modules.applications.conversionRate]
  ]);
  renderMetricList('searchReportsList', [
    ['Top keywords', modules.search.topKeywords],
    ['No result searches', modules.search.noResultSearches],
    ['Search CTR', modules.search.ctr]
  ]);
}

function renderMetricList(targetId, rows) {
  renderList(targetId, rows.map(([label, value]) => `
    <div class="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
      <span class="text-sm font-bold text-slate-500">${escapeHtml(label)}</span>
      <span class="truncate text-sm font-black text-slate-950">${escapeHtml(formatAny(value))}</span>
    </div>
  `).join(''));
}

function renderRankings(ranking) {
  renderRankingList('topCompaniesList', ranking.companies);
  renderRankingList('topJobsList', ranking.jobs);
  renderRankingList('topUsersList', ranking.users);
}

function renderRankingList(targetId, items) {
  if (!items.length) {
    renderList(targetId, '<p class="rounded-lg bg-slate-50 p-3 text-sm font-bold text-slate-400">Chưa có dữ liệu.</p>');
    return;
  }

  renderList(targetId, items.slice(0, 5).map((item, index) => `
    <div class="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
      <span class="min-w-0 truncate text-sm font-black text-slate-950">${index + 1}. ${escapeHtml(item.name || item.title || item.email || '--')}</span>
      <span class="text-sm font-black text-slate-600">${formatNumber(item.value || item.count || item.total || 0)}</span>
    </div>
  `).join(''));
}

function renderComparison(items) {
  if (!items.length) {
    renderList('comparisonList', '<p class="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-400">Chưa có dữ liệu comparison.</p>');
    return;
  }
  renderList('comparisonList', items.map((item) => `
    <div class="rounded-lg bg-slate-50 p-3">
      <p class="text-sm font-black text-slate-950">${escapeHtml(item.label || item.name || 'Comparison')}</p>
      <p class="mt-1 text-sm font-bold ${Number(item.growth ?? item.value ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}">${escapeHtml(formatAny(item.growth ?? item.value))}</p>
    </div>
  `).join(''));
}

function renderInsights(items) {
  if (!items.length) {
    renderList('reportInsightsList', '<p class="rounded-lg bg-emerald-50 p-4 text-sm font-black text-emerald-700">Chưa có alerts báo cáo.</p>');
    return;
  }
  renderList('reportInsightsList', items.map((item) => {
    const warning = String(item.type || item.severity || '').toLowerCase().includes('warn') || String(item.message || '').includes('giảm');
    return `<p class="rounded-lg ${warning ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'} p-4 text-sm font-black">${escapeHtml(item.message || item.title || 'Insight')}</p>`;
  }).join(''));
}

// Render tableData chi tiết theo type đang chọn.
function renderTable(tables) {
  const rows = normalizeArray(tables[state.tableType] || tables.rows || tables);
  const columns = getColumns(state.tableType);
  renderList('reportTableHead', `<tr>${columns.map((column) => `<th class="px-4 py-4">${escapeHtml(column.label)}</th>`).join('')}</tr>`);

  if (!rows.length) {
    renderList('reportTableBody', `<tr><td class="px-4 py-8 text-center text-sm font-bold text-slate-400" colspan="${columns.length}">Chưa có dữ liệu bảng.</td></tr>`);
    return;
  }

  renderList('reportTableBody', rows.slice(0, 30).map((row) => `
    <tr class="hover:bg-slate-50">
      ${columns.map((column) => `<td class="px-4 py-4 text-sm font-semibold text-slate-600">${escapeHtml(formatAny(row[column.key]))}</td>`).join('')}
    </tr>
  `).join(''));
}

function getColumns(type) {
  if (type === 'jobs') {
    return [
      { key: 'title', label: 'Job' },
      { key: 'company', label: 'Company' },
      { key: 'category', label: 'Category' },
      { key: 'status', label: 'Status' },
      { key: 'applications', label: 'Profile ứng tuyển' }
    ];
  }
  if (type === 'applications') {
    return [
      { key: 'candidateName', label: 'Candidate' },
      { key: 'jobTitle', label: 'Job' },
      { key: 'status', label: 'Status' },
      { key: 'createdAt', label: 'Date' },
      { key: 'conversion', label: 'Conversion' }
    ];
  }
  return [
    { key: 'name', label: 'Users' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role' },
    { key: 'status', label: 'Status' },
    { key: 'createdAt', label: 'Created' }
  ];
}

function exportReport(format) {
  const url = `${endpoint}/export?${buildQuery()}&format=${encodeURIComponent(format)}&table=${encodeURIComponent(state.tableType)}`;
  window.open(`${apiBaseUrl()}${url}`, '_blank', 'noopener');
}

function buildQuery() {
  const params = new URLSearchParams();
  params.set('range', state.range);
  if (state.startDate) params.set('startDate', state.startDate);
  if (state.endDate) params.set('endDate', state.endDate);
  if (state.role) params.set('role', state.role);
  if (state.category) params.set('category', state.category);
  if (state.location) params.set('location', state.location);
  return params.toString();
}

function setActiveRangeButton() {
  document.querySelectorAll('.reportRangeButton').forEach((button) => {
    const active = button.dataset.range === state.range;
    button.classList.toggle('bg-blue-600', active);
    button.classList.toggle('text-white', active);
    button.classList.toggle('bg-white', !active);
    button.classList.toggle('text-slate-600', !active);
  });
}

function normalizeSeries(value) {
  return normalizeArray(value).map((item) => ({
    label: item.label || item.date || item.month || '',
    value: numberValue(item.value ?? item.count ?? item.total)
  }));
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  const percent = Math.abs(number) <= 1 ? number * 100 : number;
  return `${percent.toFixed(1)}%`;
}

function formatAny(value) {
  if (value === null || value === undefined || value === '') return '--';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('en-US') : '--';
  if (Array.isArray(value)) return value.map((item) => item.name || item.label || item).join(', ');
  if (typeof value === 'object') return value.name || value.label || value.value || JSON.stringify(value);
  return String(value);
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US') : '--';
}

function apiBaseUrl() {
  return localStorage.getItem('apiBaseUrl') || '/api';
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderList(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}














