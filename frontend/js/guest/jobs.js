import { api } from '../api.js';

document.addEventListener('DOMContentLoaded', () => {
  setupNavButtons();
  if (document.querySelector('.flex-col.md\\:flex-row.gap-8')) initJobList();
  else initJobDetail();
});

// ── Nav Buttons ───────────────────────────────────────────────────────────────

function setupNavButtons() {
  document.querySelectorAll('nav button').forEach(btn => {
    const t = btn.textContent.trim();
    if (t === 'Login') btn.addEventListener('click', () => { window.location.href = '4_Login.html'; });
    if (t === 'Register') btn.addEventListener('click', () => { window.location.href = '5_Register.html'; });
  });
}

// ── Job List ──────────────────────────────────────────────────────────────────

const state = { page: 1, limit: 10, total: 0, keyword: '', location: '', type: '', loading: false };

async function initJobList() {
  const main = document.querySelector('main .flex-col.md\\:flex-row');
  if (!main) return;

  // Find or create the jobs section container
  const section = main.querySelector('section.flex-grow') || main.querySelector('section');
  if (!section) return;

  // Preserve the header, replace only the job cards + pagination
  const header = section.querySelector('header');
  section.innerHTML = '';
  if (header) section.appendChild(header);

  const container = document.createElement('div');
  container.id = 'guestJobList';
  container.className = 'space-y-6';
  section.appendChild(container);

  const paginationEl = document.createElement('div');
  paginationEl.id = 'guestPagination';
  paginationEl.className = 'flex justify-center gap-2 pt-4';
  section.appendChild(paginationEl);

  // Wire up sidebar filters
  const keywordInput = main.querySelector('input[placeholder*="Engineer"]') ||
    main.querySelector('input[type="text"]');
  const locationSel = main.querySelector('select');

  let debounce;
  keywordInput?.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.keyword = keywordInput.value.trim(); state.page = 1; fetchJobs(); }, 400);
  });
  locationSel?.addEventListener('change', () => { state.location = locationSel.value; state.page = 1; fetchJobs(); });

  // Employment type buttons
  main.querySelectorAll('button').forEach(btn => {
    const types = ['Full-time', 'Contract', 'Part-time'];
    if (types.some(t => btn.textContent.includes(t))) {
      btn.addEventListener('click', () => {
        const t = btn.textContent.trim();
        state.type = state.type === t ? '' : t;
        main.querySelectorAll('button').forEach(b => {
          if (types.some(x => b.textContent.includes(x))) {
            const active = b.textContent.trim() === state.type;
            b.className = active
              ? 'px-3 py-1.5 bg-primary text-white rounded-full text-xs font-bold'
              : 'px-3 py-1.5 bg-surface-container-highest text-on-surface-variant rounded-full text-xs font-bold hover:bg-outline-variant transition-all';
          }
        });
        state.page = 1;
        fetchJobs();
      });
    }
  });

  await fetchJobs();
}

async function fetchJobs() {
  if (state.loading) return;
  state.loading = true;
  const container = document.getElementById('guestJobList');
  if (container) container.innerHTML = [1,2,3].map(() =>
    '<div class="bg-surface-container-lowest rounded-xl p-8 animate-pulse h-36"></div>').join('');

  try {
    const params = new URLSearchParams({ page: state.page, limit: state.limit });
    if (state.keyword) params.set('q', state.keyword);
    if (state.location) params.set('location', state.location);
    if (state.type) params.set('type', state.type);

    const res = await api.get(`/jobs?${params}`);
    const items = res?.items ?? (Array.isArray(res) ? res : []);
    state.total = res?.total ?? items.length;

    const header = document.querySelector('#guestJobList')?.parentElement?.querySelector('header p');
    if (header) header.textContent = `Hiển thị ${items.length} / ${state.total} kết quả`;

    renderJobCards(items);
    renderPagination();
  } catch {
    const container = document.getElementById('guestJobList');
    if (container) container.innerHTML =
      '<div class="bg-surface-container-lowest rounded-xl p-8 text-center text-on-surface-variant">Không thể tải danh sách việc làm.</div>';
  } finally {
    state.loading = false;
  }
}

