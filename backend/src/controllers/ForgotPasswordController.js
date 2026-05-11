const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Vui lòng nhập email' });

    const [[user]] = await db.query('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL', [email]);
    if (!user) return res.status(404).json({ message: 'Email không tồn tại trong hệ thống' });

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

    await db.query(
      'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?',
      [resetToken, resetTokenExpiry, user.id]
    );

    res.json({ message: 'Link reset mật khẩu đã được tạo', resetToken });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) return res.status(400).json({ message: 'Vui lòng nhập token và mật khẩu mới' });
    if (new_password.length < 6) return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 6 ký tự' });

    const [[user]] = await db.query(
      'SELECT id FROM users WHERE reset_token = ? AND reset_token_expiry > NOW() AND deleted_at IS NULL',
      [token]
    );
    if (!user) return res.status(400).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });

    const hashedPassword = await bcrypt.hash(new_password, 10);
    await db.query(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
      [hashedPassword, user.id]
    );

    res.json({ message: 'Đặt lại mật khẩu thành công' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

module.exports = { forgotPassword, resetPassword };
