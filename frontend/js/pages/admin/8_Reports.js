import { api } from '../../api.js';

// API thật dự kiến:
// GET /admin/reports?range=&startDate=&endDate=&role=&category=&location=
// GET /admin/reports/export?format=&table=&range=&...
const endpoint = '/admin/reports/summary';

const state = {
  range: '30d',
  startDate: '',
  endDate: '',
  type: '',
  status: '',
  location: '',
  tableType: 'reports',
  page: 1,
  limit: 10,
  total: 0,
  searchTimer: null,
  reportData: null
};

export async function init() {
  const tableSelect = document.getElementById('reportTableType');
  if (tableSelect) tableSelect.value = state.tableType;
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
    state.type = event.target.value;
    state.page = 1;
    loadReports();
  });

  document.getElementById('reportCategoryFilter')?.addEventListener('change', (event) => {
    state.status = event.target.value;
    state.page = 1;
    loadReports();
  });
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
    state.total = data.total;
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
  const details = payload.details || {};
  const jobsStatus = details.jobsStatus || {};
  const topJob = normalizeArray(details.topJobs)[0];

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
      users: {
        ...(modules.users || payload.userReports || {}),
        usersByRole: details.usersByRole || modules.users?.usersByRole
      },
      jobs: {
        ...(modules.jobs || payload.jobReports || {}),
        jobsByCategory: details.jobsByCategory || modules.jobs?.jobsByCategory,
        activeExpired: details.jobsStatus
          ? `Active ${formatNumber(jobsStatus.active)} / Expired ${formatNumber(jobsStatus.expired)} / Pending ${formatNumber(jobsStatus.pending)} / Reported ${formatNumber(jobsStatus.reported)}`
          : modules.jobs?.activeExpired,
        topJob: topJob ? `${topJob.title || topJob.name || '--'} (${formatNumber(topJob.applications || topJob.count || 0)})` : modules.jobs?.topJob
      },
      applications: {
        ...(modules.applications || payload.applicationReports || {}),
        cvByJob: details.cvByJob || modules.applications?.cvByJob,
        applyRate: details.applicationRate ?? modules.applications?.applyRate,
        conversionRate: details.conversionRate ?? modules.applications?.conversionRate
      },
      search: {
        ...(modules.search || payload.searchReports || {}),
        topKeywords: details.topKeywords || modules.search?.topKeywords,
        noResultSearches: details.noResultSearches ?? modules.search?.noResultSearches
      }
    },
    ranking: {
      companies: normalizeArray(ranking.companies || ranking.topCompanies || payload.topCompanies),
      jobs: normalizeArray(ranking.jobs || ranking.topJobs || payload.topJobs || details.topJobs),
      users: normalizeArray(ranking.users || ranking.topUsers || payload.topUsers || details.usersByRole)
    },
    comparison: normalizeArray(payload.comparison || payload.compare),
    insights: normalizeArray(payload.insights || payload.alerts),
    tables: payload.tables || payload.tableData || { reports: normalizeArray(payload.reports || payload.items || payload.data) }
    ,
    total: Number(payload.total ?? normalizeArray(payload.items || payload.reports || payload.data).length) || 0
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
  renderLineChart('userGrowthChart', 'userGrowthEmpty', charts.userGrowth, '#2563eb', 'Users');
  renderLineChart('jobsPostedChart', 'jobsPostedEmpty', charts.jobsPosted, '#0891b2', 'Jobs');
  renderLineChart('applicationsTrendChart', 'applicationsTrendEmpty', charts.applicationsTrend, '#16a34a', 'Applications');
}

