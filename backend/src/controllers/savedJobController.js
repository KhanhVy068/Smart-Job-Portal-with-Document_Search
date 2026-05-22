const db = require('../config/db');

let ensurePromise = null;

function getCandidateId(req) {
  return req.user?.id;
}

function requireCandidate(req, res) {
  if (req.user?.role !== 'candidate') {
    res.status(403).json({ message: 'Chỉ tài khoản candidate được lưu việc.' });
    return false;
  }
  return true;
}

async function ensureSavedJobsTable() {
  if (!ensurePromise) {
    ensurePromise = db.query(`
      CREATE TABLE IF NOT EXISTS saved_jobs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        job_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_saved_jobs_user_job (user_id, job_id),
        INDEX idx_saved_jobs_user (user_id),
        INDEX idx_saved_jobs_job (job_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch(error => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}

function normalizeSkills(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return normalizeSkills(parsed);
  } catch {}
  return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

function toSavedJob(row = {}) {
  const salary = row.salary_min || row.salary_max
    ? `${Number(row.salary_min || 0).toLocaleString('vi-VN')} - ${Number(row.salary_max || 0).toLocaleString('vi-VN')} ${row.currency || 'VND'}`
    : 'Thỏa thuận';

  return {
    id: row.job_id,
    savedId: row.saved_id,
    title: row.title,
    companyName: row.company_name || row.employer_name || 'Smart Job Portal',
    companyLogo: row.company_logo || '',
    location: row.location || row.company_address || 'Chưa cập nhật địa điểm',
    salary,
    jobType: row.job_type,
    skills: normalizeSkills(row.skills),
    postedAt: row.posted_at,
    createdAt: row.posted_at,
    savedAt: row.saved_at,
    isSaved: true
  };
}

exports.ensureSavedJobsTable = ensureSavedJobsTable;

exports.getSavedJobs = async (req, res) => {
  try {
    if (!requireCandidate(req, res)) return;
    await ensureSavedJobsTable();
    const [rows] = await db.query(
      `
      SELECT sj.id AS saved_id, sj.job_id, sj.created_at AS saved_at,
             j.*, u.full_name AS employer_name,
             COALESCE(ep.company_name, u.full_name) AS company_name,
             ep.address AS company_address,
             COALESCE(ep.logo_url, u.avatar_url) AS company_logo
      FROM saved_jobs sj
      JOIN jobs j ON j.id = sj.job_id AND j.deleted_at IS NULL
      LEFT JOIN users u ON u.id = j.employer_id
      LEFT JOIN employer_profiles ep ON ep.user_id = j.employer_id
      WHERE sj.user_id = ?
      ORDER BY sj.created_at DESC
      `,
      [getCandidateId(req)]
    );
    const items = rows.map(toSavedJob);
    res.json({ total: items.length, items, jobs: items, data: items });
  } catch (error) {
    console.error('Get saved jobs error:', error);
    res.status(500).json({ message: 'Lỗi lấy việc đã lưu', error: error.message });
  }
};

exports.saveJob = async (req, res) => {
  try {
    if (!requireCandidate(req, res)) return;
    const jobId = Number(req.body.jobId || req.body.job_id || req.body.id || req.params.jobId);
    if (!jobId) return res.status(400).json({ message: 'Thiếu ID công việc.' });

    await ensureSavedJobsTable();
    await db.query(
      'INSERT IGNORE INTO saved_jobs (user_id, job_id) VALUES (?, ?)',
      [getCandidateId(req), jobId]
    );
    res.status(201).json({ success: true, saved: true, jobId, isSaved: true, message: 'Đã lưu việc' });
  } catch (error) {
    console.error('Save job error:', error);
    res.status(500).json({ message: 'Lỗi lưu việc', error: error.message });
  }
};

exports.unsaveJob = async (req, res) => {
  try {
    if (!requireCandidate(req, res)) return;
    const jobId = Number(req.params.jobId || req.params.id);
    await ensureSavedJobsTable();
    await db.query('DELETE FROM saved_jobs WHERE user_id = ? AND job_id = ?', [getCandidateId(req), jobId]);
    res.json({ success: true, saved: false, jobId, isSaved: false, message: 'Đã bỏ lưu việc' });
  } catch (error) {
    console.error('Unsave job error:', error);
    res.status(500).json({ message: 'Lỗi bỏ lưu việc', error: error.message });
  }
};

exports.getSavedJobIds = async (req, res) => {
  try {
    if (!requireCandidate(req, res)) return;
    await ensureSavedJobsTable();
    const [rows] = await db.query('SELECT job_id FROM saved_jobs WHERE user_id = ?', [getCandidateId(req)]);
    res.json({ ids: rows.map(row => row.job_id) });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy danh sách ID việc đã lưu', error: error.message });
  }
};
