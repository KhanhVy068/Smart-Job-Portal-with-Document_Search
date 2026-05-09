import { api } from '../../api.js';

const PAGE_SIZE = 8;

// Contract API dự kiến khi backend nối vào:
// GET    /candidates/saved?q=&sort=&page=&limit=
//        -> trả về { items, total, page, totalPages } hoặc mảng ứng viên đã lưu.
// DELETE /candidates/saved/:id
//        -> bỏ lưu một ứng viên khỏi danh sách quan tâm.
const endpoints = {
  list: '/candidates/saved',
  remove: (id) => `/candidates/saved/${encodeURIComponent(id)}`
};

let savedCandidates = [];
let currentPage = 1;
let currentQuery = '';
let currentSort = 'saved-desc';
let totalItems = 0;
let totalPages = 1;
let isLoading = false;

// Khởi tạo trang ứng viên đã lưu, chỉ dùng dữ liệu thật từ backend.
export function init() {
  resetState();
  bindEvents();
  loadSavedCandidates();
}

function resetState() {
  savedCandidates = [];
  currentPage = 1;
  currentQuery = '';
  currentSort = 'saved-desc';
  totalItems = 0;
  totalPages = 1;
  isLoading = false;
}

// Gắn sự kiện cho tìm kiếm, sắp xếp, làm mới và xuất CSV.
function bindEvents() {
  document.getElementById('savedSearchInput')?.addEventListener('input', debounce((event) => {
    currentQuery = event.target.value.trim();
    currentPage = 1;
    loadSavedCandidates();
  }, 350));

  document.getElementById('savedSortSelect')?.addEventListener('change', (event) => {
    currentSort = event.target.value;
    currentPage = 1;
    loadSavedCandidates();
  });

  document.getElementById('btnRefreshSaved')?.addEventListener('click', () => {
    loadSavedCandidates();
  });

  document.getElementById('btnClearSavedFilters')?.addEventListener('click', () => {
    currentQuery = '';
    currentSort = 'saved-desc';
    currentPage = 1;
    setInputValue('savedSearchInput', '');
    setInputValue('savedSortSelect', currentSort);
    loadSavedCandidates();
  });

  document.getElementById('btnExportSaved')?.addEventListener('click', () => {
    exportSavedCsv(savedCandidates);
  });
}

// Gọi backend lấy danh sách ứng viên đã lưu. Không fallback sang dữ liệu mẫu.
async function loadSavedCandidates() {
  if (isLoading) return;

  isLoading = true;
  renderLoadingState();

  try {
    const payload = await api.get(buildListUrl());
    const result = normalizeSavedResult(payload);

    savedCandidates = result.items;
    totalItems = result.total;
    totalPages = result.totalPages;
    currentPage = result.page;

    renderStats(savedCandidates, totalItems);
    renderSummary(totalItems, savedCandidates.length);
    renderSavedCandidates(savedCandidates);
    renderPagination(currentPage, totalPages);
    toggleExportButton(savedCandidates.length > 0);
  } catch (err) {
    console.error('Load saved candidates error:', err);
    savedCandidates = [];
    totalItems = 0;
    totalPages = 1;
    renderStats([], 0);
    renderErrorState(err);
    toggleExportButton(false);
  } finally {
    isLoading = false;
  }
}

// Tạo query string để backend xử lý phân trang, tìm kiếm và sắp xếp.
function buildListUrl() {
  const params = new URLSearchParams();

  if (currentQuery) params.set('q', currentQuery);
  if (currentSort) params.set('sort', currentSort);
  params.set('page', String(currentPage));
  params.set('limit', String(PAGE_SIZE));

  return `${endpoints.list}?${params.toString()}`;
}

// Chuẩn hóa nhiều kiểu payload phổ biến để giảm phụ thuộc vào tên field backend.
function normalizeSavedResult(payload) {
  const items = normalizeList(payload, ['items', 'candidates', 'savedCandidates', 'data', 'results']).map(normalizeCandidate);
  const total = Number(payload?.total ?? payload?.totalItems ?? payload?.count ?? items.length);
  const page = Number(payload?.page ?? payload?.currentPage ?? currentPage);
  const pagesFromTotal = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pages = Number(payload?.totalPages ?? payload?.pages ?? pagesFromTotal);

  return {
    items,
    total,
    page: Math.max(1, page || 1),
    totalPages: Math.max(1, pages || 1)
  };
}