function renderJobCards(jobs) {
  const container = document.getElementById('guestJobList');
  if (!container) return;
  if (!jobs.length) {
    container.innerHTML = `<div class="bg-surface-container-lowest rounded-xl p-12 text-center">
      <p class="font-semibold text-on-surface-variant text-lg">Không tìm thấy việc làm phù hợp</p>
      <p class="text-sm text-outline mt-2">Thử điều chỉnh bộ lọc tìm kiếm</p>
    </div>`;
    return;
  }
  container.innerHTML = jobs.map(j => `
    <article class="group relative bg-surface-container-lowest p-8 rounded-xl transition-all duration-300 hover:scale-[1.01] hover:bg-surface-container-high cursor-pointer overflow-hidden"
             data-job-id="${j.id}">
      <div class="flex flex-col lg:flex-row gap-6 items-start">
        <div class="w-16 h-16 rounded-xl overflow-hidden bg-surface-container flex-shrink-0 flex items-center justify-center text-primary font-bold text-xl">
          ${j.companyLogo ? `<img src="${esc(j.companyLogo)}" class="w-full h-full object-cover"/>` : esc((j.companyName||'?')[0])}
        </div>
        <div class="flex-grow">
          <div class="flex items-center gap-3 mb-2">
            <span class="text-sm font-bold text-on-secondary-container">${esc(j.companyName)}</span>
          </div>
          <h2 class="text-2xl font-extrabold text-blue-900 group-hover:text-primary transition-colors mb-2">${esc(j.title)}</h2>
          <div class="flex flex-wrap gap-4">
            <div class="flex items-center gap-1.5 text-on-surface-variant">
              <span class="material-symbols-outlined text-[18px]">location_on</span>
              <span class="text-xs font-semibold">${esc(j.location)}</span>
            </div>
            <div class="flex items-center gap-1.5 text-on-surface-variant">
              <span class="material-symbols-outlined text-[18px]">payments</span>
              <span class="text-xs font-semibold">${esc(j.salary)}</span>
            </div>
            <div class="flex items-center gap-1.5 text-on-surface-variant">
              <span class="material-symbols-outlined text-[18px]">work</span>
              <span class="text-xs font-semibold">${esc(j.jobType)}</span>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 mt-4">
            ${(j.skills||[]).slice(0,4).map(s=>`<span class="text-[10px] font-bold px-2 py-0.5 bg-surface-container text-on-surface-variant rounded-full">${esc(s)}</span>`).join('')}
          </div>
        </div>
        <div class="flex flex-col gap-3 lg:items-end w-full lg:w-auto">
          <button class="quick-apply-btn px-6 py-2 bg-primary text-white font-bold rounded-lg text-sm active:scale-95 transition-all"
                  data-job-id="${j.id}">
            Ứng tuyển nhanh
          </button>
        </div>
      </div>
    </article>`).join('');

  container.querySelectorAll('article[data-job-id]').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.quick-apply-btn')) return;
      localStorage.setItem('selectedJobId', card.dataset.jobId);
      window.location.href = '3_Job-Details.html';
    });
  });

  container.querySelectorAll('.quick-apply-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      localStorage.setItem('selectedJobId', btn.dataset.jobId);
      localStorage.setItem('pendingApplyJobId', btn.dataset.jobId);
      window.location.href = '4_Login.html';
    });
  });
}

function renderPagination() {
  const nav = document.getElementById('guestPagination');
  if (!nav) return;
  const total = Math.ceil(state.total / state.limit);
  if (total <= 1) { nav.innerHTML = ''; return; }
  nav.innerHTML = Array.from({ length: Math.min(total, 5) }, (_, i) => {
    const p = i + 1;
    return `<button class="w-10 h-10 flex items-center justify-center rounded-lg text-sm font-bold transition-all
      ${p === state.page ? 'bg-primary text-white' : 'bg-surface-container-low text-on-surface-variant hover:bg-primary hover:text-white'}"
      data-p="${p}">${p}</button>`;
  }).join('');
  nav.querySelectorAll('[data-p]').forEach(b =>
    b.addEventListener('click', () => { state.page = +b.dataset.p; fetchJobs(); }));
}

// ── Job Detail ────────────────────────────────────────────────────────────────

async function initJobDetail() {
  const jobId = localStorage.getItem('selectedJobId');
  // Wire apply/save buttons to redirect to login if not authenticated
  document.querySelectorAll('button').forEach(btn => {
    const t = btn.textContent.trim();
    if (t.includes('Ứng tuyển') || t.includes('Apply')) {
      btn.addEventListener('click', () => {
        if (jobId) localStorage.setItem('pendingApplyJobId', jobId);
        window.location.href = '4_Login.html';
      });
    }
    if (t === '') {
      const icon = btn.querySelector('.material-symbols-outlined');
      if (icon?.textContent === 'bookmark') {
        btn.addEventListener('click', () => window.location.href = '4_Login.html');
      }
    }
  });

  if (!jobId) return;
  try {
    const job = await api.get(`/jobs/${jobId}`);
    updateJobDetail(job);
  } catch { /* use static HTML fallback */ }
}

function updateJobDetail(job) {
  const h1 = document.querySelector('main h1');
  if (h1) h1.textContent = job.title;

  document.querySelectorAll('main .flex-wrap.gap-4 span.font-semibold').forEach((el, i) => {
    if (i === 0) el.textContent = job.salary;
    if (i === 1) el.textContent = job.location;
    if (i === 2) el.textContent = job.jobType;
  });
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
