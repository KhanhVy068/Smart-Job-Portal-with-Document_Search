import { api } from '../../api.js';

// Contract API dự kiến khi backend nối vào:
// GET   /employer/settings
//       -> trả về { company, account, notifications } hoặc object tương đương.
// PATCH /employer/settings/company
// PATCH /employer/settings/account
// PATCH /employer/settings/notifications
//       -> cập nhật từng nhóm cài đặt, không lưu dữ liệu giả trên frontend.
const endpoints = {
  settings: '/employer/settings',
  company: '/employer/settings/company',
  account: '/employer/settings/account',
  notifications: '/employer/settings/notifications'
};

let isLoading = false;

// Khởi tạo trang cài đặt và tải dữ liệu thật từ backend.
export function init() {
  bindEvents();
  loadSettings();
}

// Gắn sự kiện cho các form và nút tải lại.
function bindEvents() {
  document.getElementById('btnReloadSettings')?.addEventListener('click', () => {
    loadSettings();
  });

  document.getElementById('companyLogoUrl')?.addEventListener('input', (event) => {
    renderLogoPreview(event.target.value.trim());
  });

  document.getElementById('companySettingsForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveCompanySettings();
  });

  document.getElementById('accountSettingsForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveAccountSettings();
  });

  document.getElementById('notificationSettingsForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveNotificationSettings();
  });
}

// Tải dữ liệu cài đặt từ backend. Nếu endpoint chưa có, giữ form rỗng và báo rõ trạng thái.
async function loadSettings() {
  if (isLoading) return;

  isLoading = true;
  setFormDisabled(true);
  setSectionStatus('Đang tải dữ liệu cài đặt...');
  hideAlert();

  try {
    const payload = await api.get(endpoints.settings);
    const settings = normalizeSettings(payload);

    fillCompanyForm(settings.company);
    fillAccountForm(settings.account);
    fillNotificationForm(settings.notifications);
    setSectionStatus('Dữ liệu đã được tải từ backend.');
    showAlert('success', 'Đã tải cài đặt từ backend.');
  } catch (err) {
    console.error('Load settings error:', err);
    clearForms();
    setSectionStatus('Chưa có dữ liệu backend, form đang để trống.');
    showAlert('error', getLoadErrorMessage(err));
  } finally {
    isLoading = false;
    setFormDisabled(false);
  }
}

// Chuẩn hóa payload để frontend không phụ thuộc cứng vào tên field backend.
function normalizeSettings(payload = {}) {
  return {
    company: payload.company || payload.companyProfile || payload.employer || {},
    account: payload.account || payload.user || payload.profile || {},
    notifications: payload.notifications || payload.preferences || {}
  };
}

function fillCompanyForm(company = {}) {
  setInputValue('companyLogoUrl', company.logoUrl || company.logo || company.logo_url || '');
  setInputValue('companyNameInput', company.name || company.companyName || '');
  setInputValue('companyWebsiteInput', company.website || company.websiteUrl || '');
  setInputValue('companySizeInput', company.size || company.companySize || '');
  setInputValue('companyLocationInput', company.location || company.address || '');
  setInputValue('companyDescriptionInput', company.description || company.about || '');
  renderLogoPreview(company.logoUrl || company.logo || company.logo_url || '');
}

function fillAccountForm(account = {}) {
  setInputValue('contactNameInput', account.name || account.fullName || account.contactName || '');
  setInputValue('accountEmailInput', account.email || account.contactEmail || '');
  setInputValue('accountPhoneInput', account.phone || account.phoneNumber || contactPhone(account));
}

function fillNotificationForm(notifications = {}) {
  setChecked('notifyNewCandidateInput', Boolean(notifications.newCandidateEmail ?? notifications.emailNewCandidate));
  setChecked('notifyDailySummaryInput', Boolean(notifications.dailySummary ?? notifications.dailyCandidateSummary));
  setChecked('notifySystemAlertInput', Boolean(notifications.systemAlert ?? notifications.securityAlert));
}

function clearForms() {
  fillCompanyForm({});
  fillAccountForm({});
  fillNotificationForm({});
}

function contactPhone(account) {
  return account.contact?.phone || account.companyContactPhone || '';
}