// Chuẩn hóa từng ứng viên đã lưu về format dùng chung cho UI.
function normalizeCandidate(item, index) {
  const source = item.candidate || item.profile || item;
  const savedAt = item.savedAt || item.createdAt || item.updatedAt || source.savedAt || '';
  const score = Number(source.score ?? source.matchScore ?? source.fitScore ?? item.score ?? 0);

  return {
    id: item.id || item._id || item.savedId || source.id || source._id || source.candidateId || `saved-candidate-${index + 1}`,
    candidateId: source.id || source._id || source.candidateId || item.candidateId || '',
    name: source.name || source.fullName || source.candidateName || 'Ứng viên chưa cập nhật tên',
    title: source.title || source.position || source.currentPosition || source.jobTitle || 'Chưa cập nhật vị trí',
    location: source.location || source.city || source.address || 'Chưa cập nhật địa điểm',
    skills: normalizeSkills(source.skills || source.skillNames || source.tags),
    summary: source.summary || source.description || source.cvSummary || '',
    score: Math.max(0, Math.min(100, score)),
    savedAt,
    fileName: source.fileName || source.cvFileName || source.resumeName || 'CV chưa cập nhật tên file',
    email: source.email || source.candidateEmail || '',
    phone: source.phone || source.candidatePhone || '',
    avatarUrl: source.avatarUrl || source.avatar || source.photoUrl || ''
  };
}

function normalizeList(payload, keys) {
  if (Array.isArray(payload)) return payload;

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }

  return [];
}

function normalizeSkills(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  const text = String(value || '').trim();
  if (!text) return [];
  return text.split(',').map(item => item.trim()).filter(Boolean);
}

function renderLoadingState() {
  setText('savedSummary', 'Đang tải ứng viên đã lưu...');
  setText('savedHint', 'Frontend đang gọi API danh sách ứng viên đã lưu.');
  setHtml('savedCandidateList', `
    <div class="col-span-full rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <span class="material-symbols-outlined animate-spin text-4xl text-blue-500">progress_activity</span>
      <h2 class="mt-3 text-lg font-black text-slate-800">Đang tải dữ liệu</h2>
      <p class="mt-2 text-sm font-semibold text-slate-500">Vui lòng chờ phản hồi từ backend.</p>
    </div>
  `);
  setHtml('savedPagination', '');
}

function renderStats(candidates, total) {
  const averageScore = candidates.length
    ? Math.round(candidates.reduce((sum, item) => sum + Number(item.score || 0), 0) / candidates.length)
    : 0;

  setText('savedTotalStat', formatNumber(total));
  setText('savedContactStat', formatNumber(candidates.filter(item => item.email).length));
  setText('savedScoreStat', `${formatNumber(averageScore)}%`);
}

function renderSummary(total, visibleCount) {
  setText('savedSummary', `${formatNumber(total)} ứng viên đã lưu`);
  setText('savedHint', `Đang hiển thị ${formatNumber(visibleCount)} hồ sơ từ dữ liệu backend.`);
}

