import { api } from '../../api.js';

const PAGE_SIZE = 8;

// Contract API dự kiến khi backend nối vào:
// GET  /candidates/search?q=&location=&experience=&skills=&sort=&page=&limit=
//      -> trả về { items, total, page, totalPages } hoặc mảng ứng viên.
// POST /candidates/save { id } -> lưu CV/ứng viên vào danh sách quan tâm.
const endpoints = {
  search: '/candidates/search',
  save: '/candidates/save'
};

let currentPage = 1;
let currentQuery = '';
let currentLocation = '';
let currentExperience = '';
let currentSort = 'relevance';
let isLoading = false;

// Khởi tạo trang tìm kiếm CV, chỉ lấy dữ liệu từ API backend.
export function init() {
  bindEvents();
  renderInitialState();
}

// Gắn sự kiện cho form tìm kiếm và bộ lọc.
function bindEvents() {
  document.getElementById('btnSearch')?.addEventListener('click', () => {
    readFiltersFromForm();
    currentPage = 1;
    loadCandidates();
  });

  document.getElementById('btnRefreshSearch')?.addEventListener('click', () => {
    loadCandidates();
  });

  document.getElementById('btnResetSearch')?.addEventListener('click', () => {
    resetFilters();
    renderInitialState();
  });

  document.getElementById('sortSelect')?.addEventListener('change', (event) => {
    currentSort = event.target.value;
    currentPage = 1;
    loadCandidates();
  });

  document.querySelectorAll('.skillFilter').forEach(input => {
    input.addEventListener('change', () => {
      currentPage = 1;
      loadCandidates();
    });
  });

  document.querySelectorAll('.suggestionBtn').forEach(button => {
    button.addEventListener('click', () => {
      const input = document.getElementById('searchInput');
      if (input) input.value = button.dataset.keyword || '';
      readFiltersFromForm();
      currentPage = 1;
      loadCandidates();
    });
  });

  ['searchInput', 'locationInput'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      readFiltersFromForm();
      currentPage = 1;
      loadCandidates();
    });
  });
}

// Đọc giá trị người dùng nhập trước khi gọi API.
function readFiltersFromForm() {
  currentQuery = document.getElementById('searchInput')?.value.trim() || '';
  currentLocation = document.getElementById('locationInput')?.value.trim() || '';
  currentExperience = document.getElementById('experienceFilter')?.value || '';
  currentSort = document.getElementById('sortSelect')?.value || 'relevance';
}

// Reset bộ lọc về trạng thái ban đầu, không tự tạo dữ liệu mẫu.
function resetFilters() {
  currentPage = 1;
  currentQuery = '';
  currentLocation = '';
  currentExperience = '';
  currentSort = 'relevance';

  setInputValue('searchInput', '');
  setInputValue('locationInput', '');
  setInputValue('experienceFilter', '');
  setInputValue('sortSelect', 'relevance');
  document.querySelectorAll('.skillFilter').forEach(input => {
    input.checked = false;
  });
}

// Gọi backend tìm kiếm CV. Nếu backend chưa có, hiển thị trạng thái lỗi/rỗng thay vì dữ liệu giả.
async function loadCandidates() {
  if (isLoading) return;

  readFiltersFromForm();
  isLoading = true;
  renderLoadingState();

  try {
    const payload = await api.get(buildSearchUrl());
    const result = normalizeSearchResult(payload);

    renderSummary(result.total);
    renderCandidates(result.items);
    renderPagination(result.page, result.totalPages);
  } catch (err) {
    console.error('Search CV error:', err);
    renderErrorState(err);
  } finally {
    isLoading = false;
  }
}

// Tạo query string đúng chuẩn để backend parse được.
function buildSearchUrl() {
  const params = new URLSearchParams();

  if (currentQuery) params.set('q', currentQuery);
  if (currentLocation) params.set('location', currentLocation);
  if (currentExperience) params.set('experience', currentExperience);
  if (currentSort) params.set('sort', currentSort);

  const selectedSkills = getSelectedSkills();
  if (selectedSkills.length) params.set('skills', selectedSkills.join(','));

  params.set('page', String(currentPage));
  params.set('limit', String(PAGE_SIZE));

  return `${endpoints.search}?${params.toString()}`;
}

// Lấy danh sách kỹ năng đang được chọn trong bộ lọc nhanh.
function getSelectedSkills() {
  return Array.from(document.querySelectorAll('.skillFilter:checked'))
    .map(input => input.value)
    .filter(Boolean);
}

// Chuẩn hóa nhiều kiểu payload để frontend không phụ thuộc cứng vào tên field backend.
function normalizeSearchResult(payload) {
  const items = normalizeList(payload, ['items', 'candidates', 'results', 'data']).map(normalizeCandidate);
  const total = Number(payload?.total ?? payload?.totalItems ?? payload?.count ?? items.length);
  const page = Number(payload?.page ?? payload?.currentPage ?? currentPage);
  const totalPages = Math.max(1, Number(payload?.totalPages ?? Math.ceil(total / PAGE_SIZE) ?? 1));

  return { items, total, page, totalPages };
}

