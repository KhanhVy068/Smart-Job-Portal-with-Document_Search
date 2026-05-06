import { api } from '../../api.js';

// API thật dự kiến:
// GET    /admin/documents?search=&status=&fileType=&job=&page=&limit=
// POST   /admin/documents/upload
// GET    /admin/documents/:id
// PATCH  /admin/documents/:id/approve
// PATCH  /admin/documents/:id/reject
// DELETE /admin/documents/:id
// GET    /admin/documents/:id/download
const endpoint = '/admin/documents';

const state = {
  search: '',
  status: '',
  fileType: '',
  job: '',
  page: 1,
  limit: 10,
  total: 0,
  documents: [],
  searchTimer: null
};

export async function init() {
  bindEvents();
  renderLoading();
  await loadDocuments();
}

function bindEvents() {
  document.getElementById('documentSearchInput')?.addEventListener('input', debounceFilter('search'));
  document.getElementById('documentJobFilter')?.addEventListener('input', debounceFilter('job'));

  document.getElementById('documentStatusFilter')?.addEventListener('change', (event) => {
    state.status = event.target.value;
    state.page = 1;
    loadDocuments();
  });

  document.getElementById('documentTypeFilter')?.addEventListener('change', (event) => {
    state.fileType = event.target.value;
    state.page = 1;
    loadDocuments();
  });

  document.getElementById('documentsItemsPerPage')?.addEventListener('change', (event) => {
    state.limit = Number(event.target.value) || 10;
    state.page = 1;
    loadDocuments();
  });

  document.getElementById('btnReloadDocuments')?.addEventListener('click', () => loadDocuments());
  document.getElementById('btnUploadDocument')?.addEventListener('click', openUploadModal);
  document.getElementById('documentUploadForm')?.addEventListener('submit', uploadDocument);
  document.querySelectorAll('.closeDocumentUploadModal').forEach((button) => button.addEventListener('click', closeUploadModal));
  document.querySelectorAll('.closeDocumentDetailModal').forEach((button) => button.addEventListener('click', closeDetailModal));
  document.getElementById('adminDocumentsPage')?.addEventListener('click', handleActions);
}

function debounceFilter(key) {
  return (event) => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      state[key] = event.target.value.trim();
      state.page = 1;
      loadDocuments();
    }, 250);
  };
}

async function loadDocuments() {
  setText('documentsPageSubtitle', 'Loading danh sách CV từ backend...');
  renderLoading();

  try {
    const payload = await api.get(`${endpoint}?${buildQuery()}`);
    const data = normalizeDocumentsResponse(payload);
    state.documents = data.documents;
    state.total = data.total;
    renderDocumentsPage(data);
    setText('documentsPageSubtitle', 'Dữ liệu CV được tải theo tìm kiếm, bộ lọc và phân trang hiện tại.');
  } catch (err) {
    console.error('Admin documents error:', err);
    state.documents = [];
    state.total = 0;
    renderDocumentsPage(normalizeDocumentsResponse({}));
    setText(
      'documentsPageSubtitle',
      err?.status === 404
        ? 'Backend chưa có endpoint /admin/documents. Frontend đã sẵn sàng để nối dữ liệu thật.'
        : 'Không tải được danh sách CV từ backend.'
    );
  }
}

function renderLoading() {
  renderList('documentsTableBody', '<tr><td class="px-4 py-8 text-center text-sm font-bold text-slate-400" colspan="8">Loading danh sách CV...</td></tr>');
}

