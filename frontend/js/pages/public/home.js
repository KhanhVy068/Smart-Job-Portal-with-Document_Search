import { api } from '../../api.js';

export async function init() {
  bindSearch();
  await loadFeaturedJobs();
}

function bindSearch() {
  document.getElementById('homeSearchForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const keyword = document.getElementById('homeSearchInput')?.value.trim() || '';
    if (keyword) sessionStorage.setItem('publicJobKeyword', keyword);
    window.appRouter?.navigate('jobs');
  });

  document.querySelectorAll('.home-tag').forEach((button) => {
    button.addEventListener('click', () => {
      sessionStorage.setItem('publicJobKeyword', button.textContent.trim());
      window.appRouter?.navigate('jobs');
    });
  });
}

async function loadFeaturedJobs() {
  const container = document.getElementById('featuredJobs');
  if (!container) return;
  container.innerHTML = skeleton();

  try {
    const res = await api.get('/jobs?limit=3');
    const jobs = res.items || res.jobs || [];
    container.innerHTML = jobs.length ? jobs.map((job, index) => card(job, index)).join('') : empty();
    container.querySelectorAll('[data-job-id]').forEach((button) => {
      button.addEventListener('click', () => {
        localStorage.setItem('selectedPublicJobId', button.dataset.jobId);
        window.appRouter?.navigate('job-detail');
      });
    });
  } catch {
    container.innerHTML = empty();
  }
}

function card(job, index) {
  const wide = index === 0;
  return `
    <article class="${wide ? 'lg:row-span-1' : ''} rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-xs font-black uppercase tracking-wider text-slate-400">${esc(job.companyName || 'Smart Job Portal')}</p>
          <h3 class="mt-2 text-xl font-black text-blue-950">${esc(job.title)}</h3>
        </div>
        <span class="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">${wide ? '96% Smart Match' : 'Posted recently'}</span>
      </div>
      <p class="mt-6 line-clamp-3 text-sm font-semibold leading-6 text-slate-600">${esc(strip(job.description || job.summary || 'Cơ hội nghề nghiệp kỹ thuật đang tuyển dụng.'))}</p>
      <div class="mt-6 flex flex-wrap gap-2">
        <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">${esc(job.jobType || job.type || 'Full-time')}</span>
        <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">${esc(job.location || 'Remote')}</span>
      </div>
      <div class="mt-8 flex items-center justify-between">
        <p class="text-base font-black text-blue-950">${esc(job.salary || 'Thỏa thuận')}</p>
        <button class="rounded-lg ${wide ? 'bg-blue-900 text-white' : 'border border-blue-900 text-blue-950'} px-6 py-3 text-sm font-black" data-job-id="${esc(job.id)}" type="button">${wide ? 'Apply Now' : 'Details'}</button>
      </div>
    </article>
  `;
}

function skeleton() {
  return '<div class="h-56 animate-pulse rounded-xl bg-white"></div><div class="h-56 animate-pulse rounded-xl bg-white"></div>';
}

function empty() {
  return '<div class="rounded-xl border border-slate-200 bg-white p-8 text-sm font-bold text-slate-500">Chưa có tin tuyển dụng nổi bật.</div>';
}

function strip(value = '') {
  return String(value).replace(/<[^>]+>/g, ' ');
}

function esc(value = '') {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
