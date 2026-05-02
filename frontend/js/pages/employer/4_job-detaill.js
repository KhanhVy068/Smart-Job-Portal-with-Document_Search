import { api } from '../../api.js';
import { findLocalJob, mergeJobs } from './jobStore.js';

let currentJob = null;

// Khoi tao trang
export async function init() {
  const selectedJobId = sessionStorage.getItem('selectedJobId');
  currentJob = await findJob(selectedJobId);

  if (!currentJob) {
    renderMissingJob();
    return;
  }

  renderJob(currentJob);
  bindEvents(currentJob);
}

// Tim tin tuyen dung
async function findJob(id) {
  if (!id) return null;

  const localJob = findLocalJob(id);
  if (localJob) return localJob;

  try {
    const payload = await api.get('/jobs/my');
    const jobs = mergeJobs(normalizeList(payload, ['items', 'jobs', 'data']));
    return jobs.find(job => String(job.id || job._id) === String(id)) || null;
  } catch (err) {
    console.error('Load job detail error:', err);
    return null;
  }
}

// Render chi tiet
function renderJob(job) {
  setText('jobTitle', job.title || job.name || 'Tin tuyen dung');
  setText('jobMeta', `${job.type || job.employmentType || 'Chua cap nhat'} - ${job.location || job.city || 'Chua cap nhat'}`);
  setText('jobStatus', getStatusLabel(job.status));
  setText('jobCreatedAt', formatDate(job.createdAt || job.publishedAt));
  setText('jobCandidates', formatNumber(job.count ?? job.cvCount ?? job.applicationCount ?? 0));
  setText('jobViews', formatNumber(job.views ?? job.viewCount ?? 0));
  setText('jobDescription', job.description || 'Chua cap nhat mo ta cong viec.');
  setText('jobBenefits', job.benefits || 'Chua cap nhat quyen loi.');

  renderRequirements(job.requirements);
  renderSkills(Array.isArray(job.skills) ? job.skills : []);
  renderLocation(job.location || job.city || 'Chua cap nhat');
}

// Render yeu cau
function renderRequirements(requirements) {
  const target = document.getElementById('jobRequirements');
  if (!target) return;

  const items = normalizeTextList(requirements);
  target.innerHTML = items.map(item => `
    <li class="flex gap-3">
      <span class="material-symbols-outlined text-blue-600">check_circle</span>
      ${escapeHtml(item)}
    </li>
  `).join('');
}

// Render ky nang
function renderSkills(skills) {
  const target = document.getElementById('jobSkills');
  if (!target) return;

  const items = skills.length ? skills : ['Chua cap nhat'];
  target.innerHTML = items.map(skill => `
    <span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">${escapeHtml(skill)}</span>
  `).join('');
}

// Render dia diem
function renderLocation(location) {
  const target = document.getElementById('jobLocation');
  if (!target) return;

  target.innerHTML = `
    <span class="material-symbols-outlined text-slate-400">location_on</span>
    ${escapeHtml(location)}
  `;
}

// Gan su kien
function bindEvents(job) {
  document.getElementById('btnEditJob')?.addEventListener('click', () => {
    sessionStorage.setItem('editJobId', job.id || job._id);
    window.appRouter?.navigate('post-job') ?? (window.location.hash = '#post-job');
  });

  document.querySelector('[data-route="candidates"]')?.addEventListener('click', () => {
    sessionStorage.setItem('selectedJobId', job.id || job._id);
  });
}

// Khong tim thay tin
function renderMissingJob() {
  setText('jobTitle', 'Khong tim thay tin tuyen dung');
  setText('jobMeta', 'Vui long quay lai danh sach tin va chon lai.');
  setText('jobStatus', 'Khong co du lieu');
  setText('jobCreatedAt', '--');
  setText('jobCandidates', '0');
  setText('jobViews', '0');
}

// Chuan hoa danh sach
function normalizeList(payload, keys) {
  if (Array.isArray(payload)) return payload;

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }

  return [];
}

// Chuan hoa text
function normalizeTextList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);

  const text = String(value || '').trim();
  if (!text) return ['Chua cap nhat yeu cau cong viec.'];

  return text
    .split(/\r?\n|-/)
    .map(item => item.trim())
    .filter(Boolean);
}

// Nhan trang thai
function getStatusLabel(status = '') {
  const normalized = String(status).trim().toLowerCase();
  if (['active', 'open', 'published', 'dang tuyen', 'dang hien thi'].includes(normalized)) return 'Dang tuyen';
  if (['closed', 'inactive', 'da dong'].includes(normalized)) return 'Da dong';
  return 'Nhap';
}

// Gan text
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// Dinh dang so
function formatNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN');
}

// Dinh dang ngay
function formatDate(value) {
  if (!value) return 'Chua cap nhat';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('vi-VN');
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
