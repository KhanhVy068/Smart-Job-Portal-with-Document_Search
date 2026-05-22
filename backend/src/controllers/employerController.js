const db = require('../config/db');
const notificationService = require('../services/notificationService');

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

function ensureEmployerRole(req, res) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role && role !== 'employer' && role !== 'admin') {
    res.status(403).json({ message: 'Chỉ nhà tuyển dụng mới được truy cập dữ liệu CV ứng viên' });
    return false;
  }
  return true;
}

function normalizeSkills(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return normalizeSkills(parsed);
  } catch {}
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function buildPreview(text = '') {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 360);
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getExperienceSql(value, params) {
  const expr = 'COALESCE(d.experience_years, cp.experience)';
  if (value === '0-1') return `${expr} BETWEEN 0 AND 1`;
  if (value === '1-3') return `${expr} BETWEEN 1 AND 3`;
  if (value === '3-5') return `${expr} BETWEEN 3 AND 5`;
  if (value === '5+') return `${expr} >= 5`;
  return '';
}

function getSearchScore(row = {}, q = '', selectedSkills = []) {
  let score = 50;
  const haystack = [
    row.candidate_name,
    row.candidate_email,
    row.job_title,
    row.file_name,
    row.desired_position,
    row.extracted_summary,
    row.extracted_text,
    row.extracted_skills
  ].join(' ').toLowerCase();

  if (q && haystack.includes(q.toLowerCase())) score += 20;
  const skills = normalizeSkills(row.extracted_skills);
  for (const skill of selectedSkills) {
    if (skills.some(item => item.toLowerCase() === String(skill).toLowerCase())) score += 10;
  }
  if (row.experience_years !== null && row.experience_years !== undefined) score += 5;

  return Math.max(0, Math.min(100, score));
}

function toCvSearchItem(row = {}, query = '', selectedSkills = []) {
  const extractedSkills = normalizeSkills(row.extracted_skills);
  const profileSkills = normalizeSkills(row.profile_skills);
  const experienceYears = toNumber(row.experience_years);
  const desiredPosition = row.desired_position || row.profile_desired_position || row.job_title || '';
  const candidateName = row.candidate_name || 'Ứng viên chưa cập nhật tên';
  const score = getSearchScore(row, query, selectedSkills);

  return {
    id: row.application_id,
    applicationId: row.application_id,
    candidateId: row.candidate_id,
    documentId: row.document_id,
    cvDocumentId: row.document_id,
    candidateName,
    name: candidateName,
    fullName: candidateName,
    candidateEmail: row.candidate_email || '',
    email: row.candidate_email || '',
    candidatePhone: row.candidate_phone || '',
    phone: row.candidate_phone || '',
    avatarUrl: row.avatar_url || '',
    fileName: row.file_name || 'CV.pdf',
    fileUrl: row.file_url || '',
    cvUrl: row.file_url || '',
    jobId: row.job_id,
    jobTitle: row.job_title || '',
    applicationStatus: row.application_status || '',
    status: row.extraction_status || row.document_status || row.application_status || 'pending',
    extractionStatus: row.extraction_status || row.document_status || 'pending',
    appliedAt: row.applied_at,
    createdAt: row.applied_at,
    desiredPosition,
    title: desiredPosition || 'Chưa cập nhật vị trí mong muốn',
    position: desiredPosition || 'Chưa cập nhật vị trí mong muốn',
    location: row.location || row.job_location || 'Chưa cập nhật địa điểm',
    extractedText: row.extracted_text || '',
    previewText: buildPreview(row.extracted_text || row.extracted_summary || ''),
    summary: row.extracted_summary || buildPreview(row.extracted_text || ''),
    extractedSkills,
    skills: profileSkills.length ? profileSkills : extractedSkills,
    experienceYears,
    experience: experienceYears,
    matchScore: score,
    score
  };
}

async function toEmployerPayload(user = {}) {
  const companyName = user.company_name || user.full_name || 'Smart Job Portal';
  await notificationService.ensureNotificationsTable().catch(() => null);
  const [[countRow]] = await db.query(
    'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = FALSE',
    [user.id]
  ).catch(() => [[{ unread: 0 }]]);

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
      unread: Number(countRow?.unread || 0),
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
    res.json(await toEmployerPayload(user));
  } catch (error) {
    console.error('Get employer header error:', error);
    res.status(500).json({ message: 'Lỗi lấy dữ liệu header employer', error: error.message });
  }
};

