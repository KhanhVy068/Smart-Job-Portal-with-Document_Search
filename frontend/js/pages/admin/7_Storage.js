import { api } from '../../api.js';

// API thật dự kiến:
// GET    /admin/storage?search=&type=&user=&size=&date=&page=&limit=
// DELETE /admin/storage/files/:id
// PATCH  /admin/storage/files/:id/move
// POST   /admin/storage/cleanup-unused
// POST   /admin/storage/cleanup-old
// PATCH  /admin/storage/config
const endpoint = '/admin/storage';

const state = {
  search: '',
  type: '',
  user: '',
  size: '',
  date: '',
  page: 1,
  limit: 10,
  total: 0,
  files: [],
  searchTimer: null
};

export async function init() {
  bindEvents();
  renderLoading();
  await loadStorage();
}

function bindEvents() {
  document.getElementById('storageSearchInput')?.addEventListener('input', debounceFilter('search'));
  document.getElementById('storageUserFilter')?.addEventListener('input', debounceFilter('user'));

  ['storageTypeFilter', 'storageSizeFilter', 'storageDateFilter'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', (event) => {
      const key = id === 'storageTypeFilter' ? 'type' : id === 'storageSizeFilter' ? 'size' : 'date';
      state[key] = event.target.value;
      state.page = 1;
      loadStorage();
    });
  });

  document.getElementById('storageItemsPerPage')?.addEventListener('change', (event) => {
    state.limit = Number(event.target.value) || 10;
    state.page = 1;
    loadStorage();
  });

  document.getElementById('btnReloadStorage')?.addEventListener('click', () => loadStorage());
  document.getElementById('btnCleanupUnused')?.addEventListener('click', () => cleanup('cleanup-unused'));
  document.getElementById('btnCleanupOld')?.addEventListener('click', () => cleanup('cleanup-old'));
  document.getElementById('storageConfigForm')?.addEventListener('submit', saveConfig);
  document.getElementById('adminStoragePage')?.addEventListener('click', handleActions);
}

function debounceFilter(key) {
  return (event) => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      state[key] = event.target.value.trim();
      state.page = 1;
      loadStorage();
    }, 250);
  };
}

async function loadStorage() {
  setText('storagePageSubtitle', 'Loading storage data từ backend...');
  renderLoading();

  try {
    const payload = await api.get(`${endpoint}?${buildQuery()}`);
    const data = normalizeStorageResponse(payload);
    state.files = data.files;
    state.total = data.total;
    renderStorage(data);
    setText('storagePageSubtitle', 'Dữ liệu lưu trữ được tải theo bộ lọc và phân trang hiện tại.');
  } catch (err) {
    console.error('Admin storage error:', err);
    state.files = [];
    state.total = 0;
    renderStorage(normalizeStorageResponse({}));
    setText(
      'storagePageSubtitle',
      err?.status === 404
        ? 'Backend chưa có endpoint /admin/storage. Frontend đã sẵn sàng để nối dữ liệu thật.'
        : 'Không tải được dữ liệu lưu trữ từ backend.'
    );
  }
}

function renderLoading() {
  renderList('storageFilesTableBody', '<tr><td class="px-4 py-8 text-center text-sm font-bold text-slate-400" colspan="6">Loading tệp...</td></tr>');
}

function normalizeStorageResponse(payload = {}) {
  const overview = payload.overview || payload.stats || {};
  const charts = payload.charts || payload.analytics || {};
  const files = normalizeArray(payload.files || payload.items || payload.data).map(normalizeFile);

  return {
    overview: {
      totalStorage: overview.totalStorage || overview.total || payload.totalStorage || '',
      filesCount: numberValue(overview.filesCount ?? payload.filesCount ?? files.length),
      usedStorage: overview.usedStorage || overview.used || payload.usedStorage || '',
      availableStorage: overview.availableStorage || overview.available || payload.availableStorage || '',
      usedPercent: numberValue(overview.usedPercent ?? overview.usagePercent ?? payload.usedPercent)
    },
    usageTrend: normalizeSeries(charts.usageTrend || payload.usageTrend),
    categories: normalizeArray(charts.categories || payload.categories || payload.fileCategories),
    alerts: normalizeArray(payload.alerts || payload.storageAlerts),
    users: normalizeArray(payload.users || payload.userStorage || payload.topUsers),
    files,
    total: Number(payload.total ?? payload.totalFiles ?? files.length) || 0,
    config: payload.config || {}
  };
}

