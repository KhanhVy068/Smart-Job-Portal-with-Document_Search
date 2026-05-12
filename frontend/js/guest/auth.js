import { api } from '../api.js';

const BASE = location.origin;

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('identifier')) initLogin();
  else if (document.getElementById('full_name')) initRegister();
  else if (document.querySelector('form #email') && !document.getElementById('identifier') && !document.getElementById('full_name')) initForgot();
});

// ── Login ────────────────────────────────────────────────────────────────────

function initLogin() {
  // Role tab toggle
  const btnCandidate = document.getElementById('role-candidate');
  const btnEmployer = document.getElementById('role-employer');
  let selectedRole = 'candidate';

  const activeClass = ['bg-primary', 'text-white', 'shadow-sm'];
  const inactiveClass = ['text-on-surface-variant', 'hover:bg-surface-variant/50'];

  function setRole(role) {
    selectedRole = role;
    if (role === 'candidate') {
      btnCandidate?.classList.add(...activeClass);
      btnCandidate?.classList.remove(...inactiveClass);
      btnEmployer?.classList.remove(...activeClass);
      btnEmployer?.classList.add(...inactiveClass);
    } else {
      btnEmployer?.classList.add(...activeClass);
      btnEmployer?.classList.remove(...inactiveClass);
      btnCandidate?.classList.remove(...activeClass);
      btnCandidate?.classList.add(...inactiveClass);
    }
  }

  btnCandidate?.addEventListener('click', () => setRole('candidate'));
  btnEmployer?.addEventListener('click', () => setRole('employer'));

  // Password visibility
  document.querySelector('.absolute.right-4')?.addEventListener('click', function () {
    const input = document.getElementById('password');
    if (!input) return;
    const icon = this.querySelector('.material-symbols-outlined');
    if (input.type === 'password') {
      input.type = 'text';
      if (icon) icon.textContent = 'visibility_off';
    } else {
      input.type = 'password';
      if (icon) icon.textContent = 'visibility';
    }
  });

  // Forgot password link
  document.querySelector('a[href="#"]')?.addEventListener('click', e => {
    e.preventDefault();
    window.location.href = '6_Forgot-Password.html';
  });

  // Register link
  const links = document.querySelectorAll('a[href="#"]');
  links.forEach(a => {
    if (a.textContent.trim().includes('Đăng ký')) {
      a.addEventListener('click', e => { e.preventDefault(); window.location.href = '5_Register.html'; });
    }
  });

  // Form submit
  const form = document.querySelector('form');
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const identifier = document.getElementById('identifier')?.value.trim();
    const password = document.getElementById('password')?.value;
    if (!identifier || !password) { showAlert(form, 'Vui lòng nhập đầy đủ thông tin.', 'error'); return; }

    const submitBtn = form.querySelector('[type="submit"]');
    const origText = submitBtn?.textContent;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Đang đăng nhập...'; }
    removeAlert(form);

    try {
      const res = await api.post('/auth/login', { identifier, password, role: selectedRole });
      const token = res?.accessToken || res?.token || res?.access_token;
      const role = res?.role || res?.user?.role || selectedRole;
      if (!token) throw new Error('Không nhận được token từ server.');
      localStorage.setItem('accessToken', token);
      localStorage.setItem('role', role);
      if (res?.user) localStorage.setItem('user', JSON.stringify(res.user));
      redirectByRole(role);
    } catch (err) {
      showAlert(form, err?.message || 'Đăng nhập thất bại. Kiểm tra lại thông tin.', 'error');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = origText; }
    }
  });
}

// ── Register ─────────────────────────────────────────────────────────────────

function initRegister() {
  // Login link
  document.querySelectorAll('a[href="#"]').forEach(a => {
    if (a.textContent.trim().includes('Đăng nhập')) {
      a.addEventListener('click', e => { e.preventDefault(); window.location.href = '4_Login.html'; });
    }
  });

  const form = document.querySelector('form');
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const fullName = document.getElementById('full_name')?.value.trim();
    const email = document.getElementById('email')?.value.trim();
    const password = document.getElementById('password')?.value;
    const confirm = document.getElementById('confirm_password')?.value;
    const role = document.querySelector('input[name="role"]:checked')?.value ?? 'candidate';
    const terms = document.getElementById('terms')?.checked;

    if (!fullName || !email || !password) { showAlert(form, 'Vui lòng điền đầy đủ thông tin.', 'error'); return; }
    if (password.length < 8) { showAlert(form, 'Mật khẩu phải có ít nhất 8 ký tự.', 'error'); return; }
    if (password !== confirm) { showAlert(form, 'Mật khẩu xác nhận không khớp.', 'error'); return; }
    if (!terms) { showAlert(form, 'Bạn cần đồng ý với điều khoản dịch vụ.', 'error'); return; }

    const btn = form.querySelector('[type="submit"]');
    const orig = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Đang tạo tài khoản...'; }
    removeAlert(form);

    try {
      await api.post('/auth/register', { fullName, email, password, role });
      showAlert(form, 'Đăng ký thành công! Đang chuyển đến trang đăng nhập...', 'success');
      setTimeout(() => { window.location.href = '4_Login.html'; }, 1500);
    } catch (err) {
      showAlert(form, err?.message || 'Đăng ký thất bại. Email có thể đã được sử dụng.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = orig; }
    }
  });
}

// ── Forgot Password ───────────────────────────────────────────────────────────

function initForgot() {
  document.querySelector('a[href="/login"]')?.addEventListener('click', e => {
    e.preventDefault();
    window.location.href = '4_Login.html';
  });

  const form = document.querySelector('form');
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('email')?.value.trim();
    if (!email) { showAlert(form, 'Vui lòng nhập địa chỉ email.', 'error'); return; }

    const btn = form.querySelector('[type="submit"]');
    const orig = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Đang gửi...'; }
    removeAlert(form);

    try {
      await api.post('/auth/forgot-password', { email });
      showAlert(form, 'Liên kết đặt lại mật khẩu đã được gửi đến email của bạn.', 'success');
      if (btn) btn.textContent = 'Đã gửi';
    } catch (err) {
      showAlert(form, err?.message || 'Không thể gửi email. Vui lòng thử lại.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = orig; }
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function redirectByRole(role) {
  if (role === 'admin') { window.location.href = `${BASE}/index.html#admin`; return; }
  if (role === 'employer') { window.location.href = `${BASE}/index.html#employer`; return; }
  window.location.href = `${BASE}/index.html#candidate`;
}

function showAlert(form, msg, type) {
  removeAlert(form);
  const div = document.createElement('div');
  div.id = 'auth-alert';
  div.className = type === 'success'
    ? 'p-3 rounded-xl text-sm font-semibold bg-teal-50 border border-teal-200 text-teal-700'
    : 'p-3 rounded-xl text-sm font-semibold bg-red-50 border border-red-200 text-red-600';
  div.textContent = msg;
  form.prepend(div);
}

function removeAlert(form) {
  form.querySelector('#auth-alert')?.remove();
}
