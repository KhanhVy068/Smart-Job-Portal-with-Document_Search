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
  loadHeaderData();
}

function bindHeaderEvents() {
  document.getElementById('headerMessagesButton')?.addEventListener('click', () => {
    toggleHeaderDropdown({
      icon: 'mail',
      title: 'Tin nhắn',
      message: 'Chưa có dữ liệu tin nhắn từ backend. Khi endpoint sẵn sàng, danh sách tin nhắn chưa đọc sẽ hiển thị tại đây.'
    });
  });

  document.getElementById('headerNotificationsButton')?.addEventListener('click', () => {
    toggleHeaderDropdown({
      icon: 'notifications',
      title: 'Thông báo',
      message: 'Chưa có dữ liệu thông báo từ backend. Khi endpoint sẵn sàng, các thông báo mới sẽ hiển thị tại đây.'
    });
  });

  document.getElementById('headerProfileButton')?.addEventListener('click', () => {
    toggleProfileDropdown();
  });

  document.getElementById('headerMenuNotificationsButton')?.addEventListener('click', () => {
    closeProfileDropdown();
    toggleHeaderDropdown({
      icon: 'notifications',
      title: 'Thông báo',
      message: 'Chưa có dữ liệu thông báo từ backend. Khi endpoint sẵn sàng, các thông báo mới sẽ hiển thị tại đây.'
    });
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
    ? 'Backend chưa có endpoint /employer/header'
    : 'Chưa tải được dữ liệu header';

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

function renderCompanyLogo(url) {
  const target = document.getElementById('headerBrandLogo');
  if (!target) return;

  if (!url) {
    target.innerHTML = '<span class="material-symbols-outlined text-xl">rocket_launch</span>';
    return;
  }

  target.innerHTML = `<img class="h-full w-full rounded-lg object-cover" src="${escapeHtml(url)}" alt="Logo công ty">`;
}

function renderAvatar(url, name = '') {
  const target = document.getElementById('headerAvatar');
  if (!target) return;

  if (url) {
    target.innerHTML = `<img class="h-full w-full object-cover" src="${escapeHtml(url)}" alt="${escapeHtml(name || 'Ảnh đại diện')}">`;
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
    target.innerHTML = `<img class="h-full w-full object-cover" src="${escapeHtml(url)}" alt="${escapeHtml(name || 'Ảnh đại diện')}">`;
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

// Đăng xuất phía frontend: xóa token hiện có và quay về home khách.
// Nếu backend có đường dẫn home riêng, đặt localStorage.guestHomeUrl trước khi đăng xuất.
function logout() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('token');
  sessionStorage.clear();
  window.location.href = localStorage.getItem('guestHomeUrl') || '/';
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
