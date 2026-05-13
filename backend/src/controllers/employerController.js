const db = require('../config/db');

let ensureEmployerProfilesPromise = null;

async function ensureEmployerProfilesTable() {
  if (!ensureEmployerProfilesPromise) {
    ensureEmployerProfilesPromise = db.query(
      `
      CREATE TABLE IF NOT EXISTS employer_profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        company_name VARCHAR(255) NOT NULL,
        website VARCHAR(255) NULL,
        logo_url TEXT NULL,
        industry VARCHAR(255) NULL,
        company_size VARCHAR(100) NULL,
        address TEXT NULL,
        description TEXT NULL,
        tax_code VARCHAR(100) NULL,
        business_license_url TEXT NULL,
        company_email VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_employer_profiles_company (company_name),
        INDEX idx_employer_profiles_industry (industry),
        CONSTRAINT fk_employer_profiles_user_runtime
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `
    ).catch(error => {
      ensureEmployerProfilesPromise = null;
      throw error;
    });
  }
  return ensureEmployerProfilesPromise;
}

function getEmployerId(req) {
  return req.user?.id;
}

function toEmployerPayload(user = {}) {
  const companyName = user.company_name || user.full_name || 'Smart Job Portal';

  return {
    company: {
      name: companyName,
      companyName,
      logoUrl: user.logo_url || user.avatar_url || '',
      logo: user.logo_url || user.avatar_url || '',
      location: user.address || '',
      website: user.website || '',
      size: user.company_size || '',
      industry: user.industry || '',
      description: user.company_description || ''
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
  await ensureEmployerProfilesTable();
  const [[user]] = await db.query(
    `
    SELECT u.id, u.full_name, u.email, u.role, u.phone, u.avatar_url,
           ep.company_name, ep.website, ep.logo_url, ep.industry,
           ep.company_size, ep.address, ep.description AS company_description
    FROM users u
    LEFT JOIN employer_profiles ep ON ep.user_id = u.id
    WHERE u.id = ? AND u.deleted_at IS NULL
    LIMIT 1
    `,
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
    const userLogoUrl = logoUrl && !String(logoUrl).startsWith('data:') ? logoUrl : null;

    await db.query(
      'UPDATE users SET full_name = COALESCE(?, full_name), avatar_url = COALESCE(?, avatar_url) WHERE id = ?',
      [name || null, userLogoUrl || null, getEmployerId(req)]
    );
    await db.query(
      `
      INSERT INTO employer_profiles (user_id, company_name, website, logo_url, industry, company_size, address, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        company_name = COALESCE(VALUES(company_name), company_name),
        website = COALESCE(VALUES(website), website),
        logo_url = COALESCE(VALUES(logo_url), logo_url),
        industry = COALESCE(VALUES(industry), industry),
        company_size = COALESCE(VALUES(company_size), company_size),
        address = COALESCE(VALUES(address), address),
        description = COALESCE(VALUES(description), description)
      `,
      [
        getEmployerId(req),
        name || null,
        req.body.website || null,
        logoUrl || null,
        req.body.industry || null,
        req.body.size || req.body.companySize || null,
        req.body.location || req.body.address || null,
        req.body.description || null
      ]
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
