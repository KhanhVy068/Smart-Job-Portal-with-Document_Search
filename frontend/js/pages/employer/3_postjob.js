import { api } from '../../api.js';
import { createLocalId, findLocalJob, saveLocalJob } from './jobStore.js';

let editingJobId = null;
let editingJob = null;
let isSaving = false;

// Khoi tao trang
export async function init() {
  editingJobId = sessionStorage.getItem('editJobId');
  editingJob = null;

  bindEvents();
  bindSkillEvents();

  if (editingJobId) {
    await loadEditingJob(editingJobId);
  }
}

// Gan su kien
function bindEvents() {
  document.getElementById('postJobForm')?.addEventListener('submit', event => {
    event.preventDefault();
    saveJob('active');
  });

  document.getElementById('btnPublishTop')?.addEventListener('click', () => saveJob('active'));
  document.getElementById('btnSaveDraft')?.addEventListener('click', () => saveJob('draft'));
  document.getElementById('btnCancelPostJob')?.addEventListener('click', () => {
    clearEditState();
    navigateJobs();
  });
}

// Tai tin dang sua
async function loadEditingJob(id) {
  editingJob = findLocalJob(id);

  if (!editingJob) {
    try {
      editingJob = await api.get(`/jobs/${id}`);
    } catch (err) {
      console.warn('Load edit job error:', err);
    }
  }

  if (!editingJob) {
    setMessage('Không tìm thấy tin cần sửa.', 'error');
    return;
  }

  fillForm(editingJob);
}

// Luu tin
async function saveJob(status) {
  if (isSaving) return;

  try {
    isSaving = true;
    setBusy(true);
    setMessage(status === 'draft' ? 'Đang lưu bản nháp...' : 'Đang đăng tin...', 'info');

    const payload = collectFormData(status);
    const savedJob = await persistJob(payload);

    saveLocalJob(toLocalJob(savedJob, payload));
    clearEditState();
    navigateJobs();
  } catch (err) {
    setMessage(err.message || 'Không lưu được tin tuyển dụng.', 'error');
  } finally {
    isSaving = false;
    setBusy(false);
  }
}

// Goi API
async function persistJob(payload) {
  try {
    if (editingJobId) {
      return await api.patch(`/jobs/${editingJobId}`, payload);
    }

    return await api.post('/jobs', payload);
  } catch (err) {
    console.warn('Persist job API error:', err);
    return payload;
  }
}

// Lay du lieu form
function collectFormData(status) {
  const title = getValue('jobTitle').trim();
  if (!title) throw new Error('Vui lòng nhập tiêu đề công việc.');

  const now = new Date().toISOString();
  const id = editingJobId || createLocalId();

  const salaryMin = getValue('jobSalaryMin');
  const salaryMax = getValue('jobSalaryMax');
  const deadline = getValue('jobDeadline');

  return {
    ...(editingJob || {}),
    id,
    title,
    position: getValue('jobPosition'),
    type: getValue('jobType'),
    jobType: getValue('jobType'),
    employmentType: getValue('jobType'),
    category: getValue('jobCategory'),
    specialization: getValue('jobSpecialization'),
    skills: getSkills(),
    location: getValue('jobLocation') || undefined,
    deadline: deadline || undefined,
    salaryMin: salaryMin ? Number(salaryMin) : undefined,
    salaryMax: salaryMax ? Number(salaryMax) : undefined,
    description: getValue('jobDescription'),
    requirements: getValue('jobRequirements'),
    benefits: getValue('jobBenefits'),
    status,
    count: Number(editingJob?.count ?? editingJob?.cvCount ?? editingJob?.applicationCount ?? 0),
    views: Number(editingJob?.views ?? editingJob?.viewCount ?? 0),
    createdAt: editingJob?.createdAt || now,
    updatedAt: now
  };
}

// Chuan hoa tin luu tam
function toLocalJob(savedJob, fallback) {
  return {
    ...fallback,
    ...(savedJob && typeof savedJob === 'object' ? savedJob : {}),
    id: savedJob?.id || savedJob?._id || fallback.id,
    status: fallback.status
  };
}

// Dien form
function fillForm(job) {
  setValue('jobTitle', job.title || job.name);
  setValue('jobPosition', job.position);
  setValue('jobType', job.type || job.jobType || job.employmentType);
  setValue('jobCategory', job.category);
  setValue('jobSpecialization', job.specialization);
  setValue('jobLocation', job.location);
  setValue('jobDeadline', (job.deadline || job.expiry_date || '').slice(0, 10));
  setValue('jobSalaryMin', job.salaryMin || job.salary_min || '');
  setValue('jobSalaryMax', job.salaryMax || job.salary_max || '');
  setValue('jobDescription', job.description);
  setValue('jobRequirements', job.requirements);
  setValue('jobBenefits', job.benefits);
  renderSkills(Array.isArray(job.skills) ? job.skills : []);
}

// Su kien ky nang
function bindSkillEvents() {
  const input = document.getElementById('jobSkillInput');
  if (!input) return;

  input.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addSkill(input.value);
    input.value = '';
  });

  bindRemoveSkillEvents();
}

// Them ky nang
function addSkill(skill) {
  const nextSkill = String(skill || '').trim();
  if (!nextSkill) return;

  const skills = new Set(getSkills());
  skills.add(nextSkill);
  renderSkills(Array.from(skills));
}

// Render ky nang
function renderSkills(skills) {
  const target = document.getElementById('jobSkills');
  if (!target) return;

  target.innerHTML = skills.map(skill => `
    <span data-skill="${escapeHtml(skill)}" class="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-600">
      ${escapeHtml(skill)}
      <button type="button" class="material-symbols-outlined text-sm">close</button>
    </span>
  `).join('');

  bindRemoveSkillEvents();
}

// Xoa ky nang
function bindRemoveSkillEvents() {
  document.querySelectorAll('#jobSkills button').forEach(button => {
    button.onclick = () => button.closest('[data-skill]')?.remove();
  });
}

// Lay ky nang
function getSkills() {
  const values = Array.from(document.querySelectorAll('#jobSkills [data-skill]'))
    .map(item => item.dataset.skill)
    .filter(Boolean);

  const pendingSkill = getValue('jobSkillInput').trim();
  if (pendingSkill) values.push(pendingSkill);

  return Array.from(new Set(values));
}

// Trang thai nut
function setBusy(isBusy) {
  ['btnSaveDraft', 'btnPublishTop', 'btnPublishBottom'].forEach(id => {
    const button = document.getElementById(id);
    if (button) button.disabled = isBusy;
  });
}

// Thong bao
function setMessage(message, type = 'info') {
  const target = document.getElementById('postJobMessage');
  if (!target) return;

  target.textContent = message;
  target.classList.toggle('text-red-600', type === 'error');
  target.classList.toggle('text-slate-500', type !== 'error');
}

// Dieu huong
function navigateJobs() {
  window.appRouter?.navigate('jobs') ?? (window.location.hash = '#jobs');
}

// Xoa trang thai sua
function clearEditState() {
  sessionStorage.removeItem('editJobId');
}

// Lay gia tri
function getValue(id) {
  return document.getElementById(id)?.value || '';
}

// Gan gia tri
function setValue(id, value = '') {
  const input = document.getElementById(id);
  if (input && value !== undefined && value !== null) input.value = value;
}

// Escape HTML
function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
