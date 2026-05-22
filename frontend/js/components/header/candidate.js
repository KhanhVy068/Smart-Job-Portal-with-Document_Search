import { api } from '../../api.js';

export async function initCandidateHeader() {
  await loadProfile();
  setupDropdown();
  setupNotifications();
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
  setText('candidateBrandUserName', getDisplayName(name));
  setText('candidateDropdownName', name);
  setText('candidateDropdownEmail', email);
  setText('candidateNameSidebar', name);

  renderAvatar('candidateAvatarHeader', avatar, name);
  renderAvatar('candidateMenuAvatar', avatar, name);
  renderAvatar('candidateAvatarSidebar', avatar, name);
  setupBrandLogoFallback();
}

function getDisplayName(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'Ứng viên';
}

function setupBrandLogoFallback() {
  const logo = document.querySelector('#candidateBrandLogo img');
  if (!logo || logo.dataset.fallbackBound === 'true') return;
  logo.dataset.fallbackBound = 'true';
  logo.addEventListener('error', () => {
    const wrap = document.getElementById('candidateBrandLogo');
    if (wrap) {
      wrap.innerHTML = '<span class="material-symbols-outlined text-2xl">work</span>';
    }
  });
}

function renderAvatar(id, src, name) {
  const el = document.getElementById(id);
  if (!el) return;
  if (src) {
    el.innerHTML = `<img src="${esc(toAbsoluteUploadUrl(src))}" alt="avatar" class="w-full h-full object-cover"/>`;
  } else {
    el.textContent = (name || '?')[0].toUpperCase();
  }
}

function setupNotifications() {
  const btn = document.getElementById('candidateNotificationsButton');
  if (!btn) return;
  ensureNotificationDropdown();
  loadNotifications();
  btn.addEventListener('click', async (event) => {
    event.stopPropagation();
    const dropdown = document.getElementById('candidateNotificationDropdown');
    dropdown?.classList.toggle('hidden');
    await loadNotifications();
  });
}

function ensureNotificationDropdown() {
  if (document.getElementById('candidateNotificationDropdown')) return;
  document.getElementById('candidateNotificationsButton')?.insertAdjacentHTML('afterend', `
    <div id="candidateNotificationDropdown" class="absolute right-14 top-12 hidden w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
      <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 class="text-sm font-black text-slate-950">Thông báo</h2>
        <button id="candidateMarkReadBtn" class="text-xs font-black text-blue-600" type="button">Đánh dấu đã đọc</button>
      </div>
      <div id="candidateNotificationList" class="max-h-96 overflow-auto p-2"></div>
    </div>
  `);
  document.getElementById('candidateMarkReadBtn')?.addEventListener('click', async () => {
    await api.patch('/notifications/all/read', {});
    await loadNotifications();
  });
}

async function loadNotifications() {
  try {
    const payload = await api.get('/notifications');
    const items = payload.items || payload.notifications || [];
    const badge = document.getElementById('notifBadge');
    badge?.classList.toggle('hidden', Number(payload.unread || 0) <= 0);
    const list = document.getElementById('candidateNotificationList');
    if (!list) return;
    list.innerHTML = items.length ? items.map(renderNotificationItem).join('') :
      '<p class="px-4 py-8 text-center text-sm font-semibold text-slate-400">Chưa có thông báo.</p>';
  } catch {
    const list = document.getElementById('candidateNotificationList');
    if (list) list.innerHTML = '<p class="px-4 py-8 text-center text-sm font-semibold text-slate-400">Không thể tải thông báo.</p>';
  }
}

function renderNotificationItem(item) {
  return `
    <div class="rounded-lg px-3 py-3 ${item.isRead ? 'bg-white' : 'bg-blue-50'}">
      <p class="text-sm font-black text-slate-900">${esc(item.title || 'Thông báo')}</p>
      <p class="mt-1 text-xs font-semibold leading-5 text-slate-500">${esc(item.message || '')}</p>
    </div>
  `;
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

function toAbsoluteUploadUrl(url = '') {
  if (/^https?:\/\//i.test(url)) return url;
  const apiBase = (localStorage.getItem('apiBaseUrl') || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
  return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`;
}
