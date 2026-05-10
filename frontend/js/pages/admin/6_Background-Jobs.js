import { api } from '../../api.js';

// API thật dự kiến:
// GET    /admin/background-jobs?search=&status=&type=&time=
// GET    /admin/background-jobs/:id
// POST   /admin/background-jobs/:id/retry
// POST   /admin/background-jobs/:id/restart
// DELETE /admin/background-jobs/:id
// POST   /admin/background-jobs/queue/pause
// POST   /admin/background-jobs/queue/resume
const endpoint = '/admin/background-jobs';

const state = {
  search: '',
  status: '',
  type: '',
  time: '',
  jobs: [],
  selectedJobId: '',
  refreshTimer: null,
  searchTimer: null
};

export async function init() {
  bindEvents();
  renderLoading();
  await loadBackgroundJobs();
  startAutoRefresh();
}

function bindEvents() {
  document.getElementById('backgroundJobSearchInput')?.addEventListener('input', debounceFilter('search'));
  document.getElementById('backgroundJobTypeFilter')?.addEventListener('input', debounceFilter('type'));

  document.getElementById('backgroundJobStatusFilter')?.addEventListener('change', (event) => {
    state.status = event.target.value;
    loadBackgroundJobs();
  });

  document.getElementById('backgroundJobTimeFilter')?.addEventListener('change', (event) => {
    state.time = event.target.value;
    loadBackgroundJobs();
  });

  document.getElementById('btnReloadBackgroundJobs')?.addEventListener('click', () => loadBackgroundJobs());
  document.getElementById('btnPauseQueue')?.addEventListener('click', () => queueAction('pause'));
  document.getElementById('btnResumeQueue')?.addEventListener('click', () => queueAction('resume'));
  document.getElementById('autoRefreshJobs')?.addEventListener('change', (event) => {
    if (event.target.checked) startAutoRefresh();
    else stopAutoRefresh();
  });

  document.getElementById('adminBackgroundJobsPage')?.addEventListener('click', handleActions);
}

function debounceFilter(key) {
  return (event) => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      state[key] = event.target.value.trim();
      loadBackgroundJobs();
    }, 250);
  };
}

async function loadBackgroundJobs() {
  setText('backgroundJobsSubtitle', 'Loading background jobs từ backend...');

  try {
    const payload = await api.get(`${endpoint}?${buildQuery()}`);
    const data = normalizeResponse(payload);
    state.jobs = data.jobs;
    renderPage(data);
    setText('backgroundJobsSubtitle', `Dữ liệu queue cập nhật ${formatTime(new Date())}.`);
  } catch (err) {
    console.error('Job nền error:', err);
    state.jobs = [];
    renderPage(normalizeResponse({}));
    setText(
      'backgroundJobsSubtitle',
      err?.status === 404
        ? 'Backend chưa có endpoint /admin/background-jobs. Frontend đã sẵn sàng để nối dữ liệu thật.'
        : 'Không tải được tác vụ nền từ backend.'
    );
  }
}

function renderLoading() {
  renderList('backgroundJobsTableBody', '<tr><td class="px-4 py-8 text-center text-sm font-bold text-slate-400" colspan="8">Loading tác vụ nền...</td></tr>');
}

function normalizeResponse(payload = {}) {
  const stats = payload.stats || payload.overview || {};
  const monitoring = payload.monitoring || payload.queue || {};
  const jobs = normalizeArray(payload.jobs || payload.items || payload.data).map(normalizeJob);

  return {
    stats: {
      total: numberValue(stats.totalJobs ?? stats.total ?? payload.totalJobs ?? jobs.length),
      pending: numberValue(stats.pendingJobs ?? stats.pending),
      running: numberValue(stats.runningJobs ?? stats.running),
      failed: numberValue(stats.failedJobs ?? stats.failed)
    },
    monitoring: {
      waiting: numberValue(monitoring.waiting ?? monitoring.pending ?? stats.pendingJobs),
      processingRate: monitoring.processingRate || monitoring.rate || '',
      workerStatus: monitoring.workerStatus || monitoring.status || '',
      retrySystem: monitoring.retrySystem || monitoring.retryStatus || ''
    },
    jobs
  };
}

function normalizeJob(job = {}) {
  return {
    id: String(job.id || job._id || job.jobId || ''),
    name: job.name || job.type || job.taskType || job.queueName || '',
    status: normalizeStatus(job.status || job.state || 'pending'),
    createdAt: job.createdAt || job.created_at || '',
    startedAt: job.startedAt || job.started_at || '',
    duration: job.duration || job.durationMs || '',
    attempts: Number(job.attempts ?? job.retryCount ?? job.retries ?? 0) || 0,
    payload: job.payload || job.data || {},
    logs: normalizeArray(job.logs),
    error: job.error || job.errorMessage || job.failureReason || '',
    retryHistory: normalizeArray(job.retryHistory || job.retriesHistory),
    raw: job
  };
}

