import { api } from '../../api.js';

const state = { page: 1, limit: 10, total: 0, keyword: '', location: '', type: '' };

export async function init() {
  state.keyword = sessionStorage.getItem('publicJobKeyword') || '';
  sessionStorage.removeItem('publicJobKeyword');
  setValue('publicJobKeyword', state.keyword);
  bind();
  await loadJobs();
}

function bind() {
  document.getElementById('publicApplyFilter')?.addEventListener('click', applyFilters);
  document.getElementById('publicClearFilter')?.addEventListener('click', () => {
    state.page = 1; state.keyword = ''; state.location = ''; state.type = '';
    setValue('publicJobKeyword', ''); setValue('publicJobLocation', ''); setValue('publicJobType', '');
    loadJobs();
  });
  ['publicJobKeyword', 'publicJobLocation'].forEach((id) => {
    document.getElementById(id)?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') applyFilters();
    });
  });
}

function applyFilters() {
  state.page = 1;
  state.keyword = document.getElementById('publicJobKeyword')?.value.trim() || '';
  state.location = document.getElementById('publicJobLocation')?.value.trim() || '';
  state.type = document.getElementById('publicJobType')?.value || '';
  loadJobs();
}

async function loadJobs() {
  const list = document.getElementById('publicJobList');
  if (list) list.innerHTML = '<div class="h-32 animate-pulse rounded-xl bg-white"></div><div class="h-32 animate-pulse rounded-xl bg-white"></div>';
  const params = new URLSearchParams({ page: state.page, limit: state.limit });
  if (state.keyword) params.set('q', state.keyword);
  if (state.location) params.set('location', state.location);
  if (state.type) params.set('type', state.type);

  try {
    const res = await api.get(`/jobs?${params}`);
    const jobs = res.items || res.jobs || [];
    state.total = Number(res.total || res.totalJobs || jobs.length);
    renderJobs(jobs);
    renderPagination();
    setText('publicJobCount', `Hiển thị ${jobs.length} / ${state.total} công việc`);
  } catch {
    if (list) list.innerHTML = '<div class="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-500">Không tải được danh sách việc làm.</div>';
    setText('publicJobCount', 'Không tải được dữ liệu');
  }
}

function renderJobs(jobs) {
  const list = document.getElementById('publicJobList');
  if (!list) return;
  if (!jobs.length) {
    list.innerHTML = '<div class="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-500">Không tìm thấy việc làm phù hợp.</div>';
    return;
  }

  list.innerHTML = jobs.map((job) => `
    <article class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-lg font-black text-blue-950">${esc((job.companyName || '?')[0])}</div>
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-black text-blue-950">${esc(job.title)}</h2>
          <p class="mt-1 text-sm font-semibold text-slate-500">${esc(job.companyName || 'Smart Job Portal')}</p>
          <p class="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-slate-600">${esc(strip(job.description || job.summary || ''))}</p>
          <div class="mt-4 flex flex-wrap gap-3 text-xs font-bold text-slate-500">
            <span class="inline-flex items-center gap-1"><span class="material-symbols-outlined text-sm">location_on</span>${esc(job.location || '')}</span>
            <span class="inline-flex items-center gap-1"><span class="material-symbols-outlined text-sm">payments</span>${esc(job.salary || 'Thỏa thuận')}</span>
            <span class="rounded-full bg-slate-100 px-3 py-1">${esc(job.jobType || job.type || 'Full-time')}</span>
          </div>
        </div>
        <button class="rounded-lg bg-blue-900 px-5 py-3 text-sm font-black text-white" data-job-id="${esc(job.id)}" type="button">Chi tiết</button>
      </div>
    </article>
  `).join('');

  list.querySelectorAll('[data-job-id]').forEach((button) => {
    button.addEventListener('click', () => {
      localStorage.setItem('selectedPublicJobId', button.dataset.jobId);
      window.appRouter?.navigate('job-detail');
    });
  });
}

function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(state.total / state.limit));
  const wrap = document.getElementById('publicPagination');
  if (!wrap || totalPages <= 1) {
    if (wrap) wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = Array.from({ length: Math.min(totalPages, 6) }, (_, i) => i + 1).map((page) =>
    `<button class="h-10 min-w-10 rounded-lg px-3 text-sm font-black ${page === state.page ? 'bg-blue-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}" data-page="${page}" type="button">${page}</button>`
  ).join('');
  wrap.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', () => { state.page = Number(button.dataset.page); loadJobs(); });
  });
}

function setValue(id, value) { const el = document.getElementById(id); if (el) el.value = value; }
function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
function strip(value = '') { return String(value).replace(/<[^>]+>/g, ' '); }
function esc(value = '') { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
