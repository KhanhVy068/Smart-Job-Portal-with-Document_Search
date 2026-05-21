import { api } from '../../api.js';

const state = { page: 1, limit: 10, total: 0, keyword: '', location: '', type: '', loading: false };

export async function init() {
  setupFilters();
  await fetchJobs();
}

function setupFilters() {
  const keyword = document.getElementById('filterKeyword');
  const location = document.getElementById('filterLocation');
  const applyBtn = document.getElementById('btnApplyFilter');
  const clearBtn = document.getElementById('btnClearFilter');
  const sort = document.getElementById('sortJobs');

  let debounce;
  keyword?.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.keyword = keyword.value.trim(); state.page = 1; fetchJobs(); }, 400);
  });

  location?.addEventListener('change', () => { state.location = location.value; state.page = 1; fetchJobs(); });
  sort?.addEventListener('change', () => fetchJobs());

  // Type toggle buttons
  document.querySelectorAll('.job-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.type;
      state.type = state.type === t ? '' : t;
      document.querySelectorAll('.job-type-btn').forEach(b => {
        b.classList.toggle('bg-blue-900', b.dataset.type === state.type);
        b.classList.toggle('text-white', b.dataset.type === state.type);
        b.classList.toggle('bg-slate-100', b.dataset.type !== state.type);
        b.classList.toggle('text-slate-600', b.dataset.type !== state.type);
      });
      state.page = 1;
      fetchJobs();
    });
  });

  applyBtn?.addEventListener('click', () => {
    state.keyword = keyword?.value.trim() ?? '';
    state.location = location?.value ?? '';
    state.page = 1;
    fetchJobs();
  });

  clearBtn?.addEventListener('click', () => {
    if (keyword) keyword.value = '';
    if (location) location.value = '';
    state.keyword = ''; state.location = ''; state.type = '';
    state.page = 1;
    document.querySelectorAll('.job-type-btn').forEach(b => {
      b.classList.remove('bg-blue-900','text-white');
      b.classList.add('bg-slate-100','text-slate-600');
    });
    fetchJobs();
  });
}

async function fetchJobs() {
  if (state.loading) return;
  state.loading = true;
  showSkeleton();

  try {
    const params = new URLSearchParams({ page: state.page, limit: state.limit });
    if (state.keyword) params.set('q', state.keyword);
    if (state.location) params.set('location', state.location);
    if (state.type) params.set('type', state.type);

    const res = await api.get(`/jobs?${params}`);
    const items = res?.items ?? (Array.isArray(res) ? res : []);
    state.total = res?.total ?? items.length;

    renderJobs(items);
    renderPagination();
    setText('jobListCount', `Hiển thị ${items.length} / ${state.total} kết quả`);
  } catch {
    document.getElementById('jobListContainer').innerHTML =
      '<div class="bg-white border border-slate-100 rounded-xl p-8 text-center text-sm text-slate-400">Không thể tải danh sách việc làm.</div>';
    setText('jobListCount', 'Không thể tải kết quả phù hợp');
  } finally {
    state.loading = false;
  }
}

