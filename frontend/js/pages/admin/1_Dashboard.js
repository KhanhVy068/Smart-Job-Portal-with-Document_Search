import { api } from '../../api.js';

// API thật dự kiến: GET /admin/dashboard
// Backend có thể trả các nhóm dữ liệu: overview, analytics, recentActivity,
// highlights, hệ thống, alerts, recentUsers, recentJobs, pendingApprovals.
const endpoint = '/admin/dashboard';

export async function init() {
  bindEvents();
  renderLoading();
  await loadDashboard();
}

function bindEvents() {
  document.getElementById('adminDashboardReload')?.addEventListener('click', () => {
    loadDashboard();
  });
}

async function loadDashboard() {
  setText('adminDashboardSubtitle', 'Loading dữ liệu thật từ backend...');

  try {
    const payload = await api.get(endpoint);
    renderDashboard(normalizeDashboard(payload));
    setText('adminDashboardSubtitle', `Dữ liệu cập nhật ${formatDateTime(new Date())}`);
  } catch (err) {
    console.error('Admin dashboard error:', err);
    renderDashboard(normalizeDashboard({}));
    setText(
      'adminDashboardSubtitle',
      err?.status === 404
        ? 'Backend chưa có endpoint /admin/dashboard. Frontend đã sẵn sàng để nối dữ liệu thật.'
        : 'Không tải được dữ liệu dashboard admin từ backend.'
    );
  }
}

function renderLoading() {
  ['totalUsers', 'totalJobs', 'totalApplications', 'totalEmployers', 'activeJobs'].forEach((id) => setText(id, '--'));
  renderList('recentActivity', loadingRow('Loading hoạt động...'));
  renderList('adminAlerts', loadingRow('Loading alerts...'));
  renderMiniTable('recentUsersTable', []);
  renderMiniTable('recentJobsTable', []);
  renderMiniTable('pendingApprovalsTable', []);
}

function normalizeDashboard(payload = {}) {
  const overview = payload.overview || payload.stats || payload.summary || {};
  const analytics = payload.analytics || payload.charts || {};
  const highlights = payload.highlights || payload.top || {};
  const system = payload.system || payload.systemStatus || {};

  return {
    overview: {
      totalUsers: numberValue(overview.totalUsers ?? payload.totalUsers),
      totalJobs: numberValue(overview.totalJobs ?? payload.totalJobs),
      totalApplications: numberValue(overview.totalApplications ?? overview.totalCV ?? payload.totalApplications),
      totalEmployers: numberValue(overview.totalEmployers ?? payload.totalEmployers),
      activeJobs: numberValue(overview.activeJobs ?? payload.activeJobs)
    },
    analytics: {
      jobs: normalizeSeries(analytics.jobs || analytics.jobsOverTime || payload.jobsOverTime),
      users: normalizeSeries(analytics.users || analytics.userRegistrations || payload.userRegistrations),
      applications: normalizeSeries(analytics.applications || analytics.cvSubmissions || payload.cvSubmissions)
    },
    recentActivity: normalizeArray(payload.recentActivity || payload.activities),
    highlights: {
      topCompany: firstItem(highlights.topCompany || highlights.topCompanies || payload.topCompanies),
      hotJob: firstItem(highlights.hotJob || highlights.hotJobs || payload.hotJobs),
      activeUsers: firstItem(highlights.activeUsers || highlights.activeUsers || payload.activeUsers)
    },
    system: {
      serverStatus: system.serverStatus || system.status || payload.serverStatus || '',
      storageUsage: numberValue(system.storageUsage ?? system.storagePercent ?? payload.storageUsage),
      backgroundJobs: system.backgroundJobs || system.jobs || payload.backgroundJobs || ''
    },
    alerts: normalizeArray(payload.alerts || payload.notifications),
    recentUsers: normalizeArray(payload.recentUsers || payload.users),
    recentJobs: normalizeArray(payload.recentJobs || payload.jobs),
    pendingApprovals: normalizeArray(payload.pendingApprovals || payload.approvals)
  };
}

function renderDashboard(data) {
  renderOverview(data.overview);
  renderCharts(data.analytics);
  renderActivity(data.recentActivity);
  renderHighlights(data.highlights);
  renderSystem(data.system);
  renderAlerts(data.alerts);
  renderMiniTable('recentUsersTable', data.recentUsers, 'users');
  renderMiniTable('recentJobsTable', data.recentJobs, 'jobs');
  renderMiniTable('pendingApprovalsTable', data.pendingApprovals, 'approvals');
}

