import { api } from '../../api.js';

// API thật dự kiến:
// GET    /admin/jobs?search=&status=&company=&location=&page=&limit=
// POST   /admin/jobs
// PATCH  /admin/jobs/:id
// DELETE /admin/jobs/:id
// PATCH  /admin/jobs/:id/approve
// PATCH  /admin/jobs/:id/ban
// GET    /admin/jobs/:id
// POST   /admin/jobs/bulk-approve
// POST   /admin/jobs/bulk-delete
const endpoint = '/admin/jobs';

const state = {
  search: '',
  status: '',
  company: '',
  location: '',
  page: 1,
  limit: 10,
  total: 0,
  jobs: [],
  selectedIds: new Set(),
  searchTimer: null
};

export async function init() {
  bindEvents();
  renderLoading();
  await loadJobs();
}

function bindEvents() {
  document.getElementById('jobSearchInput')?.addEventListener('input', debounceFilter('search'));
  document.getElementById('jobCompanyFilter')?.addEventListener('input', debounceFilter('company'));
  document.getElementById('jobLocationFilter')?.addEventListener('input', debounceFilter('location'));

  document.getElementById('jobStatusFilter')?.addEventListener('change', (event) => {
    state.status = event.target.value;
    state.page = 1;
    loadJobs();
  });

  document.getElementById('jobsItemsPerPage')?.addEventListener('change', (event) => {
    state.limit = Number(event.target.value) || 10;
    state.page = 1;
    loadJobs();
  });

  document.getElementById('btnReloadJobs')?.addEventListener('click', () => loadJobs());
  document.getElementById('btnAddJob')?.addEventListener('click', openCreateModal);
  document.getElementById('jobForm')?.addEventListener('submit', saveJob);
  document.querySelectorAll('.closeJobModal').forEach((button) => button.addEventListener('click', closeJobModal));
  document.querySelectorAll('.closeJobDetailModal').forEach((button) => button.addEventListener('click', closeDetailModal));

  document.getElementById('selectAllJobs')?.addEventListener('change', (event) => {
    if (event.target.checked) state.jobs.forEach((job) => state.selectedIds.add(String(job.id)));
    else state.selectedIds.clear();
    renderJobsTable();
    renderBulkBar();
  });

  document.getElementById('btnBulkApproveJobs')?.addEventListener('click', () => bulkAction('approve'));
  document.getElementById('btnBulkDeleteJobs')?.addEventListener('click', () => bulkAction('delete'));
  document.getElementById('adminJobsPage')?.addEventListener('click', handleActions);
}

function debounceFilter(key) {
  return (event) => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      state[key] = event.target.value.trim();
      state.page = 1;
      loadJobs();
    }, 250);
  };
}

async function loadJobs() {
  setText('jobsPageSubtitle', 'Loading danh sách việc làm từ backend...');
  renderLoading();

  try {
    const payload = await api.get(`${endpoint}?${buildQuery()}`);
    const data = normalizeJobsResponse(payload);
    state.jobs = data.jobs;
    state.total = data.total;
    state.selectedIds.clear();
    renderJobsPage(data);
    setText('jobsPageSubtitle', 'Dữ liệu việc làm được tải theo tìm kiếm, bộ lọc và phân trang hiện tại.');
  } catch (err) {
    console.error('Admin jobs error:', err);
    state.jobs = [];
    state.total = 0;
    state.selectedIds.clear();
    renderJobsPage(normalizeJobsResponse({}));
    setText(
      'jobsPageSubtitle',
      err?.status === 404
        ? 'Backend chưa có endpoint /admin/jobs. Frontend đã sẵn sàng để nối dữ liệu thật.'
        : 'Không tải được danh sách việc làm từ backend.'
    );
  }
}

function renderLoading() {
  renderList('jobsTableBody', '<tr><td class="px-4 py-8 text-center text-sm font-bold text-slate-400" colspan="9">Loading danh sách việc làm...</td></tr>');
}

