const crypto = require('crypto');
const db = require('../models');
const { Op } = require('sequelize');
const User = db.User;

// POST /api/auth/forgot-password - Gửi email reset mật khẩu
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Vui lòng nhập email' });
        }

        const user = await User.findOne({ where: { email } });

        if (!user) {
            return res.status(404).json({ message: 'Email không tồn tại trong hệ thống' });
        }

        // Tạo reset token ngẫu nhiên
        const resetToken = crypto.randomBytes(32).toString('hex');
        
        // Lưu token vào database (hết hạn sau 1 giờ)
        const resetTokenExpiry = new Date();
        resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1);

        await user.update({
            reset_token: resetToken,
            reset_token_expiry: resetTokenExpiry
        });

        // Trong đồ án, trả về token (thực tế nên gửi email)
        res.json({
            message: 'Link reset mật khẩu đã được tạo',
            resetToken: resetToken  // Trong thực tế, gửi email chứ không trả về JSON
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};

// POST /api/auth/reset-password - Đặt lại mật khẩu
const resetPassword = async (req, res) => {
    try {
        const { token, new_password } = req.body;

        if (!token || !new_password) {
            return res.status(400).json({ message: 'Vui lòng nhập token và mật khẩu mới' });
        }

        if (new_password.length < 6) {
            return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 6 ký tự' });
        }

        // Tìm user theo token và token chưa hết hạn
        const user = await User.findOne({
            where: {
                reset_token: token,
               reset_token_expiry: { [Op.gt]: new Date() }
            }
        });

        if (!user) {
            return res.status(400).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
        }

        // Mã hóa mật khẩu mới
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(new_password, 10);

        // Cập nhật mật khẩu và xóa token
        await user.update({
            password_hash: hashedPassword,
            reset_token: null,
            reset_token_expiry: null
        });

        res.json({ message: 'Đặt lại mật khẩu thành công' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};

module.exports = { forgotPassword, resetPassword };