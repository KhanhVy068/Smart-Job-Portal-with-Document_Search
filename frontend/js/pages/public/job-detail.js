import { api } from '../../api.js';

export async function init() {
  const id = localStorage.getItem('selectedPublicJobId') || localStorage.getItem('selectedJobId');
  if (!id) return renderError('Chưa chọn công việc.');
  try {
    renderJob(await api.get(`/jobs/${encodeURIComponent(id)}`));
  } catch {
    renderError('Không tải được chi tiết công việc.');
  }
}

function renderJob(job) {
  const el = document.getElementById('publicJobDetail');
  if (!el) return;
  const skills = normalizeSkills(job.skills);
  const location = job.location || job.company_address || job.companyAddress || 'Chưa cập nhật địa điểm';
  const companyAddress = job.company_address || job.companyAddress || location;
  el.innerHTML = `
    <div class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p class="text-sm font-black uppercase tracking-widest text-slate-400">${esc(job.companyName || 'Smart Job Portal')}</p>
        <h1 class="mt-3 text-4xl font-black tracking-tight text-blue-950">${esc(job.title)}</h1>
        <div class="mt-5 flex flex-wrap gap-3 text-sm font-bold text-slate-500">
          <span class="inline-flex items-center gap-1"><span class="material-symbols-outlined text-base">location_on</span>${esc(location)}</span>
          <span class="inline-flex items-center gap-1"><span class="material-symbols-outlined text-base">payments</span>${esc(job.salary || 'Thỏa thuận')}</span>
          <span class="rounded-full bg-blue-50 px-3 py-1 text-blue-800">${esc(job.jobType || job.type || 'Full-time')}</span>
        </div>
      </div>
      <a class="rounded-lg bg-blue-900 px-7 py-3 text-center text-sm font-black text-white shadow-lg shadow-blue-900/20" href="#login" data-route="login">Đăng nhập để ứng tuyển</a>
    </div>
    <div class="mt-10 grid gap-6 lg:grid-cols-[1fr_280px]">
      <main class="space-y-8">
        ${section('Mô tả công việc', job.description)}
        ${section('Yêu cầu', job.requirements)}
        ${section('Quyền lợi', job.benefits)}
        <section>
          <h2 class="text-xl font-black text-blue-950">Kỹ năng</h2>
          <div class="mt-4 flex flex-wrap gap-2">
            ${skills.length ? skills.map(skill => `<span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">${esc(skill)}</span>`).join('') : '<span class="text-sm font-semibold text-slate-500">Chưa cập nhật kỹ năng</span>'}
          </div>
        </section>
      </main>
      <aside class="h-fit rounded-xl border border-slate-200 bg-slate-50 p-5">
        <p class="text-xs font-black uppercase tracking-wider text-slate-400">Thông tin nhanh</p>
        <dl class="mt-4 space-y-4 text-sm">
          <div><dt class="font-black text-slate-500">Công ty</dt><dd class="mt-1 font-bold text-blue-950">${esc(job.companyName || 'Smart Job Portal')}</dd></div>
          <div><dt class="font-black text-slate-500">Địa chỉ công ty</dt><dd class="mt-1 font-bold text-blue-950">${esc(companyAddress)}</dd></div>
          <div><dt class="font-black text-slate-500">Hạn nộp</dt><dd class="mt-1 font-bold text-blue-950">${esc(job.deadline || 'Đang cập nhật')}</dd></div>
          <div><dt class="font-black text-slate-500">Trạng thái</dt><dd class="mt-1 font-bold text-emerald-700">${esc(job.status || 'open')}</dd></div>
        </dl>
      </aside>
    </div>
  `;
}

function section(title, html) {
  return `<section><h2 class="text-xl font-black text-blue-950">${title}</h2><div class="mt-4 prose max-w-none text-sm font-semibold leading-7 text-slate-600">${html || '<p>Chưa cập nhật.</p>'}</div></section>`;
}

function renderError(message) {
  const el = document.getElementById('publicJobDetail');
  if (el) el.innerHTML = `<div class="p-10 text-center text-sm font-bold text-slate-500">${message}</div>`;
}

function esc(value = '') { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

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