function normalizeJobsResponse(payload = {}) {
  const jobs = normalizeArray(payload.jobs || payload.items || payload.data).map(normalizeJob);
  const stats = payload.stats || payload.summary || {};

  return {
    jobs,
    total: Number(payload.total ?? payload.totalJobs ?? jobs.length) || 0,
    stats: {
      totalJobs: Number(stats.totalJobs ?? payload.totalJobs ?? payload.total ?? jobs.length) || 0,
      activeJobs: Number(stats.activeJobs ?? payload.activeJobs) || 0,
      pendingJobs: Number(stats.pendingJobs ?? payload.pendingJobs) || 0,
      reportedJobs: Number(stats.reportedJobs ?? payload.reportedJobs) || 0
    }
  };
}

function normalizeJob(job = {}) {
  const company = job.company || job.companyProfile || job.employer || {};
  return {
    id: String(job.id || job._id || job.jobId || ''),
    title: job.title || job.jobTitle || job.name || '',
    companyName: company.name || company.companyName || job.companyName || job.company || '',
    companyInfo: company,
    location: job.location || job.city || job.address || '',
    salary: job.salary || job.salaryRange || job.salaryText || '',
    status: normalizeStatus(job.status || job.state || (job.isBanned ? 'banned' : 'pending')),
    postedDate: job.postedDate || job.createdAt || job.created_at || job.publishedAt || '',
    applicationsCount: Number(job.applicationsCount ?? job.applicationCount ?? job.totalApplications ?? job.count ?? 0) || 0,
    description: job.description || job.jobDescription || '',
    requirements: job.requirements || job.requirement || '',
    raw: job
  };
}

function renderJobsPage(data) {
  renderStats(data.stats);
  renderJobsTable();
  renderPagination();
  renderBulkBar();
}

// Render analytics nhẹ ở đầu page.
function renderStats(stats) {
  setText('statTotalJobs', formatNumber(stats.totalJobs));
  setText('statActiveJobs', formatNumber(stats.activeJobs));
  setText('statPendingJobs', formatNumber(stats.pendingJobs));
  setText('statReportedJobs', formatNumber(stats.reportedJobs));
}

// Render bảng chính: title, company, location, salary, status, date, CV count, actions.
function renderJobsTable() {
  const selectAll = document.getElementById('selectAllJobs');
  if (selectAll) {
    selectAll.checked = state.jobs.length > 0 && state.jobs.every((job) => state.selectedIds.has(String(job.id)));
    selectAll.indeterminate = state.jobs.some((job) => state.selectedIds.has(String(job.id))) && !selectAll.checked;
  }

  if (!state.jobs.length) {
    renderList('jobsTableBody', '<tr><td class="px-4 py-8 text-center text-sm font-bold text-slate-400" colspan="9">Chưa có job phù hợp với bộ lọc hiện tại.</td></tr>');
    return;
  }

  renderList('jobsTableBody', state.jobs.map((job) => `
    <tr class="transition-colors hover:bg-slate-50">
      <td class="px-4 py-4">
        <input class="jobRowCheckbox h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" type="checkbox" data-id="${escapeHtml(job.id)}" ${state.selectedIds.has(String(job.id)) ? 'checked' : ''} aria-label="Chọn job ${escapeHtml(job.title)}">
      </td>
      <td class="px-4 py-4">
        <button class="max-w-64 truncate text-left text-sm font-black text-slate-950 hover:text-blue-600" type="button" data-action="view" data-id="${escapeHtml(job.id)}">${escapeHtml(job.title || '--')}</button>
      </td>
      <td class="px-4 py-4 text-sm font-semibold text-slate-600">${escapeHtml(job.companyName || '--')}</td>
      <td class="px-4 py-4 text-sm font-semibold text-slate-500">${escapeHtml(job.location || '--')}</td>
      <td class="px-4 py-4 text-sm font-black text-slate-900">${escapeHtml(job.salary || '--')}</td>
      <td class="px-4 py-4">${statusBadge(job.status)}</td>
      <td class="px-4 py-4 text-sm font-semibold text-slate-500">${escapeHtml(formatDate(job.postedDate))}</td>
      <td class="px-4 py-4 text-sm font-black text-slate-900">${formatNumber(job.applicationsCount)} CV</td>
      <td class="px-4 py-4">
        <div class="flex items-center justify-end gap-1">
          ${actionButton('view', job.id, 'visibility', 'View chi tiết')}
          ${actionButton('edit', job.id, 'edit', 'Sửa')}
          ${actionButton('approve', job.id, 'check_circle', 'Duyệt')}
          ${actionButton('ban', job.id, 'block', 'Reject / Ban')}
          ${actionButton('delete', job.id, 'delete', 'Xóa', 'text-red-600 hover:bg-red-50')}
        </div>
      </td>
    </tr>
  `).join(''));
}

