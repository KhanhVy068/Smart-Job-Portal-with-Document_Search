import { api, getOptional } from '../../api.js';
import { findLocalJob, mergeJobs } from './jobStore.js';

const PAGE_SIZE = 8;
const DEMO_FALLBACK_KEY = 'useDemoCandidates';

// Contract API dự kiến khi backend được thêm vào:
// GET   /jobs/:jobId/applications  -> lấy ứng viên theo tin tuyển dụng
// GET   /applications?jobId=:jobId -> endpoint dự phòng nếu backend gom theo applications
// PATCH /applications/:id/status   -> cập nhật trạng thái ứng viên
const candidateEndpoints = {
  byJob: (jobId) => `/jobs/${encodeURIComponent(jobId)}/applications`,
  byQuery: (jobId) => `/applications?jobId=${encodeURIComponent(jobId)}`,
  allApplications: '/applications/my',
  allCandidates: '/candidates',
  updateApplicationStatus: (id) => `/applications/${encodeURIComponent(id)}/status`,
  updateCandidateStatus: (id) => `/candidates/${encodeURIComponent(id)}/status`
};

let currentJob = null;
let allCandidates = [];
let lastLoadError = null;
let currentPage = 1;
let currentStatus = 'all';
let currentSort = 'newest';
let currentKeyword = '';

// Khởi tạo trang danh sách ứng viên
export async function init() {
  setLoadingState();
  bindStaticEvents();
  await loadPageData();
}

// Gắn các sự kiện cố định của thanh công cụ
function bindStaticEvents() {
  document.getElementById('candidateSearchInput')?.addEventListener('input', (event) => {
    currentKeyword = event.target.value.trim().toLowerCase();
    currentPage = 1;
    renderCurrentView();
  });

  document.getElementById('candidateStatusFilter')?.addEventListener('change', (event) => {
    currentStatus = event.target.value;
    currentPage = 1;
    renderCurrentView();
  });

  document.getElementById('candidateSortSelect')?.addEventListener('change', (event) => {
    currentSort = event.target.value;
    currentPage = 1;
    renderCurrentView();
  });

  document.getElementById('btnRefreshCandidates')?.addEventListener('click', async () => {
    await loadPageData();
  });

  document.getElementById('btnExportCandidates')?.addEventListener('click', () => {
    exportCandidatesCsv(getVisibleCandidates());
  });
}

// Tải tin tuyển dụng đang chọn và danh sách ứng viên
async function loadPageData() {
  const selectedJobId = sessionStorage.getItem('selectedJobId');
  lastLoadError = null;
  currentJob = await findSelectedJob(selectedJobId);
  allCandidates = await loadCandidates(selectedJobId);
  currentPage = 1;

  renderJobHeader(currentJob, selectedJobId);
  renderStats(allCandidates);
  renderCurrentView();
}

// Trạng thái đang tải
function setLoadingState() {
  setText('statTotalCandidates', '--');
  setText('statProcessingCandidates', '--');
  setText('statIndexedCandidates', '--');
  setText('statRejectedCandidates', '--');
  setText('candidatePageSummary', 'Đang tải dữ liệu...');
  setText('candidatePageInfo', '');

  const tableBody = document.getElementById('candidateTableBody');
  if (tableBody) {
    tableBody.innerHTML = `
      <tr>
        <td class="px-6 py-8 text-sm font-semibold text-slate-400" colspan="6">Đang tải danh sách ứng viên...</td>
      </tr>
    `;
  }

  const pagination = document.getElementById('candidatePagination');
  if (pagination) pagination.innerHTML = '';
}

// Tìm tin tuyển dụng đang được chọn ở trang trước
async function findSelectedJob(id) {
  if (!id) return null;

  const localJob = findLocalJob(id);
  if (localJob) return localJob;

  try {
    const payload = await getOptional('/jobs/my', []);
    const jobs = mergeJobs(normalizeList(payload, ['items', 'jobs', 'data']));
    return jobs.find(job => String(job.id || job._id) === String(id)) || null;
  } catch (err) {
    console.error('Load selected job error:', err);
    return null;
  }
}