function renderPage(data) {
  renderStats(data.stats);
  renderMonitoring(data.monitoring);
  renderJobsTable(data.jobs);
}

// Render overview cards.
function renderStats(stats) {
  setText('statTotalBackgroundJobs', formatNumber(stats.total));
  setText('statPendingBackgroundJobs', formatNumber(stats.pending));
  setText('statRunningBackgroundJobs', formatNumber(stats.running));
  setText('statFailedBackgroundJobs', formatNumber(stats.failed));
}

// Render queue monitoring: waiting count, processing rate, worker status, retry system.
function renderMonitoring(monitoring) {
  setText('queueWaitingCount', formatNumber(monitoring.waiting));
  setText('processingRate', monitoring.processingRate || '--');
  setText('workerStatus', monitoring.workerStatus || '--');
  setText('retrySystemStatus', monitoring.retrySystem || '--');
}

// Render Job Queue List.
function renderJobsTable(jobs) {
  if (!jobs.length) {
    renderList('backgroundJobsTableBody', '<tr><td class="px-4 py-8 text-center text-sm font-bold text-slate-400" colspan="8">Chưa có background job phù hợp với bộ lọc hiện tại.</td></tr>');
    return;
  }

  renderList('backgroundJobsTableBody', jobs.map((job) => `
    <tr class="transition-colors hover:bg-slate-50 ${String(job.id) === String(state.selectedJobId) ? 'bg-blue-50/60' : ''}">
      <td class="px-4 py-4 text-sm font-black text-slate-950">#${escapeHtml(job.id || '--')}</td>
      <td class="px-4 py-4 text-sm font-semibold text-slate-600">${escapeHtml(job.name || '--')}</td>
      <td class="px-4 py-4">${statusBadge(job.status)}</td>
      <td class="px-4 py-4 text-sm font-semibold text-slate-500">${escapeHtml(formatDateTime(job.createdAt))}</td>
      <td class="px-4 py-4 text-sm font-semibold text-slate-500">${escapeHtml(formatDateTime(job.startedAt))}</td>
      <td class="px-4 py-4 text-sm font-black text-slate-900">${escapeHtml(formatDuration(job.duration))}</td>
      <td class="px-4 py-4 text-sm font-black text-slate-900">${formatNumber(job.attempts)}</td>
      <td class="px-4 py-4">
        <div class="flex items-center justify-end gap-1">
          ${actionButton('view', job.id, 'visibility', 'Xem')}
          ${actionButton('retry', job.id, 'replay', 'Retry job')}
          ${actionButton('restart', job.id, 'restart_alt', 'Restart job')}
          ${actionButton('delete', job.id, 'delete', 'Delete job', 'text-red-600 hover:bg-red-50')}
        </div>
      </td>
    </tr>
  `).join(''));
}

function handleActions(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  const job = state.jobs.find((item) => String(item.id) === String(target.dataset.id));
  if (!job) return;

  const action = target.dataset.action;
  if (action === 'view') openDetailPanel(job);
  if (action === 'retry') jobAction(job, 'retry');
  if (action === 'restart') jobAction(job, 'restart');
  if (action === 'delete') deleteJob(job);
}

async function openDetailPanel(job) {
  state.selectedJobId = job.id;
  renderJobsTable(state.jobs);
  renderDetail(job);

  try {
    const payload = await api.get(`${endpoint}/${encodeURIComponent(job.id)}`);
    renderDetail(normalizeJob(payload.job || payload.detail || payload));
  } catch (err) {
    if (err?.status !== 404) console.error('Load background job detail error:', err);
  }
}

// Render payload, logs, error stack và retry history phục vụ debug.
function renderDetail(job) {
  renderList('backgroundJobDetailPanel', `
    <div class="space-y-5">
      <div class="rounded-lg bg-slate-50 p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-xl font-black text-slate-950">#${escapeHtml(job.id || '--')} · ${escapeHtml(job.name || '--')}</p>
            <p class="mt-1 text-sm font-semibold text-slate-500">${escapeHtml(formatDateTime(job.createdAt))}</p>
          </div>
          ${statusBadge(job.status)}
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        ${summaryBox('Started At', formatDateTime(job.startedAt))}
        ${summaryBox('Duration', formatDuration(job.duration))}
        ${summaryBox('Attempts', formatNumber(job.attempts))}
        ${summaryBox('Status', statusText(job.status))}
      </div>

      ${codeSection('Payload', job.payload)}
      ${logsSection('Nhật ký', job.logs)}
      ${errorSection(job.error)}
      ${logsSection('Lịch sử retry', job.retryHistory)}
    </div>
  `);
}

async function jobAction(job, action) {
  if (!confirm(`${action} job #${job.id}?`)) return;
  try {
    await api.post(`${endpoint}/${encodeURIComponent(job.id)}/${action}`, {});
    await loadBackgroundJobs();
  } catch (err) {
    console.error('Background job action error:', err);
    alert(err.message || 'Không thực hiện được action.');
  }
}

