const db = require('../config/db');

/**
 * Xử lý nộp đơn ứng tuyển mới (Dành cho Candidate)
 * POST /api/applications/apply
 */
exports.applyJob = async (req, res) => {
  try {
    const { job_id, document_id } = req.body;
    const candidateId = 1; // Tạm thời fix cứng ID ứng viên để demo

    // 1. Kiểm tra dữ liệu đầu vào
    if (!job_id || isNaN(job_id) || !document_id || isNaN(document_id)) {
      return res.status(400).json({
        success: false,
        message: 'Mã công việc hoặc hồ sơ không hợp lệ. Vui lòng kiểm tra lại.'
      });
    }

    // 2. Kiểm tra xem ứng viên đã nộp đơn cho vị trí này chưa (Chống nộp trùng)
    const [existing] = await db.query(
      'SELECT id FROM applications WHERE job_id = ? AND candidate_id = ?',
      [job_id, candidateId]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Hệ thống ghi nhận bạn đã nộp đơn cho vị trí tuyển dụng này rồi.'
      });
    }

    // 3. Thực hiện lưu thông tin ứng tuyển
    const sql = `INSERT INTO applications (job_id, candidate_id, document_id, status) VALUES (?, ?, ?, 'pending')`;
    await db.query(sql, [job_id, candidateId, document_id]);

    return res.status(201).json({
      success: true,
      message: 'Nộp đơn ứng tuyển thành công! Hồ sơ đã được gửi tới nhà tuyển dụng.'
    });

  } catch (error) {
    console.error('Application Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi hệ thống khi nộp đơn.'
    });
  }
};

/**
 * Lấy lịch sử ứng tuyển của cá nhân (Dành cho Candidate)
 * GET /api/applications/my-applications
 */
exports.getMyApplications = async (req, res) => {
  try {
    const candidateId = 1;
    const sql = `
      SELECT a.id, a.status, a.applied_at, 
             j.title AS job_title, 
             d.file_name AS cv_name 
      FROM applications a
      JOIN jobs j ON a.job_id = j.id
      JOIN documents d ON a.document_id = d.id
      WHERE a.candidate_id = ?
      ORDER BY a.applied_at DESC
    `;
    const [rows] = await db.query(sql, [candidateId]);

    return res.status(200).json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Fetch My Applications Error:', error.message);
    return res.status(500).json({ success: false, message: 'Lỗi lấy lịch sử ứng tuyển.' });
  }
};

/**
 * Xem danh sách ứng viên của một Job (Dành cho Employer)
 * GET /api/applications/job/:jobId/applicants
 */
exports.getApplicantsByJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    
    if (!jobId || isNaN(jobId)) {
        return res.status(400).json({ success: false, message: 'Mã tin tuyển dụng không hợp lệ.' });
    }

    // Câu lệnh SQL khớp 100% với cấu trúc bảng của ông (full_name, file_url, file_name)
    const sql = `
      SELECT a.id AS application_id, a.status, a.applied_at,
             u.full_name AS candidate_name, u.email AS candidate_email,
             d.file_url AS cv_link, d.file_name AS cv_name
      FROM applications a
      JOIN users u ON a.candidate_id = u.id
      JOIN documents d ON a.document_id = d.id
      WHERE a.job_id = ?
      ORDER BY a.applied_at DESC
    `;
    
    const [rows] = await db.query(sql, [jobId]);
    
    res.status(200).json({ 
      success: true, 
      message: `Tìm thấy ${rows.length} ứng viên.`,
      data: rows 
    });
  } catch (error) {
    console.error('Lỗi SQL chi tiết:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi lấy danh sách ứng viên.' });
  }
};