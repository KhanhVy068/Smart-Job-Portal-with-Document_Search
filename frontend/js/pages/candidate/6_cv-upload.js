import { api } from '../../api.js';

let selectedFile = null;

export async function init() {
  loadCvCount();
  setupDropZone();
  setupUploadBtn();
}

async function loadCvCount() {
  try {
    const res = await api.get('/candidate/cv');
    const cvs = Array.isArray(res) ? res : [];
    setText('cvCountInfo', `Bạn đã có ${cvs.length} CV. Tối đa 5 CV.`);
  } catch { /* silent */ }
}

function setupDropZone() {
  const zone = document.getElementById('cvDropZone');
  const input = document.getElementById('cvFileInput');
  const idle = document.getElementById('dropIdle');
  const over = document.getElementById('dropOver');

  zone?.addEventListener('click', () => input?.click());
  zone?.addEventListener('dragover', e => { e.preventDefault(); idle?.classList.add('hidden'); over?.classList.remove('hidden'); });
  zone?.addEventListener('dragleave', () => { idle?.classList.remove('hidden'); over?.classList.add('hidden'); });
  zone?.addEventListener('drop', e => {
    e.preventDefault();
    idle?.classList.remove('hidden');
    over?.classList.add('hidden');
    const file = e.dataTransfer?.files[0];
    if (file) handleFile(file);
  });

  input?.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) handleFile(file);
    input.value = '';
  });

  document.getElementById('cvFileRemove')?.addEventListener('click', () => {
    selectedFile = null;
    setUploadButtonEnabled(false);
    document.getElementById('cvFilePreview')?.classList.add('hidden');
    zone?.classList.remove('hidden');
    hideAlerts();
  });
}

function handleFile(file) {
  const maxMB = 10;
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (!isPdf) {
    selectedFile = null;
    setUploadButtonEnabled(false);
    showError('Chỉ chấp nhận file PDF.');
    return;
  }
  if (file.size > maxMB * 1024 * 1024) {
    selectedFile = null;
    setUploadButtonEnabled(false);
    showError(`File phải nhỏ hơn ${maxMB}MB.`);
    return;
  }

  selectedFile = file;
  setUploadButtonEnabled(true);
  hideAlerts();

  setText('cvFileName', file.name);
  setText('cvFileSize', formatSize(file.size));

  document.getElementById('cvDropZone')?.classList.add('hidden');
  document.getElementById('cvFilePreview')?.classList.remove('hidden');
}

function setupUploadBtn() {
  document.getElementById('cvUploadBtn')?.addEventListener('click', async () => {
    if (!selectedFile) { showError('Vui lòng chọn file CV trước.'); return; }
    await uploadFile(selectedFile);
  });
}

async function uploadFile(file) {
  const btn = document.getElementById('cvUploadBtn');
  const progressWrap = document.getElementById('cvUploadProgress');
  const progressBar = document.getElementById('cvProgressBar');
  const progressPct = document.getElementById('cvProgressPct');

  hideAlerts();
  if (btn) btn.disabled = true;
  progressWrap?.classList.remove('hidden');

  // Simulate progress
  let pct = 0;
  const interval = setInterval(() => {
    pct = Math.min(pct + Math.random() * 20, 90);
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (progressPct) progressPct.textContent = `${Math.round(pct)}%`;
  }, 200);

  try {
    const formData = new FormData();
    formData.append('cv', file);
    await api.upload('/candidate/cv/upload', formData);

    clearInterval(interval);
    if (progressBar) progressBar.style.width = '100%';
    if (progressPct) progressPct.textContent = '100%';

    setTimeout(() => {
      progressWrap?.classList.add('hidden');
      document.getElementById('cvUploadSuccess')?.classList.remove('hidden');
      selectedFile = null;
      setUploadButtonEnabled(false);
      document.getElementById('cvFilePreview')?.classList.add('hidden');
      document.getElementById('cvDropZone')?.classList.remove('hidden');
      loadCvCount();
    }, 500);
  } catch {
    clearInterval(interval);
    progressWrap?.classList.add('hidden');
    showError('Upload thất bại. Vui lòng thử lại.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function setUploadButtonEnabled(enabled) {
  const btn = document.getElementById('cvUploadBtn');
  if (btn) btn.disabled = !enabled;
}

function showError(msg) {
  document.getElementById('cvUploadSuccess')?.classList.add('hidden');
  const err = document.getElementById('cvUploadError');
  if (err) { err.classList.remove('hidden'); setText('cvUploadErrorMsg', msg); }
}

function hideAlerts() {
  document.getElementById('cvUploadSuccess')?.classList.add('hidden');
  document.getElementById('cvUploadError')?.classList.add('hidden');
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