function renderSavedCandidates(candidates) {
  if (!candidates.length) {
    const hasFilter = Boolean(currentQuery);
    setHtml('savedCandidateList', `
      <div class="col-span-full rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <span class="material-symbols-outlined text-4xl text-slate-300">${hasFilter ? 'search_off' : 'bookmark'}</span>
        <h2 class="mt-3 text-lg font-black text-slate-800">${hasFilter ? 'Không tìm thấy ứng viên phù hợp' : 'Chưa có ứng viên đã lưu'}</h2>
        <p class="mt-2 text-sm font-semibold text-slate-500">
          ${hasFilter ? 'Thử đổi từ khóa tìm kiếm hoặc xóa bộ lọc.' : 'Khi backend trả dữ liệu từ endpoint ứng viên đã lưu, danh sách sẽ hiển thị tại đây.'}
        </p>
      </div>
    `);
    return;
  }

  setHtml('savedCandidateList', candidates.map(candidate => `
    <article class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md">
      <div class="flex items-start justify-between gap-4">
        <div class="flex min-w-0 items-start gap-4">
          ${renderAvatar(candidate)}
          <div class="min-w-0">
            <h2 class="truncate text-xl font-black text-slate-950">${escapeHtml(candidate.name)}</h2>
            <p class="mt-1 text-sm font-extrabold text-blue-600">${escapeHtml(candidate.title)}</p>
            <p class="mt-2 flex items-center gap-1 text-sm font-semibold text-slate-500">
              <span class="material-symbols-outlined text-base">location_on</span>
              ${escapeHtml(candidate.location)}
            </p>
          </div>
        </div>

        <button class="btnRemoveSaved rounded-lg p-2 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500" data-id="${escapeHtml(candidate.id)}" title="Bỏ lưu ứng viên" aria-label="Bỏ lưu ${escapeHtml(candidate.name)}">
          <span class="material-symbols-outlined text-xl">delete</span>
        </button>
      </div>

      <div class="mt-5 flex flex-wrap gap-2">
        <span class="inline-flex items-center gap-1 rounded-md ${getScoreClass(candidate.score)} px-2.5 py-1 text-xs font-black">
          <span class="material-symbols-outlined text-sm">stars</span>
          ${formatNumber(candidate.score)}%
        </span>
        <span class="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">${escapeHtml(formatSavedDate(candidate.savedAt))}</span>
        ${candidate.skills.slice(0, 4).map(skill => `
          <span class="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">${escapeHtml(skill)}</span>
        `).join('')}
      </div>

      <p class="mt-4 line-clamp-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-600">
        ${escapeHtml(candidate.summary || candidate.fileName)}
      </p>

      <div class="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <button class="btnViewSaved inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700" data-id="${escapeHtml(candidate.id)}">
          <span class="material-symbols-outlined text-base">description</span>
          Xem CV
        </button>
        <a class="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 ${candidate.email ? '' : 'pointer-events-none opacity-50'}" href="${candidate.email ? `mailto:${escapeHtml(candidate.email)}` : '#'}">
          <span class="material-symbols-outlined text-base">mail</span>
          Liên hệ
        </a>
      </div>
    </article>
  `).join(''));

  bindCandidateActions(candidates);
}

function renderAvatar(candidate) {
  if (candidate.avatarUrl) {
    return `<img class="h-14 w-14 shrink-0 rounded-lg object-cover ring-2 ring-slate-50" src="${escapeHtml(candidate.avatarUrl)}" alt="${escapeHtml(candidate.name)}">`;
  }

  return `
    <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-lg font-black text-blue-700">
      ${escapeHtml(getInitials(candidate.name))}
    </div>
  `;
}

function bindCandidateActions(candidates) {
  document.querySelectorAll('.btnViewSaved').forEach(button => {
    button.addEventListener('click', () => {
      const candidate = candidates.find(item => String(item.id) === String(button.dataset.id));
      if (candidate) sessionStorage.setItem('selectedCandidate', JSON.stringify(candidate));
      window.appRouter?.navigate('cv-detail') ?? (window.location.hash = '#cv-detail');
    });
  });

  document.querySelectorAll('.btnRemoveSaved').forEach(button => {
    button.addEventListener('click', async () => {
      await removeSavedCandidate(button.dataset.id, button);
    });
  });
}

// Bỏ lưu qua backend, sau đó tải lại danh sách để đồng bộ dữ liệu thật.
async function removeSavedCandidate(id, button) {
  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span class="material-symbols-outlined animate-spin text-xl">progress_activity</span>';

  try {
    await api.delete(endpoints.remove(id));
    await loadSavedCandidates();
  } catch (err) {
    console.error('Remove saved candidate error:', err);
    button.disabled = false;
    button.innerHTML = originalHtml;
    alert('Chưa bỏ lưu được ứng viên. Vui lòng kiểm tra backend.');
  }
}

