import { api } from '../../api.js';

export async function init() {
  const jobId = localStorage.getItem('selectedJobId');
  if (!jobId) { showError('Không tìm thấy thông tin việc làm.'); return; }
  await Promise.all([fetchJob(jobId), loadCvsForModal()]);
  setupApplyModal(jobId);
}

async function fetchJob(jobId) {
  try {
    const job = await api.get(`/jobs/${jobId}`);
    renderJob(job);
  } catch {
    showError('Không thể tải thông tin việc làm.');
  }
}

async function loadCvsForModal() {
  try {
    const res = await api.get('/candidate/cv');
    const cvs = Array.isArray(res) ? res : [];
    const sel = document.getElementById('applyCvSelect');
    if (!sel) return;
    if (!cvs.length) {
      sel.innerHTML = '<option value="">-- Chưa có CV, hãy upload trước --</option>';
      return;
    }
    sel.innerHTML = '<option value="">-- Chọn CV --</option>' +
      cvs.map(c => `<option value="${esc(c.id)}">${esc(c.filename || c.name || 'CV')}</option>`).join('');
  } catch { /* silent */ }
}

function renderJob(job) {
  const skeleton = document.getElementById('jdSkeleton');
  const content = document.getElementById('jdContent');
  if (skeleton) skeleton.classList.add('hidden');
  if (content) content.classList.remove('hidden');

  setText('jdTitle', job.title);
  setText('jdCompany', job.companyName);
  setText('jdLocation', job.location || job.company_address || job.companyAddress || 'Chưa cập nhật địa điểm');
  setText('jdSalary', job.salary);
  setText('jdType', job.jobType);
  setText('jdDeadline', job.deadline ? `Hạn nộp: ${fmt(job.deadline)}` : '');
  setText('jdCompanyCard', job.companyName);
  setText('jdCompanyIndustry', job.industry ?? '');

  const logo = document.getElementById('jdCompanyLogo');
  if (logo) {
    if (job.companyLogo) {
      logo.innerHTML = `<img src="${esc(job.companyLogo)}" class="w-full h-full object-cover"/>`;
    } else {
      logo.textContent = (job.companyName || '?')[0];
    }
  }

  const skills = document.getElementById('jdSkills');
  if (skills) {
    const items = normalizeSkills(job.skills);
    skills.innerHTML = items.length
      ? items.map(s => `<span class="text-xs font-bold px-3 py-1 bg-blue-50 text-blue-700 rounded-full">${esc(s)}</span>`).join('')
      : '<span class="text-sm font-semibold text-slate-500">Chưa cập nhật kỹ năng</span>';
  }

  setHtml('jdDescription', job.description ?? '<p class="text-slate-400">Chưa có mô tả.</p>');
  setHtml('jdRequirements', job.requirements ?? '<p class="text-slate-400">Chưa có yêu cầu.</p>');
  setHtml('jdBenefits', job.benefits ?? '<p class="text-slate-400">Chưa có thông tin.</p>');

  const saveBtn = document.getElementById('jdSaveBtn');
  if (saveBtn) {
    let saved = !!job.isSaved;
    renderSaveBtn(saveBtn, saved);
    saveBtn.addEventListener('click', () => {
      saved = !saved;
      renderSaveBtn(saveBtn, saved);
    });
  }

  if (job.isApplied) {
    document.getElementById('jdApplyBtn')?.classList.add('hidden');
    document.getElementById('jdAppliedBadge')?.classList.remove('hidden');
  }
}

function renderSaveBtn(btn, saved) {
  btn.innerHTML = saved
    ? `<span class="material-symbols-outlined text-base" style="font-variation-settings:'FILL' 1">bookmark</span> Đã lưu`
    : `<span class="material-symbols-outlined text-base">bookmark_border</span> Lưu việc`;
  btn.classList.toggle('bg-blue-900', saved);
  btn.classList.toggle('text-white', saved);
  btn.classList.toggle('bg-white', !saved);
  btn.classList.toggle('text-slate-700', !saved);
}

function setupApplyModal(jobId) {
  const modal = document.getElementById('applyModal');
  const applyBtn = document.getElementById('jdApplyBtn');
  const cancelBtn = document.getElementById('applyCancel');
  const submitBtn = document.getElementById('applySubmitBtn');

  applyBtn?.addEventListener('click', () => modal?.classList.remove('hidden'));
  cancelBtn?.addEventListener('click', () => modal?.classList.add('hidden'));
  modal?.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

  submitBtn?.addEventListener('click', async () => {
    const cvId = document.getElementById('applyCvSelect')?.value;
    const coverLetter = document.getElementById('applyCoverLetter')?.value.trim() ?? '';
    if (!cvId) { alert('Vui lòng chọn CV để ứng tuyển.'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang gửi...';
    try {
      await api.post(`/jobs/${jobId}/apply`, { cvId, coverLetter });
      modal?.classList.add('hidden');
      document.getElementById('jdApplyBtn')?.classList.add('hidden');
      document.getElementById('jdAppliedBadge')?.classList.remove('hidden');
    } catch {
      alert('Ứng tuyển thất bại. Vui lòng thử lại.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Gửi đơn ứng tuyển';
    }
  });
}

function showError(msg) {
  const skeleton = document.getElementById('jdSkeleton');
  if (skeleton) skeleton.innerHTML =
    `<div class="bg-white border border-slate-100 rounded-xl p-12 text-center text-sm text-slate-400">${msg}</div>`;
}

function fmt(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? '';
}

function setHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
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
