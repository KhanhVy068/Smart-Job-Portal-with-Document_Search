import { api } from '../../api.js';

// API thật dự kiến:
// GET   /admin/settings
// PATCH /admin/settings/:section
const endpoint = '/admin/settings';

const sectionMeta = {
  general: ['Settings chung', 'Info system: site name, domain, description, logo và favicon.'],
  auth: ['Settings người dùng & xác thực', 'Quản lý đăng ký, xác thực email, social login và reset password.'],
  roles: ['Role & quyền', 'Phân quyền Admin, Employers, Users và tạo role mới.'],
  jobs: ['Settings việc làm', 'Cấu hình thời hạn job, duyệt job và giới hạn job/employer.'],
  cv: ['Settings CV / ứng tuyển', 'Cấu hình file CV, định dạng và giới hạn số CV mỗi user.'],
  email: ['Settings email', 'SMTP config và email templates.'],
  notifications: ['Settings thông báo', 'Email, in-app và push notification.'],
  storage: ['Settings lưu trữ', 'Size tải lên tối đa và lưu trữ cục bộ/đám mây.'],
  security: ['Settings bảo mật', 'Password admin, 2FA, login attempt limit và Danh sách IP cho phép.'],
  api: ['API / Tích hợp', 'Khóa API, third-party services và webhooks.'],
  system: ['Settings hệ thống', 'Job nền, cache và chế độ bảo trì.'],
  ui: ['Settings giao diện', 'Chế độ tối và theme color.']
};

const state = {
  activeSection: 'general',
  navCollapsed: false,
  settings: {}
};

export async function init() {
  bindEvents();
  activateSection('general');
  await loadSettings();
}

function bindEvents() {
  document.querySelectorAll('.settings-nav-item').forEach((button) => {
    button.addEventListener('click', () => activateSection(button.dataset.section));
  });

  document.getElementById('toggleSettingsNav')?.addEventListener('click', () => {
    state.navCollapsed = !state.navCollapsed;
    applySettingsNavState();
  });

  document.getElementById('btnReloadSettings')?.addEventListener('click', () => loadSettings());
  document.getElementById('btnSaveSettings')?.addEventListener('click', () => saveActiveSection());
  document.getElementById('settingsForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    saveActiveSection();
  });
}

async function loadSettings() {
  setText('settingsPageSubtitle', 'Loading cài đặt từ backend...');

  try {
    const payload = await api.get(endpoint);
    state.settings = normalizeSettings(payload);
    fillActiveSection();
    setText('settingsPageSubtitle', 'Settings đã được tải từ backend theo section hiện tại.');
  } catch (err) {
    console.error('Settings quản trị error:', err);
    state.settings = normalizeSettings({});
    fillActiveSection();
    setText(
      'settingsPageSubtitle',
      err?.status === 404
        ? 'Backend chưa có endpoint /admin/settings. Frontend đã sẵn sàng để nối dữ liệu thật.'
        : 'Không tải được cài đặt từ backend.'
    );
  }
}

function normalizeSettings(payload = {}) {
  return payload.settings || payload.data || payload;
}

function activateSection(section) {
  state.activeSection = section || 'general';

  document.querySelectorAll('.settings-nav-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.section === state.activeSection);
  });

  document.querySelectorAll('.settings-section').forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.panel !== state.activeSection);
  });

  const [title, description] = sectionMeta[state.activeSection] || sectionMeta.general;
  setText('settingsSectionTitle', title);
  setText('settingsSectionDescription', description);
  setText('settingsNavToggleText', state.navCollapsed ? title : 'Settings menu');
  fillActiveSection();
  applySettingsNavState();
}

function applySettingsNavState() {
  const sidebar = document.getElementById('settingsSidebar');
  const button = document.getElementById('toggleSettingsNav');
  const title = sectionMeta[state.activeSection]?.[0] || 'Current setting';

  sidebar?.classList.toggle('settings-nav-collapsed', state.navCollapsed);
  button?.setAttribute('aria-expanded', String(!state.navCollapsed));
  setText('settingsNavToggleIcon', state.navCollapsed ? 'expand_more' : 'expand_less');
  setText('settingsNavToggleText', state.navCollapsed ? title : 'Settings menu');
}

// Fill form bên phải bằng dữ liệu backend của section đang chọn.
function fillActiveSection() {
  const values = state.settings[state.activeSection] || {};
  const panel = document.querySelector(`[data-panel="${state.activeSection}"]`);
  if (!panel) return;

  panel.querySelectorAll('[data-field]').forEach((field) => {
    const value = values[field.dataset.field];
    if (field.type === 'checkbox') {
      field.checked = Boolean(value);
    } else if (value !== undefined && value !== null) {
      field.value = stringifyFieldValue(value);
    } else if (field.type !== 'color') {
      field.value = '';
    }
  });
}

async function saveActiveSection() {
  const payload = collectActiveSectionPayload();
  setSaving(true);

  try {
    await api.patch(`${endpoint}/${encodeURIComponent(state.activeSection)}`, payload);
    state.settings[state.activeSection] = payload;
    setText('settingsPageSubtitle', `Đã lưu ${sectionMeta[state.activeSection]?.[0] || 'settings'} lên backend.`);
  } catch (err) {
    console.error('Save settings error:', err);
    alert(err.message || 'Không lưu được settings.');
  } finally {
    setSaving(false);
  }
}

// Gom payload theo các input có data-field trong section hiện tại.
function collectActiveSectionPayload() {
  const panel = document.querySelector(`[data-panel="${state.activeSection}"]`);
  const payload = {};
  if (!panel) return payload;

  panel.querySelectorAll('[data-field]').forEach((field) => {
    payload[field.dataset.field] = readFieldValue(field);
  });
  return payload;
}

function readFieldValue(field) {
  if (field.type === 'checkbox') return field.checked;
  if (field.type === 'number') return field.value === '' ? null : Number(field.value);
  return field.value;
}

function stringifyFieldValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function setSaving(isSaving) {
  const button = document.getElementById('btnSaveSettings');
  if (!button) return;
  button.disabled = isSaving;
  button.classList.toggle('opacity-60', isSaving);
  setText('btnSaveSettingsText', isSaving ? 'Đang lưu...' : 'Lưu mục hiện tại');
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}