// Gửi thông tin hồ sơ công ty lên backend.
async function saveCompanySettings() {
  const payload = {
    logoUrl: getInputValue('companyLogoUrl'),
    name: getInputValue('companyNameInput'),
    website: getInputValue('companyWebsiteInput'),
    size: getInputValue('companySizeInput'),
    location: getInputValue('companyLocationInput'),
    description: getInputValue('companyDescriptionInput')
  };

  await submitSettings(endpoints.company, payload, 'btnSaveCompany', 'Đã gửi hồ sơ công ty lên backend.');
}

// Gửi thông tin tài khoản người liên hệ lên backend.
async function saveAccountSettings() {
  const payload = {
    contactName: getInputValue('contactNameInput'),
    email: getInputValue('accountEmailInput'),
    phone: getInputValue('accountPhoneInput')
  };

  await submitSettings(endpoints.account, payload, 'btnSaveAccount', 'Đã gửi thông tin tài khoản lên backend.');
}

// Gửi tùy chọn thông báo lên backend.
async function saveNotificationSettings() {
  const payload = {
    newCandidateEmail: getChecked('notifyNewCandidateInput'),
    dailySummary: getChecked('notifyDailySummaryInput'),
    systemAlert: getChecked('notifySystemAlertInput')
  };

  await submitSettings(endpoints.notifications, payload, 'btnSaveNotifications', 'Đã gửi tùy chọn thông báo lên backend.');
}

async function submitSettings(url, payload, buttonId, successMessage) {
  const button = document.getElementById(buttonId);
  const originalText = button?.textContent;

  setButtonLoading(button, true);
  hideAlert();

  try {
    await api.patch(url, payload);
    showAlert('success', successMessage);
  } catch (err) {
    console.error(`Save settings error (${url}):`, err);
    showAlert('error', getSaveErrorMessage(err));
  } finally {
    setButtonLoading(button, false, originalText);
  }
}

function renderLogoPreview(url) {
  const target = document.getElementById('companyLogoPreview');
  if (!target) return;

  if (!url) {
    target.innerHTML = '<span class="material-symbols-outlined text-3xl">business</span>';
    return;
  }

  target.innerHTML = `<img class="h-full w-full rounded-xl object-cover" src="${escapeHtml(url)}" alt="Logo công ty">`;
}

function setSectionStatus(message) {
  setText('companyStatusText', message);
  setText('accountStatusText', message);
  setText('notificationStatusText', message);
}

function showAlert(type, message) {
  const alert = document.getElementById('settingsAlert');
  if (!alert) return;

  alert.className = [
    'rounded-xl border p-4 text-sm font-semibold',
    type === 'success'
      ? 'border-green-200 bg-green-50 text-green-700'
      : 'border-red-200 bg-red-50 text-red-700'
  ].join(' ');
  alert.textContent = message;
}

function hideAlert() {
  const alert = document.getElementById('settingsAlert');
  if (!alert) return;

  alert.className = 'hidden rounded-xl border p-4 text-sm font-semibold';
  alert.textContent = '';
}

function getLoadErrorMessage(err) {
  if (err?.status === 404) return 'Backend chưa có endpoint /employer/settings. Frontend không dùng dữ liệu giả nên form đang để trống.';
  return 'Không tải được cài đặt từ backend. Vui lòng kiểm tra API.';
}

function getSaveErrorMessage(err) {
  if (err?.status === 404) return 'Backend chưa có endpoint lưu cài đặt tương ứng.';
  return err?.message || 'Không lưu được cài đặt. Vui lòng kiểm tra backend.';
}

function setFormDisabled(disabled) {
  document.querySelectorAll('#companySettingsForm input, #companySettingsForm select, #companySettingsForm textarea, #companySettingsForm button, #accountSettingsForm input, #accountSettingsForm button, #notificationSettingsForm input, #notificationSettingsForm button, #btnReloadSettings')
    .forEach(element => {
      element.disabled = disabled;
    });
}

function setButtonLoading(button, isLoadingButton, originalText = '') {
  if (!button) return;

  button.disabled = isLoadingButton;
  if (isLoadingButton) {
    button.dataset.originalHtml = button.innerHTML;
    button.innerHTML = '<span class="material-symbols-outlined animate-spin text-lg">progress_activity</span> Đang lưu...';
    return;
  }

  button.innerHTML = button.dataset.originalHtml || originalText || button.innerHTML;
}

function getInputValue(id) {
  return document.getElementById(id)?.value.trim() || '';
}

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function getChecked(id) {
  return Boolean(document.getElementById(id)?.checked);
}

function setChecked(id, value) {
  const el = document.getElementById(id);
  if (el) el.checked = value;
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
