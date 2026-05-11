import { api } from '../../api.js';

export async function init() {
  await Promise.all([loadProfile(), loadApplications(), loadJobs()]);
}

async function loadProfile() {
  try {
    const u = await api.get('/user/profile');
    const user = u?.user || u?.data || u || {};
    const name = user.fullName || user.full_name || user.name || 'Ứng viên';
    setText('dashWelcome', `Xin chào, ${name}!`);
    const pct = user.profileStrength ?? 0;
    setText('dashProfilePct', `${pct}%`);
    const bar = document.getElementById('dashProfileBar');
    if (bar) bar.style.width = `${pct}%`;
  } catch { /* silent */ }
}

async function loadApplications() {
  try {
    const list = await api.get('/candidate/applications');
    const apps = Array.isArray(list) ? list : (list?.items ?? []);
    setText('dashApplied', apps.length);
    setText('dashInterview', apps.filter(a => a.status === 'interview').length);

    const cvRes = await api.get('/candidate/cv').catch(() => []);
    const cvs = Array.isArray(cvRes) ? cvRes : [];
    setText('dashSaved', cvs.length);

    renderTimeline(apps.slice(0, 4));
  } catch { /* silent */ }
}

async function loadJobs() {
  try {
    const res = await api.get('/jobs');
    const jobs = res?.items ?? (Array.isArray(res) ? res : []);
    renderJobs(jobs.slice(0, 3));
  } catch {
    document.getElementById('dashJobList').innerHTML =
      '<p class="text-sm text-slate-400 text-center py-6">Không thể tải danh sách việc làm.</p>';
  }
}

function renderJobs(jobs) {
  const el = document.getElementById('dashJobList');
  if (!el) return;
  if (!jobs.length) {
    el.innerHTML = '<p class="text-sm text-slate-400 text-center py-6">Không có gợi ý nào.</p>';
    return;
  }
  el.innerHTML = jobs.map(j => `
    <div class="bg-white border border-slate-100 rounded-xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer group"
         data-route="job-detail" data-job-id="${j.id}">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-900 font-bold text-sm flex-shrink-0 overflow-hidden">
          ${j.companyLogo
            ? `<img src="${esc(j.companyLogo)}" class="w-full h-full object-cover"/>`
            : esc((j.companyName || '?')[0])}
        </div>
        <div class="flex-1 min-w-0">
          <h4 class="text-sm font-bold text-blue-900 group-hover:underline truncate">${esc(j.title)}</h4>
          <p class="text-xs text-slate-500 mt-0.5">${esc(j.companyName)} · ${esc(j.location)}</p>
          <div class="flex flex-wrap gap-2 mt-2">
            <span class="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">${esc(j.jobType)}</span>
            <span class="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">${esc(j.salary)}</span>
          </div>
        </div>
        <button class="flex-shrink-0 p-2 text-slate-300 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-all"
                data-save-job="${j.id}" title="Lưu việc">
          <span class="material-symbols-outlined text-lg">${j.isSaved ? 'bookmark' : 'bookmark_border'}</span>
        </button>
      </div>
    </div>`).join('');

  // Click job card → navigate to detail
  el.querySelectorAll('[data-route="job-detail"]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-save-job]')) return;
      const id = card.dataset.jobId;
      localStorage.setItem('selectedJobId', id);
      window.appRouter?.navigate('job-detail');
    });
  });
}

function renderTimeline(apps) {
  const el = document.getElementById('dashTimeline');
  if (!el) return;
  if (!apps.length) {
    el.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">Chưa ứng tuyển việc nào.</p>';
    return;
  }
  const statusInfo = {
    submitted:  { label: 'Đã nộp',        color: 'bg-slate-200 text-slate-600' },
    reviewing:  { label: 'Đang xét duyệt', color: 'bg-blue-100 text-blue-700' },
    interview:  { label: 'Phỏng vấn',      color: 'bg-teal-100 text-teal-700' },
    rejected:   { label: 'Không đạt',      color: 'bg-red-100 text-red-600' },
    accepted:   { label: 'Chấp nhận',      color: 'bg-teal-500 text-white' },
  };
  el.innerHTML = apps.map(a => {
    const s = statusInfo[a.status] ?? { label: a.status, color: 'bg-slate-100 text-slate-600' };
    return `
    <div class="flex items-center gap-3">
      <div class="w-2 h-2 rounded-full bg-blue-900 flex-shrink-0"></div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-blue-900 truncate">${esc(a.jobTitle)}</p>
        <p class="text-xs text-slate-400">${esc(a.companyName)}</p>
      </div>
      <span class="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${s.color}">${s.label}</span>
    </div>`;
  }).join('');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
