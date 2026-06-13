import { api } from '../../api.js';

// Contract API dự kiến khi backend nối vào:
// GET /employer/header
// -> trả về { company, user, notifications, messages } hoặc object tương đương.
// Header không dùng dữ liệu giả; nếu backend chưa có, UI giữ trạng thái trống/đang chờ.
const endpoint = '/employer/header';
let currentHeaderData = {
  userName: '',
  userRole: '',
  userEmail: '',
  userAvatarUrl: ''
};

// Khởi tạo header sau khi component HTML đã được load vào DOM.
export function initHeader() {
  bindHeaderEvents();
  setupBrandLogoFallback();
  loadHeaderData();
}

function bindHeaderEvents() {
  document.getElementById('headerMessagesButton')?.addEventListener('click', () => {
    toggleHeaderDropdown({
      icon: 'mail',
      title: 'Tin nhắn',
      message: 'Chưa có tin nhắn mới.'
    });
  });

  document.getElementById('headerNotificationsButton')?.addEventListener('click', () => {
    toggleNotificationsDropdown();
  });

  document.getElementById('headerProfileButton')?.addEventListener('click', () => {
    toggleProfileDropdown();
  });

  document.getElementById('headerMenuNotificationsButton')?.addEventListener('click', () => {
    closeProfileDropdown();
    toggleNotificationsDropdown();
  });

  document.getElementById('headerLogoutButton')?.addEventListener('click', () => {
    logout();
  });

  document.addEventListener('click', (event) => {
    const dropdown = document.getElementById('headerDropdown');
    const profileDropdown = document.getElementById('headerProfileDropdown');
    const clickedInsideHeader = event.target.closest('#headerEl');
    if (!clickedInsideHeader) {
      dropdown?.classList.add('hidden');
      profileDropdown?.classList.add('hidden');
    }
  });
}

// Tải dữ liệu header từ backend. Không fallback sang tên, ảnh hoặc số lượng giả.
async function loadHeaderData() {
  renderLoadingState();

  try {
    const payload = await api.get(endpoint);
    const data = normalizeHeaderData(payload);
    renderHeader(data);
  } catch (err) {
    console.error('Load header error:', err);
    renderEmptyState(err);
  }
}

// Chuẩn hóa payload để frontend linh hoạt với tên field backend.
function normalizeHeaderData(payload = {}) {
  const company = payload.company || payload.companyProfile || payload.employer || {};
  const user = payload.user || payload.account || payload.profile || {};
  const notifications = payload.notifications || {};
  const messages = payload.messages || {};

  return {
    companyName: company.name || company.companyName || '',
    companyLogoUrl: company.logoUrl || company.logo || company.logo_url || '',
    userName: user.name || user.fullName || user.contactName || '',
    userRole: user.roleLabel || user.role || user.position || '',
    userEmail: user.email || user.contactEmail || '',
    userAvatarUrl: user.avatarUrl || user.avatar || user.photoUrl || '',
    unreadMessages: Number(messages.unread ?? payload.unreadMessages ?? 0),
    unreadNotifications: Number(notifications.unread ?? payload.unreadNotifications ?? 0)
  };
}

function renderLoadingState() {
  setText('headerCompanyName', 'Đang tải thông tin công ty...');
  setText('headerUserName', 'Đang tải...');
  setText('headerUserRole', 'Nhà tuyển dụng');
  renderAvatar('');
  renderMenuAvatar('', '');
  setText('headerMenuUserName', 'Đang tải...');
  setText('headerMenuUserMeta', 'Nhà tuyển dụng');
  setBadge('headerMessagesBadge', 0);
  setBadge('headerNotificationsBadge', 0);
}

function renderHeader(data) {
  currentHeaderData = data;
  setText('headerCompanyName', data.companyName || 'Chưa có thông tin công ty');
  setText('headerUserName', data.userName || 'Chưa có tên người dùng');
  setText('headerUserRole', data.userRole || 'Nhà tuyển dụng');
  setText('headerMenuUserName', data.userName || 'Chưa có tên người dùng');
  setText('headerMenuUserMeta', data.userEmail || data.userRole || 'Nhà tuyển dụng');

  renderCompanyLogo(data.companyLogoUrl);
  renderAvatar(data.userAvatarUrl, data.userName);
  renderMenuAvatar(data.userAvatarUrl, data.userName);
  setBadge('headerMessagesBadge', data.unreadMessages);
  setBadge('headerNotificationsBadge', data.unreadNotifications);
}

function renderEmptyState(err) {
  currentHeaderData = {
    userName: '',
    userRole: 'Nhà tuyển dụng',
    userEmail: '',
    userAvatarUrl: ''
  };
  const message = err?.status === 404
    ? 'Chưa có thông tin công ty'
    : 'Chưa tải được thông tin';

  setText('headerCompanyName', message);
  setText('headerUserName', 'Chưa có dữ liệu');
  setText('headerUserRole', 'Nhà tuyển dụng');
  setText('headerMenuUserName', 'Chưa có dữ liệu');
  setText('headerMenuUserMeta', 'Nhà tuyển dụng');
  renderCompanyLogo('');
  renderAvatar('');
  renderMenuAvatar('', '');
  setBadge('headerMessagesBadge', 0);
  setBadge('headerNotificationsBadge', 0);
}

