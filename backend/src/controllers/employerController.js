const db = require('../config/db');

function getEmployerId(req) {
  return req.user?.role === 'employer' ? req.user.id : 1;
}

function toEmployerPayload(user = {}) {
  const companyName = user.full_name || 'Smart Job Portal';

  return {
    company: {
      name: companyName,
      companyName,
      logoUrl: user.avatar_url || '',
      logo: user.avatar_url || '',
      location: '',
      website: '',
      size: '',
      description: ''
    },
    account: {
      id: user.id,
      name: user.full_name || '',
      fullName: user.full_name || '',
      contactName: user.full_name || '',
      email: user.email || '',
      contactEmail: user.email || '',
      phone: user.phone || '',
      phoneNumber: user.phone || '',
      role: user.role || 'employer',
      roleLabel: 'Nhà tuyển dụng',
      avatarUrl: user.avatar_url || '',
      avatar: user.avatar_url || ''
    },
    user: {
      id: user.id,
      fullName: user.full_name || '',
      name: user.full_name || '',
      email: user.email || '',
      phone: user.phone || '',
      role: user.role || 'employer',
      roleLabel: 'Nhà tuyển dụng',
      avatarUrl: user.avatar_url || '',
      avatar: user.avatar_url || ''
    },
    notifications: {
      unread: 0,
      newCandidateEmail: true,
      dailySummary: false,
      systemAlert: true
    },
    messages: {
      unread: 0
    }
  };
}

async function getEmployerUser(req) {
  const [[user]] = await db.query(
    'SELECT id, full_name, email, role, phone, avatar_url FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [getEmployerId(req)]
  );
  return user;
}

exports.getHeader = async (req, res) => {
  try {
    const user = await getEmployerUser(req);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy tài khoản nhà tuyển dụng' });
    res.json(toEmployerPayload(user));
  } catch (error) {
    console.error('Get employer header error:', error);
    res.status(500).json({ message: 'Lỗi lấy dữ liệu header employer', error: error.message });
  }
};

exports.getSettings = async (req, res) => {
  try {
    const user = await getEmployerUser(req);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy tài khoản nhà tuyển dụng' });
    res.json(toEmployerPayload(user));
  } catch (error) {
    console.error('Get employer settings error:', error);
    res.status(500).json({ message: 'Lỗi lấy cài đặt employer', error: error.message });
  }
};

exports.updateCompany = async (req, res) => {
  try {
    const name = req.body.name || req.body.companyName;
    const logoUrl = req.body.logoUrl || req.body.logo || req.body.logo_url;

    await db.query(
      'UPDATE users SET full_name = COALESCE(?, full_name), avatar_url = COALESCE(?, avatar_url) WHERE id = ?',
      [name || null, logoUrl || null, getEmployerId(req)]
    );

    return exports.getSettings(req, res);
  } catch (error) {
    console.error('Update employer company error:', error);
    res.status(500).json({ message: 'Lỗi cập nhật hồ sơ công ty', error: error.message });
  }
};

exports.updateAccount = async (req, res) => {
  try {
    const contactName = req.body.contactName || req.body.name || req.body.fullName;
    const email = req.body.email || req.body.contactEmail;
    const phone = req.body.phone || req.body.phoneNumber;

    await db.query(
      'UPDATE users SET full_name = COALESCE(?, full_name), email = COALESCE(?, email), phone = COALESCE(?, phone) WHERE id = ?',
      [contactName || null, email || null, phone || null, getEmployerId(req)]
    );

    return exports.getSettings(req, res);
  } catch (error) {
    console.error('Update employer account error:', error);
    res.status(500).json({ message: 'Lỗi cập nhật tài khoản', error: error.message });
  }
};

exports.updateNotifications = async (req, res) => {
  res.json({
    success: true,
    notifications: {
      newCandidateEmail: Boolean(req.body.newCandidateEmail),
      dailySummary: Boolean(req.body.dailySummary),
      systemAlert: Boolean(req.body.systemAlert)
    }
  });
};