// Chuẩn hóa từng CV/ứng viên về format UI dùng chung.
function normalizeCandidate(item, index) {
  const score = Number(item.score ?? item.matchScore ?? item.fitScore ?? 0);
  const experience = item.experienceYears ?? item.yearsOfExperience ?? item.experience ?? '';

  return {
    id: item.id || item._id || item.candidateId || `api-candidate-${index + 1}`,
    name: item.name || item.fullName || item.candidateName || 'Ứng viên chưa cập nhật tên',
    title: item.title || item.position || item.currentPosition || item.jobTitle || 'Chưa cập nhật vị trí',
    location: item.location || item.city || item.address || 'Chưa cập nhật địa điểm',
    experience,
    skills: normalizeSkills(item.skills || item.skillNames || item.tags),
    summary: item.summary || item.description || item.cvSummary || '',
    score: Math.max(0, Math.min(100, score)),
    lastActive: item.lastActive || item.updatedAt || item.createdAt || '',
    fileName: item.fileName || item.cvFileName || item.resumeName || 'CV chưa cập nhật tên file',
    email: item.email || item.candidateEmail || '',
    phone: item.phone || item.candidatePhone || ''
  };
}

// Chuẩn hóa danh sách từ payload API.
function normalizeList(payload, keys) {
  if (Array.isArray(payload)) return payload;

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }

  return [];
}

// Chuẩn hóa kỹ năng để render tag.
function normalizeSkills(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  const text = String(value || '').trim();
  if (!text) return [];
  return text.split(',').map(item => item.trim()).filter(Boolean);
}

// Trạng thái ban đầu khi chưa tìm kiếm.
function renderInitialState() {
  setText('resultSummary', 'Nhập điều kiện để tìm CV');
  setText('resultHint', 'Dữ liệu sẽ được tải từ backend, không dùng dữ liệu mẫu trên frontend.');
  setHtml('candidateList', `
    <div class="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <span class="material-symbols-outlined text-4xl text-slate-300">description</span>
      <h2 class="mt-3 text-lg font-black text-slate-800">Chưa có kết quả tìm kiếm</h2>
      <p class="mt-2 text-sm font-semibold text-slate-500">Nhấn “Tìm kiếm” để gọi API tìm kiếm CV.</p>
    </div>
  `);
  setHtml('pagination', '');
}

// Trạng thái đang tải trong lúc chờ API.
function renderLoadingState() {
  setText('resultSummary', 'Đang tìm kiếm CV...');
  setText('resultHint', 'Vui lòng chờ phản hồi từ backend.');
  setHtml('candidateList', `
    <div class="rounded-xl border border-slate-200 bg-white p-10 text-center">
      <span class="material-symbols-outlined animate-spin text-4xl text-blue-500">progress_activity</span>
      <h2 class="mt-3 text-lg font-black text-slate-800">Đang tải dữ liệu</h2>
      <p class="mt-2 text-sm font-semibold text-slate-500">Frontend đang gọi API tìm kiếm CV.</p>
    </div>
  `);
  setHtml('pagination', '');
}

// Hiển thị tổng số kết quả trả về từ backend.
function renderSummary(total) {
  setText('resultSummary', `${formatNumber(total)} CV phù hợp`);
  setText('resultHint', 'Kết quả bên dưới được render từ phản hồi API.');
}

// Render danh sách CV tìm thấy.
function renderCandidates(candidates) {
  if (!candidates.length) {
    setHtml('candidateList', `
      <div class="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <span class="material-symbols-outlined text-4xl text-slate-300">search_off</span>
        <h2 class="mt-3 text-lg font-black text-slate-800">Không tìm thấy CV phù hợp</h2>
        <p class="mt-2 text-sm font-semibold text-slate-500">Thử đổi từ khóa, địa điểm hoặc kỹ năng lọc.</p>
      </div>
    `);
    return;
  }

  setHtml('candidateList', candidates.map(candidate => `
    <article class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md">
      <div class="flex flex-col gap-5 md:flex-row">
        <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <span class="material-symbols-outlined">description</span>
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div class="min-w-0">
              <h3 class="truncate text-lg font-black text-slate-950">${escapeHtml(candidate.name)}</h3>
              <p class="mt-1 text-sm font-bold text-slate-600">${escapeHtml(candidate.title)}${formatExperience(candidate.experience)}</p>
            </div>
            <span class="inline-flex w-fit items-center gap-1 rounded-full ${getScoreClass(candidate.score)} px-3 py-1.5 text-xs font-black">
              <span class="material-symbols-outlined text-sm">stars</span>
              ${formatNumber(candidate.score)}%
            </span>
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <span class="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-black uppercase text-slate-600">${escapeHtml(candidate.location)}</span>
            ${candidate.skills.slice(0, 5).map(skill => `
              <span class="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">${escapeHtml(skill)}</span>
            `).join('')}
          </div>

          <p class="mt-4 line-clamp-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-600">
            ${escapeHtml(candidate.summary || candidate.fileName)}
          </p>

          <div class="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 lg:flex-row lg:items-center lg:justify-between">
            <div class="flex flex-wrap gap-3 text-xs font-semibold text-slate-400">
              <span class="inline-flex items-center gap-1">
                <span class="material-symbols-outlined text-sm">schedule</span>
                ${escapeHtml(formatLastActive(candidate.lastActive))}
              </span>
              <span class="inline-flex items-center gap-1">
                <span class="material-symbols-outlined text-sm">draft</span>
                ${escapeHtml(candidate.fileName)}
              </span>
            </div>

            <div class="flex flex-wrap gap-2">
              <button class="btnViewCandidate rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50" data-id="${escapeHtml(candidate.id)}">
                Xem chi tiết
              </button>
              <button class="btnSaveCandidate rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700" data-id="${escapeHtml(candidate.id)}">
                Lưu CV
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  `).join(''));

  bindCandidateActions(candidates);
}

