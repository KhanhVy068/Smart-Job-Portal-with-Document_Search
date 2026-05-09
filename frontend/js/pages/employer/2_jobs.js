import { api } from '../../api.js';
import { deleteLocalJob, mergeJobs } from './jobStore.js';

const PAGE_SIZE = 10;

let allJobs = [];
let currentFilter = 'all';
let currentPage = 1;

// Khoi tao trang
export async function init() {
  setLoadingState();
  bindStaticEvents();
  await loadJobs();
}

// Tai du lieu tin
async function loadJobs() {
  let payload = [];

  try {
    payload = await api.get('/jobs/my');
  } catch (err) {
    console.error('Load jobs error:', err);
  }

  allJobs = normalizeJobs(payload);
  currentPage = 1;

  renderStats(allJobs);
  renderCurrentView();
}

// Trang thai dang tai
function setLoadingState() {
  setText('totalJobs', '--');
  setText('activeJobs', '--');
  setText('totalCandidates', '--');
  setText('totalViews', '--');
  setText('countActive', '--');
  setText('countClosed', '--');
  setText('countDraft', '--');
  setText('pageInfo', '');
  setText('pageSummary', '');

  const jobList = document.getElementById('jobList');
  if (jobList) {
    jobList.innerHTML = `
      <tr>
        <td class="px-6 py-5 text-sm font-semibold text-slate-400" colspan="5">Dang tai tin tuyen dung...</td>
      </tr>
    `;
  }

  const pagination = document.getElementById('pagination');
  if (pagination) pagination.innerHTML = '';
}

// Su kien co dinh
function bindStaticEvents() {
  bindFilterButton('tabAll', 'all');
  bindFilterButton('tabActive', 'active');
  bindFilterButton('tabClosed', 'closed');
  bindFilterButton('tabDraft', 'draft');
}

// Gan su kien tab
function bindFilterButton(id, filter) {
  const button = document.getElementById(id);
  if (!button) return;

  button.onclick = () => {
    currentFilter = filter;
    currentPage = 1;
    renderCurrentView();
  };
}

// Render view hien tai
function renderCurrentView() {
  const filteredJobs = getFilteredJobs();
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);

  const pageJobs = paginate(filteredJobs, currentPage);

  renderFilterState();
  renderJobs(pageJobs);
  renderPageInfo(filteredJobs.length, pageJobs.length);
  renderPagination(totalPages);
}

// Render so lieu
function renderStats(jobs) {
  const totalJobs = jobs.length;
  const activeJobs = jobs.filter(job => job.status === 'active').length;
  const closedJobs = jobs.filter(job => job.status === 'closed').length;
  const draftJobs = jobs.filter(job => job.status === 'draft').length;
  const totalCandidates = jobs.reduce((sum, job) => sum + job.count, 0);
  const totalViews = jobs.reduce((sum, job) => sum + job.views, 0);

  setText('totalJobs', formatNumber(totalJobs));
  setText('activeJobs', formatNumber(activeJobs));
  setText('totalCandidates', formatNumber(totalCandidates));
  setText('totalViews', formatNumber(totalViews));
  setText('countActive', formatNumber(activeJobs));
  setText('countClosed', formatNumber(closedJobs));
  setText('countDraft', formatNumber(draftJobs));
}