// Render các chỉ số chính ở TOP dashboard.
function renderOverview(overview) {
  setText('totalUsers', formatNumber(overview.totalUsers));
  setText('totalJobs', formatNumber(overview.totalJobs));
  setText('totalApplications', formatNumber(overview.totalApplications));
  setText('totalEmployers', formatNumber(overview.totalEmployers));
  setText('activeJobs', formatNumber(overview.activeJobs));
}

// Render 3 biểu đồ xu hướng bằng SVG để không phụ thuộc thư viện ngoài.
function renderCharts(analytics) {
  renderLineChart('jobsChartSvg', 'jobsChartLabels', 'jobsChartEmpty', analytics.jobs, '#0891b2');
  renderLineChart('usersChartSvg', 'usersChartLabels', 'usersChartEmpty', analytics.users, '#2563eb');
  renderLineChart('applicationsChartSvg', 'applicationsChartLabels', 'applicationsChartEmpty', analytics.applications, '#7c3aed');
}

function renderLineChart(svgId, labelsId, emptyId, series, color) {
  const svg = document.getElementById(svgId);
  const labels = document.getElementById(labelsId);
  const empty = document.getElementById(emptyId);
  if (!svg || !labels || !empty) return;

  svg.innerHTML = '';
  labels.innerHTML = '';
  const points = series.filter((item) => Number.isFinite(item.value));
  const hasData = points.length > 0;
  empty.classList.toggle('hidden', hasData);
  empty.classList.toggle('flex', !hasData);
  if (!hasData) return;

  const width = 420;
  const height = 180;
  const max = Math.max(...points.map((item) => item.value), 1);
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const coords = points.map((item, index) => {
    const x = points.length > 1 ? index * step : width / 2;
    const y = height - (item.value / max) * 140 - 20;
    return { x, y, ...item };
  });

  const grid = [35, 75, 115, 155]
    .map((y) => `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />`)
    .join('');
  const polyline = coords.map((point) => `${point.x},${point.y}`).join(' ');
  const circles = coords
    .map((point) => `<circle cx="${point.x}" cy="${point.y}" r="4" fill="${color}"><title>${escapeHtml(point.label)}: ${formatNumber(point.value)}</title></circle>`)
    .join('');

  svg.innerHTML = `
    ${grid}
    <polyline fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${polyline}" />
    ${circles}
  `;

  const visibleLabels = coords.length > 6
    ? [coords[0], coords[Math.floor(coords.length / 2)], coords[coords.length - 1]]
    : coords;
  labels.innerHTML = visibleLabels.map((item) => `<span>${escapeHtml(shortLabel(item.label))}</span>`).join('');
}

// Render luồng hoạt động gần đây: user mới, job mới, CV mới, report/lỗi.
function renderActivity(items) {
  if (!items.length) {
    renderList('recentActivity', emptyRow('Chưa có hoạt động gần đây.'));
    return;
  }

  renderList('recentActivity', items.slice(0, 12).map((item) => {
    const normalized = normalizeActivity(item);
    return `
      <article class="flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-slate-50">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${activityTone(normalized.type)}">
          <span class="material-symbols-outlined text-xl">${escapeHtml(activityIcon(normalized.type))}</span>
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-black text-slate-950">${escapeHtml(normalized.title)}</p>
          <p class="mt-1 line-clamp-2 text-sm font-semibold text-slate-500">${escapeHtml(normalized.description)}</p>
        </div>
        <span class="shrink-0 text-xs font-bold text-slate-400">${escapeHtml(formatRelative(normalized.createdAt))}</span>
      </article>
    `;
  }).join(''));
}

function renderHighlights(highlights) {
  const company = highlights.topCompany || {};
  const hotJob = highlights.hotJob || {};
  const activeUsers = highlights.activeUsers || {};

  setText('topCompanyName', company.name || company.companyName || '--');
  setText('topCompanyMeta', metricText(company.jobs ?? company.totalJobs ?? company.value, 'jobs'));
  setText('hotJobTitle', hotJob.title || hotJob.name || '--');
  setText('hotJobMeta', metricText(hotJob.applications ?? hotJob.totalApplications ?? hotJob.value, 'applications'));
  setText('activeUsersName', activeUsers.name || activeUsers.fullName || activeUsers.email || '--');
  setText('activeUsersMeta', metricText(activeUsers.actions ?? activeUsers.activityCount ?? activeUsers.value, 'actions'));
}

