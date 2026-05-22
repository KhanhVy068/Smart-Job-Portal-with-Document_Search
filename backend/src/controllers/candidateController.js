const db = require('../config/db');
const searchService = require('../services/searchService');
const performanceLogService = require('../services/performanceLogService');

async function ensureSavedCandidatesTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS saved_candidates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employer_id INT NOT NULL,
      candidate_id INT NOT NULL,
      document_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_employer_candidate (employer_id, candidate_id),
      INDEX idx_employer (employer_id),
      INDEX idx_candidate (candidate_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function ignoreDuplicateDDL(sql) {
  try {
    await db.query(sql);
  } catch (error) {
    if (!['ER_DUP_FIELDNAME', 'ER_TABLE_EXISTS_ERROR'].includes(error.code)) throw error;
  }
}

async function ensureCandidateReadSchema() {
  await ignoreDuplicateDDL(`
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
  await ignoreDuplicateDDL('ALTER TABLE documents ADD COLUMN extracted_skills TEXT NULL AFTER extracted_text_hash');
  await ignoreDuplicateDDL('ALTER TABLE documents ADD COLUMN desired_position VARCHAR(255) NULL AFTER extracted_skills');
  await ignoreDuplicateDDL('ALTER TABLE documents ADD COLUMN extracted_summary TEXT NULL AFTER desired_position');
  await ignoreDuplicateDDL("ALTER TABLE documents ADD COLUMN extraction_status VARCHAR(50) DEFAULT 'pending' AFTER status");
  await ignoreDuplicateDDL('ALTER TABLE documents ADD COLUMN extracted_at DATETIME NULL AFTER processed_at');
}

function getEmployerId(req) {
  return req.user?.id || 1;
}

function requireEmployer(req, res) {
  if (req.user?.role && req.user.role !== 'employer') {
    res.status(403).json({ message: 'Chỉ tài khoản employer được lưu ứng viên.' });
    return false;
  }
  return true;
}

function toCandidate(row = {}) {
  const profileSkills = normalizeSkills(row.profile_skills);
  const extractedSkills = normalizeSkills(row.extracted_skills);
  const skills = profileSkills.length ? profileSkills : extractedSkills;
  const desiredPosition = row.desired_position || inferDesiredPosition(row.extracted_text) || row.job_title || row.title || '';
  const extractionStatus = row.extraction_status || row.cv_status || row.document_status || 'pending';
  return {
    id: row.candidate_id || row.user_id || row.id,
    applicationId: row.application_id,
    name: row.candidate_name || row.full_name || 'Ứng viên',
    fullName: row.candidate_name || row.full_name || 'Ứng viên',
    candidateName: row.candidate_name || row.full_name || 'Ứng viên',
    email: row.candidate_email || row.email || '',
    phone: row.phone || '',
    position: desiredPosition || 'Chưa cập nhật vị trí mong muốn',
    desiredPosition: desiredPosition || 'Chưa cập nhật vị trí mong muốn',
    desired_position: desiredPosition || '',
    jobTitle: row.job_title || row.title || '',
    fileName: row.cv_name || row.file_name || '',
    cvUrl: row.cv_link || row.file_url || '',
    url: row.cv_link || row.file_url || '',
    cvDocumentId: row.cv_document_id || row.document_id || '',
    status: row.status || 'pending',
    cvStatus: row.cv_status || row.document_status || 'pending',
    extractionStatus,
    extraction_status: extractionStatus,
    createdAt: row.applied_at || row.created_at,
    appliedAt: row.applied_at || row.created_at,
    matchScore: row.match_score || 0,
    score: row.match_score || 0,
    location: row.job_location || '',
    extractedText: row.extracted_text || '',
    extractedSkills,
    summary: row.extracted_summary || '',
    skills
  };
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

function inferDesiredPosition(text = '') {
  const firstLine = String(text || '').split(/\r?\n| {2,}/).map(line => line.trim()).find(Boolean);
  if (!firstLine) return '';
  return firstLine.length <= 80 ? firstLine : '';
}

async function loadCandidates(whereSql = '', params = []) {
  const [rows] = await db.query(
    `
    SELECT a.id AS application_id, a.status, a.applied_at, a.cv_document_id,
           u.id AS candidate_id, u.full_name AS candidate_name, u.email AS candidate_email, u.phone,
           cp.skills AS profile_skills, cp.desired_position,
           j.title AS job_title, j.location AS job_location,
           d.id AS document_id, d.file_name AS cv_name, d.file_url AS cv_link,
           d.status AS cv_status, d.extraction_status, d.extracted_text, d.extracted_skills,
           d.desired_position, d.extracted_summary
    FROM applications a
    JOIN users u ON a.candidate_id = u.id
    JOIN jobs j ON a.job_id = j.id
    JOIN documents d ON a.cv_document_id = d.id
    LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
    WHERE a.deleted_at IS NULL ${whereSql}
    ORDER BY a.applied_at DESC
    LIMIT 100
    `,
    params
  );
  return rows.map(toCandidate);
}

exports.ensureSavedCandidatesTable = ensureSavedCandidatesTable;

exports.getCandidates = async (req, res) => {
  try {
    await ensureCandidateReadSchema();
    const items = await loadCandidates();
    res.json({ total: items.length, items, candidates: items, data: items });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy danh sách ứng viên', error: error.message });
  }
};

exports.searchCandidates = async (req, res) => {
  try {
    await ensureCandidateReadSchema();
    const result = await searchService.search({
      q: req.query.q || req.query.keyword || '',
      type: 'cv',
      location: req.query.location || '',
      page: req.query.page,
      limit: req.query.limit
    });

    const documentIds = result.items
      .map(item => item.documentId || item.id)
      .filter(Boolean);

    let enrichMap = {};
    if (documentIds.length) {
      const placeholders = documentIds.map(() => '?').join(',');
      const [rows] = await db.query(
        `SELECT d.id AS document_id, d.file_url, d.extracted_text, d.status, d.extraction_status,
                u.phone, u.avatar_url, cp.skills AS profile_skills, cp.desired_position,
                d.extracted_skills, d.desired_position AS doc_desired_position, d.extracted_summary
         FROM documents d
         JOIN users u ON u.id = d.user_id
         LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
         WHERE d.id IN (${placeholders})`,
        documentIds
      );
      rows.forEach(r => { enrichMap[r.document_id] = r; });
    }

    const items = result.items.map(item => {
      const docId = item.documentId || item.id;
      const extra = enrichMap[docId] || {};
      const skills = normalizeSkills(extra.profile_skills).length
        ? normalizeSkills(extra.profile_skills)
        : normalizeSkills(extra.extracted_skills || item.skills);
      const desiredPosition = extra.desired_position || extra.doc_desired_position || item.desiredPosition || inferDesiredPosition(extra.extracted_text) || '';
      return {
        id: docId,
        candidateId: item.candidateId,
        name: item.candidateName || item.name || item.title,
        fullName: item.candidateName || item.name || item.title,
        candidateName: item.candidateName || item.name || item.title,
        email: item.email || '',
        phone: extra.phone || '',
        fileName: item.fileName || item.title,
        cvUrl: extra.file_url || item.fileUrl || item.url || '',
        url: extra.file_url || item.fileUrl || item.url || '',
        cvDocumentId: docId,
        status: extra.status || item.status || 'completed',
        cvStatus: extra.status || item.status || 'completed',
        extractionStatus: extra.extraction_status || item.extractionStatus || extra.status || item.status || 'pending',
        position: desiredPosition || item.title || 'Chưa cập nhật vị trí mong muốn',
        desiredPosition: desiredPosition || item.title || '',
        desired_position: desiredPosition,
        summary: extra.extracted_summary || item.summary || '',
        matchScore: item.score || 0,
        score: item.score || 0,
        extractedText: extra.extracted_text || '',
        extractedSkills: normalizeSkills(extra.extracted_skills),
        skills
      };
    });

    await performanceLogService.logPerformance({
      eventType: 'filter_candidates',
      engine: result.engine,
      queryText: req.query.q || req.query.keyword || '',
      filters: {
        location: req.query.location || '',
        page: req.query.page || 1,
        limit: req.query.limit || 10
      },
      resultCount: result.total || items.length,
      latencyMs: result.latencyMs,
      userId: req.user?.id || null
    });

    res.json({ ...result, items, candidates: items, data: items });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi tìm ứng viên', error: error.message });
  }
};

exports.saveCandidate = async (req, res) => {
  try {
    if (!requireEmployer(req, res)) return;
    const employerId = getEmployerId(req);
    const candidateId = Number(req.body.id || req.body.candidateId);
    const documentId = Number(req.body.documentId || req.body.cvDocumentId || 0) || null;

    if (!candidateId) {
      return res.status(400).json({ message: 'Thiếu ID ứng viên.' });
    }

    await ensureSavedCandidatesTable();
    await db.query(
      `INSERT IGNORE INTO saved_candidates (employer_id, candidate_id, document_id)
       VALUES (?, ?, ?)`,
      [employerId, candidateId, documentId]
    );

    res.json({ success: true, message: 'Đã lưu ứng viên.' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lưu ứng viên', error: error.message });
  }
};

exports.getSavedCandidates = async (req, res) => {
  try {
    const employerId = getEmployerId(req);
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 8), 1), 100);
    const offset = (page - 1) * limit;

    await ensureSavedCandidatesTable();
    await ensureCandidateReadSchema();

    const qFilter = req.query.q ? `AND (u.full_name LIKE ? OR u.email LIKE ?)` : '';
    const qParams = req.query.q ? [`%${req.query.q}%`, `%${req.query.q}%`] : [];

    const orderBy = req.query.sort === 'saved-asc' ? 'sc.created_at ASC' : 'sc.created_at DESC';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM saved_candidates sc
       JOIN users u ON u.id = sc.candidate_id
       WHERE sc.employer_id = ? ${qFilter}`,
      [employerId, ...qParams]
    );

    const [rows] = await db.query(
      `SELECT sc.id AS saved_id, sc.candidate_id, sc.document_id, sc.created_at AS saved_at,
              u.full_name AS candidate_name, u.email, u.phone, u.avatar_url,
              cp.skills AS profile_skills, cp.desired_position, cp.location,
              d.id AS doc_id, d.file_name, d.file_url, d.status AS cv_status, d.extraction_status,
              d.extracted_text, d.extracted_skills, d.desired_position AS doc_desired_position, d.extracted_summary
       FROM saved_candidates sc
       JOIN users u ON u.id = sc.candidate_id
       LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
       LEFT JOIN documents d ON d.id = IFNULL(
         sc.document_id,
         (SELECT id FROM documents WHERE user_id = sc.candidate_id AND deleted_at IS NULL
          ORDER BY created_at DESC LIMIT 1)
       )
       WHERE sc.employer_id = ? ${qFilter}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [employerId, ...qParams, limit, offset]
    );

    const items = rows.map(row => {
      const skills = normalizeSkills(row.profile_skills).length
        ? normalizeSkills(row.profile_skills)
        : normalizeSkills(row.extracted_skills);
      const desiredPosition = row.desired_position || row.doc_desired_position || inferDesiredPosition(row.extracted_text);
      return {
        id: row.saved_id,
        savedId: row.saved_id,
        candidateId: row.candidate_id,
        name: row.candidate_name || 'Ứng viên',
        fullName: row.candidate_name || 'Ứng viên',
        candidateName: row.candidate_name || 'Ứng viên',
        email: row.email || '',
        phone: row.phone || '',
        avatarUrl: row.avatar_url || '',
        fileName: row.file_name || '',
        cvUrl: row.file_url || '',
        url: row.file_url || '',
        cvDocumentId: row.doc_id || row.document_id || '',
        cvStatus: row.cv_status || '',
        extractionStatus: row.extraction_status || row.cv_status || '',
        status: row.cv_status || '',
        summary: row.extracted_summary || (row.extracted_text || '').slice(0, 360),
        extractedText: row.extracted_text || '',
        extractedSkills: normalizeSkills(row.extracted_skills),
        savedAt: row.saved_at,
        score: 0,
        skills,
        title: desiredPosition || 'Chưa cập nhật vị trí mong muốn',
        position: desiredPosition || 'Chưa cập nhật vị trí mong muốn',
        desiredPosition: desiredPosition || '',
        location: row.location || ''
      };
    });

    const totalPages = Math.max(1, Math.ceil(total / limit));
    res.json({ total, page, limit, totalPages, items, candidates: items, data: items });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy ứng viên đã lưu', error: error.message });
  }
};

exports.getSavedCandidateIds = async (req, res) => {
  try {
    const employerId = getEmployerId(req);
    await ensureSavedCandidatesTable();
    const [rows] = await db.query(
      `SELECT candidate_id FROM saved_candidates WHERE employer_id = ?`,
      [employerId]
    );
    res.json({ ids: rows.map(r => r.candidate_id) });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy danh sách ID đã lưu', error: error.message });
  }
};

exports.removeSavedCandidate = async (req, res) => {
  try {
    const employerId = getEmployerId(req);
    const savedId = Number(req.params.id);

    await ensureSavedCandidatesTable();
    const [result] = await db.query(
      `DELETE FROM saved_candidates WHERE id = ? AND employer_id = ?`,
      [savedId, employerId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: 'Không tìm thấy ứng viên đã lưu.' });
    }

    res.json({ success: true, message: 'Đã bỏ lưu ứng viên.' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi bỏ lưu ứng viên', error: error.message });
  }
};

exports.updateCandidateStatus = async (req, res) => {
  res.json({ success: true, message: 'Đã cập nhật trạng thái ứng viên.' });
};