// Render bang
function renderJobs(jobs) {
  const target = document.getElementById('jobList');
  if (!target) return;

  if (!jobs.length) {
    target.innerHTML = `
      <tr>
        <td class="px-6 py-8 text-center text-sm font-semibold text-slate-400" colspan="5">Khong co tin tuyen dung phu hop.</td>
      </tr>
    `;
    return;
  }

  target.innerHTML = jobs.map(job => `
    <tr class="hover:bg-blue-50/30 transition-colors group">
      <td class="px-6 py-5">
        <div class="flex flex-col">
          <button class="btnView text-left text-sm font-bold text-slate-900 group-hover:text-blue-600" data-id="${escapeHtml(job.id)}">
            ${escapeHtml(job.title)}
          </button>
          <span class="text-xs text-slate-500 font-medium">
            ${escapeHtml(job.type)} - ${escapeHtml(job.location)}
          </span>
        </div>
      </td>

      <td class="px-6 py-5 text-center">
        <span class="inline-flex px-3 py-1 text-[11px] font-bold rounded-full ${getStatusClass(job.status)}">
          ${escapeHtml(job.statusLabel)}
        </span>
      </td>

      <td class="px-6 py-5">
        <span class="text-sm text-slate-600">${escapeHtml(job.createdAt)}</span>
      </td>

      <td class="px-6 py-5 text-center">
        <span class="text-sm font-bold">${formatNumber(job.count)}</span>
      </td>

      <td class="px-6 py-5">
        <div class="flex justify-end items-center gap-2">
          <button class="btnView p-2 text-slate-400 hover:text-blue-600" data-id="${escapeHtml(job.id)}" title="Xem chi tiet JD">
            <span class="material-symbols-outlined">visibility</span>
          </button>
          <button class="btnEdit p-2 text-slate-400 hover:text-blue-600" data-id="${escapeHtml(job.id)}">
            <span class="material-symbols-outlined">edit</span>
          </button>
          <button class="btnDelete p-2 text-slate-400 hover:text-red-600" data-id="${escapeHtml(job.id)}">
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  bindRowEvents();
}

// Render thong tin trang
function renderPageInfo(totalFiltered, currentCount) {
  const start = totalFiltered === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const end = totalFiltered === 0 ? 0 : start + currentCount - 1;

  setText('pageInfo', `Hien thi ${formatNumber(start)} - ${formatNumber(end)}`);
  setText('pageSummary', `Tong so ${formatNumber(totalFiltered)} tin tuyen dung`);
}

// Render phan trang
function renderPagination(totalPages) {
  const target = document.getElementById('pagination');
  if (!target) return;

  const pageButtons = Array.from({ length: totalPages }, (_, index) => index + 1)
    .map(page => `
      <button class="pageBtn w-8 h-8 flex items-center justify-center text-sm ${page === currentPage ? 'font-bold bg-primary-container text-white' : 'font-medium text-slate-600 hover:bg-slate-50 border border-slate-200'} rounded-md" data-page="${page}">
        ${page}
      </button>
    `).join('');

  target.innerHTML = `
    <button class="pagePrev p-2 text-slate-400 hover:text-primary transition-colors disabled:opacity-30" ${currentPage === 1 ? 'disabled' : ''}>
      <span class="material-symbols-outlined">chevron_left</span>
    </button>
    ${pageButtons}
    <button class="pageNext p-2 text-slate-400 hover:text-primary transition-colors disabled:opacity-30" ${currentPage === totalPages ? 'disabled' : ''}>
      <span class="material-symbols-outlined">chevron_right</span>
    </button>
  `;

  target.querySelector('.pagePrev')?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage -= 1;
      renderCurrentView();
    }
  });

  target.querySelector('.pageNext')?.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage += 1;
      renderCurrentView();
    }
  });

  target.querySelectorAll('.pageBtn').forEach(button => {
    button.addEventListener('click', () => {
      currentPage = Number(button.dataset.page);
      renderCurrentView();
    });
  });
}

// Su kien tung dong
function bindRowEvents() {
  document.querySelectorAll('.btnView').forEach(btn => {
    btn.onclick = () => {
      sessionStorage.setItem('selectedJobId', btn.dataset.id);
      window.appRouter?.navigate('job-detail') ?? (window.location.hash = '#job-detail');
    };
  });

  document.querySelectorAll('.btnDelete').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Xoa tin nay?')) return;

      await deleteJob(btn.dataset.id);
      await loadJobs();
    };
  });

  document.querySelectorAll('.btnEdit').forEach(btn => {
    btn.onclick = () => {
      sessionStorage.setItem('editJobId', btn.dataset.id);
      window.appRouter?.navigate('post-job') ?? (window.location.hash = '#post-job');
    };
  });
}

// Xoa tin
async function deleteJob(id) {
  try {
    await api.delete(`/jobs/${id}`);
  } catch (err) {
    try {
      await api.post('/jobs/delete', { id });
    } catch (fallbackErr) {
      if (err.status && err.status !== 404 && err.status !== 405) throw fallbackErr;
    }
  }

  deleteLocalJob(id);
}

// Loc tin
function getFilteredJobs() {
  if (currentFilter === 'all') return allJobs;
  return allJobs.filter(job => job.status === currentFilter);
}

// Phan trang du lieu
function paginate(items, page) {
  const start = (page - 1) * PAGE_SIZE;
  return items.slice(start, start + PAGE_SIZE);
}

// Trang thai tab
function renderFilterState() {
  document.querySelectorAll('.tab-btn').forEach(button => {
    button.classList.remove('bg-blue-50', 'text-blue-600', 'font-bold');
  });

  const activeId = {
    all: 'tabAll',
    active: 'tabActive',
    closed: 'tabClosed',
    draft: 'tabDraft'
  }[currentFilter];

  const activeButton = document.getElementById(activeId);
  activeButton?.classList.add('bg-blue-50', 'text-blue-600', 'font-bold');
}

// Chuan hoa du lieu
function normalizeJobs(payload) {
  const rawJobs = mergeJobs(normalizeList(payload, ['items', 'jobs', 'data']));

  return rawJobs.map(job => {
    const normalizedStatus = normalizeJobStatus(job.status);

    return {
      id: job.id || job._id,
      title: job.title || job.name || 'Tin tuyen dung',
      type: job.type || job.employmentType || 'Chua cap nhat',
      location: job.location || job.city || 'Chua cap nhat',
      createdAt: formatDate(job.createdAt || job.publishedAt),
      status: normalizedStatus,
      statusLabel: getStatusLabel(normalizedStatus),
      count: Number(job.count ?? job.cvCount ?? job.applicationCount ?? job.applicationsCount ?? 0),
      views: Number(job.views ?? job.viewCount ?? 0)
    };
  });
}

// Chuan hoa danh sach
function normalizeList(payload, keys) {
  if (Array.isArray(payload)) return payload;

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }

  return [];
}

// Chuan hoa trang thai
function normalizeJobStatus(status = '') {
  const normalized = String(status).trim().toLowerCase();
  if (['active', 'open', 'published', 'dang tuyen', 'dang hien thi'].includes(normalized)) return 'active';
  if (['closed', 'inactive', 'da dong'].includes(normalized)) return 'closed';
  return 'draft';
}

// Mau trang thai
function getStatusClass(status) {
  if (status === 'active') return 'bg-green-100 text-green-700';
  if (status === 'closed') return 'bg-slate-100 text-slate-600';
  return 'bg-orange-100 text-orange-700';
}

// Nhan trang thai
function getStatusLabel(status) {
  if (status === 'active') return 'Dang tuyen';
  if (status === 'closed') return 'Da dong';
  return 'Nhap';
}

// Hien thi loi
function renderError(err) {
  const target = document.getElementById('jobList');
  if (target) {
    target.innerHTML = `
      <tr>
        <td class="px-6 py-8 text-center text-sm font-semibold text-red-600" colspan="5">
          Khong tai duoc danh sach tin: ${escapeHtml(err.message || 'Unknown error')}
        </td>
      </tr>
    `;
  }
}

// Gan text
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// Dinh dang so
function formatNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN');
}

// Dinh dang ngay
function formatDate(value) {
  if (!value) return 'Chua cap nhat';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('vi-VN');
}

// Escape HTML
function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