function renderPagination() {
  const totalPages = Math.max(Math.ceil(state.total / state.limit), 1);
  const start = state.total === 0 ? 0 : (state.page - 1) * state.limit + 1;
  const end = Math.min(state.page * state.limit, state.total);
  setText('jobsPaginationSummary', `${start}-${end} / ${formatNumber(state.total)} jobs`);

  const pages = buildPageList(totalPages);
  renderList('jobsPaginationButtons', [
    pageButton('prev', 'chevron_left', state.page <= 1),
    ...pages.map((page) => typeof page === 'number' ? pageNumberButton(page) : `<span class="px-2 text-sm font-black text-slate-400">...</span>`),
    pageButton('next', 'chevron_right', state.page >= totalPages)
  ].join(''));
}

function renderBulkBar() {
  const count = state.selectedIds.size;
  const bar = document.getElementById('bulkJobsBar');
  setText('selectedJobsCount', String(count));
  bar?.classList.toggle('hidden', count === 0);
  bar?.classList.toggle('flex', count > 0);
}

function handleActions(event) {
  const checkbox = event.target.closest('.jobRowCheckbox');
  if (checkbox) {
    const id = String(checkbox.dataset.id);
    if (checkbox.checked) state.selectedIds.add(id);
    else state.selectedIds.delete(id);
    renderJobsTable();
    renderBulkBar();
    return;
  }

  const target = event.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;
  if (action === 'prev' && state.page > 1) {
    state.page -= 1;
    loadJobs();
    return;
  }
  if (action === 'next') {
    state.page += 1;
    loadJobs();
    return;
  }
  if (action === 'page') {
    state.page = Number(target.dataset.page) || 1;
    loadJobs();
    return;
  }

  const job = state.jobs.find((item) => String(item.id) === String(target.dataset.id));
  if (!job) return;

  if (action === 'view') openDetailModal(job);
  if (action === 'edit') openEditModal(job);
  if (action === 'approve') updateJobStatus(job, 'approve');
  if (action === 'ban') updateJobStatus(job, 'ban');
  if (action === 'delete') deleteJob(job);
}

function openCreateModal() {
  setText('jobFormTitle', 'Add Job');
  document.getElementById('jobForm')?.reset();
  setValue('jobIdInput', '');
  document.getElementById('jobFormModal')?.classList.remove('hidden');
  document.getElementById('jobFormModal')?.classList.add('flex');
}

function openEditModal(job) {
  setText('jobFormTitle', 'Edit Job');
  setValue('jobIdInput', job.id);
  setValue('jobTitleInput', job.title);
  setValue('jobCompanyInput', job.companyName);
  setValue('jobLocationInput', job.location);
  setValue('jobSalaryInput', job.salary);
  setValue('jobStatusInput', job.status);
  setValue('jobPostedDateInput', toDateInput(job.postedDate));
  setValue('jobDescriptionInput', job.description);
  setValue('jobRequirementsInput', job.requirements);
  document.getElementById('jobFormModal')?.classList.remove('hidden');
  document.getElementById('jobFormModal')?.classList.add('flex');
}

function closeJobModal() {
  document.getElementById('jobFormModal')?.classList.add('hidden');
  document.getElementById('jobFormModal')?.classList.remove('flex');
}

