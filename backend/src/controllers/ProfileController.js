const db = require('../models');
const User = db.User;

// GET /api/profile - Lấy thông tin cá nhân
const getProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const user = await User.findByPk(userId, {
            attributes: { exclude: ['password_hash', 'reset_token', 'reset_token_expiry'] }
        });
        
        if (!user) {
            return res.status(404).json({ message: 'Không tìm thấy người dùng' });
        }
        
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};

// PUT /api/profile - Cập nhật thông tin cá nhân
const updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { full_name, phone, avatar_url } = req.body;
        
        const user = await User.findByPk(userId);
        
        if (!user) {
            return res.status(404).json({ message: 'Không tìm thấy người dùng' });
        }
        
        await user.update({
            full_name: full_name || user.full_name,
            phone: phone || user.phone,
            avatar_url: avatar_url || user.avatar_url
        });
        
        res.json({
            message: 'Cập nhật thông tin thành công',
            user: {
                id: user.id,
                full_name: user.full_name,
                email: user.email,
                phone: user.phone,
                avatar_url: user.avatar_url,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};

module.exports = { getProfile, updateProfile };