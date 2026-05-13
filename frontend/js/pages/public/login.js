import { api } from '../../api.js';

let selectedRole = 'candidate';

export function init() {
  bindRoles();
  document.getElementById('publicLoginForm')?.addEventListener('submit', submit);
}

function bindRoles() {
  document.querySelectorAll('.login-role').forEach((button) => {
    button.addEventListener('click', () => {
      selectedRole = button.dataset.role || 'candidate';
      document.querySelectorAll('.login-role').forEach((item) => {
        const active = item === button;
        item.classList.toggle('border-blue-600', active);
        item.classList.toggle('bg-blue-50', active);
        item.classList.toggle('text-blue-700', active);
        item.classList.toggle('border-slate-200', !active);
        item.classList.toggle('text-slate-700', !active);
      });
    });
  });
}

async function submit(event) {
  event.preventDefault();
  const message = document.getElementById('publicLoginMessage');
  const submitButton = document.getElementById('publicLoginSubmit');
  message.textContent = '';
  submitButton.disabled = true;
  submitButton.textContent = 'Đang đăng nhập...';
  try {
    const payload = await api.post('/auth/login', {
      email: document.getElementById('publicLoginEmail').value.trim(),
      password: document.getElementById('publicLoginPassword').value,
      role: selectedRole
    });
    finishAuth(payload);
  } catch (error) {
    message.textContent = error.message || 'Không đăng nhập được.';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Sign In to Nexus ->';
  }
}

function finishAuth(payload) {
  const token = payload.accessToken || payload.token;
  if (token) {
    localStorage.setItem('accessToken', token);
    localStorage.setItem('token', token);
  }
  localStorage.setItem('user', JSON.stringify(payload.user || {}));
  window.location.hash = '#dashboard';
  window.location.reload();
}