function renderJobs(jobs) {
  const el = document.getElementById('jobListContainer');
  if (!el) return;
  if (!jobs.length) {
    el.innerHTML = `
      <div class="bg-white border border-slate-100 rounded-xl p-12 text-center">
        <span class="material-symbols-outlined text-4xl text-slate-300 block mb-3">search_off</span>
        <p class="text-base font-semibold text-slate-500">Không tìm thấy việc làm phù hợp</p>
        <p class="text-sm text-slate-400 mt-1">Thử điều chỉnh bộ lọc tìm kiếm</p>
      </div>`;
    return;
  }
  el.innerHTML = jobs.map(j => `
    ${(() => {
      const skills = normalizeSkills(j.skills);
      const location = j.location || j.company_address || j.companyAddress || 'Chưa cập nhật địa điểm';
      return `
    <article class="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md group"
             data-job-id="${j.id}">
      <div class="flex flex-col sm:flex-row sm:items-start gap-4">
        <div class="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-blue-50 text-base font-bold text-blue-900">
          ${j.companyLogo ? `<img src="${esc(j.companyLogo)}" class="w-full h-full object-cover"/>` : esc((j.companyName||'?')[0])}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-2">
            <div>
              <h2 class="text-base font-black text-slate-950 group-hover:text-blue-600">${esc(j.title)}</h2>
              <p class="text-sm text-slate-500 mt-0.5">${esc(j.companyName)}</p>
            </div>
            <button class="save-btn flex-shrink-0 p-2 rounded-xl ${j.isSaved ? 'text-blue-900 bg-blue-50' : 'text-slate-300 hover:text-blue-900 hover:bg-blue-50'} transition-all"
                    data-id="${j.id}" data-saved="${j.isSaved}" title="${j.isSaved ? 'Bỏ lưu' : 'Lưu việc'}">
              <span class="material-symbols-outlined text-lg" style="font-variation-settings:'FILL' ${j.isSaved ? 1 : 0}">bookmark</span>
            </button>
          </div>
          <div class="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-slate-500">
            <span class="flex items-center gap-1"><span class="material-symbols-outlined text-sm">location_on</span>${esc(location)}</span>
            <span class="flex items-center gap-1"><span class="material-symbols-outlined text-sm">payments</span>${esc(j.salary)}</span>
            <span class="flex items-center gap-1"><span class="material-symbols-outlined text-sm">schedule</span>${timeAgo(j.postedAt)}</span>
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <span class="text-[10px] font-bold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full">${esc(j.jobType)}</span>
            ${skills.length ? skills.slice(0,3).map(s => `<span class="text-[10px] font-bold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full">${esc(s)}</span>`).join('') : '<span class="text-[10px] font-bold px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full">Chưa cập nhật kỹ năng</span>'}
          </div>
        </div>
      </div>
    </article>
      `;
    })()}`).join('');

  // Attach click events
  el.querySelectorAll('article[data-job-id]').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.save-btn')) return;
      localStorage.setItem('selectedJobId', card.dataset.jobId);
      window.appRouter?.navigate('job-detail');
    });
  });

  el.querySelectorAll('.save-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const saved = btn.dataset.saved === 'true';
      // Toggle saved state locally (no dedicated API in spec, use apply as proxy)
      btn.dataset.saved = !saved;
      const icon = btn.querySelector('.material-symbols-outlined');
      if (icon) icon.style.fontVariationSettings = `'FILL' ${saved ? 0 : 1}`;
      btn.classList.toggle('text-blue-900', !saved);
      btn.classList.toggle('bg-blue-50', !saved);
    });
  });
}

function renderPagination() {
  const nav = document.getElementById('jobListPagination');
  const nums = document.getElementById('pageNumbers');
  if (!nav || !nums) return;
  const total = Math.ceil(state.total / state.limit);
  if (total <= 1) { nav.classList.add('hidden'); return; }
  nav.classList.remove('hidden');

  nums.innerHTML = Array.from({ length: Math.min(total, 5) }, (_, i) => {
    const p = i + 1;
    return `<button class="w-9 h-9 flex items-center justify-center rounded-lg text-sm font-bold transition-all
      ${p === state.page ? 'bg-blue-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-blue-900 hover:text-white hover:border-blue-900'}"
      data-p="${p}">${p}</button>`;
  }).join('');

  nums.querySelectorAll('[data-p]').forEach(b =>
    b.addEventListener('click', () => { state.page = +b.dataset.p; fetchJobs(); }));

  document.getElementById('prevPage')?.addEventListener('click', () => {
    if (state.page > 1) { state.page--; fetchJobs(); }
  });
  document.getElementById('nextPage')?.addEventListener('click', () => {
    if (state.page < total) { state.page++; fetchJobs(); }
  });
}

function showSkeleton() {
  const el = document.getElementById('jobListContainer');
  if (el) el.innerHTML = [1,2,3].map(() =>
    '<div class="h-24 animate-pulse rounded-xl border border-slate-100 bg-white p-4"></div>').join('');
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 36e5);
  if (h < 1) return 'Vừa đăng';
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d} ngày trước` : `${Math.floor(d/30)} tháng trước`;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function normalizeSkills(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return normalizeSkills(parsed);
  } catch {
    // Accept comma-separated skills from older API rows.
  }
  return String(value).split(',').map(item => item.trim()).filter(Boolean);
}
