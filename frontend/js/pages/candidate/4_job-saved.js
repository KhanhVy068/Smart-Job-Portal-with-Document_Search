import { api } from '../../api.js';

const saved = new Set();

export async function init() {
  await fetchSaved();
}

async function fetchSaved() {
  showSkeleton();
  try {
    const res = await api.get('/jobs');
    const jobs = (res?.items ?? (Array.isArray(res) ? res : [])).filter(j => j.isSaved);
    jobs.forEach(j => saved.add(String(j.id)));
    render(jobs);
  } catch {
    document.getElementById('savedJobList').innerHTML =
      '<p class="text-sm text-slate-400 text-center py-8">Không thể tải danh sách đã lưu.</p>';
  }
}

function render(jobs) {
  const empty = document.getElementById('savedEmpty');
  const list = document.getElementById('savedJobList');
  const count = document.getElementById('savedCount');

  if (count) count.textContent = `${jobs.length} việc làm đã lưu`;

  if (!jobs.length) {
    empty?.classList.remove('hidden');
    if (list) list.innerHTML = '';
    return;
  }
  empty?.classList.add('hidden');

  if (!list) return;
  list.innerHTML = jobs.map(j => `
    <article class="bg-white border border-slate-100 rounded-xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer group relative"
             data-job-id="${j.id}">
      <button class="unsave-btn absolute top-4 right-4 p-2 text-blue-900 bg-blue-50 rounded-xl hover:bg-red-50 hover:text-red-500 transition-all"
              data-id="${j.id}" title="Bỏ lưu">
        <span class="material-symbols-outlined text-base" style="font-variation-settings:'FILL' 1">bookmark</span>
      </button>
      <div class="flex items-start gap-4 pr-12">
        <div class="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-900 font-bold text-sm flex-shrink-0 overflow-hidden">
          ${j.companyLogo ? `<img src="${esc(j.companyLogo)}" class="w-full h-full object-cover"/>` : esc((j.companyName||'?')[0])}
        </div>
        <div class="flex-1 min-w-0">
          <h2 class="text-sm font-bold text-blue-900 group-hover:underline truncate">${esc(j.title)}</h2>
          <p class="text-xs text-slate-500 mt-0.5">${esc(j.companyName)}</p>
          <div class="flex flex-wrap gap-2 mt-2 text-xs text-slate-500">
            <span class="flex items-center gap-1"><span class="material-symbols-outlined text-xs">location_on</span>${esc(j.location)}</span>
            <span class="flex items-center gap-1"><span class="material-symbols-outlined text-xs">payments</span>${esc(j.salary)}</span>
          </div>
          <div class="flex flex-wrap gap-2 mt-2">
            <span class="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">${esc(j.jobType)}</span>
            ${(j.skills||[]).slice(0,2).map(s=>`<span class="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">${esc(s)}</span>`).join('')}
          </div>
        </div>
      </div>
    </article>`).join('');

  list.querySelectorAll('article[data-job-id]').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.unsave-btn')) return;
      localStorage.setItem('selectedJobId', card.dataset.jobId);
      window.appRouter?.navigate('job-detail');
    });
  });

  list.querySelectorAll('.unsave-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      saved.delete(String(id));
      btn.closest('article')?.remove();
      const remaining = list.querySelectorAll('article').length;
      if (count) count.textContent = `${remaining} việc làm đã lưu`;
      if (!remaining) empty?.classList.remove('hidden');
    });
  });
}

function showSkeleton() {
  const list = document.getElementById('savedJobList');
  if (list) list.innerHTML = [1,2,3].map(() =>
    '<div class="bg-white border border-slate-100 rounded-xl p-5 animate-pulse h-24"></div>').join('');
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
