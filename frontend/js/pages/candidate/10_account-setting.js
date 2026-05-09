import { api } from '../../api.js';

export async function init() {
  await loadAccountInfo();
  setupPasswordToggles();
  setupPasswordStrength();
  setupSavePassword();
  setupLogoutAll();
}

async function loadAccountInfo() {
  try {
    const u = await api.get('/user/profile');
    const user = u?.user || u?.data || u || {};
    setText('acctEmail', user.email || '—');
  } catch { /* silent */ }
}

function setupPasswordToggles() {
  document.querySelectorAll('.toggle-pwd').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      if (!input) return;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      const icon = btn.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = isPassword ? 'visibility_off' : 'visibility';
    });
  });
}

function setupPasswordStrength() {
  document.getElementById('acctNewPwd')?.addEventListener('input', function () {
    const val = this.value;
    const score = calcStrength(val);
    const bars = document.querySelectorAll('.pwd-strength-bar');
    const colors = ['bg-red-500', 'bg-orange-400', 'bg-yellow-400', 'bg-teal-500'];
    const labels = ['', 'Yếu', 'Trung bình', 'Khá', 'Mạnh'];

    bars.forEach((bar, i) => {
      bar.className = 'pwd-strength-bar flex-1 h-1 rounded-full transition-all ' +
        (i < score ? colors[score - 1] : 'bg-slate-200');
    });
    setText('pwdStrengthLabel', val ? labels[score] : '');
  });
}

function calcStrength(pwd) {
  if (!pwd) return 0;
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return score;
}

function setupSavePassword() {
  document.getElementById('acctSavePwdBtn')?.addEventListener('click', async () => {
    const current = document.getElementById('acctCurrentPwd')?.value;
    const newPwd = document.getElementById('acctNewPwd')?.value;
    const confirm = document.getElementById('acctConfirmPwd')?.value;

    hideAlerts();

    if (!current || !newPwd || !confirm) {
      showError('Vui lòng điền đầy đủ các trường.');
      return;
    }
    if (newPwd.length < 8) {
      showError('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }
    if (newPwd !== confirm) {
      showError('Mật khẩu xác nhận không khớp.');
      return;
    }

    const btn = document.getElementById('acctSavePwdBtn');
    btn.disabled = true;
    btn.textContent = 'Đang cập nhật...';

    try {
      await api.put('/user/change-password', { currentPassword: current, newPassword: newPwd });
      document.getElementById('pwdSuccess')?.classList.remove('hidden');
      document.getElementById('acctCurrentPwd').value = '';
      document.getElementById('acctNewPwd').value = '';
      document.getElementById('acctConfirmPwd').value = '';
      document.querySelectorAll('.pwd-strength-bar').forEach(b => {
        b.className = 'pwd-strength-bar flex-1 h-1 bg-slate-200 rounded-full';
      });
      setText('pwdStrengthLabel', '');
      setTimeout(() => document.getElementById('pwdSuccess')?.classList.add('hidden'), 4000);
    } catch (err) {
      showError(err?.message || 'Cập nhật mật khẩu thất bại. Vui lòng thử lại.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Cập nhật mật khẩu';
    }
  });
}

function setupLogoutAll() {
  document.getElementById('acctLogoutAllBtn')?.addEventListener('click', () => {
    if (!confirm('Bạn có chắc muốn đăng xuất khỏi tất cả thiết bị?')) return;
    ['accessToken', 'token', 'user', 'role'].forEach(k => localStorage.removeItem(k));
    window.location.href = '/page/guest/4_Login.html';
  });
}

function showError(msg) {
  document.getElementById('pwdSuccess')?.classList.add('hidden');
  const err = document.getElementById('pwdError');
  if (err) err.classList.remove('hidden');
  setText('pwdErrorMsg', msg);
}

function hideAlerts() {
  document.getElementById('pwdSuccess')?.classList.add('hidden');
  document.getElementById('pwdError')?.classList.add('hidden');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? '';
}