function renderCompanyLogo() {
  const target = document.getElementById('headerBrandLogo');
  if (!target) return;

  target.innerHTML = '<img src="./assets/logo.png" alt="Smart Job Portal" class="h-full w-full object-cover" width="48" height="48">';
  setupBrandLogoFallback();
}

function setupBrandLogoFallback() {
  const logo = document.querySelector('#headerBrandLogo img');
  if (!logo || logo.dataset.fallbackBound === 'true') return;
  logo.dataset.fallbackBound = 'true';
  logo.addEventListener('error', () => {
    const wrap = document.getElementById('headerBrandLogo');
    if (wrap) wrap.innerHTML = '<span class="material-symbols-outlined text-2xl">work</span>';
  });
}

function renderAvatar(url, name = '') {
  const target = document.getElementById('headerAvatar');
  if (!target) return;

  if (url) {
    target.innerHTML = `<img class="h-full w-full object-cover" src="${escapeHtml(toAbsoluteUploadUrl(url))}" alt="${escapeHtml(name || 'Ảnh đại diện')}">`;
    return;
  }

  const initials = getInitials(name);
  target.innerHTML = initials
    ? escapeHtml(initials)
    : '<span class="material-symbols-outlined text-lg">person</span>';
}

function renderMenuAvatar(url, name = '') {
  const target = document.getElementById('headerMenuAvatar');
  if (!target) return;

  if (url) {
    target.innerHTML = `<img class="h-full w-full object-cover" src="${escapeHtml(toAbsoluteUploadUrl(url))}" alt="${escapeHtml(name || 'Ảnh đại diện')}">`;
    return;
  }

  const initials = getInitials(name);
  target.innerHTML = initials
    ? escapeHtml(initials)
    : '<span class="material-symbols-outlined">person</span>';
}

function setBadge(id, count) {
  const badge = document.getElementById(id);
  if (!badge) return;

  badge.classList.toggle('hidden', Number(count || 0) <= 0);
  badge.title = count > 0 ? `${count} mục chưa đọc` : '';
}

function toggleHeaderDropdown({ icon, title, message }) {
  const dropdown = document.getElementById('headerDropdown');
  const iconTarget = document.getElementById('headerDropdownIcon');

  if (!dropdown) return;

  closeProfileDropdown();

  if (iconTarget) {
    iconTarget.innerHTML = `<span class="material-symbols-outlined text-xl">${escapeHtml(icon)}</span>`;
  }
  setText('headerDropdownTitle', title);
  setText('headerDropdownMessage', message);

  dropdown.classList.remove('hidden');
}

async function toggleNotificationsDropdown() {
  const dropdown = document.getElementById('headerDropdown');
  const iconTarget = document.getElementById('headerDropdownIcon');
  if (!dropdown) return;

  closeProfileDropdown();
  if (iconTarget) iconTarget.innerHTML = '<span class="material-symbols-outlined text-xl">notifications</span>';
  setText('headerDropdownTitle', 'Thông báo');
  setText('headerDropdownMessage', 'Đang tải thông báo...');
  dropdown.classList.remove('hidden');

  try {
    const payload = await api.get('/notifications');
    const items = payload.items || payload.notifications || [];
    setBadge('headerNotificationsBadge', payload.unread || 0);
    const message = document.getElementById('headerDropdownMessage');
    if (!message) return;
    message.innerHTML = items.length ? `
      <div class="mt-2 max-h-80 space-y-2 overflow-auto">
        ${items.map(item => `
          <div class="rounded-lg ${item.isRead ? 'bg-white' : 'bg-blue-50'} p-3">
            <p class="text-sm font-black text-slate-900">${escapeHtml(item.title || 'Thông báo')}</p>
            <p class="mt-1 text-xs font-semibold leading-5 text-slate-500">${escapeHtml(item.message || '')}</p>
          </div>
        `).join('')}
      </div>
      <button id="headerMarkReadButton" class="mt-3 text-xs font-black text-blue-600" type="button">Đánh dấu đã đọc</button>
    ` : '<span class="text-sm font-semibold text-slate-500">Chưa có thông báo.</span>';
    document.getElementById('headerMarkReadButton')?.addEventListener('click', async () => {
      await api.patch('/notifications/all/read', {});
      await toggleNotificationsDropdown();
    });
  } catch {
    setText('headerDropdownMessage', 'Không thể tải thông báo.');
  }
}

function toggleProfileDropdown() {
  const dropdown = document.getElementById('headerProfileDropdown');
  const infoDropdown = document.getElementById('headerDropdown');
  if (!dropdown) return;

  infoDropdown?.classList.add('hidden');
  setText('headerMenuUserName', currentHeaderData.userName || 'Chưa có dữ liệu');
  setText('headerMenuUserMeta', currentHeaderData.userEmail || currentHeaderData.userRole || 'Nhà tuyển dụng');
  renderMenuAvatar(currentHeaderData.userAvatarUrl, currentHeaderData.userName);
  dropdown.classList.toggle('hidden');
}

function closeProfileDropdown() {
  document.getElementById('headerProfileDropdown')?.classList.add('hidden');
}

// Đăng xuất phía frontend: xóa token hiện có và quay về màn đăng nhập.
function logout() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  sessionStorage.clear();
  window.location.href = './index.html';
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

// Escape HTML để tránh chèn trực tiếp dữ liệu backend vào DOM.
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
