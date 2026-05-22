import { api } from '../../api.js';

const skills = [];

export async function init() {
  await loadProfile();
  setupAvatarUpload();
  setupSkillInput();
  setupSave();
  renderTips();
}

async function loadProfile() {
  try {
    const u = await api.get('/user/profile');
    const user = u?.user || u?.data || u || {};

    setVal('psFullName', user.fullName || user.full_name || user.name || '');
    setVal('psPhone', user.phone || user.phoneNumber || '');
    setVal('psTitle', user.title || user.jobTitle || '');
    setVal('psLocation', user.location || '');
    setVal('psBio', user.bio || user.about || '');
    setVal('psEducation', user.education || '');

    const expSel = document.getElementById('psExperience');
    if (expSel && user.experience != null) expSel.value = String(user.experience);

    // Skills
    const userSkills = user.skills || [];
    skills.length = 0;
    userSkills.forEach(s => skills.push(s));
    renderSkillTags();

    // Avatar preview
    const preview = document.getElementById('psAvatarPreview');
    if (preview) {
      if (user.avatar || user.avatarUrl) {
        preview.innerHTML = `<img src="${esc(toAbsoluteUploadUrl(user.avatar || user.avatarUrl))}" class="w-full h-full object-cover"/>`;
      } else {
        const name = user.fullName || user.name || '?';
        preview.textContent = name[0]?.toUpperCase() ?? '?';
      }
    }
  } catch { /* silent */ }
}

function setupAvatarUpload() {
  const btn = document.getElementById('psAvatarBtn');
  const input = document.getElementById('psAvatarInput');
  const preview = document.getElementById('psAvatarPreview');

  btn?.addEventListener('click', () => input?.click());
  input?.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Ảnh phải nhỏ hơn 2MB.'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      if (preview) preview.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover"/>`;
    };
    reader.readAsDataURL(file);
    const formData = new FormData();
    formData.append('avatar', file);
    try {
      const payload = await api.upload('/user/profile/avatar', formData);
      const avatarUrl = payload.avatarUrl || payload.avatar_url || payload.avatar;
      if (avatarUrl && preview) {
        preview.innerHTML = `<img src="${esc(toAbsoluteUploadUrl(avatarUrl))}" class="w-full h-full object-cover"/>`;
      }
    } catch {
      alert('Upload avatar thất bại. Vui lòng thử lại.');
    }
    input.value = '';
  });
}

function setupSkillInput() {
  const input = document.getElementById('psSkillInput');
  input?.addEventListener('input', () => {
    skills.length = 0;
    parseSkillText(input.value).forEach(skill => skills.push(skill));
  });
}

function renderSkillTags() {
  const input = document.getElementById('psSkillInput');
  if (input) input.value = skills.join('\n');

  const container = document.getElementById('psSkillTags');
  if (!container) return;
  container.innerHTML = skills.map((s, i) => `
    <span class="flex items-center gap-1.5 text-xs font-bold px-3 py-1 bg-blue-50 text-blue-700 rounded-full">
      ${esc(s)}
      <button class="remove-skill text-blue-400 hover:text-red-500 transition-all" data-idx="${i}">
        <span class="material-symbols-outlined text-xs">close</span>
      </button>
    </span>`).join('');

  container.querySelectorAll('.remove-skill').forEach(btn => {
    btn.addEventListener('click', () => {
      skills.splice(Number(btn.dataset.idx), 1);
      renderSkillTags();
    });
  });
}

function setupSave() {
  document.getElementById('psSaveBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('psSaveBtn');
    const fullName = document.getElementById('psFullName')?.value.trim();
    if (!fullName) { showError('Họ tên không được để trống.'); return; }

    hideAlerts();
    btn.disabled = true;
    btn.textContent = 'Đang lưu...';

    const payload = {
      fullName,
      phone: document.getElementById('psPhone')?.value.trim() || null,
      title: document.getElementById('psTitle')?.value.trim() || null,
      location: document.getElementById('psLocation')?.value.trim() || null,
      bio: document.getElementById('psBio')?.value.trim() || null,
      education: document.getElementById('psEducation')?.value.trim() || null,
      experience: document.getElementById('psExperience')?.value || null,
      skills: parseSkillText(document.getElementById('psSkillInput')?.value || ''),
    };

    try {
      await api.put('/user/profile', payload);
      showSuccess();
    } catch {
      showError('Cập nhật hồ sơ thất bại. Vui lòng thử lại.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Lưu thay đổi';
    }
  });
}

function renderTips() {
  const container = document.getElementById('psTipsContainer');
  if (!container) return;
  const tips = [
    { icon: 'person', text: 'Thêm ảnh đại diện để tăng độ tin cậy' },
    { icon: 'work', text: 'Điền chức danh nghề nghiệp rõ ràng' },
    { icon: 'label', text: 'Thêm ít nhất 5 kỹ năng chính' },
    { icon: 'description', text: 'Viết giới thiệu bản thân ít nhất 50 từ' },
    { icon: 'school', text: 'Điền đầy đủ thông tin học vấn' },
  ];
  container.innerHTML = tips.map(t => `
    <div class="flex items-start gap-3">
      <span class="material-symbols-outlined text-teal-700 text-base mt-0.5">${t.icon}</span>
      <p class="text-sm text-slate-600">${t.text}</p>
    </div>`).join('');
}

function showSuccess() {
  document.getElementById('psError')?.classList.add('hidden');
  document.getElementById('psSuccess')?.classList.remove('hidden');
  setTimeout(() => document.getElementById('psSuccess')?.classList.add('hidden'), 3000);
}

function showError(msg) {
  document.getElementById('psSuccess')?.classList.add('hidden');
  const err = document.getElementById('psError');
  if (err) { err.classList.remove('hidden'); }
  const errMsg = document.getElementById('psErrorMsg');
  if (errMsg) errMsg.textContent = msg;
}

function hideAlerts() {
  document.getElementById('psSuccess')?.classList.add('hidden');
  document.getElementById('psError')?.classList.add('hidden');
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? '';
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function parseSkillText(value = '') {
  return Array.from(new Set(String(value)
    .split(/[\n,;]+/)
    .map(item => item.trim())
    .filter(Boolean)));
}

function toAbsoluteUploadUrl(url = '') {
  if (/^https?:\/\//i.test(url)) return url;
  const apiBase = (localStorage.getItem('apiBaseUrl') || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
  return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`;
}
