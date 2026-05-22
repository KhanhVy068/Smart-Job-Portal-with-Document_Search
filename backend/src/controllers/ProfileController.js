const db = require('../config/db');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const avatarDir = path.join(__dirname, '..', '..', 'uploads', 'avatars');
fs.mkdirSync(avatarDir, { recursive: true });

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: avatarDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      cb(null, `avatar-${req.user?.id || Date.now()}-${Date.now()}${ext}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype)) return cb(null, true);
    cb(new Error('Chỉ chấp nhận file ảnh PNG, JPG, WEBP hoặc GIF.'));
  },
  limits: { fileSize: 2 * 1024 * 1024 }
});

let ensureCandidateProfilePromise = null;

function getUserId(req, fallback = 2) {
  return req.user?.id || fallback;
}

async function addColumnIfMissing(table, column, definition) {
  try {
    await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (error) {
    if (error.code !== 'ER_DUP_FIELDNAME') throw error;
  }
}

async function ensureCandidateProfileTable() {
  if (!ensureCandidateProfilePromise) {
    ensureCandidateProfilePromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS candidate_profiles (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL UNIQUE,
          title VARCHAR(255) NULL,
          desired_position VARCHAR(255) NULL,
          location VARCHAR(255) NULL,
          bio TEXT NULL,
          skills TEXT NULL,
          experience INT DEFAULT 0,
          education TEXT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_candidate_profiles_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await addColumnIfMissing('candidate_profiles', 'desired_position', 'VARCHAR(255) NULL AFTER title');
    })().catch(error => {
      ensureCandidateProfilePromise = null;
      throw error;
    });
  }
  return ensureCandidateProfilePromise;
}

function normalizeSkills(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return normalizeSkills(parsed);
  } catch {}
  return String(value).split(/[\n,;]+/).map(item => item.trim()).filter(Boolean);
}

function serializeSkills(value) {
  const skills = normalizeSkills(value);
  return skills.length ? JSON.stringify(skills) : null;
}

function toProfileResponse(user = {}) {
  const skills = normalizeSkills(user.skills);
  const desiredPosition = user.desired_position || user.title || '';
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
    title: user.role === 'employer' ? 'Nhà tuyển dụng' : (user.title || desiredPosition || ''),
    desiredPosition,
    desired_position: desiredPosition,
    location: user.location || '',
    bio: user.bio || '',
    skills,
    experience: Number(user.experience || 0),
    education: user.education || '',
    profileStrength: calcProfileStrength({ ...user, skills, desiredPosition })
  };
}

function calcProfileStrength(user = {}) {
  const fields = ['full_name', 'phone', 'avatar_url', 'title', 'location', 'bio', 'education', 'desiredPosition'];
  const filled = fields.filter(key => Boolean(user[key])).length + (user.skills?.length ? 1 : 0);
  return Math.round((filled / 9) * 100);
}

const getProfile = async (req, res) => {
  try {
    await ensureCandidateProfileTable();
    const [[user]] = await db.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.phone, u.avatar_url, u.is_verified, u.created_at, u.updated_at,
              cp.title, cp.desired_position, cp.location, cp.bio, cp.skills, cp.experience, cp.education
       FROM users u
       LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
       WHERE u.id = ? AND u.deleted_at IS NULL`,
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
    await ensureCandidateProfileTable();
    const userId = getUserId(req);
    const fullName = req.body.full_name || req.body.fullName || req.body.name;
    const avatarUrl = req.body.avatar_url || req.body.avatarUrl || req.body.avatar;
    const title = req.body.title || req.body.jobTitle || req.body.desiredPosition || req.body.desired_position;
    const desiredPosition = req.body.desiredPosition || req.body.desired_position || title;

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

    await db.query(
      `
      INSERT INTO candidate_profiles (user_id, title, desired_position, location, bio, skills, experience, education)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        title = COALESCE(VALUES(title), title),
        desired_position = COALESCE(VALUES(desired_position), desired_position),
        location = COALESCE(VALUES(location), location),
        bio = COALESCE(VALUES(bio), bio),
        skills = COALESCE(VALUES(skills), skills),
        experience = COALESCE(VALUES(experience), experience),
        education = COALESCE(VALUES(education), education)
      `,
      [
        userId,
        title || null,
        desiredPosition || null,
        req.body.location || null,
        req.body.bio || req.body.about || null,
        Object.prototype.hasOwnProperty.call(req.body, 'skills') ? serializeSkills(req.body.skills) : null,
        req.body.experience === undefined || req.body.experience === null || req.body.experience === '' ? null : Number(req.body.experience),
        req.body.education || null
      ]
    );

    return getProfile(req, res);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Vui lòng chọn ảnh đại diện.' });
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    await db.query('UPDATE users SET avatar_url = ? WHERE id = ? AND deleted_at IS NULL', [avatarUrl, getUserId(req)]);
    res.json({ success: true, avatar_url: avatarUrl, avatarUrl, avatar: avatarUrl });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ message: 'Lỗi upload avatar', error: error.message });
  }
};

module.exports = { getProfile, updateProfile, uploadAvatar, avatarUpload, ensureCandidateProfileTable };
