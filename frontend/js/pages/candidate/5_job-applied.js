import { api } from '../../api.js';

let allApps = [];

export async function init() {
  await fetchApplications();
  setupTabs();
}

async function fetchApplications() {
  showSkeleton();
  try {
    const res = await api.get('/candidate/applications');
    allApps = Array.isArray(res) ? res : (res?.items ?? []);
    renderStats();
    renderList('all');
  } catch {
    document.getElementById('appliedList').innerHTML =
      '<p class="text-sm text-slate-400 text-center py-8">Không thể tải danh sách ứng tuyển.</p>';
  }
}

function renderStats() {
  setText('statTotal', allApps.length);
  setText('statInterview', allApps.filter(a => a.status === 'interview').length);
  setText('statReviewing', allApps.filter(a => a.status === 'reviewing').length);
  setText('statRejected', allApps.filter(a => a.status === 'rejected').length);
}

function setupTabs() {
  document.querySelectorAll('.apply-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.apply-tab-btn').forEach(b => {
        b.classList.remove('bg-blue-900', 'text-white');
        b.classList.add('bg-slate-100', 'text-slate-600');
      });
      btn.classList.remove('bg-slate-100', 'text-slate-600');
      btn.classList.add('bg-blue-900', 'text-white');
      renderList(btn.dataset.status);
    });
  });
}

function renderList(status) {
  const items = status === 'all' ? allApps : allApps.filter(a => a.status === status);
  const empty = document.getElementById('appliedEmpty');
  const list = document.getElementById('appliedList');

  if (!items.length) {
    empty?.classList.remove('hidden');
    if (list) list.innerHTML = '';
    return;
  }
  empty?.classList.add('hidden');
  if (!list) return;

  const statusInfo = {
    submitted:  { label: 'Đã nộp',          color: 'bg-slate-100 text-slate-600' },
    reviewing:  { label: 'Đang xét duyệt',  color: 'bg-blue-100 text-blue-700' },
    interview:  { label: 'Phỏng vấn',        color: 'bg-teal-100 text-teal-700' },
    rejected:   { label: 'Không đạt',        color: 'bg-red-100 text-red-600' },
    accepted:   { label: 'Chấp nhận',        color: 'bg-teal-500 text-white' },
  };

  list.innerHTML = items.map(a => {
    const s = statusInfo[a.status] ?? { label: a.status, color: 'bg-slate-100 text-slate-600' };
    return `
    <div class="bg-white border border-slate-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-900 font-bold text-sm flex-shrink-0 overflow-hidden">
          ${a.companyLogo ? `<img src="${esc(a.companyLogo)}" class="w-full h-full object-cover"/>` : esc((a.companyName||'?')[0])}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-2">
            <div>
              <h2 class="text-sm font-bold text-blue-900 truncate">${esc(a.jobTitle)}</h2>
              <p class="text-xs text-slate-500 mt-0.5">${esc(a.companyName)}</p>
            </div>
            <span class="text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${s.color}">${s.label}</span>
          </div>
          <div class="flex flex-wrap gap-3 mt-3 text-xs text-slate-400">
            ${a.appliedAt ? `<span class="flex items-center gap-1"><span class="material-symbols-outlined text-xs">calendar_today</span>Nộp: ${fmt(a.appliedAt)}</span>` : ''}
            ${a.location ? `<span class="flex items-center gap-1"><span class="material-symbols-outlined text-xs">location_on</span>${esc(a.location)}</span>` : ''}
          </div>
        </div>
      </div>
      ${a.note ? `<p class="mt-3 text-xs text-slate-400 border-t border-slate-50 pt-3">${esc(a.note)}</p>` : ''}
    </div>`;
  }).join('');
}

function showSkeleton() {
  const list = document.getElementById('appliedList');
  if (list) list.innerHTML = [1,2,3].map(() =>
    '<div class="bg-white border border-slate-100 rounded-xl p-5 animate-pulse h-24"></div>').join('');
}

function fmt(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? '';
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