function normalizeDocumentsResponse(payload = {}) {
  const documents = normalizeArray(payload.documents || payload.items || payload.data || payload.cvs).map(normalizeDocument);
  const stats = payload.stats || payload.summary || {};
  const storage = payload.storage || {};

  return {
    documents,
    total: Number(payload.total ?? payload.totalDocuments ?? documents.length) || 0,
    stats: {
      totalDocuments: Number(stats.totalDocuments ?? payload.totalDocuments ?? payload.total ?? documents.length) || 0,
      todayDocuments: Number(stats.todayDocuments ?? stats.documentsToday ?? payload.todayDocuments) || 0,
      pendingDocuments: Number(stats.pendingDocuments ?? payload.pendingDocuments) || 0,
      rejectedDocuments: Number(stats.rejectedDocuments ?? payload.rejectedDocuments) || 0,
      storageUsed: storage.usedText || stats.storageUsed || payload.storageUsed || sumFileSizeText(documents)
    }
  };
}

function normalizeDocument(item = {}) {
  const candidate = item.candidate || item.user || item.applicant || {};
  const file = item.file || item.document || {};
  const job = item.job || {};

  return {
    id: String(item.id || item._id || item.documentId || item.applicationId || ''),
    candidateName: candidate.name || candidate.fullName || item.candidateName || item.name || '',
    email: candidate.email || item.email || '',
    skills: item.skills || candidate.skills || [],
    jobApplied: job.title || item.jobTitle || item.jobApplied || item.position || '',
    fileName: file.name || file.fileName || item.fileName || item.originalName || 'CV',
    fileUrl: file.url || file.fileUrl || item.fileUrl || item.url || '',
    fileType: normalizeFileType(file.type || item.fileType || item.mimeType || item.fileName),
    fileSize: Number(file.size ?? item.fileSize ?? item.size ?? 0) || 0,
    status: normalizeStatus(item.status || item.cvStatus || item.state || 'pending'),
    uploadedAt: item.uploadedAt || item.createdAt || item.created_at || item.submittedAt || '',
    applyHistory: normalizeArray(item.applyHistory || item.history || item.activities),
    raw: item
  };
}

function renderDocumentsPage(data) {
  renderStats(data.stats);
  renderDocumentsTable();
  renderPagination();
}

// Render analytics nhẹ và storage tracking.
function renderStats(stats) {
  setText('statTotalDocuments', formatNumber(stats.totalDocuments));
  setText('statTodayDocuments', formatNumber(stats.todayDocuments));
  setText('statPendingDocuments', formatNumber(stats.pendingDocuments));
  setText('statRejectedDocuments', formatNumber(stats.rejectedDocuments));
  setText('statStorageUsed', stats.storageUsed || '--');
}

// Render bảng chính: candidate, email, job, file, status, date và actions.
function renderDocumentsTable() {
  if (!state.documents.length) {
    renderList('documentsTableBody', '<tr><td class="px-4 py-8 text-center text-sm font-bold text-slate-400" colspan="8">Chưa có CV phù hợp với bộ lọc hiện tại.</td></tr>');
    return;
  }

  renderList('documentsTableBody', state.documents.map((documentItem) => `
    <tr class="transition-colors hover:bg-slate-50">
      <td class="px-4 py-4">
        <button class="max-w-52 truncate text-left text-sm font-black text-slate-950 hover:text-blue-600" type="button" data-action="view" data-id="${escapeHtml(documentItem.id)}">${escapeHtml(documentItem.candidateName || '--')}</button>
      </td>
      <td class="px-4 py-4 text-sm font-semibold text-slate-500">${escapeHtml(documentItem.email || '--')}</td>
      <td class="px-4 py-4 text-sm font-semibold text-slate-600">${escapeHtml(documentItem.jobApplied || '--')}</td>
      <td class="px-4 py-4">
        <div class="flex min-w-0 items-center gap-2">
          <span class="material-symbols-outlined text-xl text-slate-400">description</span>
          <span class="max-w-44 truncate text-sm font-black text-slate-900">${escapeHtml(documentItem.fileName)}</span>
        </div>
      </td>
      <td class="px-4 py-4 text-sm font-semibold text-slate-500">${escapeHtml(formatFileSize(documentItem.fileSize))}</td>
      <td class="px-4 py-4">${statusBadge(documentItem.status)}</td>
      <td class="px-4 py-4 text-sm font-semibold text-slate-500">${escapeHtml(formatDate(documentItem.uploadedAt))}</td>
      <td class="px-4 py-4">
        <div class="flex items-center justify-end gap-1">
          ${actionButton('view', documentItem.id, 'visibility', 'Xem')}
          ${actionButton('download', documentItem.id, 'download', 'Download')}
          ${actionButton('approve', documentItem.id, 'check_circle', 'Duyệt')}
          ${actionButton('reject', documentItem.id, 'cancel', 'Từ chối')}
          ${actionButton('delete', documentItem.id, 'delete', 'Xóa', 'text-red-600 hover:bg-red-50')}
        </div>
      </td>
    </tr>
  `).join(''));
}

