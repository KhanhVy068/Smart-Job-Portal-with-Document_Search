const db = require('../config/db');
const searchService = require('../services/searchService');

function toCandidate(row = {}) {
  return {
    id: row.candidate_id || row.user_id || row.id,
    applicationId: row.application_id,
    name: row.candidate_name || row.full_name || 'Ứng viên',
    fullName: row.candidate_name || row.full_name || 'Ứng viên',
    candidateName: row.candidate_name || row.full_name || 'Ứng viên',
    email: row.candidate_email || row.email || '',
    phone: row.phone || '',
    position: row.job_title || row.title || 'Ứng viên',
    jobTitle: row.job_title || row.title || '',
    fileName: row.cv_name || row.file_name || '',
    cvUrl: row.cv_link || row.file_url || '',
    url: row.cv_link || row.file_url || '',
    status: row.status || 'pending',
    cvStatus: row.cv_status || row.document_status || 'pending',
    createdAt: row.applied_at || row.created_at,
    appliedAt: row.applied_at || row.created_at,
    matchScore: row.match_score || 0,
    skills: []
  };
}

async function loadCandidates(whereSql = '', params = []) {
  const [rows] = await db.query(
    `
    SELECT a.id AS application_id, a.status, a.applied_at,
           u.id AS candidate_id, u.full_name AS candidate_name, u.email AS candidate_email, u.phone,
           j.title AS job_title,
           d.file_name AS cv_name, d.file_url AS cv_link, d.status AS cv_status
    FROM applications a
    JOIN users u ON a.candidate_id = u.id
    JOIN jobs j ON a.job_id = j.id
    JOIN documents d ON a.cv_document_id = d.id
    WHERE a.deleted_at IS NULL ${whereSql}
    ORDER BY a.applied_at DESC
    LIMIT 100
    `,
    params
  );
  return rows.map(toCandidate);
}

exports.getCandidates = async (req, res) => {
  try {
    const items = await loadCandidates();
    res.json({ total: items.length, items, candidates: items, data: items });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy danh sách ứng viên', error: error.message });
  }
};

exports.searchCandidates = async (req, res) => {
  try {
    const result = await searchService.search({
      q: req.query.q || req.query.keyword || '',
      type: 'cv',
      location: req.query.location || '',
      page: req.query.page,
      limit: req.query.limit
    });
    const items = result.items.map(item => ({
      id: item.documentId || item.id,
      candidateId: item.candidateId,
      name: item.candidateName || item.name || item.title,
      fullName: item.candidateName || item.name || item.title,
      candidateName: item.candidateName || item.name || item.title,
      email: item.email || '',
      fileName: item.fileName || item.title,
      cvUrl: item.fileUrl || item.url || '',
      url: item.fileUrl || item.url || '',
      status: item.status || 'completed',
      cvStatus: item.status || 'completed',
      position: item.title || 'CV ứng viên',
      summary: item.summary || '',
      matchScore: item.score || 0,
      skills: []
    }));
    res.json({ ...result, items, candidates: items, data: items });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi tìm ứng viên', error: error.message });
  }
};

exports.saveCandidate = async (req, res) => {
  res.json({ success: true, message: 'Đã lưu ứng viên.' });
};

exports.getSavedCandidates = async (req, res) => {
  try {
    const items = await loadCandidates();
    res.json({ total: items.length, page: Number(req.query.page || 1), totalPages: 1, items, candidates: items, data: items });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy ứng viên đã lưu', error: error.message });
  }
};

exports.removeSavedCandidate = async (req, res) => {
  res.json({ success: true, message: 'Đã bỏ lưu ứng viên.' });
};

exports.updateCandidateStatus = async (req, res) => {
  res.json({ success: true, message: 'Đã cập nhật trạng thái ứng viên.' });
};
