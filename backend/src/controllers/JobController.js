const db = require('../config/db');
const searchService = require('../services/searchService');
const performanceLogService = require('../services/performanceLogService');
const savedJobController = require('./savedJobController');
const notificationService = require('../services/notificationService');

function fixMojibake(value) {
  if (typeof value !== 'string') return value;
  if (!/[ÃÂÄÆ]|á[º»¼½¾¿]|à[¡¢£¤¥¦§¨©ª«¬­®¯]|â[\u0080-\u009c]/.test(value)) return value;
  try {
    return Buffer.from(value, 'latin1').toString('utf8');
  } catch {
    return value;
  }
}

let ensureJobColumnsPromise = null;

function getUserId(req, fallback) {
  return req.user?.id || fallback;
}

async function addColumnIfMissing(table, column, definition) {
  try {
    await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (error) {
    if (error.code !== 'ER_DUP_FIELDNAME') throw error;
  }
}

async function ensureJobColumns() {
  if (!ensureJobColumnsPromise) {
    ensureJobColumnsPromise = Promise.all([
      addColumnIfMissing('jobs', 'skills', 'TEXT NULL')
    ]).catch(error => {
      ensureJobColumnsPromise = null;
      throw error;
    });
  }
  return ensureJobColumnsPromise;
}

function normalizeSkills(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return normalizeSkills(parsed);
  } catch {
    // Old rows may store comma-separated skills.
  }
  return String(value).split(/[\n,;]+/).map(item => item.trim()).filter(Boolean);
}

function serializeSkills(value) {
  const skills = normalizeSkills(value);
  return skills.length ? JSON.stringify(skills) : null;
}

function isEmptyLocation(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || ['chưa cập nhật', 'chua cap nhat', 'đang cập nhật', 'dang cap nhat'].includes(normalized);
}

function firstLocation(...values) {
  return values.find(value => !isEmptyLocation(value)) || '';
}

function toJobResponse(row = {}) {
  const salary = row.salary_min || row.salary_max
    ? `${Number(row.salary_min || 0).toLocaleString('vi-VN')} - ${Number(row.salary_max || 0).toLocaleString('vi-VN')} ${row.currency || 'VND'}`
    : 'Thỏa thuận';
  const companyAddress = fixMojibake(row.company_address || '');
  const location = fixMojibake(firstLocation(row.location, row.company_address));

  return {
    id: row.id,
    employerId: row.employer_id,
    categoryId: row.category_id,
    title: fixMojibake(row.title),
    companyName: fixMojibake(row.company_name || row.employer_name || 'Smart Job Portal'),
    company_name: fixMojibake(row.company_name || row.employer_name || 'Smart Job Portal'),
    companyAddress,
    company_address: companyAddress,
    companyLogo: row.company_logo || '',
    description: fixMojibake(row.description),
    location,
    city: fixMojibake(row.city || ''),
    province: fixMojibake(row.province || ''),
    salary,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    currency: row.currency,
    experienceRequired: row.experience_required || 0,
    experience: row.experience_required || 0,
    jobType: row.job_type,
    type: row.job_type,
    category: fixMojibake(row.category_name || ''),
    requirements: fixMojibake(row.requirements),
    benefits: fixMojibake(row.benefits),
    deadline: row.expiry_date,
    postedAt: row.posted_at,
    createdAt: row.posted_at,
    updatedAt: row.updated_at,
    status: row.status,
    count: Number(row.application_count || 0),
    applicationCount: Number(row.application_count || 0),
    views: 0,
    skills: normalizeSkills(row.skills),
    isApplied: Boolean(row.is_applied),
    isSaved: Boolean(row.is_saved)
  };
}

function normalizeJobType(value = '') {
  const normalized = String(value).trim().toLowerCase();
  if (['part-time', 'bán thời gian', 'ban thoi gian'].includes(normalized)) return 'Part-time';
  if (['freelance', 'contract', 'hợp đồng', 'hop dong'].includes(normalized)) return 'Freelance';
  if (['remote', 'từ xa', 'tu xa'].includes(normalized)) return 'Remote';
  return 'Full-time';
}