function renderPagination() {
  const totalPages = Math.max(Math.ceil(state.total / state.limit), 1);
  const start = state.total === 0 ? 0 : (state.page - 1) * state.limit + 1;
  const end = Math.min(state.page * state.limit, state.total);
  setText('documentsPaginationSummary', `${start}-${end} / ${formatNumber(state.total)} CV`);

  const pages = buildPageList(totalPages);
  renderList('documentsPaginationButtons', [
    pageButton('prev', 'chevron_left', state.page <= 1),
    ...pages.map((page) => typeof page === 'number' ? pageNumberButton(page) : `<span class="px-2 text-sm font-black text-slate-400">...</span>`),
    pageButton('next', 'chevron_right', state.page >= totalPages)
  ].join(''));
}

function handleActions(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;
  if (action === 'prev' && state.page > 1) {
    state.page -= 1;
    loadDocuments();
    return;
  }
  if (action === 'next') {
    state.page += 1;
    loadDocuments();
    return;
  }
  if (action === 'page') {
    state.page = Number(target.dataset.page) || 1;
    loadDocuments();
    return;
  }

  const documentItem = state.documents.find((item) => String(item.id) === String(target.dataset.id));
  if (!documentItem) return;

  if (action === 'view') openDetailModal(documentItem);
  if (action === 'download') downloadDocument(documentItem);
  if (action === 'approve') updateDocumentStatus(documentItem, 'approve');
  if (action === 'reject') updateDocumentStatus(documentItem, 'reject');
  if (action === 'delete') deleteDocument(documentItem);
}

function openUploadModal() {
  document.getElementById('documentUploadForm')?.reset();
  document.getElementById('documentUploadModal')?.classList.remove('hidden');
  document.getElementById('documentUploadModal')?.classList.add('flex');
}

function closeUploadModal() {
  document.getElementById('documentUploadModal')?.classList.add('hidden');
  document.getElementById('documentUploadModal')?.classList.remove('flex');
}

async function uploadDocument(event) {
  event.preventDefault();
  const file = document.getElementById('uploadDocumentFile')?.files?.[0];
  if (!file) return;

  const formData = new FormData();
  formData.set('candidateName', document.getElementById('uploadCandidateName')?.value?.trim() || '');
  formData.set('email', document.getElementById('uploadCandidateEmail')?.value?.trim() || '');
  formData.set('jobApplied', document.getElementById('uploadJobApplied')?.value?.trim() || '');
  formData.set('status', document.getElementById('uploadDocumentStatus')?.value || 'pending');
  formData.set('file', file);

  try {
    await uploadFormData(`${endpoint}/upload`, formData);
    closeUploadModal();
    await loadDocuments();
  } catch (err) {
    console.error('Lỗi tải tài liệu lên:', err);
    alert(err.message || 'Không upload được CV.');
  }
}

