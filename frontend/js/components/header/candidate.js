import { api } from '../../api.js';

export async function initCandidateHeader() {
  await loadProfile();
  setupDropdown();
  setupLogout();
  setupHeaderSearch();
}

async function loadProfile() {
  try {
    const data = await api.get('/user/profile');
    const user = data?.user || data?.data || data || {};
    renderHeader(user);
  } catch {
    renderHeader({});
  }
}

function renderHeader(user) {
  const name = esc(user.fullName || user.full_name || user.name || 'Ứng viên');
  const email = esc(user.email || '');
  const avatar = user.avatar || user.avatarUrl || user.profilePicture || '';

  setText('candidateNameHeader', name);
  setText('candidateDropdownName', name);
  setText('candidateDropdownEmail', email);
  setText('candidateNameSidebar', name);

  renderAvatar('candidateAvatarHeader', avatar, name);
  renderAvatar('candidateMenuAvatar', avatar, name);
  renderAvatar('candidateAvatarSidebar', avatar, name);
}

function renderAvatar(id, src, name) {
  const el = document.getElementById(id);
  if (!el) return;
  if (src) {
    el.innerHTML = `<img src="${esc(src)}" alt="avatar" class="w-full h-full object-cover"/>`;
  } else {
    el.textContent = (name || '?')[0].toUpperCase();
  }
}

function setupDropdown() {
  const btn = document.getElementById('candidateMenuBtn');
  const menu = document.getElementById('candidateMenuDropdown');
  if (!btn || !menu) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', String(!menu.classList.contains('hidden')));
  });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('candidateMenuContainer')?.contains(e.target)) {
      menu.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

function setupLogout() {
  document.getElementById('candidateLogoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.clear();
    window.location.href = './index.html';
  });
}

function setupHeaderSearch() {
  const input = document.getElementById('headerSearchInput');
  if (!input) return;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = input.value.trim();
      if (q) window.appRouter?.navigate('job-list', { q });
    }
  });
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