function getLocationKeywords(value = '') {
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return [];
  if (['hcm', 'hochiminh', 'ho-chi-minh', 'tp hcm', 'tp. hcm', 'sai gon', 'saigon'].includes(normalized)) {
    return ['hồ chí minh', 'ho chi minh', 'hcm', 'tp. h', 'sài gòn', 'sai gon'];
  }
  if (['hanoi', 'ha noi', 'hà nội'].includes(normalized)) return ['hà nội', 'ha noi', 'hanoi'];
  if (['danang', 'da nang', 'đà nẵng'].includes(normalized)) return ['đà nẵng', 'da nang', 'danang'];
  if (['remote', 'tu xa', 'từ xa'].includes(normalized)) return ['remote', 'từ xa', 'tu xa'];
  return [value];
}

function normalizeStatus(value = '') {
  const normalized = String(value).trim().toLowerCase();
  if (['closed', 'inactive', 'da dong', 'đã đóng'].includes(normalized)) return 'closed';
  return 'open';
}

function stripVietnameseLocation(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function getLocationFilterKeywords(value = '') {
  const normalized = stripVietnameseLocation(value)
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (!normalized) return [];
  if (['hcm', 'hochiminh', 'ho chi minh', 'tp hcm', 'tphcm', 'sai gon', 'saigon'].includes(normalized)) {
    return ['ho chi minh', 'hcm', 'tp hcm', 'tphcm', 'sai gon', 'saigon'];
  }
  if (['hanoi', 'ha noi'].includes(normalized)) return ['ha noi', 'hanoi'];
  if (['danang', 'da nang'].includes(normalized)) return ['da nang', 'danang'];
  if (['remote', 'tu xa'].includes(normalized)) return ['remote', 'tu xa'];
  return [value, normalized].filter((item, index, items) => item && items.indexOf(item) === index);
}

async function getDefaultCategoryId() {
  const [[category]] = await db.query('SELECT id FROM job_categories ORDER BY id LIMIT 1');
  return category?.id || 1;
}

async function getEmployerAddress(employerId) {
  if (!employerId) return '';
  const [[profile]] = await db.query(
    'SELECT address FROM employer_profiles WHERE user_id = ? LIMIT 1',
    [employerId]
  );
  return profile?.address || '';
}

function parseSalary(payload = {}) {
  const min = payload.salaryMin ?? payload.salary_min;
  const max = payload.salaryMax ?? payload.salary_max;
  const single = payload.salary;

  if (min || max) {
    return {
      salaryMin: min ? Number(min) : null,
      salaryMax: max ? Number(max) : null
    };
  }

  const number = String(single || '').match(/\d[\d.,]*/)?.[0]?.replace(/[.,]/g, '');
  return {
    salaryMin: number ? Number(number) : null,
    salaryMax: null
  };
}

exports.getJobs = async (req, res) => {
  try { 
    await ensureJobColumns();
    await savedJobController.ensureSavedJobsTable();
    const startedAt = Date.now();
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
    const offset = (page - 1) * limit;
    const where = ['j.deleted_at IS NULL'];
    const params = [];

    const keyword = String(req.query.q || req.query.keyword || req.query.search || '').trim();
    if (keyword) {
      where.push(`(
        j.title LIKE ? OR
        j.description LIKE ? OR
        j.requirements LIKE ? OR
        j.benefits LIKE ? OR
        j.location LIKE ? OR
        ep.address LIKE ? OR
        u.full_name LIKE ? OR
        ep.company_name LIKE ? OR
        c.name LIKE ?
      )`);
      const like = `%${keyword}%`;
      params.push(like, like, like, like, like, like, like, like, like);
    }

    if (req.query.location) {
      const locationKeywords = getLocationFilterKeywords(req.query.location);
      where.push(`(${locationKeywords.map(() => `(
        j.location LIKE ? OR
        (
          (j.location IS NULL OR TRIM(j.location) = '' OR LOWER(j.location) IN ('chua cap nhat', 'chÆ°a cáº­p nháº­t', 'dang cap nhat', 'Ä‘ang cáº­p nháº­t'))
          AND ep.address LIKE ?
        )
      )`).join(' OR ')})`);
      params.push(...locationKeywords.flatMap(item => [`%${item}%`, `%${item}%`]));
    }

    if (req.query.category_id) {
      where.push('j.category_id = ?');
      params.push(req.query.category_id);
    }

    const jobType = req.query.job_type || req.query.jobType || req.query.type;
    if (jobType) {
      where.push('j.job_type = ?');
      params.push(normalizeJobType(jobType));
    }

    if (req.query.employer_id) {
      where.push('j.employer_id = ?');
      params.push(Number(req.query.employer_id));
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const candidateId = req.user?.id || null;
    const fromSql = `
      FROM jobs j
      LEFT JOIN users u ON u.id = j.employer_id
      LEFT JOIN employer_profiles ep ON ep.user_id = j.employer_id
      LEFT JOIN job_categories c ON c.id = j.category_id
    `;
    const [[countRow]] = await db.query(`SELECT COUNT(DISTINCT j.id) AS total ${fromSql} ${whereSql}`, params);
    const [rows] = await db.query(
      `
      SELECT j.*, u.full_name AS employer_name,
             COALESCE(ep.company_name, u.full_name) AS company_name,
             ep.address AS company_address,
             COALESCE(ep.logo_url, u.avatar_url) AS company_logo,
             c.name AS category_name, COUNT(a.id) AS application_count,
             ${candidateId ? 'MAX(CASE WHEN sj.id IS NULL THEN 0 ELSE 1 END)' : '0'} AS is_saved
      ${fromSql}
      LEFT JOIN applications a ON a.job_id = j.id AND a.deleted_at IS NULL
      ${candidateId ? 'LEFT JOIN saved_jobs sj ON sj.job_id = j.id AND sj.user_id = ?' : ''}
      ${whereSql}
      GROUP BY j.id
      ORDER BY j.posted_at DESC
      LIMIT ? OFFSET ?
      `,
      [...(candidateId ? [candidateId] : []), ...params, limit, offset]
    );

    const items = rows.map(toJobResponse);

    const latencyMs = Date.now() - startedAt;

    await performanceLogService.logPerformance({
      eventType: 'filter_jobs',
      engine: 'mysql',
      queryText: req.query.q || req.query.keyword || req.query.search || '',
      filters: {
        location: req.query.location || '',
        category_id: req.query.category_id || '',
        job_type: req.query.job_type || req.query.jobType || req.query.type || '',
        page,
        limit
      },
      resultCount: countRow.total,
      latencyMs,
      userId: req.user?.id || null
    });
 
    res.json({
      total: countRow.total,
      page,
      limit,
      latencyMs,
      items,
      jobs: items,
      data: items,
      totalJobs: countRow.total,
      activeJobs: items.filter(job => job.status === 'open').length,
      totalCandidates: items.reduce((sum, job) => sum + job.applicationCount, 0),
      totalViews: 0
    });
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ message: 'Lỗi lấy danh sách việc làm', error: error.message });
  }
};