async function openDetailModal(documentItem) {
  const modal = document.getElementById('documentDetailModal');
  const content = document.getElementById('documentDetailContent');
  if (!modal || !content) return;

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  content.innerHTML = loadingBlock('Loading chi tiết CV...');

  try {
    const payload = await api.get(`${endpoint}/${encodeURIComponent(documentItem.id)}`);
    renderDocumentDetail(normalizeDocumentDetail(payload, documentItem));
  } catch (err) {
    if (err?.status !== 404) console.error('Load document detail error:', err);
    renderDocumentDetail(normalizeDocumentDetail({}, documentItem));
  }
}

function renderDocumentDetail(detail) {
  const documentItem = detail.document;
  renderList('documentDetailContent', `
    <div class="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,1.2fr)]">
      <div class="space-y-4">
        <section class="rounded-lg bg-slate-50 p-4">
          <p class="text-xs font-black uppercase tracking-wider text-slate-400">Info ứng viên</p>
          <h3 class="mt-3 truncate text-2xl font-black text-slate-950">${escapeHtml(documentItem.candidateName || '--')}</h3>
          <p class="mt-1 text-sm font-semibold text-slate-500">${escapeHtml(documentItem.email || '--')}</p>
        </section>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          ${summaryBox('Job đã apply', documentItem.jobApplied || '--')}
          ${summaryBox('Status', statusText(documentItem.status))}
          ${summaryBox('File', documentItem.fileName)}
          ${summaryBox('File size', formatFileSize(documentItem.fileSize))}
          ${summaryBox('File type', documentItem.fileType.toUpperCase() || '--')}
          ${summaryBox('Uploaded Date', formatDate(documentItem.uploadedAt))}
        </div>

        <section class="rounded-lg border border-slate-200 p-4">
          <h3 class="text-sm font-black text-slate-950">Lịch sử apply</h3>
          <div class="mt-3 divide-y divide-slate-100">${renderHistory(detail.history)}</div>
        </section>
      </div>

      <section class="min-w-0 rounded-lg border border-slate-200 p-4">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-sm font-black text-slate-950">View trước CV</h3>
          <button class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50" type="button" data-action="download" data-id="${escapeHtml(documentItem.id)}">Download</button>
        </div>
        <div class="mt-4 h-[520px] overflow-hidden rounded-lg bg-slate-100">
          ${renderPreview(documentItem)}
        </div>
      </section>
    </div>
  `);
}

function normalizeDocumentDetail(payload = {}, fallbackDocument) {
  const documentItem = normalizeDocument(payload.document || payload.cv || payload.detail || fallbackDocument.raw || fallbackDocument);
  return {
    document: documentItem,
    history: normalizeArray(payload.history || payload.applyHistory || documentItem.applyHistory)
  };
}

function closeDetailModal() {
  document.getElementById('documentDetailModal')?.classList.add('hidden');
  document.getElementById('documentDetailModal')?.classList.remove('flex');
}

async function updateDocumentStatus(documentItem, action) {
  if (!confirm(`${action} CV của ${documentItem.candidateName || documentItem.email}?`)) return;
  try {
    await api.patch(`${endpoint}/${encodeURIComponent(documentItem.id)}/${action}`, {});
    await loadDocuments();
  } catch (err) {
    console.error('Update document status error:', err);
    alert(err.message || 'Không cập nhật được trạng thái CV.');
  }
}

async function deleteDocument(documentItem) {
  if (!confirm(`Xóa tệp ${documentItem.fileName}?`)) return;
  try {
    await api.delete(`${endpoint}/${encodeURIComponent(documentItem.id)}`);
    await loadDocuments();
  } catch (err) {
    console.error('Delete document error:', err);
    alert(err.message || 'Không xóa được file.');
  }
}

function downloadDocument(documentItem) {
  const url = documentItem.fileUrl || `${apiBaseUrl()}${endpoint}/${encodeURIComponent(documentItem.id)}/download`;
  window.open(url, '_blank', 'noopener');
}