async function deleteJob(job) {
  if (!confirm(`Delete job #${job.id}?`)) return;
  try {
    await api.delete(`${endpoint}/${encodeURIComponent(job.id)}`);
    await loadBackgroundJobs();
    if (String(state.selectedJobId) === String(job.id)) {
      state.selectedJobId = '';
      renderList('backgroundJobDetailPanel', '<p class="rounded-lg bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">Chưa chọn job.</p>');
    }
  } catch (err) {
    console.error('Delete background job error:', err);
    alert(err.message || 'Không xóa được job.');
  }
}

async function queueAction(action) {
  try {
    await api.post(`${endpoint}/queue/${action}`, {});
    await loadBackgroundJobs();
  } catch (err) {
    console.error('Queue action error:', err);
    alert(err.message || 'Không điều khiển được queue.');
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  state.refreshTimer = window.setInterval(() => {
    loadBackgroundJobs();
  }, 10000);
}

function stopAutoRefresh() {
  if (state.refreshTimer) window.clearInterval(state.refreshTimer);
  state.refreshTimer = null;
}

function buildQuery() {
  const params = new URLSearchParams();
  if (state.search) params.set('search', state.search);
  if (state.status) params.set('status', state.status);
  if (state.type) params.set('type', state.type);
  if (state.time) params.set('time', state.time);
  return params.toString();
}

function statusBadge(status) {
  const normalized = normalizeStatus(status);
  const tones = {
    pending: 'bg-amber-50 text-amber-700',
    running: 'bg-cyan-50 text-cyan-700',
    completed: 'bg-emerald-50 text-emerald-700',
    failed: 'bg-red-50 text-red-700',
    retried: 'bg-violet-50 text-violet-700'
  };
  return `<span class="rounded-full ${tones[normalized]} px-3 py-1 text-xs font-black">${escapeHtml(statusText(normalized))}</span>`;
}

function actionButton(action, id, icon, label, extraClass = 'text-slate-500 hover:bg-slate-100 hover:text-slate-950') {
  return `
    <button class="flex h-9 w-9 items-center justify-center rounded-lg ${extraClass}" type="button" data-action="${escapeHtml(action)}" data-id="${escapeHtml(id)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
      <span class="material-symbols-outlined text-xl">${escapeHtml(icon)}</span>
    </button>
  `;
}

function summaryBox(label, value) {
  return `<div class="rounded-lg border border-slate-200 p-3"><p class="text-xs font-black uppercase tracking-wider text-slate-400">${escapeHtml(label)}</p><p class="mt-2 truncate text-sm font-black text-slate-950">${escapeHtml(value || '--')}</p></div>`;
}

function codeSection(title, value) {
  return `
    <section>
      <h3 class="text-sm font-black text-slate-950">${escapeHtml(title)}</h3>
      <pre class="mt-3 max-h-64 overflow-auto rounded-lg bg-slate-950 p-4 text-xs font-semibold leading-6 text-slate-100">${escapeHtml(formatJson(value))}</pre>
    </section>
  `;
}

function logsSection(title, items) {
  const rows = normalizeArray(items);
  const content = rows.length
    ? rows.map((item) => `<div class="rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-600">${escapeHtml(item.message || item.text || item.log || JSON.stringify(item))}</div>`).join('')
    : '<p class="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-400">Chưa có dữ liệu.</p>';
  return `<section><h3 class="text-sm font-black text-slate-950">${escapeHtml(title)}</h3><div class="mt-3 space-y-2">${content}</div></section>`;
}

function errorSection(error) {
  if (!error) return logsSection('Notifications lỗi', []);
  return `
    <section>
      <h3 class="text-sm font-black text-red-700">Notifications lỗi</h3>
      <pre class="mt-3 max-h-64 overflow-auto rounded-lg bg-red-50 p-4 text-xs font-semibold leading-6 text-red-700">${escapeHtml(typeof error === 'string' ? error : formatJson(error))}</pre>
    </section>
  `;
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function normalizeStatus(status = '') {
  const normalized = String(status).toLowerCase();
  if (['running', 'active', 'processing'].includes(normalized)) return 'running';
  if (['completed', 'complete', 'success', 'succeeded'].includes(normalized)) return 'completed';
  if (['failed', 'error', 'failure'].includes(normalized)) return 'failed';
  if (['retried', 'retry', 'retrying'].includes(normalized)) return 'retried';
  return 'pending';
}

function statusText(status) {
  const normalized = normalizeStatus(status);
  if (normalized === 'running') return 'Đang chạy';
  if (normalized === 'completed') return 'Hoàn thành';
  if (normalized === 'failed') return 'Thất bại';
  if (normalized === 'retried') return 'Đã thử lại';
  return 'Pending';
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatJson(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch {
    return String(value);
  }
}

function formatDuration(value) {
  if (!value && value !== 0) return '--';
  if (typeof value === 'string') return value;
  const ms = Number(value);
  if (!Number.isFinite(ms)) return '--';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatDateTime(value) {
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

function formatTime(value) {
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(value);
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US') : '--';
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