exports.getMyJobs = async (req, res) => {
  try {
    await ensureJobColumns();

    const employerId = getUserId(req, 1);
    const [rows] = await db.query(
      `
      SELECT j.*,
             u.full_name AS employer_name,
             COALESCE(ep.company_name, u.full_name) AS company_name,
             ep.address AS company_address,
             COALESCE(ep.logo_url, u.avatar_url) AS company_logo,
             c.name AS category_name,
             (
               SELECT COUNT(1)
               FROM applications a
               WHERE a.job_id = j.id AND a.deleted_at IS NULL
             ) AS application_count,
             0 AS is_saved
      FROM jobs j
      LEFT JOIN users u ON u.id = j.employer_id
      LEFT JOIN employer_profiles ep ON ep.user_id = j.employer_id
      LEFT JOIN job_categories c ON c.id = j.category_id
      WHERE j.employer_id = ? AND j.deleted_at IS NULL
      ORDER BY j.posted_at DESC
      `,
      [employerId]
    );

    const items = rows.map(toJobResponse);

    res.json({
      total: items.length,
      items,
      jobs: items,
      data: items,
      activeJobs: items.filter(job => job.status === 'open').length,
      totalCandidates: items.reduce((sum, job) => sum + job.applicationCount, 0)
    });
  } catch (error) {
    console.error('Get my jobs error:', error);
    res.status(500).json({
      message: 'Lỗi lấy danh sách việc làm của tôi',
      error: error.message
    });
  }
};