// Gắn sự kiện xem chi tiết và lưu CV.
function bindCandidateActions(candidates) {
  document.querySelectorAll('.btnViewCandidate').forEach(button => {
    button.addEventListener('click', () => {
      const candidate = candidates.find(item => String(item.id) === String(button.dataset.id));
      if (candidate) sessionStorage.setItem('selectedCandidate', JSON.stringify(candidate));
      window.appRouter?.navigate('cv-detail') ?? (window.location.hash = '#cv-detail');
    });
  });

  document.querySelectorAll('.btnSaveCandidate').forEach(button => {
    button.addEventListener('click', async () => {
      await saveCandidate(button.dataset.id, button);
    });
  });
}

// Lưu CV qua backend, không lưu cứng trên frontend.
async function saveCandidate(id, button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Đang lưu...';

  try {
    await api.post(endpoints.save, { id });
    button.textContent = 'Đã lưu';
  } catch (err) {
    console.error('Save candidate error:', err);
    button.disabled = false;
    button.textContent = originalText;
    alert('Chưa lưu được CV. Vui lòng kiểm tra backend.');
  }
}

// Render phân trang dựa trên metadata backend.
function renderPagination(page, totalPages) {
  if (totalPages <= 1) {
    setHtml('pagination', '');
    return;
  }

  const buttons = Array.from({ length: totalPages }, (_, index) => index + 1)
    .map(item => `
      <button class="pageBtn flex h-10 w-10 items-center justify-center rounded-lg text-sm ${item === page ? 'bg-blue-600 font-black text-white' : 'border border-slate-200 font-bold text-slate-600 hover:bg-slate-50'}" data-page="${item}">
        ${item}
      </button>
    `).join('');

  setHtml('pagination', `
    <button class="pagePrev flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40" ${page <= 1 ? 'disabled' : ''}>
      <span class="material-symbols-outlined text-lg">chevron_left</span>
    </button>
    ${buttons}
    <button class="pageNext flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40" ${page >= totalPages ? 'disabled' : ''}>
      <span class="material-symbols-outlined text-lg">chevron_right</span>
    </button>
  `);

  document.querySelector('.pagePrev')?.addEventListener('click', () => {
    if (currentPage <= 1) return;
    currentPage -= 1;
    loadCandidates();
  });

  document.querySelector('.pageNext')?.addEventListener('click', () => {
    if (currentPage >= totalPages) return;
    currentPage += 1;
    loadCandidates();
  });

  document.querySelectorAll('.pageBtn').forEach(button => {
    button.addEventListener('click', () => {
      currentPage = Number(button.dataset.page);
      loadCandidates();
    });
  });
}

// Hiển thị lỗi khi backend chưa sẵn sàng hoặc API trả lỗi.
function renderErrorState(err) {
  const message = err?.status === 404
    ? 'Backend chưa có endpoint /candidates/search.'
    : 'Không thể tải kết quả tìm kiếm CV từ backend.';

  setText('resultSummary', 'Chưa tải được dữ liệu');
  setText('resultHint', 'Frontend không dùng dữ liệu giả, nên cần backend trả dữ liệu thật.');
  setHtml('candidateList', `
    <div class="rounded-xl border border-red-200 bg-red-50 p-10 text-center text-red-700">
      <span class="material-symbols-outlined text-4xl">error</span>
      <h2 class="mt-3 text-lg font-black">${escapeHtml(message)}</h2>
      <p class="mt-2 text-sm font-semibold">${escapeHtml(err?.message || 'Vui lòng kiểm tra API và thử lại.')}</p>
    </div>
  `);
  setHtml('pagination', '');
}

function formatExperience(value) {
  if (value === '' || value === null || value === undefined) return '';
  return ` (${escapeHtml(value)} năm kinh nghiệm)`;
}

function formatLastActive(value) {
  if (!value) return 'Chưa cập nhật hoạt động';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `Cập nhật ${date.toLocaleDateString('vi-VN')}`;
}

function getScoreClass(score) {
  if (score >= 85) return 'bg-green-100 text-green-700';
  if (score >= 70) return 'bg-blue-100 text-blue-700';
  if (score > 0) return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-500';
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setHtml(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = value;
}

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN');
}

// Escape HTML để tránh chèn trực tiếp dữ liệu backend vào DOM.
function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