function buildQuery() {
  const params = new URLSearchParams();
  if (state.search) params.set('search', state.search);
  if (state.status) params.set('status', state.status);
  if (state.fileType) params.set('fileType', state.fileType);
  if (state.job) params.set('job', state.job);
  params.set('page', String(state.page));
  params.set('limit', String(state.limit));
  return params.toString();
}

function statusBadge(status) {
  const normalized = normalizeStatus(status);
  const tones = {
    approved: 'bg-emerald-50 text-emerald-700',
    pending: 'bg-amber-50 text-amber-700',
    rejected: 'bg-red-50 text-red-700',
    spam: 'bg-rose-50 text-rose-700',
    reported: 'bg-orange-50 text-orange-700'
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

function renderPreview(documentItem) {
  if (!documentItem.fileUrl) {
    return '<div class="flex h-full items-center justify-center p-6 text-center text-sm font-bold text-slate-400">Backend chưa trả fileUrl nên chưa thể preview CV.</div>';
  }

  if (documentItem.fileType === 'pdf') {
    return `<iframe class="h-full w-full" src="${escapeHtml(documentItem.fileUrl)}" title="${escapeHtml(documentItem.fileName)}"></iframe>`;
  }

  return '<div class="flex h-full items-center justify-center p-6 text-center text-sm font-bold text-slate-400">Preview trực tiếp hiện ưu tiên PDF. DOC/DOCX có thể tải xuống để xem.</div>';
}

function renderHistory(items) {
  if (!items.length) return '<p class="py-6 text-center text-sm font-bold text-slate-400">Chưa có lịch sử apply.</p>';
  return items.slice(0, 8).map((item) => `
    <div class="py-3">
      <p class="text-sm font-black text-slate-950">${escapeHtml(item.title || item.action || item.status || 'Activity')}</p>
      <p class="mt-1 text-xs font-bold text-slate-400">${escapeHtml(item.createdAt || item.date || item.description || '--')}</p>
    </div>
  `).join('');
}

function summaryBox(label, value) {
  return `<div class="rounded-lg border border-slate-200 p-4"><p class="text-xs font-black uppercase tracking-wider text-slate-400">${escapeHtml(label)}</p><p class="mt-3 truncate text-sm font-black text-slate-950">${escapeHtml(value)}</p></div>`;
}

async function uploadFormData(url, formData) {
  const headers = new Headers();
  const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${apiBaseUrl()}${url}`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: formData
  });
  if (!res.ok) throw new Error(`Upload thất bại với trạng thái ${res.status}`);
  return res;
}

function apiBaseUrl() {
  return localStorage.getItem('apiBaseUrl') || '/api';
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function normalizeStatus(status = '') {
  const normalized = String(status).toLowerCase();
  if (['approved', 'approve', 'accepted'].includes(normalized)) return 'approved';
  if (['rejected', 'reject', 'denied'].includes(normalized)) return 'rejected';
  if (['spam'].includes(normalized)) return 'spam';
  if (['reported', 'report'].includes(normalized)) return 'reported';
  return 'pending';
}

function statusText(status = '') {
  const normalized = normalizeStatus(status);
  if (normalized === 'approved') return 'Approved';
  if (normalized === 'rejected') return 'Rejected';
  if (normalized === 'spam') return 'Spam';
  if (normalized === 'reported') return 'Bị báo cáo';
  return 'Pending';
}

function normalizeFileType(value = '') {
  const text = String(value).toLowerCase();
  if (text.includes('docx')) return 'docx';
  if (text.includes('doc')) return 'doc';
  if (text.includes('pdf')) return 'pdf';
  return text.split('.').pop() || '--';
}

function sumFileSizeText(items) {
  const total = items.reduce((sum, item) => sum + Number(item.fileSize || 0), 0);
  return total > 0 ? formatFileSize(total) : '--';
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

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US') : '--';
}

function loadingBlock(message) {
  return `<p class="rounded-lg bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">${escapeHtml(message)}</p>`;
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