function renderSystem(system) {
  const status = system.serverStatus || '--';
  const statusEl = document.getElementById('serverStatus');
  if (statusEl) {
    statusEl.textContent = status;
    const online = String(status).toLowerCase().includes('online') || String(status).toLowerCase().includes('ok');
    statusEl.className = `rounded-full px-3 py-1 text-xs font-black ${online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`;
  }

  const usage = clamp(system.storageUsage, 0, 100);
  setText('storageUsageText', Number.isFinite(usage) ? `${usage}%` : '--');
  const bar = document.getElementById('storageUsageBar');
  if (bar) bar.style.width = Number.isFinite(usage) ? `${usage}%` : '0%';
  setText('backgroundJobsStatus', system.backgroundJobs || '--');
}

function renderAlerts(items) {
  if (!items.length) {
    renderList('adminAlerts', emptyRow('Không có alerts cần xử lý.'));
    return;
  }

  renderList('adminAlerts', items.slice(0, 8).map((item) => {
    const severity = String(item.severity || item.type || '').toLowerCase();
    const tone = severity.includes('error') || severity.includes('danger') || severity.includes('report')
      ? 'bg-red-50 text-red-700'
      : 'bg-amber-50 text-amber-700';
    return `
      <article class="rounded-lg ${tone} p-3">
        <p class="text-sm font-black">${escapeHtml(item.title || item.name || 'Alert')}</p>
        <p class="mt-1 text-sm font-semibold opacity-80">${escapeHtml(item.message || item.description || '')}</p>
      </article>
    `;
  }).join(''));
}

// Render các bảng nhỏ ở BOTTOM để admin xem nhanh mà không cần rời dashboard.
function renderMiniTable(targetId, items, type = '') {
  if (!items.length) {
    renderList(targetId, emptyRow('Chưa có dữ liệu.'));
    return;
  }

  renderList(targetId, items.slice(0, 6).map((item) => {
    const title = item.name || item.fullName || item.title || item.companyName || item.email || 'Item';
    const meta = item.email || item.role || item.company || item.status || item.createdAt || '';
    const status = item.status || item.state || type;
    return `
      <div class="min-w-0 px-4 py-3">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate text-sm font-black text-slate-950">${escapeHtml(title)}</p>
            <p class="mt-1 truncate text-xs font-bold text-slate-400">${escapeHtml(String(meta || '--'))}</p>
          </div>
          <span class="shrink-0 rounded bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">${escapeHtml(String(status || '--'))}</span>
        </div>
      </div>
    `;
  }).join(''));
}

function normalizeSeries(series) {
  return normalizeArray(series).map((item) => ({
    label: item.label || item.date || item.month || item.day || item.name || '',
    value: numberValue(item.value ?? item.count ?? item.total)
  }));
}

function normalizeActivity(item = {}) {
  return {
    type: item.type || item.category || 'activity',
    title: item.title || item.name || item.actor || 'Active mới',
    description: item.description || item.message || item.action || '',
    createdAt: item.createdAt || item.time || item.date || ''
  };
}

function activityIcon(type = '') {
  const normalized = String(type).toLowerCase();
  if (normalized.includes('user')) return 'person_add';
  if (normalized.includes('job')) return 'work';
  if (normalized.includes('cv') || normalized.includes('application')) return 'description';
  if (normalized.includes('report') || normalized.includes('error')) return 'warning';
  return 'history';
}

function activityTone(type = '') {
  const normalized = String(type).toLowerCase();
  if (normalized.includes('user')) return 'bg-blue-50 text-blue-600';
  if (normalized.includes('job')) return 'bg-cyan-50 text-cyan-700';
  if (normalized.includes('cv') || normalized.includes('application')) return 'bg-violet-50 text-violet-700';
  if (normalized.includes('report') || normalized.includes('error')) return 'bg-red-50 text-red-700';
  return 'bg-slate-100 text-slate-600';
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function firstItem(value) {
  if (Array.isArray(value)) return value[0] || {};
  return value || {};
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return null;
  return Math.min(Math.max(value, min), max);
}

function metricText(value, unit) {
  return Number.isFinite(Number(value)) ? `${formatNumber(value)} ${unit}` : '--';
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US') : '--';
}

function shortLabel(value = '') {
  const text = String(value);
  return text.length > 8 ? text.slice(0, 8) : text;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(value);
}

function formatRelative(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function loadingRow(message) {
  return `<p class="px-2 py-6 text-center text-sm font-bold text-slate-400">${escapeHtml(message)}</p>`;
}

function emptyRow(message) {
  return `<p class="px-2 py-6 text-center text-sm font-bold text-slate-400">${escapeHtml(message)}</p>`;
}

function renderList(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}