async function saveJob(event) {
  event.preventDefault();
  const id = document.getElementById('jobIdInput')?.value;
  const payload = {
    title: document.getElementById('jobTitleInput')?.value?.trim(),
    companyName: document.getElementById('jobCompanyInput')?.value?.trim(),
    location: document.getElementById('jobLocationInput')?.value?.trim(),
    salary: document.getElementById('jobSalaryInput')?.value?.trim(),
    status: document.getElementById('jobStatusInput')?.value,
    postedDate: document.getElementById('jobPostedDateInput')?.value,
    description: document.getElementById('jobDescriptionInput')?.value?.trim(),
    requirements: document.getElementById('jobRequirementsInput')?.value?.trim()
  };

  try {
    if (id) await api.patch(`${endpoint}/${encodeURIComponent(id)}`, payload);
    else await api.post(endpoint, payload);
    closeJobModal();
    await loadJobs();
  } catch (err) {
    console.error('Save job error:', err);
    alert(err.message || 'Không lưu được job.');
  }
}

async function openDetailModal(job) {
  const modal = document.getElementById('jobDetailModal');
  const content = document.getElementById('jobDetailContent');
  if (!modal || !content) return;

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  content.innerHTML = loadingBlock('Loading chi tiết việc làm...');

  try {
    const payload = await api.get(`${endpoint}/${encodeURIComponent(job.id)}`);
    renderJobDetail(normalizeJobDetail(payload, job));
  } catch (err) {
    if (err?.status !== 404) console.error('Load job detail error:', err);
    renderJobDetail(normalizeJobDetail({}, job));
  }
}

function renderJobDetail(detail) {
  const job = detail.job;
  renderList('jobDetailContent', `
    <div class="space-y-5">
      <div class="rounded-lg bg-slate-50 p-4">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div class="min-w-0">
            <h3 class="truncate text-2xl font-black text-slate-950">${escapeHtml(job.title || '--')}</h3>
            <p class="mt-2 text-sm font-bold text-slate-500">${escapeHtml(job.companyName || '--')} · ${escapeHtml(job.location || '--')}</p>
          </div>
          ${statusBadge(job.status)}
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
        ${summaryBox('Salary', job.salary || '--')}
        ${summaryBox('Posted Date', formatDate(job.postedDate))}
        ${summaryBox('Profile ứng tuyển', `${formatNumber(job.applicationsCount)} CV`)}
        ${summaryBox('Company', job.companyName || '--')}
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        ${textSection('Description công việc', job.description)}
        ${textSection('Yêu cầu', job.requirements)}
      </div>

      <section class="rounded-lg border border-slate-200 p-4">
        <h3 class="text-sm font-black text-slate-950">Info công ty</h3>
        <p class="mt-3 text-sm font-semibold leading-6 text-slate-500">${escapeHtml(companyInfoText(job.companyInfo))}</p>
      </section>

      <section class="rounded-lg border border-slate-200 p-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-black text-slate-950">Danh sách CV hồ sơ ứng tuyển</h3>
          <span class="text-sm font-black text-slate-500">${formatNumber(detail.applications.length)} profile</span>
        </div>
        <div class="mt-3 divide-y divide-slate-100">
          ${renderApplications(detail.applications)}
        </div>
      </section>
    </div>
  `);
}

function normalizeJobDetail(payload = {}, fallbackJob) {
  const job = normalizeJob(payload.job || payload.detail || fallbackJob.raw || fallbackJob);
  return {
    job,
    applications: normalizeArray(payload.applications || payload.cvs || payload.documents)
  };
}

function closeDetailModal() {
  document.getElementById('jobDetailModal')?.classList.add('hidden');
  document.getElementById('jobDetailModal')?.classList.remove('flex');
}

async function updateJobStatus(job, action) {
  const label = action === 'approve' ? 'approve' : 'ban';
  if (!confirm(`${label} job "${job.title}"?`)) return;
  try {
    await api.patch(`${endpoint}/${encodeURIComponent(job.id)}/${action}`, {});
    await loadJobs();
  } catch (err) {
    console.error('Update job status error:', err);
    alert(err.message || 'Không cập nhật được trạng thái job.');
  }
}

