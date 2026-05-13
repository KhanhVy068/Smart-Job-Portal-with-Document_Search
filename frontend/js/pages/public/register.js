import { api } from '../../api.js';

let selectedRole = 'candidate';
let logoDataUrl = '';

export function init() {
  bindRoleButtons();
  bindPasswordToggles();
  bindLogoPreview();
  bindGoogleButton();
  document.getElementById('publicRegisterForm')?.addEventListener('submit', submit);
}

function bindRoleButtons() {
  document.querySelectorAll('.register-role').forEach((button) => {
    button.addEventListener('click', () => {
      selectedRole = button.dataset.role || 'candidate';
      renderRoleState();
    });
  });
  renderRoleState();
}

function renderRoleState() {
  document.querySelectorAll('.register-role').forEach((item) => {
    const active = item.dataset.role === selectedRole;
    item.classList.toggle('border-blue-600', active);
    item.classList.toggle('bg-blue-50', active);
    item.classList.toggle('text-blue-700', active);
    item.classList.toggle('border-slate-200', !active);
    item.classList.toggle('text-slate-700', !active);
  });

  const isEmployer = selectedRole === 'employer';
  document.getElementById('employerCompanySection')?.classList.toggle('hidden', !isEmployer);
  document.getElementById('employerVerifySection')?.classList.toggle('hidden', !isEmployer);
  ['companyNameInput', 'companyIndustryInput', 'companySizeInput', 'companyAddressInput'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.required = isEmployer;
  });
}

function bindPasswordToggles() {
  document.querySelectorAll('.toggle-password').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.target);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      button.querySelector('.material-symbols-outlined').textContent = input.type === 'password' ? 'visibility' : 'visibility_off';
    });
  });
}

function bindLogoPreview() {
  document.getElementById('companyLogoInput')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    logoDataUrl = '';
    const preview = document.getElementById('companyLogoPreview');
    preview?.classList.add('hidden');
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      showMessage('Logo chỉ chấp nhận PNG, JPG hoặc WEBP.');
      event.target.value = '';
      return;
    }
    if (file.size > 1024 * 1024) {
      showMessage('Logo tối đa 1MB để lưu nhanh trong demo.');
      event.target.value = '';
      return;
    }

    logoDataUrl = await readAsDataUrl(file);
    if (preview) {
      preview.src = logoDataUrl;
      preview.classList.remove('hidden');
    }
  });
}

function bindGoogleButton() {
  document.getElementById('googleRegisterButton')?.addEventListener('click', () => {
    showToast('Google OAuth chưa được cấu hình trong môi trường demo.', 'warning');
  });
}

async function submit(event) {
  event.preventDefault();
  clearMessage();

  const validationError = validate();
  if (validationError) {
    showMessage(validationError);
    return;
  }

  const submitButton = document.getElementById('publicRegisterSubmit');
  submitButton.disabled = true;
  submitButton.textContent = 'Đang đăng ký...';

  try {
    const payload = await api.post('/auth/register', buildPayload());
    showToast('Đăng ký thành công. Đang mở không gian làm việc...', 'success');
    finishAuth(payload);
  } catch (error) {
    showMessage(error.message || 'Không đăng ký được.');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Đăng ký';
  }
}

function buildPayload() {
  const payload = {
    full_name: value('publicRegisterName'),
    email: value('publicRegisterEmail'),
    phone: value('publicRegisterPhone'),
    password: document.getElementById('publicRegisterPassword').value,
    role: selectedRole
  };

  if (selectedRole === 'employer') {
    payload.avatarUrl = logoDataUrl || null;
    payload.company = {
      companyName: value('companyNameInput'),
      website: value('companyWebsiteInput'),
      logoUrl: logoDataUrl || null,
      industry: value('companyIndustryInput'),
      companySize: value('companySizeInput'),
      address: value('companyAddressInput'),
      description: value('companyDescriptionInput'),
      taxCode: value('taxCodeInput'),
      businessLicenseUrl: document.getElementById('businessLicenseInput')?.files?.[0]?.name || '',
      companyEmail: value('companyEmailInput')
    };
  }

  return payload;
}

function validate() {
  const email = value('publicRegisterEmail');
  const phone = value('publicRegisterPhone');
  const password = document.getElementById('publicRegisterPassword').value;
  const confirm = document.getElementById('publicRegisterConfirm').value;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Email không đúng định dạng.';
  if (!/^(0|\+84)[0-9]{9,10}$/.test(phone.replace(/\s+/g, ''))) return 'Số điện thoại không hợp lệ.';
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) return 'Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường và số.';
  if (password !== confirm) return 'Mật khẩu xác nhận không khớp.';
  if (!document.getElementById('publicRegisterTerms')?.checked) return 'Vui lòng đồng ý điều khoản sử dụng.';
  if (!document.getElementById('publicRegisterPrivacy')?.checked) return 'Vui lòng đồng ý chính sách bảo mật.';

  if (selectedRole === 'employer') {
    if (!value('companyNameInput')) return 'Vui lòng nhập tên công ty.';
    if (!value('companyIndustryInput')) return 'Vui lòng nhập lĩnh vực hoạt động.';
    if (!value('companySizeInput')) return 'Vui lòng chọn quy mô công ty.';
    if (!value('companyAddressInput')) return 'Vui lòng nhập địa chỉ công ty.';
    const companyEmail = value('companyEmailInput');
    if (companyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyEmail)) return 'Email công ty không đúng định dạng.';
    const license = document.getElementById('businessLicenseInput')?.files?.[0];
    if (license && !['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(license.type)) {
      return 'Giấy phép kinh doanh chỉ chấp nhận PDF hoặc ảnh.';
    }
  }

  return '';
}

function finishAuth(payload) {
  const token = payload.accessToken || payload.token;
  if (token) {
    localStorage.setItem('accessToken', token);
    localStorage.setItem('token', token);
  }
  localStorage.setItem('user', JSON.stringify(payload.user || {}));
  window.setTimeout(() => {
    window.location.hash = '#dashboard';
    window.location.reload();
  }, 300);
}

function value(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function showMessage(message) {
  const el = document.getElementById('publicRegisterMessage');
  if (el) el.textContent = message;
}

function clearMessage() {
  showMessage('');
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('publicToast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `fixed bottom-5 right-5 z-50 rounded-lg border px-4 py-3 text-sm font-bold shadow-xl ${
    type === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-amber-200 bg-amber-50 text-amber-700'
  }`;
  window.setTimeout(() => toast.classList.add('hidden'), 3200);
}
