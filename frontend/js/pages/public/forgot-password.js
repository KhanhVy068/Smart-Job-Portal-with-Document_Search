import { api } from '../../api.js';

export function init() {
  document.getElementById('publicForgotForm')?.addEventListener('submit', submit);
}

async function submit(event) {
  event.preventDefault();
  const message = document.getElementById('publicForgotMessage');
  const submitButton = document.getElementById('publicForgotSubmit');
  message.textContent = '';
  message.className = 'mt-5 min-h-5 text-sm font-bold';
  submitButton.disabled = true;
  submitButton.textContent = 'Đang gửi...';
  try {
    const payload = await api.post('/auth/forgot-password', {
      email: document.getElementById('publicForgotEmail').value.trim()
    });
    message.textContent = payload.message || 'Đã gửi thông tin đặt lại mật khẩu.';
    message.classList.add('text-emerald-700');
  } catch (error) {
    message.textContent = error.message || 'Không gửi được yêu cầu.';
    message.classList.add('text-red-600');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Gửi liên kết đặt lại';
  }
}