function normalizeFile(file = {}) {
  const owner = file.owner || file.user || file.uploader || {};
  return {
    id: String(file.id || file._id || file.fileId || ''),
    name: file.name || file.fileName || file.originalName || '',
    type: normalizeType(file.type || file.fileType || file.mimeType || file.name || file.fileName),
    category: file.category || '',
    size: Number(file.size ?? file.fileSize ?? 0) || 0,
    ownerName: owner.name || owner.fullName || file.ownerName || file.userName || '',
    uploadedAt: file.uploadedAt || file.createdAt || file.created_at || '',
    url: file.url || file.fileUrl || '',
    raw: file
  };
}

function renderStorage(data) {
  renderStats(data.overview);
  renderUsageChart(data.usageTrend);
  renderCategories(data.categories);
  renderAlerts(data.alerts, data.overview);
  renderUsersStorage(data.users);
  renderFilesTable();
  renderPagination();
  renderConfig(data.config);
}

// Render Thống kê lưu trữ.
function renderStats(overview) {
  setText('statTotalStorage', overview.totalStorage || '--');
  setText('statFilesCount', formatNumber(overview.filesCount));
  setText('statUsedStorage', overview.usedStorage || '--');
  setText('statAvailableStorage', overview.availableStorage || '--');
}

// Render biểu đồ dung lượng theo thời gian bằng SVG.
function renderUsageChart(series) {
  const svg = document.getElementById('storageUsageChartSvg');
  const labels = document.getElementById('storageUsageChartLabels');
  const empty = document.getElementById('storageUsageChartEmpty');
  if (!svg || !labels || !empty) return;

  svg.innerHTML = '';
  labels.innerHTML = '';
  const points = series.filter((item) => Number.isFinite(item.value));
  const hasData = points.length > 0;
  empty.classList.toggle('hidden', hasData);
  empty.classList.toggle('flex', !hasData);
  if (!hasData) return;

  const width = 900;
  const height = 250;
  const max = Math.max(...points.map((item) => item.value), 1);
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const coords = points.map((item, index) => ({
    x: points.length > 1 ? index * step : width / 2,
    y: height - (item.value / max) * 190 - 30,
    ...item
  }));

  const grid = [50, 100, 150, 200].map((y) => `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#e2e8f0" />`).join('');
  const polyline = coords.map((point) => `${point.x},${point.y}`).join(' ');
  svg.innerHTML = `
    ${grid}
    <polyline fill="none" stroke="#2563eb" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" points="${polyline}" />
    ${coords.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5" fill="#2563eb"><title>${escapeHtml(point.label)}: ${formatNumber(point.value)}</title></circle>`).join('')}
  `;

  const visible = coords.length > 8 ? [coords[0], coords[Math.floor(coords.length / 2)], coords[coords.length - 1]] : coords;
  labels.innerHTML = visible.map((item) => `<span>${escapeHtml(shortLabel(item.label))}</span>`).join('');
}

function renderCategories(items) {
  if (!items.length) {
    renderList('fileCategoryList', '<p class="text-sm font-bold text-slate-400">Chưa có dữ liệu phân loại file.</p>');
    return;
  }

  const max = Math.max(...items.map((item) => Number(item.size || item.value || item.count || 0)), 1);
  renderList('fileCategoryList', items.map((item) => {
    const label = item.label || item.name || item.category || '--';
    const value = Number(item.size || item.value || item.count || 0);
    return `
      <div>
        <div class="flex items-center justify-between text-sm font-bold">
          <span class="text-slate-600">${escapeHtml(categoryIcon(label))} ${escapeHtml(label)}</span>
          <span class="text-slate-950">${item.sizeText || formatFileSize(value)}</span>
        </div>
        <div class="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-blue-600" style="width:${Math.max((value / max) * 100, 4)}%"></div></div>
      </div>
    `;
  }).join(''));
}

function renderAlerts(items, overview) {
  const generated = [];
  if (Number(overview.usedPercent) >= 95) generated.push({ severity: 'critical', message: 'Storage đã vượt 95%, cần cleanup hoặc nâng cấp dung lượng.' });
  else if (Number(overview.usedPercent) >= 80) generated.push({ severity: 'warning', message: 'Storage đã vượt 80%, nên theo dõi và cleanup file không dùng.' });
  const alerts = items.length ? items : generated;

  if (!alerts.length) {
    renderList('storageAlertsList', '<p class="rounded-lg bg-emerald-50 p-4 text-sm font-black text-emerald-700">Storage đang ổn định, chưa có alerts.</p>');
    return;
  }

  renderList('storageAlertsList', alerts.map((alert) => {
    const critical = String(alert.severity || alert.level || '').toLowerCase().includes('critical');
    return `<p class="rounded-lg ${critical ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'} p-4 text-sm font-black">${escapeHtml(alert.message || alert.title || 'Storage alert')}</p>`;
  }).join(''));
}

function renderUsersStorage(items) {
  if (!items.length) {
    renderList('userStorageList', '<p class="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-400">Chưa có dữ liệu storage theo user.</p>');
    return;
  }

  renderList('userStorageList', items.slice(0, 6).map((item) => `
    <div class="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
      <div class="min-w-0">
        <p class="truncate text-sm font-black text-slate-950">${escapeHtml(item.name || item.fullName || item.email || 'Users')}</p>
        <p class="mt-1 text-xs font-bold text-slate-400">${formatNumber(item.filesCount || item.count || 0)} files</p>
      </div>
      <span class="text-sm font-black text-slate-900">${escapeHtml(item.storageUsed || item.sizeText || formatFileSize(item.size || 0))}</span>
    </div>
  `).join(''));
}

// Render Bảng tệp: file name, type, size, owner, uploaded date, actions.
function renderFilesTable() {
  if (!state.files.length) {
    renderList('storageFilesTableBody', '<tr><td class="px-4 py-8 text-center text-sm font-bold text-slate-400" colspan="6">Chưa có file phù hợp với bộ lọc hiện tại.</td></tr>');
    return;
  }

  renderList('storageFilesTableBody', state.files.map((file) => `
    <tr class="transition-colors hover:bg-slate-50">
      <td class="px-4 py-4">
        <div class="flex min-w-0 items-center gap-2">
          <span class="material-symbols-outlined text-xl text-slate-400">draft</span>
          <span class="max-w-72 truncate text-sm font-black text-slate-950">${escapeHtml(file.name || '--')}</span>
        </div>
      </td>
      <td class="px-4 py-4"><span class="rounded bg-slate-100 px-2 py-1 text-xs font-black uppercase text-slate-700">${escapeHtml(file.type || '--')}</span></td>
      <td class="px-4 py-4 text-sm font-black text-slate-900">${escapeHtml(formatFileSize(file.size))}</td>
      <td class="px-4 py-4 text-sm font-semibold text-slate-600">${escapeHtml(file.ownerName || '--')}</td>
      <td class="px-4 py-4 text-sm font-semibold text-slate-500">${escapeHtml(formatDate(file.uploadedAt))}</td>
      <td class="px-4 py-4">
        <div class="flex items-center justify-end gap-1">
          ${actionButton('view', file.id, 'visibility', 'View file')}
          ${actionButton('download', file.id, 'download', 'Download')}
          ${actionButton('move', file.id, 'drive_file_move', 'Move')}
          ${actionButton('delete', file.id, 'delete', 'Xóa', 'text-red-600 hover:bg-red-50')}
        </div>
      </td>
    </tr>
  `).join(''));
}

function renderPagination() {
  const totalPages = Math.max(Math.ceil(state.total / state.limit), 1);
  const start = state.total === 0 ? 0 : (state.page - 1) * state.limit + 1;
  const end = Math.min(state.page * state.limit, state.total);
  setText('storagePaginationSummary', `${start}-${end} / ${formatNumber(state.total)} files`);

  const pages = buildPageList(totalPages);
  renderList('storagePaginationButtons', [
    pageButton('prev', 'chevron_left', state.page <= 1),
    ...pages.map((page) => typeof page === 'number' ? pageNumberButton(page) : `<span class="px-2 text-sm font-black text-slate-400">...</span>`),
    pageButton('next', 'chevron_right', state.page >= totalPages)
  ].join(''));
}

function renderConfig(config = {}) {
  setValue('storageUsersLimitInput', config.userLimit || config.perUsersLimit || '');
  setValue('storageFileSizeLimitInput', config.maxFileSize || config.fileSizeLimit || '');
  setValue('storageProviderInput', config.provider || 'local');
}

function handleActions(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;
  if (action === 'prev' && state.page > 1) {
    state.page -= 1;
    loadStorage();
    return;
  }
  if (action === 'next') {
    state.page += 1;
    loadStorage();
    return;
  }
  if (action === 'page') {
    state.page = Number(target.dataset.page) || 1;
    loadStorage();
    return;
  }

  const file = state.files.find((item) => String(item.id) === String(target.dataset.id));
  if (!file) return;
  if (action === 'view') viewFile(file);
  if (action === 'download') downloadFile(file);
  if (action === 'move') moveFile(file);
  if (action === 'delete') deleteFile(file);
}

function viewFile(file) {
  if (!file.url) {
    alert('Backend chưa trả file URL để view.');
    return;
  }
  window.open(file.url, '_blank', 'noopener');
}

function downloadFile(file) {
  const url = file.url || `${apiBaseUrl()}${endpoint}/files/${encodeURIComponent(file.id)}/download`;
  window.open(url, '_blank', 'noopener');
}

async function moveFile(file) {
  const folder = prompt('Nhập folder đích:', file.category || '');
  if (!folder) return;
  try {
    await api.patch(`${endpoint}/files/${encodeURIComponent(file.id)}/move`, { folder });
    await loadStorage();
  } catch (err) {
    console.error('Move file error:', err);
    alert(err.message || 'Không move được file.');
  }
}

async function deleteFile(file) {
  if (!confirm(`Xóa tệp ${file.name}?`)) return;
  try {
    await api.delete(`${endpoint}/files/${encodeURIComponent(file.id)}`);
    await loadStorage();
  } catch (err) {
    console.error('Xóa tệp error:', err);
    alert(err.message || 'Không xóa được file.');
  }
}

async function cleanup(action) {
  if (!confirm(`Chạy ${action}?`)) return;
  try {
    await api.post(`${endpoint}/${action}`, {});
    await loadStorage();
  } catch (err) {
    console.error('Cleanup error:', err);
    alert(err.message || 'Không chạy được cleanup.');
  }
}

async function saveConfig(event) {
  event.preventDefault();
  const payload = {
    userLimit: document.getElementById('storageUsersLimitInput')?.value?.trim(),
    maxFileSize: document.getElementById('storageFileSizeLimitInput')?.value?.trim(),
    provider: document.getElementById('storageProviderInput')?.value
  };

  try {
    await api.patch(`${endpoint}/config`, payload);
    alert('Đã lưu storage config.');
  } catch (err) {
    console.error('Save storage config error:', err);
    alert(err.message || 'Không lưu được storage config.');
  }
}

function buildQuery() {
  const params = new URLSearchParams();
  if (state.search) params.set('search', state.search);
  if (state.type) params.set('type', state.type);
  if (state.user) params.set('user', state.user);
  if (state.size) params.set('size', state.size);
  if (state.date) params.set('date', state.date);
  params.set('page', String(state.page));
  params.set('limit', String(state.limit));
  return params.toString();
}

function normalizeSeries(value) {
  return normalizeArray(value).map((item) => ({
    label: item.label || item.date || item.month || '',
    value: numberValue(item.value ?? item.size ?? item.used)
  }));
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function normalizeType(value = '') {
  const text = String(value).toLowerCase();
  if (text.includes('pdf')) return 'pdf';
  if (text.includes('jpg') || text.includes('jpeg')) return 'jpg';
  if (text.includes('png')) return 'png';
  if (text.includes('docx')) return 'docx';
  if (text.includes('doc')) return 'doc';
  return text.split('.').pop() || 'other';
}

function categoryIcon(label = '') {
  const text = String(label).toLowerCase();
  if (text.includes('cv') || text.includes('resume')) return '📄';
  if (text.includes('image')) return '🖼️';
  if (text.includes('doc')) return '📁';
  return '📦';
}

function actionButton(action, id, icon, label, extraClass = 'text-slate-500 hover:bg-slate-100 hover:text-slate-950') {
  return `
    <button class="flex h-9 w-9 items-center justify-center rounded-lg ${extraClass}" type="button" data-action="${escapeHtml(action)}" data-id="${escapeHtml(id)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
      <span class="material-symbols-outlined text-xl">${escapeHtml(icon)}</span>
    </button>
  `;
}

function pageButton(action, icon, disabled) {
  return `
    <button class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" type="button" data-action="${action}" ${disabled ? 'disabled' : ''}>
      <span class="material-symbols-outlined text-xl">${icon}</span>
    </button>
  `;
}

function pageNumberButton(page) {
  const active = page === state.page;
  return `<button class="h-9 min-w-9 rounded-lg px-3 text-sm font-black ${active ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}" type="button" data-action="page" data-page="${page}">${page}</button>`;
}

function buildPageList(totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = [1];
  const start = Math.max(2, state.page - 1);
  const end = Math.min(totalPages - 1, state.page + 1);
  if (start > 2) pages.push('...');
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < totalPages - 1) pages.push('...');
  pages.push(totalPages);
  return pages;
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatFileSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return '--';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatDate(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function shortLabel(value = '') {
  const text = String(value);
  return text.length > 10 ? text.slice(0, 10) : text;
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US') : '--';
}

function apiBaseUrl() {
  return localStorage.getItem('apiBaseUrl') || '/api';
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value || '';
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














