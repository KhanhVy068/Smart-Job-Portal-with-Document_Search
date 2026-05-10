import { api } from '../../api.js';

// API thật dự kiến:
// GET    /admin/users?search=&role=&status=&page=&limit=
// POST   /admin/users
// PATCH  /admin/users/:id
// DELETE /admin/users/:id
// PATCH  /admin/users/:id/ban
// PATCH  /admin/users/:id/unban
// POST   /admin/users/:id/reset-password
// GET    /admin/users/:id
// POST   /admin/users/bulk-ban
// POST   /admin/users/bulk-delete
const endpoint = '/admin/users';

const state = {
  search: '',
  role: '',
  status: '',
  page: 1,
  limit: 10,
  total: 0,
  users: [],
  selectedIds: new Set(),
  searchTimer: null
};

export async function init() {
  bindEvents();
  renderLoading();
  await loadUsers();
}

function bindEvents() {
  document.getElementById('userSearchInput')?.addEventListener('input', (event) => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      state.search = event.target.value.trim();
      state.page = 1;
      loadUsers();
    }, 250);
  });

  document.getElementById('roleFilter')?.addEventListener('change', (event) => {
    state.role = event.target.value;
    state.page = 1;
    loadUsers();
  });

  document.getElementById('statusFilter')?.addEventListener('change', (event) => {
    state.status = event.target.value;
    state.page = 1;
    loadUsers();
  });

  document.getElementById('itemsPerPage')?.addEventListener('change', (event) => {
    state.limit = Number(event.target.value) || 10;
    state.page = 1;
    loadUsers();
  });

  document.getElementById('btnReloadUsers')?.addEventListener('click', () => loadUsers());
  document.getElementById('btnAddUsers')?.addEventListener('click', openCreateModal);
  document.getElementById('userForm')?.addEventListener('submit', saveUsers);
  document.querySelectorAll('.closeUsersModal').forEach((button) => button.addEventListener('click', closeUsersModal));
  document.querySelectorAll('.closeUsersDetailModal').forEach((button) => button.addEventListener('click', closeDetailModal));

  document.getElementById('selectAllUsers')?.addEventListener('change', (event) => {
    if (event.target.checked) {
      state.users.forEach((user) => state.selectedIds.add(String(user.id)));
    } else {
      state.selectedIds.clear();
    }
    renderUsersTable();
    renderBulkBar();
  });

  document.getElementById('btnBulkBan')?.addEventListener('click', () => bulkAction('ban'));
  document.getElementById('btnBulkDelete')?.addEventListener('click', () => bulkAction('delete'));

  document.getElementById('adminUsersPage')?.addEventListener('click', handleTableActions);
}

async function loadUsers() {
  setText('usersPageSubtitle', 'Loading danh sách người dùng từ backend...');
  renderLoading();

  try {
    const payload = await api.get(`${endpoint}?${buildQuery()}`);
    const data = normalizeUsersResponse(payload);
    state.users = data.users;
    state.total = data.total;
    state.selectedIds.clear();
    renderUsersPage(data);
    setText('usersPageSubtitle', 'Dữ liệu người dùng được tải theo tìm kiếm, bộ lọc và phân trang hiện tại.');
  } catch (err) {
    console.error('Admin users error:', err);
    state.users = [];
    state.total = 0;
    state.selectedIds.clear();
    renderUsersPage(normalizeUsersResponse({}));
    setText(
      'usersPageSubtitle',
      err?.status === 404
        ? 'Backend chưa có endpoint /admin/users. Frontend đã sẵn sàng để nối dữ liệu thật.'
        : 'Không tải được danh sách người dùng từ backend.'
    );
  }
}

function renderLoading() {
  renderList('usersTableBody', '<tr><td class="px-4 py-8 text-center text-sm font-bold text-slate-400" colspan="8">Loading danh sách người dùng...</td></tr>');
}

function normalizeUsersResponse(payload = {}) {
  const users = normalizeArray(payload.users || payload.items || payload.data).map(normalizeUsers);
  const stats = payload.stats || payload.summary || {};

  return {
    users,
    total: Number(payload.total ?? payload.totalUsers ?? users.length) || 0,
    page: Number(payload.page ?? state.page) || state.page,
    limit: Number(payload.limit ?? state.limit) || state.limit,
    stats: {
      totalUsers: Number(stats.totalUsers ?? payload.totalUsers ?? payload.total ?? users.length) || 0,
      newToday: Number(stats.newToday ?? stats.newUsersToday ?? payload.newToday) || 0,
      activeUsers: Number(stats.activeUsers ?? payload.activeUsers) || 0
    }
  };
}

