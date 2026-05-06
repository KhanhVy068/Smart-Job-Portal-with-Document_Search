import { api } from '../../api.js';
import { getUser } from '../../auth.js';

const endpoint = '/admin/me';

export function initAdminSidebar() {
  renderAdmin(getLocalAdmin());
  loadAdmin();
}

async function loadAdmin() {
  try {
    const payload = await api.get(endpoint);
    const admin = normalizeAdmin(payload);
    if (admin.name || admin.avatarUrl || admin.role) renderAdmin(admin);
  } catch (err) {
    if (err?.status !== 404) console.error('Load admin sidebar error:', err);
  }
}

function getLocalAdmin() {
  return normalizeAdmin(getUser() || {});
}

function normalizeAdmin(payload = {}) {
  if (!payload || Array.isArray(payload)) return {};

  const user = payload.user || payload.admin || payload.profile || payload.account || payload;
  return {
    name: user.fullName || user.full_name || user.name || user.username || user.email || '',
    role: user.roleLabel || user.role || 'Admin',
    avatarUrl: user.avatarUrl || user.avatar_url || user.avatar || user.photoUrl || ''
  };
}

function renderAdmin(admin) {
  setText('adminName', admin.name || 'Admin');
  setText('adminRole', formatRole(admin.role));
  renderAvatar(admin.avatarUrl, admin.name);
}

function renderAvatar(url, name = '') {
  const target = document.getElementById('adminAvatar');
  if (!target) return;

  if (url) {
    target.innerHTML = `<img class="h-full w-full object-cover" src="${escapeHtml(url)}" alt="${escapeHtml(name || 'Ảnh đại diện quản trị')}">`;
    return;
  }

  const initials = getInitials(name);
  target.innerHTML = initials
    ? escapeHtml(initials)
    : '<span class="material-symbols-outlined text-xl">admin_panel_settings</span>';
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