async function deleteJob(job) {
  if (!confirm(`Delete job "${job.title}"?`)) return;
  try {
    await api.delete(`${endpoint}/${encodeURIComponent(job.id)}`);
    await loadJobs();
  } catch (err) {
    console.error('Delete job error:', err);
    alert(err.message || 'Không xóa được job.');
  }
}

async function bulkAction(action) {
  const ids = Array.from(state.selectedIds);
  if (!ids.length) return;
  if (!confirm(`${action} ${ids.length} job đã chọn?`)) return;

  try {
    const url = action === 'delete' ? `${endpoint}/bulk-delete` : `${endpoint}/bulk-approve`;
    await api.post(url, { ids });
    await loadJobs();
  } catch (err) {
    console.error('Bulk jobs error:', err);
    alert(err.message || 'Không thực hiện được bulk action.');
  }
}

function buildQuery() {
  const params = new URLSearchParams();
  if (state.search) params.set('search', state.search);
  if (state.status) params.set('status', state.status);
  if (state.company) params.set('company', state.company);
  if (state.location) params.set('location', state.location);
  params.set('page', String(state.page));
  params.set('limit', String(state.limit));
  return params.toString();
}

function statusBadge(status) {
  const normalized = normalizeStatus(status);
  const tones = {
    active: 'bg-emerald-50 text-emerald-700',
    pending: 'bg-amber-50 text-amber-700',
    banned: 'bg-red-50 text-red-700',
    expired: 'bg-slate-100 text-slate-700'
  };
  return `<span class="rounded-full ${tones[normalized]} px-3 py-1 text-xs font-black">${escapeHtml(statusLabel(normalized))}</span>`;
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

function summaryBox(label, value) {
  return `<div class="rounded-lg border border-slate-200 p-4"><p class="text-xs font-black uppercase tracking-wider text-slate-400">${escapeHtml(label)}</p><p class="mt-3 text-sm font-black text-slate-950">${escapeHtml(value)}</p></div>`;
}

function textSection(title, value) {
  return `<section class="rounded-lg border border-slate-200 p-4"><h3 class="text-sm font-black text-slate-950">${escapeHtml(title)}</h3><p class="mt-3 whitespace-pre-line text-sm font-semibold leading-6 text-slate-500">${escapeHtml(value || 'Chưa có dữ liệu.')}</p></section>`;
}

function renderApplications(items) {
  if (!items.length) return '<p class="py-6 text-center text-sm font-bold text-slate-400">Chưa có CV hồ sơ ứng tuyển.</p>';
  return items.slice(0, 10).map((item) => `
    <div class="flex items-center justify-between gap-3 py-3">
      <div class="min-w-0">
        <p class="truncate text-sm font-black text-slate-950">${escapeHtml(item.candidateName || item.name || item.fileName || 'CV')}</p>
        <p class="mt-1 truncate text-xs font-bold text-slate-400">${escapeHtml(item.email || item.createdAt || '--')}</p>
      </div>
      <span class="rounded bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">${escapeHtml(item.status || item.cvStatus || 'submitted')}</span>
    </div>
  `).join('');
}

function companyInfoText(company = {}) {
  return company.description || company.industry || company.website || company.email || 'Chưa có info công ty từ backend.';
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function normalizeStatus(status = '') {
  const normalized = String(status).toLowerCase();
  if (['active', 'open', 'published', 'approved'].includes(normalized)) return 'active';
  if (['banned', 'ban', 'rejected', 'blocked'].includes(normalized)) return 'banned';
  if (['expired', 'closed', 'ended'].includes(normalized)) return 'expired';
  return 'pending';
}

function statusLabel(status) {
  if (status === 'active') return 'Active';
  if (status === 'banned') return 'Banned';
  if (status === 'expired') return 'Hết hạn';
  return 'Pending';
}

function toDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
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














