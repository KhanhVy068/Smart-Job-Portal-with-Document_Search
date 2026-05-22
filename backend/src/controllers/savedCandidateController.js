const db = require('../config/db');

let ensurePromise = null;

function getEmployerId(req) {
  return req.user?.id;
}

function requireEmployer(req, res) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role && role !== 'employer' && role !== 'admin') {
    res.status(403).json({ message: 'Chỉ tài khoản employer được lưu ứng viên.' });
    return false;
  }
  return true;
}

async function ignoreDuplicateColumn(sql) {
  try {
    await db.query(sql);
  } catch (error) {
    if (error.code !== 'ER_DUP_FIELDNAME') throw error;
  }
}

async function ensureSavedCandidatesTable() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS saved_candidates (
          id INT AUTO_INCREMENT PRIMARY KEY,
          employer_id INT NOT NULL,
          candidate_id INT NOT NULL,
          application_id INT NULL,
          document_id INT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_saved_candidate (employer_id, candidate_id),
          INDEX idx_saved_candidates_employer (employer_id),
          INDEX idx_saved_candidates_candidate (candidate_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await ignoreDuplicateColumn('ALTER TABLE saved_candidates ADD COLUMN application_id INT NULL AFTER candidate_id');
      await ignoreDuplicateColumn('ALTER TABLE saved_candidates ADD COLUMN document_id INT NULL AFTER application_id');
    })().catch(error => {
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

async function resolveCandidate(body = {}) {
  let candidateId = Number(body.candidateId || body.candidate_id || body.id || 0) || null;
  const applicationId = Number(body.applicationId || body.application_id || 0) || null;
  let documentId = Number(body.documentId || body.cvDocumentId || body.document_id || 0) || null;

  if (applicationId) {
    const [[application]] = await db.query(
      'SELECT candidate_id, cv_document_id FROM applications WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [applicationId]
    );
    candidateId = application?.candidate_id || candidateId || null;
    documentId = documentId || application?.cv_document_id || null;
  }

  return { candidateId, applicationId, documentId };
}

exports.ensureSavedCandidatesTable = ensureSavedCandidatesTable;

exports.saveCandidate = async (req, res) => {
  try {
    if (!requireEmployer(req, res)) return;
    await ensureSavedCandidatesTable();

    const employerId = getEmployerId(req);
    const { candidateId, applicationId, documentId } = await resolveCandidate(req.body);

    if (!candidateId) return res.status(400).json({ message: 'Thiếu ID ứng viên.' });

    await db.query(
      `INSERT INTO saved_candidates (employer_id, candidate_id, application_id, document_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         application_id = COALESCE(VALUES(application_id), application_id),
         document_id = COALESCE(VALUES(document_id), document_id)`,
      [employerId, candidateId, applicationId, documentId]
    );

    res.json({ success: true, saved: true, candidateId, message: 'Đã lưu ứng viên' });
  } catch (error) {
    console.error('Save candidate error:', error);
    res.status(500).json({ message: 'Lỗi lưu ứng viên', error: error.message });
  }
};

exports.getSavedCandidates = async (req, res) => {
  try {
    if (!requireEmployer(req, res)) return;
    await ensureSavedCandidatesTable();

    const employerId = getEmployerId(req);
    const [rows] = await db.query(
      `SELECT sc.id AS saved_id, sc.candidate_id, sc.application_id, sc.document_id, sc.created_at AS saved_at,
              u.full_name AS candidate_name, u.email, u.phone, u.avatar_url,
              cp.title AS desired_position, cp.location, cp.skills AS profile_skills,
              d.id AS cv_document_id, d.file_name, d.file_url, d.status AS cv_status,
              d.extraction_status, d.extracted_text, d.extracted_skills,
              d.desired_position AS doc_desired_position, d.extracted_summary
       FROM saved_candidates sc
       JOIN users u ON u.id = sc.candidate_id
       LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
       LEFT JOIN documents d ON d.id = COALESCE(
         sc.document_id,
         (SELECT id FROM documents WHERE user_id = sc.candidate_id AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1)
       )
       WHERE sc.employer_id = ?
       ORDER BY sc.created_at DESC`,
      [employerId]
    );

    const items = rows.map(row => {
      const skills = normalizeSkills(row.profile_skills).length
        ? normalizeSkills(row.profile_skills)
        : normalizeSkills(row.extracted_skills);
      const desiredPosition = row.desired_position || row.doc_desired_position || 'Chưa cập nhật vị trí mong muốn';
      return {
        id: row.saved_id,
        savedId: row.saved_id,
        candidateId: row.candidate_id,
        applicationId: row.application_id,
        name: row.candidate_name || 'Ứng viên',
        fullName: row.candidate_name || 'Ứng viên',
        candidateName: row.candidate_name || 'Ứng viên',
        email: row.email || '',
        phone: row.phone || '',
        avatarUrl: row.avatar_url || '',
        title: desiredPosition,
        position: desiredPosition,
        desiredPosition: row.desired_position || row.doc_desired_position || '',
        location: row.location || '',
        fileName: row.file_name || '',
        cvUrl: row.file_url || '',
        url: row.file_url || '',
        cvDocumentId: row.cv_document_id || row.document_id || '',
        cvStatus: row.cv_status || '',
        extractionStatus: row.extraction_status || row.cv_status || '',
        status: row.cv_status || '',
        summary: row.extracted_summary || (row.extracted_text || '').slice(0, 360),
        extractedText: row.extracted_text || '',
        extractedSkills: normalizeSkills(row.extracted_skills),
        skills,
        savedAt: row.saved_at,
        score: 0,
        saved: true
      };
    });

    res.json({ total: items.length, items, candidates: items, data: items });
  } catch (error) {
    console.error('Get saved candidates error:', error);
    res.status(500).json({ message: 'Lỗi lấy ứng viên đã lưu', error: error.message });
  }
};

exports.getSavedCandidateIds = async (req, res) => {
  try {
    if (!requireEmployer(req, res)) return;
    await ensureSavedCandidatesTable();
    const [rows] = await db.query(
      'SELECT candidate_id FROM saved_candidates WHERE employer_id = ?',
      [getEmployerId(req)]
    );
    res.json({ ids: rows.map(row => row.candidate_id) });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy danh sách ID đã lưu', error: error.message });
  }
};

exports.unsaveCandidate = async (req, res) => {
  try {
    if (!requireEmployer(req, res)) return;
    await ensureSavedCandidatesTable();

    const id = Number(req.params.candidateId || req.params.id);
    const [result] = await db.query(
      `DELETE FROM saved_candidates
       WHERE employer_id = ? AND (candidate_id = ? OR id = ?)`,
      [getEmployerId(req), id, id]
    );

    if (!result.affectedRows) return res.status(404).json({ message: 'Không tìm thấy ứng viên đã lưu.' });
    res.json({ success: true, saved: false, candidateId: id, message: 'Đã bỏ lưu ứng viên' });
  } catch (error) {
    console.error('Unsave candidate error:', error);
    res.status(500).json({ message: 'Lỗi bỏ lưu ứng viên', error: error.message });
  }
};
