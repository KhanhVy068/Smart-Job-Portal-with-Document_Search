import { api } from '../../api.js';
import { getUser } from '../../auth.js';

const endpoint = '/admin/me';
let currentAdmin = {
  name: '',
  email: '',
  role: 'Admin',
  avatarUrl: '',
  unreadNotifications: 0
};

export function initAdminHeader() {
  bindEvents();
  setupBrandLogoFallback();
  renderAdmin(normalizeAdmin(getUser() || {}));
  loadAdmin();
}

async function loadAdmin() {
  try {
    const payload = await api.get(endpoint);
    const admin = normalizeAdmin(payload);
    if (admin.name || admin.email || admin.avatarUrl || admin.unreadNotifications) renderAdmin(admin);
  } catch (err) {
    if (err?.status !== 404) console.error('Load admin header error:', err);
  }
}

function bindEvents() {
  document.getElementById('adminProfileButton')?.addEventListener('click', () => {
    closeNotifications();
    toggleProfile();
  });

  document.getElementById('adminNotificationsButton')?.addEventListener('click', () => {
    closeProfile();
    document.getElementById('adminNotificationDropdown')?.classList.toggle('hidden');
    loadNotifications();
  });

  document.getElementById('adminHeaderSearchForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const keyword = document.getElementById('adminHeaderSearch')?.value?.trim();
    if (keyword) sessionStorage.setItem('adminSearchKeyword', keyword);
  });

  document.getElementById('adminChangePasswordButton')?.addEventListener('click', () => {
    closeProfile();
    window.appRouter?.navigate('settings');
  });

  document.getElementById('adminHelpButton')?.addEventListener('click', () => {
    closeProfile();
    document.getElementById('adminNotificationMessage').textContent = 'Chưa có nội dung trợ giúp để hiển thị.';
    document.getElementById('adminNotificationDropdown')?.classList.remove('hidden');
  });

  document.getElementById('adminLogoutButton')?.addEventListener('click', logout);

  document.addEventListener('click', (event) => {
    if (!event.target.closest('#headerEl')) {
      closeProfile();
      closeNotifications();
    }
  });
}

function normalizeAdmin(payload = {}) {
  if (!payload || Array.isArray(payload)) return { role: 'Admin' };

  const user = payload.user || payload.admin || payload.profile || payload.account || payload;
  const notifications = payload.notifications || {};
  return {
    name: user.fullName || user.full_name || user.name || user.username || user.email || '',
    email: user.email || user.contactEmail || '',
    role: user.roleLabel || user.role || 'Admin',
    avatarUrl: user.avatarUrl || user.avatar_url || user.avatar || user.photoUrl || '',
    unreadNotifications: Number(notifications.unread ?? payload.unreadNotifications ?? user.unreadNotifications ?? 0)
  };
}

function renderAdmin(admin) {
  currentAdmin = { ...currentAdmin, ...admin };
  const name = currentAdmin.name || 'Admin';
  const email = currentAdmin.email || formatRole(currentAdmin.role);

  setText('adminHeaderName', name);
  setText('adminHeaderEmail', email);
  setText('adminMenuName', name);
  setText('adminMenuEmail', email);
  renderAvatar('adminHeaderAvatar', currentAdmin.avatarUrl, name);
  renderAvatar('adminMenuAvatar', currentAdmin.avatarUrl, name);
  setBadge(currentAdmin.unreadNotifications);
}

function toggleProfile() {
  const dropdown = document.getElementById('adminProfileDropdown');
  const button = document.getElementById('adminProfileButton');
  if (!dropdown) return;

  dropdown.classList.toggle('hidden');
  button?.setAttribute('aria-expanded', String(!dropdown.classList.contains('hidden')));
}

function closeProfile() {
  document.getElementById('adminProfileDropdown')?.classList.add('hidden');
  document.getElementById('adminProfileButton')?.setAttribute('aria-expanded', 'false');
}

function closeNotifications() {
  document.getElementById('adminNotificationDropdown')?.classList.add('hidden');
}

function renderAvatar(id, url, name = '') {
  const target = document.getElementById(id);
  if (!target) return;

  if (url) {
    target.innerHTML = `<img class="h-full w-full object-cover" src="${escapeHtml(toAbsoluteUploadUrl(url))}" alt="${escapeHtml(name || 'Ảnh đại diện quản trị')}">`;
    return;
  }

  const initials = getInitials(name);
  target.innerHTML = initials
    ? escapeHtml(initials)
    : '<span class="material-symbols-outlined text-lg">admin_panel_settings</span>';
}

function setBadge(count) {
  const badge = document.getElementById('adminNotificationsBadge');
  if (!badge) return;

  badge.classList.toggle('hidden', Number(count || 0) <= 0);
  badge.title = count > 0 ? `${count} unread notifications` : '';
}

function logout() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  sessionStorage.clear();
  window.location.href = './index.html';
}

function setupBrandLogoFallback() {
  const logo = document.querySelector('#adminBrandLogo img');
  if (!logo || logo.dataset.fallbackBound === 'true') return;
  logo.dataset.fallbackBound = 'true';
  logo.addEventListener('error', () => {
    const wrap = document.getElementById('adminBrandLogo');
    if (wrap) wrap.innerHTML = '<span class="material-symbols-outlined text-2xl">work</span>';
  });
}

async function loadNotifications() {
  try {
    const payload = await api.get('/notifications');
    const items = payload.items || payload.notifications || [];
    setBadge(payload.unread || 0);
    const message = document.getElementById('adminNotificationMessage');
    if (!message) return;
    message.innerHTML = items.length ? items.map(item => `
      <span class="mb-2 block rounded-lg ${item.isRead ? 'bg-white' : 'bg-blue-50'} p-3">
        <span class="block text-sm font-black text-slate-900">${escapeHtml(item.title || 'Thông báo')}</span>
        <span class="mt-1 block text-xs font-semibold leading-5 text-slate-500">${escapeHtml(item.message || '')}</span>
      </span>
    `).join('') : 'Không có thông báo mới.';
  } catch {
    setText('adminNotificationMessage', 'Không thể tải thông báo.');
  }
}

function formatRole(role = '') {
  return String(role).toLowerCase() === 'admin' ? 'Admin' : role || 'Admin';
}

function getInitials(name = '') {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map(part => part.charAt(0).toUpperCase())
    .join('');
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toAbsoluteUploadUrl(url = '') {
  if (/^https?:\/\//i.test(url)) return url;
  const apiBase = (localStorage.getItem('apiBaseUrl') || `${window.location.origin}/api`).replace(/\/api\/?$/, '');
  return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`;
}