exports.getAllJobs = exports.getJobs;

exports.getJobById = async (req, res) => {
  try {
    await ensureJobColumns();
    await savedJobController.ensureSavedJobsTable();
    const candidateId = req.user?.id || null;
    const [rows] = await db.query(
      `
      SELECT j.*, u.full_name AS employer_name,
             COALESCE(ep.company_name, u.full_name) AS company_name,
             ep.address AS company_address,
             COALESCE(ep.logo_url, u.avatar_url) AS company_logo,
             c.name AS category_name, COUNT(a.id) AS application_count,
             ${candidateId ? 'MAX(CASE WHEN sj.id IS NULL THEN 0 ELSE 1 END)' : '0'} AS is_saved
      FROM jobs j
      LEFT JOIN users u ON u.id = j.employer_id
      LEFT JOIN employer_profiles ep ON ep.user_id = j.employer_id
      LEFT JOIN job_categories c ON c.id = j.category_id
      LEFT JOIN applications a ON a.job_id = j.id AND a.deleted_at IS NULL
      ${candidateId ? 'LEFT JOIN saved_jobs sj ON sj.job_id = j.id AND sj.user_id = ?' : ''}
      WHERE j.id = ? AND j.deleted_at IS NULL
      GROUP BY j.id
      LIMIT 1
      `,
      [...(candidateId ? [candidateId] : []), req.params.id]
    );

    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy việc làm' });
    res.json(toJobResponse(rows[0]));
  } catch (error) {
    console.error('Get job detail error:', error);
    res.status(500).json({ message: 'Lỗi lấy chi tiết việc làm', error: error.message });
  }
};