function normalizeUsers(user = {}) {
  return {
    id: String(user.id || user._id || user.userId || ''),
    name: user.fullName || user.full_name || user.name || user.username || user.email || '',
    email: user.email || '',
    role: normalizeRole(user.role || user.type || 'user'),
    status: normalizeStatus(user.status || user.state || (user.isBanned ? 'banned' : 'active')),
    avatarUrl: user.avatarUrl || user.avatar_url || user.avatar || user.photoUrl || '',
    createdAt: user.createdAt || user.created_at || user.createdDate || '',
    raw: user
  };
}

function renderUsersPage(data) {
  renderStats(data.stats);
  renderUsersTable();
  renderPagination();
  renderBulkBar();
}

// Render analytics nhẹ ở đầu trang.
function renderStats(stats) {
  setText('statTotalUsers', formatNumber(stats.totalUsers));
  setText('statNewToday', formatNumber(stats.newToday));
  setText('statActiveUsers', formatNumber(stats.activeUsers));
}

// Render bảng chính: avatar, name, email, role, status, created date, actions.
function renderUsersTable() {
  const selectAll = document.getElementById('selectAllUsers');
  if (selectAll) {
    selectAll.checked = state.users.length > 0 && state.users.every((user) => state.selectedIds.has(String(user.id)));
    selectAll.indeterminate = state.users.some((user) => state.selectedIds.has(String(user.id))) && !selectAll.checked;
  }

  if (!state.users.length) {
    renderList('usersTableBody', '<tr><td class="px-4 py-8 text-center text-sm font-bold text-slate-400" colspan="8">Chưa có user phù hợp với bộ lọc hiện tại.</td></tr>');
    return;
  }

  renderList('usersTableBody', state.users.map((user) => `
    <tr class="transition-colors hover:bg-slate-50">
      <td class="px-4 py-4">
        <input class="userRowCheckbox h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" type="checkbox" data-id="${escapeHtml(user.id)}" ${state.selectedIds.has(String(user.id)) ? 'checked' : ''} aria-label="Chọn user ${escapeHtml(user.name)}">
      </td>
      <td class="px-4 py-4">${renderAvatar(user)}</td>
      <td class="px-4 py-4">
        <button class="max-w-48 truncate text-left text-sm font-black text-slate-950 hover:text-blue-600" type="button" data-action="view" data-id="${escapeHtml(user.id)}">${escapeHtml(user.name || '--')}</button>
      </td>
      <td class="px-4 py-4 text-sm font-semibold text-slate-500">${escapeHtml(user.email || '--')}</td>
      <td class="px-4 py-4">${roleBadge(user.role)}</td>
      <td class="px-4 py-4">${statusBadge(user.status)}</td>
      <td class="px-4 py-4 text-sm font-semibold text-slate-500">${escapeHtml(formatDate(user.createdAt))}</td>
      <td class="px-4 py-4">
        <div class="flex items-center justify-end gap-1">
          ${actionButton('view', user.id, 'visibility', 'View chi tiết')}
          ${actionButton('edit', user.id, 'edit', 'Sửa')}
          ${actionButton(user.status === 'banned' ? 'unban' : 'ban', user.id, user.status === 'banned' ? 'lock_open' : 'block', user.status === 'banned' ? 'Bỏ ban' : 'Cấm')}
          ${actionButton('reset-password', user.id, 'key', 'Reset mật khẩu')}
          ${actionButton('delete', user.id, 'delete', 'Xóa', 'text-red-600 hover:bg-red-50')}
        </div>
      </td>
    </tr>
  `).join(''));
}

function renderPagination() {
  const totalPages = Math.max(Math.ceil(state.total / state.limit), 1);
  const start = state.total === 0 ? 0 : (state.page - 1) * state.limit + 1;
  const end = Math.min(state.page * state.limit, state.total);
  setText('paginationSummary', `${start}-${end} / ${formatNumber(state.total)} users`);

  const pages = buildPageList(totalPages);
  const buttons = [
    pageButton('prev', 'chevron_left', state.page <= 1),
    ...pages.map((page) => typeof page === 'number' ? pageNumberButton(page) : `<span class="px-2 text-sm font-black text-slate-400">...</span>`),
    pageButton('next', 'chevron_right', state.page >= totalPages)
  ];
  renderList('paginationButtons', buttons.join(''));
}