exports.getSettings = async (req, res) => {
  try {
    const user = await getEmployerUser(req);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy tài khoản nhà tuyển dụng' });
    res.json(await toEmployerPayload(user));
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

exports.searchEmployerCvs = async (req, res) => {
  if (!ensureEmployerRole(req, res)) return;

  try {
    const employerId = getEmployerId(req);
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 8)));
    const offset = (page - 1) * limit;
    const query = String(req.query.q || req.query.keyword || '').trim();
    const location = String(req.query.location || '').trim();
    const experience = String(req.query.experience || '').trim();
    const sort = String(req.query.sort || 'relevance');
    const selectedSkills = String(req.query.skills || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);

    const where = [
      'j.employer_id = ?',
      'a.deleted_at IS NULL',
      'j.deleted_at IS NULL',
      'd.deleted_at IS NULL'
    ];
    const params = [employerId];

    if (query) {
      const keyword = `%${query}%`;
      where.push(`(
        u.full_name LIKE ? OR u.email LIKE ? OR j.title LIKE ? OR d.file_name LIKE ?
        OR d.extracted_text LIKE ? OR d.extracted_skills LIKE ? OR d.desired_position LIKE ?
        OR cp.title LIKE ? OR cp.skills LIKE ?
      )`);
      params.push(keyword, keyword, keyword, keyword, keyword, keyword, keyword, keyword, keyword);
    }

    if (location) {
      const locationKeyword = `%${location}%`;
      where.push('(cp.location LIKE ? OR j.location LIKE ?)');
      params.push(locationKeyword, locationKeyword);
    }

    for (const skill of selectedSkills) {
      where.push('(d.extracted_skills LIKE ? OR cp.skills LIKE ?)');
      params.push(`%${skill}%`, `%${skill}%`);
    }

    const experienceSql = getExperienceSql(experience, params);
    if (experienceSql) where.push(experienceSql);

    const fromSql = `
      FROM applications a
      JOIN jobs j ON j.id = a.job_id
      JOIN users u ON u.id = a.candidate_id AND u.deleted_at IS NULL
      JOIN documents d ON d.id = a.cv_document_id AND d.user_id = a.candidate_id
      LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
      WHERE ${where.join(' AND ')}
    `;

    let orderSql = 'a.applied_at DESC';
    if (sort === 'experience-desc') {
      orderSql = 'COALESCE(d.experience_years, cp.experience) DESC, a.applied_at DESC';
    } else if (sort === 'newest') {
      orderSql = 'a.applied_at DESC';
    }

    const [[countRow]] = await db.query(`SELECT COUNT(*) AS total ${fromSql}`, params);
    const [rows] = await db.query(
      `
      SELECT
        a.id AS application_id,
        a.applied_at,
        a.status AS application_status,
        j.id AS job_id,
        j.title AS job_title,
        j.location AS job_location,
        u.id AS candidate_id,
        u.full_name AS candidate_name,
        u.email AS candidate_email,
        u.phone AS candidate_phone,
        u.avatar_url,
        cp.location,
        cp.skills AS profile_skills,
        cp.title AS profile_desired_position,
        d.id AS document_id,
        d.file_name,
        d.file_url,
        d.status AS document_status,
        d.extraction_status,
        d.extracted_text,
        d.extracted_skills,
        d.desired_position,
        d.extracted_summary,
        d.experience_years
      ${fromSql}
      ORDER BY ${orderSql}
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    const total = Number(countRow?.total || 0);
    const items = rows.map(row => toCvSearchItem(row, query, selectedSkills));
    res.json({
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      items,
      candidates: items,
      data: items
    });
  } catch (error) {
    console.error('Employer CV search error:', error);
    res.status(500).json({ message: 'Lỗi tìm CV của nhà tuyển dụng', error: error.message });
  }
};

exports.getEmployerCvDetail = async (req, res) => {
  if (!ensureEmployerRole(req, res)) return;

  try {
    const employerId = getEmployerId(req);
    const applicationId = Number(req.query.applicationId || req.query.application_id || req.query.id || 0);
    const documentId = Number(req.query.documentId || req.query.document_id || req.query.cvDocumentId || 0);

    if (!applicationId) {
      return res.status(400).json({ message: 'Thiếu applicationId để mở chi tiết CV' });
    }

    const documentFilter = documentId ? 'd.id = ?' : 'd.id = a.cv_document_id';
    const params = documentId ? [documentId, applicationId, employerId] : [applicationId, employerId];
    const [[row]] = await db.query(
      `
      SELECT
        a.id AS application_id,
        a.applied_at,
        a.status AS application_status,
        a.cover_letter,
        j.id AS job_id,
        j.title AS job_title,
        j.location AS job_location,
        u.id AS candidate_id,
        u.full_name AS candidate_name,
        u.email AS candidate_email,
        u.phone AS candidate_phone,
        u.avatar_url,
        cp.location,
        cp.skills AS profile_skills,
        cp.title AS profile_desired_position,
        d.id AS document_id,
        d.file_name,
        d.file_url,
        d.status AS document_status,
        d.extraction_status,
        d.extracted_text,
        d.extracted_skills,
        d.desired_position,
        d.extracted_summary,
        d.experience_years
      FROM applications a
      JOIN jobs j ON j.id = a.job_id
      JOIN users u ON u.id = a.candidate_id AND u.deleted_at IS NULL
      JOIN documents d ON ${documentFilter} AND d.user_id = a.candidate_id AND d.deleted_at IS NULL
      LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
      WHERE a.id = ?
        AND j.employer_id = ?
        AND a.deleted_at IS NULL
        AND j.deleted_at IS NULL
      LIMIT 1
      `,
      params
    );

    if (!row) {
      return res.status(403).json({ message: 'CV này không thuộc ứng viên đã ứng tuyển vào công ty của bạn' });
    }

    res.json(toCvSearchItem(row, '', []));
  } catch (error) {
    console.error('Employer CV detail error:', error);
    res.status(500).json({ message: 'Lỗi lấy chi tiết CV', error: error.message });
  }
};

exports.searchCV = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const location = String(req.query.location || '').trim();
    const experience = String(req.query.experience || '').trim();

    const where = ['d.deleted_at IS NULL'];
    const params = [];

    if (q) {
      where.push(`(
        u.full_name LIKE ? OR
        cp.desired_position LIKE ? OR
        cp.skills LIKE ? OR
        d.extracted_text LIKE ? OR
        d.extracted_skills LIKE ?
      )`);
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }

    if (location) {
      where.push(`cp.location LIKE ?`);
      params.push(`%${location}%`);
    }

    const [rows] = await db.query(
      `
      SELECT 
        u.id AS candidate_id,
        u.full_name,
        u.email,
        u.phone,
        u.avatar_url,
        cp.desired_position,
        cp.location,
        cp.skills AS profile_skills,
        d.id AS document_id,
        d.file_name,
        d.file_url,
        d.extracted_text,
        d.extracted_skills
      FROM documents d
      JOIN users u ON u.id = d.user_id
      LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
      WHERE ${where.join(' AND ')}
      ORDER BY d.created_at DESC
      LIMIT 50
      `,
      params
    );

    const items = rows.map(row => ({
      candidateId: row.candidate_id,
      name: row.full_name || 'Ứng viên',
      fullName: row.full_name || 'Ứng viên',
      email: row.email || '',
      phone: row.phone || '',
      avatarUrl: row.avatar_url || '',
      title: row.desired_position || 'Chưa cập nhật vị trí',
      position: row.desired_position || '',
      location: row.location || '',
      cvDocumentId: row.document_id,
      fileName: row.file_name || '',
      cvUrl: row.file_url || '',
      skills: parseSkills(row.profile_skills || row.extracted_skills),
      summary: (row.extracted_text || '').slice(0, 300),
      score: 0
    }));

    res.json({
      total: items.length,
      items,
      candidates: items,
      data: items
    });
  } catch (error) {
    console.error('CV search error:', error);
    res.status(500).json({
      message: 'Lỗi tìm kiếm CV',
      error: error.message
    });
  }
};

function parseSkills(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {}

  return String(value)
    .split(/[,;\n]+/)
    .map(s => s.trim())
    .filter(Boolean);
}
