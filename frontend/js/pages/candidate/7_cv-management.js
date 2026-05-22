import { api } from '../../api.js';

let pendingDeleteId = null;
let refreshTimer = null;

export async function init() {
  await fetchCvs();
  setupDeleteModal();
}

async function fetchCvs() {
  if (refreshTimer) {
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  showSkeleton();
  try {
    const res = await api.get('/candidate/cv');
    const cvs = Array.isArray(res) ? res : [];
    render(cvs);
  } catch {
    document.getElementById('cvMgmtList').innerHTML =
      '<p class="text-sm text-slate-400 text-center py-8">Không thể tải danh sách CV.</p>';
  }
}

function render(cvs) {
  const empty = document.getElementById('cvMgmtEmpty');
  const list = document.getElementById('cvMgmtList');
  const count = document.getElementById('cvMgmtCount');

  if (count) count.textContent = `${cvs.length} / 5 CV`;

  if (!cvs.length) {
    empty?.classList.remove('hidden');
    if (list) list.innerHTML = '';
    return;
  }
  empty?.classList.add('hidden');
  if (!list) return;

  const statusBadge = {
    indexed:    { label: 'Đã lập chỉ mục', color: 'bg-teal-100 text-teal-700' },
    processing: { label: 'Đang xử lý',     color: 'bg-blue-100 text-blue-700' },
    pending:    { label: 'Đang xử lý',       color: 'bg-amber-100 text-amber-700' },
    completed:  { label: 'Đã trích xuất',   color: 'bg-teal-100 text-teal-700' },
    failed:     { label: 'Trích xuất thất bại', color: 'bg-red-100 text-red-600' },
    error:      { label: 'Trích xuất thất bại', color: 'bg-red-100 text-red-600' },
  };

  const hasRunningExtraction = cvs.some(cv => ['pending', 'processing'].includes(getExtractionStatus(cv)));
  if (hasRunningExtraction) refreshTimer = window.setTimeout(fetchCvs, 3500);

  list.innerHTML = cvs.map(cv => {
    const extractionStatus = getExtractionStatus(cv);
    const s = statusBadge[extractionStatus] ?? { label: extractionStatus || 'Không rõ', color: 'bg-slate-100 text-slate-600' };
    const skills = normalizeSkills(cv.extractedSkills || cv.skills);
    return `
    <div class="bg-white border border-slate-100 rounded-xl p-5 shadow-sm" data-cv-id="${cv.id}">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
          <span class="material-symbols-outlined text-blue-900 text-2xl">description</span>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-2">
            <div>
              <h2 class="text-sm font-bold text-blue-900 truncate">${esc(cv.filename || cv.name || 'CV')}</h2>
              <p class="text-xs text-slate-400 mt-0.5">${cv.uploadedAt ? fmt(cv.uploadedAt) : ''}</p>
            </div>
            <span class="text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${s.color}">${s.label}</span>
          </div>
          ${cv.size ? `<p class="text-xs text-slate-400 mt-1">${formatSize(cv.size)}</p>` : ''}
          ${cv.desiredPosition ? `<p class="mt-2 text-xs font-bold text-slate-600">CV mong muốn: ${esc(cv.desiredPosition)}</p>` : ''}
          ${skills.length ? `<div class="mt-2 flex flex-wrap gap-1.5">${skills.slice(0, 4).map(skill => `<span class="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">${esc(skill)}</span>`).join('')}</div>` : ''}
        </div>
      </div>
      <div class="flex gap-2 mt-4">
        ${cv.url ? `<a href="${esc(cv.url)}" target="_blank" rel="noopener"
          class="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all">
          <span class="material-symbols-outlined text-sm">open_in_new</span> Xem CV
        </a>` : ''}
        <button class="delete-cv-btn flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-all"
                data-cv-id="${cv.id}" data-cv-name="${esc(cv.filename || cv.name || 'CV')}">
          <span class="material-symbols-outlined text-sm">delete</span> Xóa
        </button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.delete-cv-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingDeleteId = btn.dataset.cvId;
      setText('cvDeleteName', btn.dataset.cvName);
      document.getElementById('cvDeleteModal')?.classList.remove('hidden');
    });
  });
}

function getExtractionStatus(cv = {}) {
  return String(cv.extractionStatus || cv.extraction_status || cv.status || 'pending').toLowerCase();
}

function normalizeSkills(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  const text = String(value || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {}
  return text.split(',').map(item => item.trim()).filter(Boolean);
}

function setupDeleteModal() {
  document.getElementById('cvDeleteCancel')?.addEventListener('click', () => {
    document.getElementById('cvDeleteModal')?.classList.add('hidden');
    pendingDeleteId = null;
  });

  document.getElementById('cvDeleteConfirm')?.addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    const btn = document.getElementById('cvDeleteConfirm');
    btn.disabled = true;
    btn.textContent = 'Đang xóa...';
    try {
      await api.delete(`/candidate/cv/${pendingDeleteId}`);
      document.getElementById('cvDeleteModal')?.classList.add('hidden');
      pendingDeleteId = null;
      await fetchCvs();
    } catch {
      alert('Xóa CV thất bại. Vui lòng thử lại.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Xóa CV';
    }
  });
}

function showSkeleton() {
  const list = document.getElementById('cvMgmtList');
  if (list) list.innerHTML = [1,2].map(() =>
    '<div class="bg-white border border-slate-100 rounded-xl p-5 animate-pulse h-28"></div>').join('');
}

function fmt(iso) {
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1024/1024).toFixed(1)} MB`;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? '';
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