function renderBulkBar() {
  const count = state.selectedIds.size;
  const bar = document.getElementById('bulkActionBar');
  setText('selectedUsersCount', String(count));
  bar?.classList.toggle('hidden', count === 0);
  bar?.classList.toggle('flex', count > 0);
}

function handleTableActions(event) {
  const checkbox = event.target.closest('.userRowCheckbox');
  if (checkbox) {
    const id = String(checkbox.dataset.id);
    if (checkbox.checked) state.selectedIds.add(id);
    else state.selectedIds.delete(id);
    renderUsersTable();
    renderBulkBar();
    return;
  }

  const actionTarget = event.target.closest('[data-action]');
  if (!actionTarget) return;

  const action = actionTarget.dataset.action;
  if (action === 'prev' && state.page > 1) {
    state.page -= 1;
    loadUsers();
    return;
  }
  if (action === 'next') {
    state.page += 1;
    loadUsers();
    return;
  }
  if (action === 'page') {
    state.page = Number(actionTarget.dataset.page) || 1;
    loadUsers();
    return;
  }

  const id = actionTarget.dataset.id;
  const user = state.users.find((item) => String(item.id) === String(id));
  if (!user) return;

  if (action === 'view') openDetailModal(user);
  if (action === 'edit') openEditModal(user);
  if (action === 'delete') deleteUsers(user);
  if (action === 'ban') updateUsersStatus(user, 'banned');
  if (action === 'unban') updateUsersStatus(user, 'active');
  if (action === 'reset-password') resetPassword(user);
}

function openCreateModal() {
  setText('userFormTitle', 'Add User');
  document.getElementById('userForm')?.reset();
  setValue('userIdInput', '');
  document.getElementById('passwordCreateField')?.classList.remove('hidden');
  document.getElementById('userFormModal')?.classList.remove('hidden');
  document.getElementById('userFormModal')?.classList.add('flex');
}

function openEditModal(user) {
  setText('userFormTitle', 'Edit người dùng');
  setValue('userIdInput', user.id);
  setValue('userNameInput', user.name);
  setValue('userEmailInput', user.email);
  setValue('userRoleInput', user.role);
  setValue('userStatusInput', user.status);
  setValue('userAvatarInput', user.avatarUrl);
  setValue('userPasswordInput', '');
  document.getElementById('passwordCreateField')?.classList.add('hidden');
  document.getElementById('userFormModal')?.classList.remove('hidden');
  document.getElementById('userFormModal')?.classList.add('flex');
}

function closeUsersModal() {
  document.getElementById('userFormModal')?.classList.add('hidden');
  document.getElementById('userFormModal')?.classList.remove('flex');
}

async function saveUsers(event) {
  event.preventDefault();
  const id = document.getElementById('userIdInput')?.value;
  const payload = {
    fullName: document.getElementById('userNameInput')?.value?.trim(),
    email: document.getElementById('userEmailInput')?.value?.trim(),
    role: document.getElementById('userRoleInput')?.value,
    status: document.getElementById('userStatusInput')?.value,
    avatarUrl: document.getElementById('userAvatarInput')?.value?.trim()
  };

  const password = document.getElementById('userPasswordInput')?.value;
  if (!id && password) payload.password = password;

  try {
    if (id) await api.patch(`${endpoint}/${encodeURIComponent(id)}`, payload);
    else await api.post(endpoint, payload);
    closeUsersModal();
    await loadUsers();
  } catch (err) {
    console.error('Save user error:', err);
    alert(err.message || 'Không lưu được user.');
  }
}

async function openDetailModal(user) {
  const modal = document.getElementById('userDetailModal');
  const content = document.getElementById('userDetailContent');
  if (!modal || !content) return;

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  content.innerHTML = loadingBlock('Loading chi tiết người dùng...');

  try {
    const payload = await api.get(`${endpoint}/${encodeURIComponent(user.id)}`);
    renderUsersDetail(normalizeUsersDetail(payload, user));
  } catch (err) {
    if (err?.status !== 404) console.error('Load user detail error:', err);
    renderUsersDetail(normalizeUsersDetail({}, user));
  }
}

