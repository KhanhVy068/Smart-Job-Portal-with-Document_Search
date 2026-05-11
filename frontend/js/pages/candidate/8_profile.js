import { api } from '../../api.js';

export async function init() {
  await Promise.all([loadProfile(), loadCvs()]);
}

async function loadProfile() {
  try {
    const u = await api.get('/user/profile');
    const user = u?.user || u?.data || u || {};

    const name = user.fullName || user.full_name || user.name || 'Ứng viên';
    setText('profileName', name);
    setText('profileTitle', user.title || user.jobTitle || '');
    setText('profileLocation', user.location || '');
    setText('profileEmail', user.email || '');
    setText('profilePhone', user.phone || user.phoneNumber || '');
    setText('profileBio', user.bio || user.about || 'Chưa có giới thiệu.');
    setText('profileEducation', user.education || '—');

    const expMap = { 0:'Chưa có kinh nghiệm', 1:'Dưới 1 năm', 2:'1–2 năm', 3:'2–3 năm', 5:'3–5 năm', 7:'5–7 năm', 10:'Trên 7 năm' };
    setText('profileExp', expMap[user.experience] || (user.experience ? `${user.experience} năm` : '—'));

    // Avatar
    const wrap = document.getElementById('profileAvatarWrap');
    if (wrap) {
      if (user.avatar || user.avatarUrl) {
        wrap.innerHTML = `<img src="${esc(user.avatar || user.avatarUrl)}" class="w-full h-full object-cover"/>`;
      } else {
        wrap.textContent = name[0]?.toUpperCase() ?? '?';
      }
    }

    // Skills
    const skillsEl = document.getElementById('profileSkills');
    const skills = user.skills || [];
    if (skillsEl) {
      skillsEl.innerHTML = skills.length
        ? skills.map(s => `<span class="text-xs font-bold px-3 py-1 bg-blue-50 text-blue-700 rounded-full">${esc(s)}</span>`).join('')
        : '<p class="text-sm text-slate-400">Chưa có kỹ năng nào.</p>';
    }

    // Profile strength
    const pct = user.profileStrength ?? calcStrength(user);
    setText('profileStrengthPct', `${pct}%`);
    const bar = document.getElementById('profileStrengthBar');
    if (bar) bar.style.width = `${pct}%`;

    // Toggle visibility of contact wrappers
    toggleWrap('profileLocationWrap', !!user.location);
    toggleWrap('profileEmailWrap', !!user.email);
    toggleWrap('profilePhoneWrap', !!(user.phone || user.phoneNumber));
  } catch { /* silent */ }
}

async function loadCvs() {
  const el = document.getElementById('profileCvList');
  if (!el) return;
  try {
    const res = await api.get('/candidate/cv');
    const cvs = Array.isArray(res) ? res : [];
    if (!cvs.length) {
      el.innerHTML = '<p class="text-sm text-slate-400">Chưa có CV nào.</p>';
      return;
    }
    el.innerHTML = cvs.slice(0, 3).map(cv => `
      <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
        <span class="material-symbols-outlined text-blue-900 text-xl">description</span>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-slate-700 truncate">${esc(cv.filename || cv.name || 'CV')}</p>
          ${cv.uploadedAt ? `<p class="text-xs text-slate-400">${fmt(cv.uploadedAt)}</p>` : ''}
        </div>
        ${cv.url ? `<a href="${esc(cv.url)}" target="_blank" rel="noopener"
          class="text-xs text-blue-900 hover:underline font-semibold flex-shrink-0">Xem</a>` : ''}
      </div>`).join('');
  } catch {
    el.innerHTML = '<p class="text-sm text-slate-400">Không thể tải CV.</p>';
  }
}

function calcStrength(user) {
  const fields = ['fullName','title','location','bio','skills','education','experience','phone'];
  const filled = fields.filter(f => {
    const v = user[f];
    return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length);
  }).length;
  return Math.round((filled / fields.length) * 100);
}

function toggleWrap(id, show) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('hidden', !show);
}

function fmt(iso) {
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? '';
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