// Tải ứng viên từ API; nếu backend chưa sẵn sàng thì dùng dữ liệu mẫu
async function loadCandidates(jobId) {
  const endpoints = jobId
    ? [candidateEndpoints.byJob(jobId), candidateEndpoints.byQuery(jobId), candidateEndpoints.allApplications, candidateEndpoints.allCandidates]
    : [candidateEndpoints.allApplications, candidateEndpoints.allCandidates];

  for (const endpoint of endpoints) {
    try {
      const payload = await getOptional(endpoint, []);
      const candidates = normalizeCandidates(payload, jobId);
      if (candidates.length) {
        lastLoadError = null;
        return candidates;
      }
    } catch (err) {
      lastLoadError = err;
      console.error(`Load candidates error (${endpoint}):`, err);
    }
  }

  // Backend chưa được thêm vào nên giữ fallback demo để hoàn thiện UI.
  // Khi có backend, trả dữ liệu theo contract bên trên là trang tự dùng dữ liệu thật.
  return shouldUseDemoFallback() ? normalizeCandidates(getMockCandidates(jobId), jobId) : [];
}

// Render thông tin tin tuyển dụng ở đầu trang
function renderJobHeader(job, selectedJobId) {
  setText('candidateJobTitle', job?.title || job?.name || 'Danh sách ứng viên');
  setText('candidateJobLocation', job?.location || job?.city || 'Chưa cập nhật địa điểm');
  setText('candidateJobId', `ID: ${job?.id || job?._id || selectedJobId || '--'}`);
}

// Render số liệu tổng quan
function renderStats(candidates) {
  setText('statTotalCandidates', formatNumber(candidates.length));
  setText('statProcessingCandidates', formatNumber(candidates.filter(item => item.status === 'processing').length));
  setText('statIndexedCandidates', formatNumber(candidates.filter(item => item.status === 'indexed').length));
  setText('statRejectedCandidates', formatNumber(candidates.filter(item => item.status === 'rejected').length));
}