function renderUsersDetail(detail) {
  renderList('userDetailContent', `
    <div class="space-y-5">
      <div class="flex items-center gap-4 rounded-lg bg-slate-50 p-4">
        ${renderAvatar(detail.user, 'h-14 w-14 text-base')}
        <div class="min-w-0">
          <p class="truncate text-xl font-black text-slate-950">${escapeHtml(detail.user.name || '--')}</p>
          <p class="mt-1 truncate text-sm font-semibold text-slate-500">${escapeHtml(detail.user.email || '--')}</p>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div class="rounded-lg border border-slate-200 p-4">
          <p class="text-xs font-black uppercase tracking-wider text-slate-400">Role</p>
          <div class="mt-3">${roleBadge(detail.user.role)}</div>
        </div>
        <div class="rounded-lg border border-slate-200 p-4">
          <p class="text-xs font-black uppercase tracking-wider text-slate-400">Status</p>
          <div class="mt-3">${statusBadge(detail.user.status)}</div>
        </div>
        <div class="rounded-lg border border-slate-200 p-4">
          <p class="text-xs font-black uppercase tracking-wider text-slate-400">Created Date</p>
          <p class="mt-3 text-sm font-black text-slate-950">${escapeHtml(formatDate(detail.user.createdAt))}</p>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
        ${detailSection('Lịch sử hoạt động', detail.activities)}
        ${detailSection('Job posted', detail.jobs)}
        ${detailSection('CV / Profile ứng tuyển', detail.applications)}
      </div>
    </div>
  `);
}

function normalizeUsersDetail(payload = {}, fallbackUsers) {
  const user = normalizeUsers(payload.user || payload.profile || payload.account || fallbackUsers.raw || fallbackUsers);
  return {
    user,
    activities: normalizeArray(payload.activities || payload.activityLog),
    jobs: normalizeArray(payload.jobs || payload.postedJobs),
    applications: normalizeArray(payload.applications || payload.cvs || payload.documents)
  };
}

function closeDetailModal() {
  document.getElementById('userDetailModal')?.classList.add('hidden');
  document.getElementById('userDetailModal')?.classList.remove('flex');
}

async function deleteUsers(user) {
  if (!confirm(`Delete user ${user.name || user.email}?`)) return;
  try {
    await api.delete(`${endpoint}/${encodeURIComponent(user.id)}`);
    await loadUsers();
  } catch (err) {
    console.error('Delete user error:', err);
    alert(err.message || 'Không xóa được user.');
  }
}

async function updateUsersStatus(user, nextStatus) {
  const action = nextStatus === 'banned' ? 'ban' : 'unban';
  try {
    await api.patch(`${endpoint}/${encodeURIComponent(user.id)}/${action}`, {});
    await loadUsers();
  } catch (err) {
    console.error('Update user status error:', err);
    alert(err.message || 'Không cập nhật được trạng thái user.');
  }
}

async function resetPassword(user) {
  if (!confirm(`Reset mật khẩu cho ${user.name || user.email}?`)) return;
  try {
    await api.post(`${endpoint}/${encodeURIComponent(user.id)}/reset-password`, {});
    alert('Đã gửi yêu cầu reset password.');
  } catch (err) {
    console.error('Reset mật khẩu error:', err);
    alert(err.message || 'Không reset được password.');
  }
}

async function bulkAction(action) {
  const ids = Array.from(state.selectedIds);
  if (!ids.length) return;
  const label = action === 'delete' ? 'delete' : 'ban';
  if (!confirm(`${label} ${ids.length} user đã chọn?`)) return;

  try {
    const url = action === 'delete' ? `${endpoint}/bulk-delete` : `${endpoint}/bulk-ban`;
    await api.post(url, { ids });
    await loadUsers();
  } catch (err) {
    console.error('Bulk action error:', err);
    alert(err.message || 'Không thực hiện được bulk action.');
  }
}

function buildQuery() {
  const params = new URLSearchParams();
  if (state.search) params.set('search', state.search);
  if (state.role) params.set('role', state.role);
  if (state.status) params.set('status', state.status);
  params.set('page', String(state.page));
  params.set('limit', String(state.limit));
  return params.toString();
}

