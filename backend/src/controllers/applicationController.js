const db = require('../config/db');

function fixMojibake(value) {
  if (typeof value !== 'string') return value;
  if (!/[ÃÂÄÆ]|á[º»¼½¾¿]|à[¡¢£¤¥¦§¨©ª«¬­®¯]|â[\u0080-\u009c]/.test(value)) return value;
  try {
    return Buffer.from(value, 'latin1').toString('utf8');
  } catch {
    return value;
  }
}

function getUserId(req, fallback = 2) {
  return req.user?.id || fallback;
}

function toApplicationResponse(row = {}) {
  return {
    id: row.id || row.application_id,
    applicationId: row.id || row.application_id,
    jobId: row.job_id,
    jobTitle: fixMojibake(row.job_title),
    companyName: fixMojibake(row.company_name || row.employer_name || 'Smart Job Portal'),
    location: fixMojibake(row.location),
    status: row.status,
    applicationStatus: row.status,
    appliedAt: row.applied_at,
    updatedAt: row.updated_at,
    candidateId: row.candidate_id,
    candidateName: fixMojibake(row.candidate_name),
    email: row.candidate_email,
    phone: row.candidate_phone || row.phone,
    coverLetter: row.cover_letter,
    expectedSalary: row.expected_salary,
    availableFrom: row.available_from,
    cvDocumentId: row.cv_document_id,
    fileName: fixMojibake(row.cv_name),
    cvUrl: row.cv_link,
    url: row.cv_link,
    cvStatus: row.cv_status,
    extractedText: fixMojibake(row.extracted_text),
    documentStatus: row.cv_status
  };
}

function normalizeApplicationStatus(status = '') {
  const value = String(status).trim().toLowerCase();
  const map = {
    submitted: 'pending',
    pending: 'pending',
    reviewing: 'reviewed',
    reviewed: 'reviewed',
    shortlisted: 'shortlisted',
    interview: 'interviewed',
    interviewed: 'interviewed',
    offered: 'offered',
    hired: 'hired',
    accepted: 'hired',
    rejected: 'rejected'
  };
  return map[value] || null;
}

exports.applyJob = async (req, res) => {
  try {
    const jobId = Number(req.body.job_id || req.body.jobId || req.params.jobId);
    const cvDocumentId = Number(req.body.document_id || req.body.documentId || req.body.cvId || req.body.cv_document_id);
    const candidateId = getUserId(req);

    if (!jobId || !cvDocumentId) {
      return res.status(400).json({ message: 'Mã công việc hoặc CV không hợp lệ.' });
    }

    await db.query(
      `
      INSERT INTO applications (job_id, candidate_id, cv_document_id, cover_letter, status)
      VALUES (?, ?, ?, ?, 'pending')
      `,
      [jobId, candidateId, cvDocumentId, req.body.coverLetter || req.body.cover_letter || null]
    );

    res.status(201).json({ success: true, message: 'Nộp đơn ứng tuyển thành công.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Bạn đã ứng tuyển công việc này rồi.' });
    }
    console.error('Apply error:', error);
    res.status(500).json({ message: 'Lỗi nộp đơn ứng tuyển', error: error.message });
  }
};

