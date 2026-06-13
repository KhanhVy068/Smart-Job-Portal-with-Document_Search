import { api } from '../../api.js';

export async function init() {
  const fallback = readSelectedCandidate();
  renderLoading(fallback);

  try {
    const id = sessionStorage.getItem('selectedApplicationId') || fallback?.applicationId || fallback?.id;
    const detail = id ? await api.get(`/applications/${encodeURIComponent(id)}`) : fallback;
    renderDetail({ ...fallback, ...normalizeDetail(detail) });
  } catch (err) {
    console.error('Load CV detail error:', err);
    if (fallback) {
      renderDetail(fallback, 'Không tải được chi tiết, đang hiển thị thông tin có sẵn.');
    } else {
      renderError(err);
    }
  }
}

function readSelectedCandidate() {
  try {
    const raw = sessionStorage.getItem('selectedCandidate');
    return raw ? normalizeDetail(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function normalizeDetail(item = {}) {
  return {
    id: item.id || item.applicationId || '',
    applicationId: item.applicationId || item.id || '',
    candidateId: item.candidateId || '',
    name: item.candidateName || item.name || item.fullName || 'Ứng viên',
    email: item.email || item.candidateEmail || '',
    phone: item.phone || item.candidatePhone || '',
    desiredPosition: item.desiredPosition || item.desired_position || item.jobTitle || item.position || 'Chưa cập nhật vị trí mong muốn',
    jobTitle: item.jobTitle || item.appliedJobTitle || '',
    companyName: item.companyName || '',
    location: item.location || '',
    status: item.extractionStatus || item.extraction_status || item.status || item.applicationStatus || item.cvStatus || item.documentStatus || 'pending',
    statusLabel: getStatusLabel(item.extractionStatus || item.extraction_status || item.status || item.applicationStatus || item.cvStatus || item.documentStatus),
    appliedAt: item.appliedAt || item.createdAt || '',
    updatedAt: item.updatedAt || '',
    fileName: item.fileName || item.cvFileName || item.name || 'CV.pdf',
    cvUrl: item.cvUrl || item.url || item.fileUrl || '',
    coverLetter: item.coverLetter || '',
    availableFrom: item.availableFrom || '',
    cvDocumentId: item.cvDocumentId || item.documentId || item.cv_document_id || '',
    extractedText: item.extractedText || '',
    score: Number(item.score ?? item.matchScore ?? item.fitScore ?? 0),
    skills: normalizeSkills(item.skills || item.extractedSkills || item.skillNames || item.tags)
  };
}

function renderLoading(fallback) {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <section class="min-h-screen bg-slate-100">
      <div class="border-b border-slate-200 bg-white px-8 py-5">
        <div class="mx-auto flex max-w-7xl items-center gap-6">
          <button class="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-blue-600" data-route="candidates" aria-label="Quay lại danh sách ứng viên">
            <span class="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <p class="text-xs font-black uppercase tracking-wider text-slate-400">Đang tải chi tiết CV</p>
            <h1 class="mt-1 text-2xl font-black tracking-tight text-slate-950">${escapeHtml(fallback?.name || 'Ứng viên')}</h1>
          </div>
        </div>
      </div>
      <div class="mx-auto max-w-7xl px-8 py-8">
        <div class="rounded-xl border border-slate-200 bg-white p-8 text-sm font-semibold text-slate-500 shadow-sm">Đang lấy dữ liệu hồ sơ ứng tuyển...</div>
      </div>
    </section>
  `;
}

function renderDetail(candidate, note = '') {
  const app = document.getElementById('app');
  if (!app) return;

  const viewUrl = getCvViewUrl(candidate);
  const embedUrl = getCvEmbedUrl(viewUrl);
  const cvPanel = candidate.cvUrl
    ? `
      ${isLegacyCloudinaryPdf(candidate.cvUrl) ? `
        <div class="border-b border-amber-200 bg-amber-50 px-6 py-4 text-sm font-semibold text-amber-800">
          File này có thể không mở được trong trình duyệt. Hãy xóa CV cũ và upload lại PDF.
        </div>
      ` : ''}
      <iframe title="CV ${escapeHtml(candidate.name)}" src="${escapeAttr(embedUrl)}" class="w-full bg-white" style="height: calc(100vh - 190px); min-height: 900px;"></iframe>
      <div class="border-t border-slate-200 bg-white px-6 py-4">
        <a href="${escapeAttr(viewUrl)}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
          <span class="material-symbols-outlined text-lg">open_in_new</span>
          Mở CV trong tab mới
        </a>
      </div>
    `
    : `
      <div class="flex min-h-[720px] flex-col items-center justify-center bg-slate-50 px-8 text-center">
        <span class="material-symbols-outlined text-6xl text-slate-300">description</span>
        <h2 class="mt-4 text-xl font-black text-slate-800">Chưa có file CV để xem</h2>
        <p class="mt-2 max-w-md text-sm font-semibold text-slate-500">Hồ sơ này chưa có đường dẫn file CV trong database.</p>
      </div>
    `;

  app.innerHTML = `
    <section class="min-h-screen bg-slate-100">
      <div class="border-b border-slate-200 bg-white px-8 py-5">
        <div class="mx-auto flex max-w-7xl items-center gap-6">
          <button class="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-blue-600" data-route="candidates" aria-label="Quay lại danh sách ứng viên">
            <span class="material-symbols-outlined">arrow_back</span>
          </button>
          <div class="min-w-0">
            <p class="text-xs font-black uppercase tracking-wider text-slate-400">Chi tiết CV ứng viên</p>
            <h1 class="mt-1 truncate text-2xl font-black tracking-tight text-slate-950">${escapeHtml(candidate.name)}</h1>
          </div>
        </div>
      </div>

      <div class="mx-auto grid max-w-[1800px] grid-cols-1 gap-6 px-6 py-6 2xl:grid-cols-[minmax(980px,1fr)_420px]">
        <section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div class="flex flex-col gap-3 border-b border-slate-200 bg-white px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div class="min-w-0">
              <p class="truncate text-sm font-black uppercase tracking-wider text-slate-500">File: ${escapeHtml(candidate.fileName)}</p>
              <p class="mt-1 text-xs font-semibold text-slate-400">Application ID: ${escapeHtml(candidate.applicationId || candidate.id || '--')}</p>
            </div>
            ${candidate.cvUrl ? `
              <a href="${escapeAttr(viewUrl)}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
                <span class="material-symbols-outlined text-lg">download</span>
                Tải CV
              </a>
            ` : ''}
          </div>
          ${cvPanel}
        </section>

        <aside class="space-y-5">
          ${note ? `<div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">${escapeHtml(note)}</div>` : ''}

          <div class="flex flex-wrap gap-3">
            <span class="inline-flex items-center gap-2 rounded-full ${getStatusClass(candidate.status)} px-5 py-3 text-sm font-black">
              <span class="material-symbols-outlined text-base">description</span>
              ${escapeHtml(candidate.statusLabel)}
            </span>
            <span class="inline-flex items-center rounded-full bg-blue-100 px-5 py-3 text-sm font-black text-blue-700">Phù hợp ${formatScore(candidate.score)}</span>
          </div>

          <div class="grid grid-cols-1 gap-4">
            ${infoCard('Họ và tên', candidate.name)}
            ${infoCard('CV mong muốn', candidate.desiredPosition)}
            ${candidate.jobTitle ? infoCard('Vị trí ứng tuyển', candidate.jobTitle) : ''}
            ${infoCard('Email', candidate.email || 'Chưa cập nhật')}
            ${infoCard('Số điện thoại', candidate.phone || 'Chưa cập nhật')}
            ${infoCard('Công ty', candidate.companyName || 'Chưa cập nhật')}
            ${infoCard('Địa điểm job', candidate.location || 'Chưa cập nhật')}
            ${infoCard('Ngày ứng tuyển', formatDateTime(candidate.appliedAt))}
          </div>

          <section class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 class="flex items-center gap-3 text-xl font-black text-slate-950">
              <span class="material-symbols-outlined text-blue-600">label</span>
              Kỹ năng / từ khóa
            </h2>
            <div class="mt-4 flex flex-wrap gap-2">
              ${candidate.skills.length ? candidate.skills.map(skill => `
                <span class="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">${escapeHtml(skill)}</span>
              `).join('') : '<span class="text-sm font-semibold text-slate-400">Chưa có kỹ năng được trích xuất.</span>'}
            </div>
          </section>

          <section class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 class="flex items-center gap-3 text-xl font-black text-slate-950">
              <span class="material-symbols-outlined text-blue-600">article</span>
              Nội dung trích xuất
            </h2>
            <p class="mt-4 max-h-72 overflow-auto whitespace-pre-line rounded-lg bg-slate-50 p-4 text-sm font-semibold leading-7 text-slate-600">
              ${escapeHtml(candidate.extractedText || candidate.coverLetter || 'Chưa có nội dung trích xuất từ CV.')}
            </p>
          </section>
        </aside>
      </div>
    </section>
  `;
}

function renderError(err) {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <section class="p-8">
      <div class="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
        <h2 class="text-lg font-bold">Không tải được chi tiết CV</h2>
        <p class="mt-2 text-sm">${escapeHtml(err?.message || 'Vui lòng quay lại danh sách ứng viên và chọn lại CV.')}</p>
        <button class="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white" data-route="candidates">Quay lại</button>
      </div>
    </section>
  `;
}

function infoCard(label, value) {
  return `
    <div class="rounded-xl border border-slate-200 bg-slate-50 p-5">
      <p class="text-xs font-black uppercase tracking-widest text-slate-400">${escapeHtml(label)}</p>
      <p class="mt-3 break-words text-base font-black text-slate-950">${escapeHtml(value || 'Chưa cập nhật')}</p>
    </div>
  `;
}

function normalizeSkills(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  const text = String(value || '').trim();
  if (!text) return [];
  return text.split(',').map(item => item.trim()).filter(Boolean);
}

function getStatusLabel(status = '') {
  const normalized = String(status).toLowerCase();
  if (['completed', 'processed', 'indexed', 'saved', 'reviewed'].includes(normalized)) return 'Đã trích xuất';
  if (['failed', 'error', 'rejected'].includes(normalized)) return 'Trích xuất thất bại';
  if (['interview', 'interviewed'].includes(normalized)) return 'Mời phỏng vấn';
  return 'Đang xử lý';
}

function getStatusClass(status = '') {
  const normalized = String(status).toLowerCase();
  if (['completed', 'processed', 'indexed', 'saved', 'reviewed'].includes(normalized)) return 'bg-green-100 text-green-700';
  if (['failed', 'error', 'rejected'].includes(normalized)) return 'bg-red-100 text-red-700';
  if (['interview', 'interviewed'].includes(normalized)) return 'bg-blue-100 text-blue-700';
  return 'bg-amber-100 text-amber-700';
}

function formatScore(score) {
  return score ? `${Math.max(0, Math.min(100, score))}%` : '--';
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa cập nhật';
  return date.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value = '') {
  return escapeHtml(value).replaceAll('`', '&#096;');
}

function isLegacyCloudinaryPdf(url = '') {
  return /res\.cloudinary\.com\/.+\/image\/upload\/.+\.pdf($|\?)/i.test(String(url));
}

function getCvViewUrl(candidate) {
  if (!candidate.cvDocumentId) return candidate.cvUrl;
  return `${getApiBaseUrl()}/documents/${encodeURIComponent(candidate.cvDocumentId)}/view`;
}

function getCvEmbedUrl(url = '') {
  const separator = String(url).includes('#') ? '&' : '#';
  return `${url}${separator}zoom=70&view=FitH&navpanes=0`;
}

function getApiBaseUrl() {
  return (localStorage.getItem('apiBaseUrl') || `${window.location.origin}/api`).replace(/\/$/, '');
}