function renderAvatar(user, sizeClass = 'h-10 w-10 text-sm') {
  if (user.avatarUrl) {
    return `<img class="${sizeClass} rounded-full object-cover" src="${escapeHtml(user.avatarUrl)}" alt="${escapeHtml(user.name || 'Users avatar')}">`;
  }

  return `<div class="flex ${sizeClass} items-center justify-center rounded-full bg-slate-100 font-black text-slate-600">${escapeHtml(getInitials(user.name || user.email))}</div>`;
}

function roleBadge(role) {
  const label = roleLabel(role);
  const tone = role === 'admin'
    ? 'bg-violet-50 text-violet-700'
    : role === 'employer'
      ? 'bg-cyan-50 text-cyan-700'
      : 'bg-blue-50 text-blue-700';
  return `<span class="rounded-full ${tone} px-3 py-1 text-xs font-black">${escapeHtml(label)}</span>`;
}

function statusBadge(status) {
  const normalized = normalizeStatus(status);
  const tone = normalized === 'active'
    ? 'bg-emerald-50 text-emerald-700'
    : normalized === 'banned'
      ? 'bg-red-50 text-red-700'
      : 'bg-amber-50 text-amber-700';
  const icon = normalized === 'active' ? '●' : normalized === 'banned' ? '●' : '●';
  return `<span class="rounded-full ${tone} px-3 py-1 text-xs font-black">${icon} ${escapeHtml(statusLabel(normalized))}</span>`;
}

function actionButton(action, id, icon, label, extraClass = 'text-slate-500 hover:bg-slate-100 hover:text-slate-950') {
  return `
    <button class="flex h-9 w-9 items-center justify-center rounded-lg ${extraClass}" type="button" data-action="${escapeHtml(action)}" data-id="${escapeHtml(id)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
      <span class="material-symbols-outlined text-xl">${escapeHtml(icon)}</span>
    </button>
  `;
}

function pageButton(action, icon, disabled) {
  return `
    <button class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" type="button" data-action="${action}" ${disabled ? 'disabled' : ''}>
      <span class="material-symbols-outlined text-xl">${icon}</span>
    </button>
  `;
}

function pageNumberButton(page) {
  const active = page === state.page;
  return `<button class="h-9 min-w-9 rounded-lg px-3 text-sm font-black ${active ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}" type="button" data-action="page" data-page="${page}">${page}</button>`;
}

function buildPageList(totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const pages = [1];
  const start = Math.max(2, state.page - 1);
  const end = Math.min(totalPages - 1, state.page + 1);
  if (start > 2) pages.push('...');
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < totalPages - 1) pages.push('...');
  pages.push(totalPages);
  return pages;
}

function detailSection(title, items) {
  const body = items.length
    ? items.slice(0, 6).map((item) => `
      <div class="rounded-lg bg-slate-50 p-3">
        <p class="truncate text-sm font-black text-slate-950">${escapeHtml(item.title || item.name || item.action || item.fileName || 'Item')}</p>
        <p class="mt-1 truncate text-xs font-bold text-slate-400">${escapeHtml(item.status || item.createdAt || item.description || '--')}</p>
      </div>
    `).join('')
    : '<p class="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-400">Chưa có dữ liệu.</p>';

  return `
    <section class="min-w-0 rounded-lg border border-slate-200 p-4">
      <h3 class="text-sm font-black text-slate-950">${escapeHtml(title)}</h3>
      <div class="mt-3 space-y-2">${body}</div>
    </section>
  `;
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function normalizeRole(role = '') {
  const normalized = String(role).toLowerCase();
  if (normalized === 'candidate') return 'user';
  if (['user', 'employer', 'admin'].includes(normalized)) return normalized;
  return 'user';
}

function normalizeStatus(status = '') {
  const normalized = String(status).toLowerCase();
  if (['banned', 'ban', 'blocked', 'disabled'].includes(normalized)) return 'banned';
  if (['pending', 'waiting', 'unverified'].includes(normalized)) return 'pending';
  return 'active';
}

function roleLabel(role) {
  if (role === 'admin') return 'Admin';
  if (role === 'employer') return 'Employers';
  return 'Users';
}

function statusLabel(status) {
  if (status === 'banned') return 'Banned';
  if (status === 'pending') return 'Pending';
  return 'Active';
}

function getInitials(name = '') {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'U';
}

function formatDate(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US') : '--';
}

function loadingBlock(message) {
  return `<p class="rounded-lg bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">${escapeHtml(message)}</p>`;
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value || '';
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderList(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}














