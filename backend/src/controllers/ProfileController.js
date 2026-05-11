const db = require('../config/db');

function getUserId(req, fallback = 2) {
  return req.user?.id || fallback;
}

function toProfileResponse(user = {}) {
  return {
    id: user.id,
    full_name: user.full_name,
    fullName: user.full_name,
    email: user.email,
    phone: user.phone || '',
    avatar_url: user.avatar_url || '',
    avatarUrl: user.avatar_url || '',
    avatar: user.avatar_url || '',
    role: user.role,
    title: user.role === 'employer' ? 'Nhà tuyển dụng' : 'Ứng viên',
    location: '',
    bio: '',
    skills: [],
    experience: 0,
    education: '',
    profileStrength: user.phone ? 70 : 45
  };
}

const getProfile = async (req, res) => {
  try {
    const [[user]] = await db.query(
      'SELECT id, full_name, email, role, phone, avatar_url, is_verified, created_at, updated_at FROM users WHERE id = ? AND deleted_at IS NULL',
      [getUserId(req)]
    );

    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    res.json(toProfileResponse(user));
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = getUserId(req);
    const fullName = req.body.full_name || req.body.fullName || req.body.name;
    const avatarUrl = req.body.avatar_url || req.body.avatarUrl || req.body.avatar;

    await db.query(
      `
      UPDATE users
      SET full_name = COALESCE(?, full_name),
          phone = COALESCE(?, phone),
          avatar_url = COALESCE(?, avatar_url)
      WHERE id = ? AND deleted_at IS NULL
      `,
      [fullName || null, req.body.phone || null, avatarUrl || null, userId]
    );

    return getProfile(req, res);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

module.exports = { getProfile, updateProfile };