// Render view hiện tại sau khi lọc, sắp xếp và phân trang
function renderCurrentView() {
  const visibleCandidates = getVisibleCandidates();
  const totalPages = Math.max(1, Math.ceil(visibleCandidates.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);

  const pageCandidates = paginate(visibleCandidates, currentPage);

  renderCandidates(pageCandidates);
  renderPageInfo(visibleCandidates.length, pageCandidates.length);
  renderPagination(totalPages);
}

// Lấy danh sách ứng viên đang hiển thị theo bộ lọc
function getVisibleCandidates() {
  return sortCandidates(filterCandidates(allCandidates));
}

// Lọc ứng viên theo trạng thái và từ khóa
function filterCandidates(candidates) {
  return candidates.filter(candidate => {
    const matchStatus = currentStatus === 'all' || candidate.status === currentStatus;
    const searchableText = [
      candidate.name,
      candidate.email,
      candidate.phone,
      candidate.fileName,
      candidate.position,
      candidate.summary,
      candidate.skills.join(' ')
    ].join(' ').toLowerCase();

    return matchStatus && (!currentKeyword || searchableText.includes(currentKeyword));
  });
}

// Sắp xếp ứng viên
function sortCandidates(candidates) {
  return [...candidates].sort((first, second) => {
    if (currentSort === 'oldest') return first.appliedAtValue - second.appliedAtValue;
    if (currentSort === 'score-desc') return second.score - first.score;
    if (currentSort === 'score-asc') return first.score - second.score;
    return second.appliedAtValue - first.appliedAtValue;
  });
}

// Cắt dữ liệu theo trang
function paginate(items, page) {
  const start = (page - 1) * PAGE_SIZE;
  return items.slice(start, start + PAGE_SIZE);
}

// Render bảng ứng viên
function renderCandidates(candidates) {
  const target = document.getElementById('candidateTableBody');
  if (!target) return;

  if (!candidates.length) {
    const message = lastLoadError
      ? 'Chưa kết nối được backend ứng viên. Khi backend sẵn sàng, trang sẽ đọc dữ liệu từ API.'
      : 'Không tìm thấy ứng viên phù hợp với bộ lọc hiện tại.';

    target.innerHTML = `
      <tr>
        <td class="px-6 py-10 text-center text-sm font-semibold text-slate-400" colspan="6">
          ${escapeHtml(message)}
        </td>
      </tr>
    `;
    return;
  }

  target.innerHTML = candidates.map(candidate => `
    <tr class="group transition-colors hover:bg-blue-50/30">
      <td class="px-6 py-5">
        <div class="flex items-center gap-4">
          <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${getAvatarClass(candidate.status)}">
            <span class="material-symbols-outlined">description</span>
          </div>
          <div class="min-w-0">
            <button class="btnViewCandidate truncate text-left text-base font-black text-slate-950 group-hover:text-blue-600" data-id="${escapeHtml(candidate.id)}">
              ${escapeHtml(candidate.name)}
            </button>
            <p class="mt-1 truncate text-sm font-semibold text-slate-500">${escapeHtml(candidate.fileName)}</p>
            <p class="mt-1 text-xs font-medium text-slate-400">${escapeHtml(candidate.email)}${candidate.phone ? ` - ${escapeHtml(candidate.phone)}` : ''}</p>
          </div>
        </div>
      </td>

      <td class="px-6 py-5">
        <p class="text-sm font-bold text-slate-800">${escapeHtml(candidate.position)}</p>
        <div class="mt-2 flex max-w-sm flex-wrap gap-2">
          ${candidate.skills.slice(0, 3).map(skill => `
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">${escapeHtml(skill)}</span>
          `).join('')}
        </div>
      </td>

      <td class="px-6 py-5 text-center">
        <span class="inline-flex min-w-16 justify-center rounded-full px-3 py-1.5 text-xs font-black ${getScoreClass(candidate.score)}">
          ${formatNumber(candidate.score)}%
        </span>
      </td>

      <td class="px-6 py-5 text-center">
        <p class="text-sm font-bold text-slate-900">${escapeHtml(candidate.appliedDate)}</p>
        <p class="mt-1 text-xs font-semibold text-slate-400">${escapeHtml(candidate.appliedTime)}</p>
      </td>

      <td class="px-6 py-5 text-center">
        <span class="inline-flex rounded-full px-3 py-1.5 text-xs font-black ${getStatusClass(candidate.status)}">
          ${escapeHtml(candidate.statusLabel)}
        </span>
      </td>

      <td class="px-6 py-5">
        <div class="flex items-center justify-end gap-2">
          <button class="btnViewCandidate rounded-lg p-2 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600" data-id="${escapeHtml(candidate.id)}" title="Xem chi tiết CV">
            <span class="material-symbols-outlined">visibility</span>
          </button>
          <button class="btnSaveCandidate rounded-lg p-2 text-slate-400 transition-colors hover:bg-green-50 hover:text-green-600" data-id="${escapeHtml(candidate.id)}" title="Lưu ứng viên">
            <span class="material-symbols-outlined">bookmark</span>
          </button>
          <button class="btnRejectCandidate rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600" data-id="${escapeHtml(candidate.id)}" title="Loại ứng viên">
            <span class="material-symbols-outlined">person_remove</span>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  bindCandidateRowEvents();
}

// Gắn sự kiện cho từng dòng ứng viên
function bindCandidateRowEvents() {
  document.querySelectorAll('.btnViewCandidate').forEach(button => {
    button.onclick = () => {
      const candidate = allCandidates.find(item => String(item.id) === String(button.dataset.id));
      if (candidate) sessionStorage.setItem('selectedCandidate', JSON.stringify(candidate));
      window.appRouter?.navigate('cv-detail') ?? (window.location.hash = '#cv-detail');
    };
  });

  document.querySelectorAll('.btnSaveCandidate').forEach(button => {
    button.onclick = () => updateCandidateStatus(button.dataset.id, 'indexed');
  });

  document.querySelectorAll('.btnRejectCandidate').forEach(button => {
    button.onclick = () => updateCandidateStatus(button.dataset.id, 'rejected');
  });
}

// Cập nhật trạng thái tạm trên giao diện
async function updateCandidateStatus(id, nextStatus) {
  const selectedCandidate = allCandidates.find(candidate => String(candidate.id) === String(id));
  if (!selectedCandidate) return;

  await syncCandidateStatus(selectedCandidate, nextStatus);

  allCandidates = allCandidates.map(candidate => {
    if (String(candidate.id) !== String(id)) return candidate;
    return {
      ...candidate,
      status: nextStatus,
      statusLabel: getStatusLabel(nextStatus)
    };
  });

  renderStats(allCandidates);
  renderCurrentView();
}

// Đồng bộ trạng thái lên backend nếu endpoint đã sẵn sàng.
async function syncCandidateStatus(candidate, nextStatus) {
  const payload = {
    status: nextStatus,
    cvStatus: nextStatus,
    jobId: candidate.jobId || currentJob?.id || currentJob?._id || null
  };

  try {
    await api.patch(candidateEndpoints.updateApplicationStatus(candidate.id), payload);
    return;
  } catch (err) {
    if (err.status && ![404, 405].includes(err.status)) {
      console.error('Update application status error:', err);
    }
  }

  try {
    await api.patch(candidateEndpoints.updateCandidateStatus(candidate.id), payload);
  } catch (err) {
    // Backend chưa có endpoint thì vẫn cập nhật UI tạm để employer thao tác được khi demo.
    console.warn('Candidate status API is not ready, updated UI only:', err);
  }
}

// Render thông tin số dòng đang hiển thị
function renderPageInfo(totalFiltered, currentCount) {
  const start = totalFiltered === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const end = totalFiltered === 0 ? 0 : start + currentCount - 1;

  setText('candidatePageSummary', `Tìm thấy ${formatNumber(totalFiltered)} ứng viên phù hợp`);
  setText('candidatePageInfo', `Hiển thị ${formatNumber(start)} - ${formatNumber(end)} trong tổng số ${formatNumber(totalFiltered)} ứng viên`);
}

// Render phân trang
function renderPagination(totalPages) {
  const target = document.getElementById('candidatePagination');
  if (!target) return;

  const buttons = Array.from({ length: totalPages }, (_, index) => index + 1)
    .map(page => `
      <button class="pageBtn flex h-9 w-9 items-center justify-center rounded-lg text-sm ${page === currentPage ? 'bg-blue-600 font-black text-white' : 'border border-slate-200 font-bold text-slate-600 hover:bg-slate-50'}" data-page="${page}">
        ${page}
      </button>
    `).join('');

  target.innerHTML = `
    <button class="pagePrev flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40" ${currentPage === 1 ? 'disabled' : ''}>
      <span class="material-symbols-outlined text-lg">chevron_left</span>
    </button>
    ${buttons}
    <button class="pageNext flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40" ${currentPage === totalPages ? 'disabled' : ''}>
      <span class="material-symbols-outlined text-lg">chevron_right</span>
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

// Xuất danh sách đang lọc ra file CSV
function exportCandidatesCsv(candidates) {
  const rows = [
    ['Ho ten', 'Email', 'So dien thoai', 'Vi tri', 'Diem phu hop', 'Trang thai', 'Ngay ung tuyen'],
    ...candidates.map(candidate => [
      candidate.name,
      candidate.email,
      candidate.phone,
      candidate.position,
      `${candidate.score}%`,
      candidate.statusLabel,
      `${candidate.appliedDate} ${candidate.appliedTime}`
    ])
  ];

  const csvContent = rows
    .map(row => row.map(cell => `"${String(cell || '').replaceAll('"', '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'danh-sach-ung-vien.csv';
  link.click();
  URL.revokeObjectURL(url);
}

// Chuẩn hóa dữ liệu ứng viên về một format dùng chung cho UI
function normalizeCandidates(payload, selectedJobId) {
  return normalizeList(payload, ['items', 'candidates', 'applications', 'data']).map((item, index) => {
    const createdAt = item.createdAt || item.appliedAt || item.submittedAt || new Date().toISOString();
    const status = normalizeCandidateStatus(item.cvStatus || item.status);
    const score = Number(item.score ?? item.matchScore ?? item.fitScore ?? 70 + ((index * 7) % 26));

    return {
      id: item.id || item._id || `candidate-${index + 1}`,
      jobId: item.jobId || item.job?._id || item.job?.id || selectedJobId || '',
      name: item.candidateName || item.name || item.fullName || 'Ứng viên chưa đặt tên',
      email: item.email || item.candidateEmail || 'candidate@email.com',
      phone: item.phone || item.candidatePhone || '',
      fileName: item.fileName || item.cvFileName || item.resumeName || `${slugify(item.candidateName || item.name || 'ung-vien')}-CV.pdf`,
      position: item.position || item.currentPosition || item.jobTitle || 'Chưa cập nhật vị trí',
      summary: item.summary || item.note || '',
      skills: normalizeSkills(item.skills || item.skillNames || item.tags),
      score: Math.max(0, Math.min(100, score)),
      status,
      statusLabel: getStatusLabel(status),
      appliedAtValue: new Date(createdAt).getTime() || Date.now(),
      appliedDate: formatDate(createdAt),
      appliedTime: formatTime(createdAt)
    };
  });
}

// Mặc định bật demo fallback vì backend chưa được thêm vào project.
// Đặt localStorage.useDemoCandidates = 'false' để xem empty/error state thuần API.
function shouldUseDemoFallback() {
  return localStorage.getItem(DEMO_FALLBACK_KEY) !== 'false';
}

// Chuẩn hóa danh sách từ payload API
function normalizeList(payload, keys) {
  if (Array.isArray(payload)) return payload;

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }

  return [];
}

// Chuẩn hóa kỹ năng
function normalizeSkills(value) {
  if (Array.isArray(value) && value.length) return value.map(String);

  const text = String(value || '').trim();
  if (!text) return ['Chưa cập nhật'];

  return text.split(',').map(item => item.trim()).filter(Boolean);
}

// Chuẩn hóa trạng thái ứng viên
function normalizeCandidateStatus(status = '') {
  const normalized = String(status).trim().toLowerCase();
  if (['processed', 'indexed', 'saved', 'da luu', 'da luu/indexed', 'đã lưu/indexed'].includes(normalized)) return 'indexed';
  if (['rejected', 'denied', 'bi loai', 'bị loại'].includes(normalized)) return 'rejected';
  if (['interview', 'invited', 'moi phong van', 'mời phỏng vấn'].includes(normalized)) return 'interview';
  return 'processing';
}

// Nhãn trạng thái
function getStatusLabel(status) {
  if (status === 'indexed') return 'Đã lưu/Indexed';
  if (status === 'rejected') return 'Bị loại';
  if (status === 'interview') return 'Mời phỏng vấn';
  return 'Đang xử lý';
}

// Màu trạng thái
function getStatusClass(status) {
  if (status === 'indexed') return 'bg-green-100 text-green-700';
  if (status === 'rejected') return 'bg-red-100 text-red-700';
  if (status === 'interview') return 'bg-blue-100 text-blue-700';
  return 'bg-amber-100 text-amber-700';
}

// Màu icon file CV
function getAvatarClass(status) {
  if (status === 'indexed') return 'bg-green-50 text-green-600';
  if (status === 'rejected') return 'bg-red-50 text-red-600';
  if (status === 'interview') return 'bg-blue-50 text-blue-600';
  return 'bg-amber-50 text-amber-600';
}

// Màu điểm phù hợp
function getScoreClass(score) {
  if (score >= 85) return 'bg-green-100 text-green-700';
  if (score >= 70) return 'bg-blue-100 text-blue-700';
  return 'bg-orange-100 text-orange-700';
}

// Dữ liệu mẫu dùng khi backend chưa có endpoint ứng viên
function getMockCandidates(jobId) {
  return [
    {
      id: 'cv-001',
      jobId,
      candidateName: 'Nguyễn Minh Anh',
      email: 'minhanh.nguyen@email.com',
      phone: '090 234 5678',
      fileName: 'Nguyen-Minh-Anh-Senior-Designer.pdf',
      position: 'Senior UI/UX Designer',
      skills: ['Figma', 'Design System', 'User Research'],
      matchScore: 94,
      cvStatus: 'processing',
      createdAt: '2026-04-28T10:45:00+07:00'
    },
    {
      id: 'cv-002',
      jobId,
      candidateName: 'Trần Hoàng Nam',
      email: 'nam.tran@email.com',
      phone: '091 888 1204',
      fileName: 'Tran-Hoang-Nam-Product-Designer.pdf',
      position: 'Product Designer',
      skills: ['Prototype', 'UX Writing', 'Dashboard'],
      matchScore: 88,
      cvStatus: 'indexed',
      createdAt: '2026-04-27T15:20:00+07:00'
    },
    {
      id: 'cv-003',
      jobId,
      candidateName: 'Lê Thị Thu Hà',
      email: 'thuha.le@email.com',
      phone: '093 441 3322',
      fileName: 'Le-Thi-Thu-Ha-Portfolio.pdf',
      position: 'Junior Designer',
      skills: ['Illustrator', 'Wireframe', 'Mobile UI'],
      matchScore: 64,
      cvStatus: 'rejected',
      createdAt: '2026-04-26T09:12:00+07:00'
    },
    {
      id: 'cv-004',
      jobId,
      candidateName: 'Phạm Quang Huy',
      email: 'huy.pham@email.com',
      phone: '097 765 4321',
      fileName: 'Pham-Quang-Huy-Mobile-UI.pdf',
      position: 'Mobile UI Specialist',
      skills: ['iOS UI', 'Figma', 'Interaction'],
      matchScore: 79,
      cvStatus: 'interview',
      createdAt: '2026-04-25T16:45:00+07:00'
    },
    {
      id: 'cv-005',
      jobId,
      candidateName: 'Đặng Khánh Linh',
      email: 'linh.dang@email.com',
      phone: '098 300 2026',
      fileName: 'Dang-Khanh-Linh-UX-Researcher.pdf',
      position: 'UX Researcher',
      skills: ['Interview', 'Survey', 'Persona'],
      matchScore: 91,
      cvStatus: 'processing',
      createdAt: '2026-04-24T08:30:00+07:00'
    }
  ];
}

// Gắn text vào element
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// Định dạng số
function formatNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN');
}

// Định dạng ngày
function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa cập nhật';
  return date.toLocaleDateString('vi-VN');
}

// Định dạng giờ
function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

// Tạo tên file tạm từ tên ứng viên
function slugify(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'ung-vien';
}

// Escape HTML để tránh lỗi chèn nội dung vào bảng
function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
