const db = require('../config/db');
const searchService = require('../services/searchService');

function fixMojibake(value) {
  if (typeof value !== 'string') return value;
  if (!/[ÃÂÄÆ]|á[º»¼½¾¿]|à[¡¢£¤¥¦§¨©ª«¬­®¯]|â[\u0080-\u009c]/.test(value)) return value;
  try {
    return Buffer.from(value, 'latin1').toString('utf8');
  } catch {
    return value;
  }
}

function getUserId(req, fallback) {
  return req.user?.id || fallback;
}

function toJobResponse(row = {}) {
  const salary = row.salary_min || row.salary_max
    ? `${Number(row.salary_min || 0).toLocaleString('vi-VN')} - ${Number(row.salary_max || 0).toLocaleString('vi-VN')} ${row.currency || 'VND'}`
    : 'Thỏa thuận';

  return {
    id: row.id,
    employerId: row.employer_id,
    categoryId: row.category_id,
    title: fixMojibake(row.title),
    companyName: fixMojibake(row.company_name || row.employer_name || 'Smart Job Portal'),
    companyLogo: row.company_logo || '',
    description: fixMojibake(row.description),
    location: fixMojibake(row.location),
    salary,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    currency: row.currency,
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
    isApplied: Boolean(row.is_applied)
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

async function getDefaultCategoryId() {
  const [[category]] = await db.query('SELECT id FROM job_categories ORDER BY id LIMIT 1');
  return category?.id || 1;
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
        u.full_name LIKE ? OR
        c.name LIKE ?
      )`);
      const like = `%${keyword}%`;
      params.push(like, like, like, like, like, like, like);
    }

    if (req.query.location) {
      const locationKeywords = getLocationKeywords(req.query.location);
      where.push(`(${locationKeywords.map(() => 'j.location LIKE ?').join(' OR ')})`);
      params.push(...locationKeywords.map(item => `%${item}%`));
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

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const fromSql = `
      FROM jobs j
      LEFT JOIN users u ON u.id = j.employer_id
      LEFT JOIN job_categories c ON c.id = j.category_id
    `;
    const [[countRow]] = await db.query(`SELECT COUNT(DISTINCT j.id) AS total ${fromSql} ${whereSql}`, params);
    const [rows] = await db.query(
      `
      SELECT j.*, u.full_name AS employer_name, u.avatar_url AS company_logo,
             c.name AS category_name, COUNT(a.id) AS application_count
      ${fromSql}
      LEFT JOIN applications a ON a.job_id = j.id AND a.deleted_at IS NULL
      ${whereSql}
      GROUP BY j.id
      ORDER BY j.posted_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    const items = rows.map(toJobResponse);
    res.json({
      total: countRow.total,
      page,
      limit,
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
  req.query.limit = req.query.limit || 100;
  return exports.getJobs(req, res);
};

exports.getAllJobs = exports.getJobs;

exports.getJobById = async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT j.*, u.full_name AS employer_name, u.avatar_url AS company_logo,
             c.name AS category_name, COUNT(a.id) AS application_count
      FROM jobs j
      LEFT JOIN users u ON u.id = j.employer_id
      LEFT JOIN job_categories c ON c.id = j.category_id
      LEFT JOIN applications a ON a.job_id = j.id AND a.deleted_at IS NULL
      WHERE j.id = ? AND j.deleted_at IS NULL
      GROUP BY j.id
      LIMIT 1
      `,
      [req.params.id]
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
    const title = String(req.body.title || '').trim();
    if (title.length < 5) {
      return res.status(400).json({ message: 'Tiêu đề công việc phải có ít nhất 5 ký tự.' });
    }

    const categoryId = Number(req.body.category_id || req.body.categoryId || await getDefaultCategoryId());
    const employerId = getUserId(req, 1);
    const { salaryMin, salaryMax } = parseSalary(req.body);
    const expiryDate = req.body.expiry_date || req.body.deadline || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    const [result] = await db.query(
      `
      INSERT INTO jobs (
        employer_id, category_id, title, description, location,
        salary_min, salary_max, currency, job_type, status,
        expiry_date, experience_required, positions_available, benefits, requirements
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        employerId,
        categoryId,
        title,
        req.body.description || 'Chưa có mô tả.',
        req.body.location || 'Chưa cập nhật',
        salaryMin,
        salaryMax,
        req.body.currency || 'VND',
        normalizeJobType(req.body.job_type || req.body.jobType || req.body.type || req.body.employmentType),
        normalizeStatus(req.body.status),
        expiryDate,
        Number(req.body.experience_required || req.body.experience || 0),
        Number(req.body.positions_available || req.body.positions || 1),
        req.body.benefits || null,
        req.body.requirements || null
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
    const current = await db.query('SELECT * FROM jobs WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!current[0].length) return res.status(404).json({ message: 'Không tìm thấy việc làm' });

    const job = current[0][0];
    const { salaryMin, salaryMax } = parseSalary(req.body);

    await db.query(
      `
      UPDATE jobs
      SET title = ?, description = ?, location = ?, salary_min = ?, salary_max = ?,
          currency = ?, job_type = ?, status = ?, expiry_date = ?,
          experience_required = ?, positions_available = ?, benefits = ?, requirements = ?
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

    res.status(201).json({ success: true, message: 'Ứng tuyển thành công.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Bạn đã ứng tuyển công việc này rồi.' });
    }
    console.error('Apply job error:', error);
    res.status(500).json({ message: 'Lỗi ứng tuyển', error: error.message });
  }
};