function renderPagination(page, pages) {
  if (pages <= 1) {
    setHtml('savedPagination', '');
    return;
  }

  const buttons = Array.from({ length: pages }, (_, index) => index + 1)
    .map(item => `
      <button class="savedPageBtn flex h-10 w-10 items-center justify-center rounded-lg text-sm ${item === page ? 'bg-blue-600 font-black text-white' : 'border border-slate-200 bg-white font-bold text-slate-600 hover:bg-slate-50'}" data-page="${item}">
        ${item}
      </button>
    `).join('');

  setHtml('savedPagination', `
    <button class="savedPrev flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 disabled:opacity-40" ${page <= 1 ? 'disabled' : ''}>
      <span class="material-symbols-outlined text-lg">chevron_left</span>
    </button>
    ${buttons}
    <button class="savedNext flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 disabled:opacity-40" ${page >= pages ? 'disabled' : ''}>
      <span class="material-symbols-outlined text-lg">chevron_right</span>
    </button>
  `);

  document.querySelector('.savedPrev')?.addEventListener('click', () => {
    if (currentPage <= 1) return;
    currentPage -= 1;
    loadSavedCandidates();
  });

  document.querySelector('.savedNext')?.addEventListener('click', () => {
    if (currentPage >= pages) return;
    currentPage += 1;
    loadSavedCandidates();
  });

  document.querySelectorAll('.savedPageBtn').forEach(button => {
    button.addEventListener('click', () => {
      currentPage = Number(button.dataset.page);
      loadSavedCandidates();
    });
  });
}

function renderErrorState(err) {
  const message = err?.status === 404
    ? 'Backend chưa có endpoint /candidates/saved.'
    : 'Không thể tải danh sách ứng viên đã lưu từ backend.';

  setText('savedSummary', 'Chưa tải được dữ liệu');
  setText('savedHint', 'Frontend không dùng dữ liệu giả, nên cần backend trả dữ liệu thật.');
  setHtml('savedCandidateList', `
    <div class="col-span-full rounded-xl border border-red-200 bg-red-50 p-10 text-center text-red-700">
      <span class="material-symbols-outlined text-4xl">error</span>
      <h2 class="mt-3 text-lg font-black">${escapeHtml(message)}</h2>
      <p class="mt-2 text-sm font-semibold">${escapeHtml(err?.message || 'Vui lòng kiểm tra API và thử lại.')}</p>
    </div>
  `);
  setHtml('savedPagination', '');
}

function exportSavedCsv(candidates) {
  if (!candidates.length) return;

  const rows = [
    ['Tên ứng viên', 'Vị trí', 'Email', 'Số điện thoại', 'Địa điểm', 'Kỹ năng', 'Điểm phù hợp', 'Ngày lưu'],
    ...candidates.map(candidate => [
      candidate.name,
      candidate.title,
      candidate.email,
      candidate.phone,
      candidate.location,
      candidate.skills.join(', '),
      `${candidate.score}%`,
      formatSavedDate(candidate.savedAt)
    ])
  ];

  const csv = rows.map(row => row.map(escapeCsvCell).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `ung-vien-da-luu-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function toggleExportButton(enabled) {
  const button = document.getElementById('btnExportSaved');
  if (button) button.disabled = !enabled;
}

function formatSavedDate(value) {
  if (!value) return 'Chưa có ngày lưu';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `Lưu ngày ${date.toLocaleDateString('vi-VN')}`;
}

function getScoreClass(score) {
  if (score >= 85) return 'bg-green-100 text-green-700';
  if (score >= 70) return 'bg-blue-100 text-blue-700';
  if (score > 0) return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-500';
}

function getInitials(name = '') {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map(part => part.charAt(0).toUpperCase())
    .join('') || 'UV';
}

function debounce(callback, delay) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
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

function escapeCsvCell(value = '') {
  return `"${String(value).replaceAll('"', '""')}"`;
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