function renderLineChart(svgId, emptyId, series, color, metricLabel) {
  const svg = document.getElementById(svgId);
  const empty = document.getElementById(emptyId);
  if (!svg || !empty) return;

  svg.innerHTML = '';
  const container = svg.parentElement;
  const tooltip = ensureChartTooltip(container, `${svgId}Tooltip`);
  const points = series.filter((item) => Number.isFinite(item.value));
  const hasData = points.length > 0;
  empty.classList.toggle('hidden', hasData);
  empty.classList.toggle('flex', !hasData);
  if (tooltip) tooltip.classList.add('hidden');
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
    ${coords.map((point) => `
      <g class="report-chart-point" data-label="${escapeHtml(formatChartDate(point.label))}" data-value="${escapeHtml(point.value)}" data-metric="${escapeHtml(metricLabel)}">
        <circle cx="${point.x}" cy="${point.y}" r="4" fill="${color}" />
        <circle cx="${point.x}" cy="${point.y}" r="13" fill="transparent" stroke="transparent" />
      </g>
    `).join('')}
  `;

  svg.querySelectorAll('.report-chart-point').forEach((point) => {
    point.addEventListener('mouseenter', (event) => showChartTooltip(event, tooltip));
    point.addEventListener('mousemove', (event) => showChartTooltip(event, tooltip));
    point.addEventListener('mouseleave', () => tooltip?.classList.add('hidden'));
  });
}

function ensureChartTooltip(container, id) {
  if (!container) return null;
  let tooltip = document.getElementById(id);
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = id;
    tooltip.className = 'pointer-events-none absolute z-20 hidden rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold leading-5 text-white shadow-lg transition-opacity';
    container.appendChild(tooltip);
  }
  return tooltip;
}

function showChartTooltip(event, tooltip) {
  if (!tooltip) return;
  const target = event.currentTarget;
  const label = target.dataset.label || '--';
  const metric = target.dataset.metric || 'Value';
  const value = formatNumber(target.dataset.value);
  tooltip.innerHTML = `<div>${escapeHtml(label)}</div><div>${escapeHtml(metric)}: ${escapeHtml(value)}</div>`;
  tooltip.classList.remove('hidden');

  const container = tooltip.parentElement;
  const rect = container.getBoundingClientRect();
  const tipWidth = tooltip.offsetWidth || 120;
  const tipHeight = tooltip.offsetHeight || 48;
  const padding = 8;
  const x = Math.min(Math.max(event.clientX - rect.left + 12, padding), rect.width - tipWidth - padding);
  const y = Math.min(Math.max(event.clientY - rect.top - tipHeight - 10, padding), rect.height - tipHeight - padding);
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function formatChartDate(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
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
    renderReportPagination();
    return;
  }

  renderList('reportTableBody', rows.slice(0, state.limit).map((row) => `
    <tr class="hover:bg-slate-50">
      ${columns.map((column) => `<td class="px-4 py-4 text-sm font-semibold text-slate-600">${escapeHtml(formatAny(row[column.key]))}</td>`).join('')}
    </tr>
  `).join(''));
  renderReportPagination();
}

function renderReportPagination() {
  const table = document.getElementById('reportTableBody')?.closest('section');
  if (!table) return;
  let pager = document.getElementById('reportsPagination');
  if (!pager) {
    pager = document.createElement('div');
    pager.id = 'reportsPagination';
    pager.className = 'flex flex-col gap-3 border-t border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between';
    table.appendChild(pager);
  }
  const totalPages = Math.max(Math.ceil(state.total / state.limit), 1);
  const start = state.total === 0 ? 0 : (state.page - 1) * state.limit + 1;
  const end = Math.min(state.page * state.limit, state.total);
  pager.innerHTML = `
    <span class="text-sm font-bold text-slate-500">${start}-${end} / ${formatNumber(state.total)} reports</span>
    <div class="flex items-center gap-2">
      <button class="h-9 rounded-lg border border-slate-200 px-3 text-sm font-black text-slate-600 disabled:opacity-40" type="button" data-report-page="prev" ${state.page <= 1 ? 'disabled' : ''}>Trước</button>
      <span class="text-sm font-black text-slate-700">${state.page} / ${totalPages}</span>
      <button class="h-9 rounded-lg border border-slate-200 px-3 text-sm font-black text-slate-600 disabled:opacity-40" type="button" data-report-page="next" ${state.page >= totalPages ? 'disabled' : ''}>Sau</button>
    </div>
  `;
  pager.querySelector('[data-report-page="prev"]')?.addEventListener('click', () => {
    if (state.page > 1) {
      state.page -= 1;
      loadReports();
    }
  });
  pager.querySelector('[data-report-page="next"]')?.addEventListener('click', () => {
    if (state.page < totalPages) {
      state.page += 1;
      loadReports();
    }
  });
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
  if (type === 'reports') {
    return [
      { key: 'type', label: 'Loại' },
      { key: 'targetName', label: 'Đối tượng' },
      { key: 'reporterName', label: 'Người báo cáo' },
      { key: 'reason', label: 'Lý do' },
      { key: 'status', label: 'Trạng thái' },
      { key: 'createdAt', label: 'Ngày' }
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
  const rows = normalizeArray(state.reportData?.tables?.[state.tableType] || []);
  const columns = getColumns(state.tableType);
  if (!rows.length) {
    alert('Không có dữ liệu để export.');
    return;
  }

  if (format === 'pdf') {
    exportPrintable(rows, columns);
    return;
  }

  if (format === 'excel') {
    downloadBlob(`reports-${state.tableType}.xls`, tableHtml(rows, columns), 'application/vnd.ms-excel;charset=utf-8');
    return;
  }

  downloadBlob(`reports-${state.tableType}.csv`, toCsv(rows, columns), 'text/csv;charset=utf-8');
}

function toCsv(rows, columns) {
  const escapeCell = (value) => `"${formatAny(value).replaceAll('"', '""')}"`;
  return [
    columns.map((column) => escapeCell(column.label)).join(','),
    ...rows.map((row) => columns.map((column) => escapeCell(row[column.key])).join(','))
  ].join('\n');
}

function tableHtml(rows, columns) {
  return `
    <table>
      <thead><tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(formatAny(row[column.key]))}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  `;
}

function exportPrintable(rows, columns) {
  const win = window.open('', '_blank', 'noopener');
  if (!win) return;
  win.document.write(`
    <html>
      <head><title>Reports ${state.tableType}</title></head>
      <body>
        <h1>Reports ${state.tableType}</h1>
        ${tableHtml(rows, columns)}
        <script>window.print();</script>
      </body>
    </html>
  `);
  win.document.close();
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildQuery() {
  const params = new URLSearchParams();
  params.set('range', state.range);
  if (state.startDate) params.set('startDate', state.startDate);
  if (state.endDate) params.set('endDate', state.endDate);
  if (state.type) params.set('type', state.type);
  if (state.status) params.set('status', state.status);
  if (state.location) params.set('location', state.location);
  params.set('page', String(state.page));
  params.set('limit', String(state.limit));
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
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const label = item.name || item.label || item.role || item.category || item.keyword || item.title || item.jobTitle || item.type || '--';
      const count = item.count ?? item.total ?? item.value ?? item.applications;
      return count === undefined ? label : `${label}: ${formatNumber(count)}`;
    }).join(', ');
  }
  if (typeof value === 'object') {
    const label = value.name || value.label || value.role || value.category || value.keyword || value.title || value.jobTitle || value.type;
    const count = value.count ?? value.total ?? value.value ?? value.applications;
    if (label && count !== undefined) return `${label}: ${formatNumber(count)}`;
    return label || JSON.stringify(value);
  }
  return String(value);
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US') : '--';
}

function apiBaseUrl() {
  return localStorage.getItem('apiBaseUrl') || `${window.location.origin}/api`;
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














