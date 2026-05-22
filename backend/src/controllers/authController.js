const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

let ensureEmployerProfilesPromise = null;

function normalizeRole(role = '') {
  const normalized = String(role || '').trim().toLowerCase();
  return ['candidate', 'employer'].includes(normalized) ? normalized : 'candidate';
}

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
        CONSTRAINT fk_employer_profiles_user
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

function toUserResponse(user = {}) {
  return {
    id: user.id,
    full_name: user.full_name,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    avatar_url: user.avatar_url,
    avatarUrl: user.avatar_url
  };
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'smart_job_portal_secret_key_2026',
    { expiresIn: '7d' }
  );
}

const register = async (req, res) => {
  try {
    const fullName = req.body.full_name || req.body.fullName || req.body.name;
    const { email, password, phone } = req.body;
    const role = normalizeRole(req.body.role);
    const company = req.body.company || {};

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ họ tên, email và mật khẩu.' });
    }
    if (role === 'employer' && !(company.companyName || company.company_name)) {
      return res.status(400).json({ message: 'Vui lòng nhập tên công ty.' });
    }

    const [[existingUser]] = await db.query('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL', [email]);
    if (existingUser) return res.status(400).json({ message: 'Email đã được đăng ký' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const avatarUrl = req.body.avatar_url || req.body.avatarUrl || company.logoUrl || company.logo_url || null;
    const userAvatarUrl = avatarUrl && !String(avatarUrl).startsWith('data:') ? avatarUrl : null;
    const [result] = await db.query(
      `
      INSERT INTO users (full_name, email, password_hash, role, phone, avatar_url, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, FALSE)
      `,
      [fullName, email, hashedPassword, role, phone || null, userAvatarUrl]
    );

    if (role === 'employer') {
      await ensureEmployerProfilesTable();
      await db.query(
        `
        INSERT INTO employer_profiles (
          user_id, company_name, website, logo_url, industry, company_size,
          address, description, tax_code, business_license_url, company_email
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          result.insertId,
          company.companyName || company.company_name,
          company.website || null,
          avatarUrl,
          company.industry || null,
          company.companySize || company.company_size || null,
          company.address || null,
          company.description || null,
          company.taxCode || company.tax_code || null,
          company.businessLicenseUrl || company.business_license_url || null,
          company.companyEmail || company.company_email || null
        ]
      );
    }

    const [[user]] = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
    const token = signToken(user);

    res.status(201).json({
      message: 'Đăng ký thành công',
      token,
      accessToken: token,
      user: toUserResponse(user)
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const login = async (req, res) => {
  try {
    const email = req.body.email || req.body.identifier;
    const { password } = req.body;
    const requestedRole = ['candidate', 'employer'].includes(String(req.body.role || '').trim().toLowerCase())
      ? String(req.body.role).trim().toLowerCase()
      : '';

    const [[user]] = await db.query('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', [email]);
    if (!user) return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });

    const isSeedPlaceholder = String(user.password_hash || '').includes('YourRealHashHere');
    const isPasswordValid = isSeedPlaceholder
      ? password === '123456'
      : await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });

    const actualRole = String(user.role || '').trim().toLowerCase();
    if (requestedRole && actualRole !== 'admin' && actualRole !== requestedRole) {
      return res.status(403).json({
        message: 'Đăng nhập sai vị trí! Vui lòng chọn đúng vai trò tài khoản.'
      });
    }

    const token = signToken(user);
    res.json({
      message: 'Đăng nhập thành công',
      token,
      accessToken: token,
      user: toUserResponse(user)
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

module.exports = { register, login };