exports.getMyApplications = async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT a.*, j.title AS job_title, j.location, u.full_name AS employer_name,
             d.file_name AS cv_name, d.file_url AS cv_link, d.status AS cv_status
      FROM applications a
      JOIN jobs j ON a.job_id = j.id
      LEFT JOIN users u ON j.employer_id = u.id
      JOIN documents d ON a.cv_document_id = d.id
      WHERE a.candidate_id = ? AND a.deleted_at IS NULL
      ORDER BY a.applied_at DESC
      `,
      [getUserId(req)]
    );

    res.json(rows.map(toApplicationResponse));
  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({ message: 'Lỗi lấy lịch sử ứng tuyển', error: error.message });
  }
};

exports.getApplicantsByJob = async (req, res) => {
  try {
    const params = [];
    let whereSql = 'a.deleted_at IS NULL';
    if (req.params.jobId || req.query.jobId) {
      whereSql += ' AND a.job_id = ?';
      params.push(req.params.jobId || req.query.jobId);
    }

    const [rows] = await db.query(
      `
      SELECT a.id AS application_id, a.job_id, a.status, a.applied_at, a.updated_at,
             u.full_name AS candidate_name, u.email AS candidate_email,
             d.file_url AS cv_link, d.file_name AS cv_name, d.status AS cv_status,
             j.title AS job_title
      FROM applications a
      JOIN users u ON a.candidate_id = u.id
      JOIN documents d ON a.cv_document_id = d.id
      JOIN jobs j ON a.job_id = j.id
      WHERE ${whereSql}
      ORDER BY a.applied_at DESC
      `,
      params
    );

    const items = rows.map(toApplicationResponse);
    res.json({ total: items.length, items, data: items });
  } catch (error) {
    console.error('Get applicants error:', error);
    res.status(500).json({ message: 'Lỗi lấy danh sách ứng viên', error: error.message });
  }
};

exports.getApplicationById = async (req, res) => {
  try {
    const [[row]] = await db.query(
      `
      SELECT a.id AS application_id, a.job_id, a.candidate_id, a.cv_document_id,
             a.cover_letter, a.expected_salary, a.available_from, a.status,
             a.applied_at, a.updated_at,
             u.full_name AS candidate_name, u.email AS candidate_email, u.phone AS candidate_phone,
             d.file_url AS cv_link, d.file_name AS cv_name, d.status AS cv_status, d.extracted_text,
             j.title AS job_title, j.location,
             employer.full_name AS employer_name
      FROM applications a
      JOIN users u ON a.candidate_id = u.id
      JOIN documents d ON a.cv_document_id = d.id
      JOIN jobs j ON a.job_id = j.id
      LEFT JOIN users employer ON j.employer_id = employer.id
      WHERE a.id = ? AND a.deleted_at IS NULL
      LIMIT 1
      `,
      [req.params.id]
    );

    if (!row) return res.status(404).json({ message: 'Không tìm thấy hồ sơ ứng tuyển.' });
    res.json(toApplicationResponse(row));
  } catch (error) {
    console.error('Get application detail error:', error);
    res.status(500).json({ message: 'Lỗi lấy chi tiết hồ sơ ứng tuyển', error: error.message });
  }
};

exports.updateApplicationStatus = async (req, res) => {
  try {
    const nextStatus = normalizeApplicationStatus(req.body.status || req.body.applicationStatus || req.body.cvStatus);
    if (!nextStatus) {
      return res.status(400).json({ message: 'Trạng thái hồ sơ không hợp lệ.' });
    }

    const [result] = await db.query(
      `
      UPDATE applications
      SET status = ?,
          reviewed_at = CASE WHEN ? <> 'pending' THEN COALESCE(reviewed_at, NOW()) ELSE reviewed_at END,
          updated_at = NOW()
      WHERE id = ? AND deleted_at IS NULL
      `,
      [nextStatus, nextStatus, req.params.id]
    );

    if (!result.affectedRows) return res.status(404).json({ message: 'Không tìm thấy hồ sơ ứng tuyển.' });

    const [[row]] = await db.query(
      `
      SELECT a.*, j.title AS job_title, j.location, employer.full_name AS employer_name,
             u.full_name AS candidate_name, u.email AS candidate_email, u.phone AS candidate_phone,
             d.file_name AS cv_name, d.file_url AS cv_link, d.status AS cv_status, d.extracted_text
      FROM applications a
      JOIN jobs j ON a.job_id = j.id
      LEFT JOIN users employer ON j.employer_id = employer.id
      JOIN users u ON a.candidate_id = u.id
      JOIN documents d ON a.cv_document_id = d.id
      WHERE a.id = ?
      `,
      [req.params.id]
    );

    res.json({ success: true, message: 'Đã cập nhật trạng thái hồ sơ.', application: toApplicationResponse(row) });
  } catch (error) {
    console.error('Update application status error:', error);
    res.status(500).json({ message: 'Lỗi cập nhật trạng thái hồ sơ', error: error.message });
  }
};