exports.createJob = async (req, res) => {
  try {
    await ensureJobColumns();
    const title = String(req.body.title || '').trim();
    if (title.length < 5) {
      return res.status(400).json({ message: 'Tiêu đề công việc phải có ít nhất 5 ký tự.' });
    }

    const categoryId = Number(req.body.category_id || req.body.categoryId || await getDefaultCategoryId());
    const employerId = getUserId(req, 1);
    const { salaryMin, salaryMax } = parseSalary(req.body);
    const expiryDate = req.body.expiry_date || req.body.deadline || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const skills = serializeSkills(req.body.skills || req.body.skillNames || req.body.tags);
    console.log('CREATE JOB BODY:', req.body);
    console.log('RAW SKILLS:', req.body.skills);
    console.log('SAVE SKILLS:', skills);
    const location = firstLocation(req.body.location, await getEmployerAddress(employerId), 'Chưa cập nhật');

    const [result] = await db.query(
      
      `
      INSERT INTO jobs (
        employer_id, category_id, title, description, location,
        salary_min, salary_max, currency, job_type, status,
        expiry_date, experience_required, positions_available, benefits, requirements, skills
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        employerId,
        categoryId,
        title,
        req.body.description || 'Chưa có mô tả.',
        location,
        salaryMin,
        salaryMax,
        req.body.currency || 'VND',
        normalizeJobType(req.body.job_type || req.body.jobType || req.body.type || req.body.employmentType),
        normalizeStatus(req.body.status),
        expiryDate,
        Number(req.body.experience_required || req.body.experience || 0),
        Number(req.body.positions_available || req.body.positions || 1),
        req.body.benefits || null,
        req.body.requirements || null,
        skills
      ]
    );

    searchService.indexJob(result.insertId).catch(err => console.warn('Index job warning:', err.message));
    req.params.id = result.insertId;
    return exports.getJobById(req, res);
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({ message: 'Lỗi tạo tin tuyển dụng', error: error.message });
  }
};

exports.updateJob = async (req, res) => {
  try {
    await ensureJobColumns();
    const current = await db.query('SELECT * FROM jobs WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!current[0].length) return res.status(404).json({ message: 'Không tìm thấy việc làm' });

    const job = current[0][0];
    const { salaryMin, salaryMax } = parseSalary(req.body);
    const skills = Object.prototype.hasOwnProperty.call(req.body, 'skills')
      ? serializeSkills(req.body.skills)
      : job.skills;

    await db.query(
      `
      UPDATE jobs
      SET title = ?, description = ?, location = ?, salary_min = ?, salary_max = ?,
          currency = ?, job_type = ?, status = ?, expiry_date = ?,
          experience_required = ?, positions_available = ?, benefits = ?, requirements = ?, skills = ?
      WHERE id = ?
      `,
      [
        req.body.title || job.title,
        req.body.description || job.description,
        req.body.location || job.location,
        salaryMin ?? job.salary_min,
        salaryMax ?? job.salary_max,
        req.body.currency || job.currency,
        normalizeJobType(req.body.job_type || req.body.jobType || req.body.type || job.job_type),
        normalizeStatus(req.body.status || job.status),
        req.body.expiry_date || req.body.deadline || job.expiry_date,
        Number(req.body.experience_required || req.body.experience || job.experience_required || 0),
        Number(req.body.positions_available || req.body.positions || job.positions_available || 1),
        req.body.benefits ?? job.benefits,
        req.body.requirements ?? job.requirements,
        skills,
        req.params.id
      ]
    );

    searchService.indexJob(req.params.id).catch(err => console.warn('Index job warning:', err.message));
    return exports.getJobById(req, res);
  } catch (error) {
    console.error('Update job error:', error);
    res.status(500).json({ message: 'Lỗi cập nhật tin tuyển dụng', error: error.message });
  }
};

exports.deleteJob = async (req, res) => {
  try {
    const [result] = await db.query('UPDATE jobs SET deleted_at = NOW(), status = "closed" WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Không tìm thấy việc làm' });
    res.json({ success: true, message: 'Đã xóa tin tuyển dụng' });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ message: 'Lỗi xóa tin tuyển dụng', error: error.message });
  }
};

exports.applyToJob = async (req, res) => {
  try {
    const candidateId = getUserId(req, 2);
    const cvDocumentId = Number(req.body.cvId || req.body.document_id || req.body.documentId || req.body.cv_document_id);
    if (!cvDocumentId) return res.status(400).json({ message: 'Vui lòng chọn CV để ứng tuyển.' });

    await db.query(
      `
      INSERT INTO applications (job_id, candidate_id, cv_document_id, cover_letter, status)
      VALUES (?, ?, ?, ?, 'pending')
      `,
      [req.params.id, candidateId, cvDocumentId, req.body.coverLetter || req.body.cover_letter || null]
    );

    const [[job]] = await db.query('SELECT employer_id, title FROM jobs WHERE id = ? LIMIT 1', [req.params.id]);
    await notificationService.createNotification({
      userId: job?.employer_id,
      type: 'new_cv',
      title: 'Có CV mới ứng tuyển',
      message: `Ứng viên mới vừa nộp CV cho vị trí ${job?.title || 'đang tuyển'}.`
    });

    res.status(201).json({ success: true, message: 'Ứng tuyển thành công.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Bạn đã ứng tuyển công việc này rồi.' });
    }
    console.error('Apply job error:', error);
    res.status(500).json({ message: 'Lỗi ứng tuyển', error: error.message });
  }
};
