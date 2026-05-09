const db = require('../config/db');
const cloudinary = require('../config/cloudinary');

// --- UPLOAD CV ---
exports.uploadCV = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Vui lòng chọn file!' });

    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: 'auto',
      folder: 'smart_job_portal/cvs'
    });

    const userId = 2; // Giả định user Mai Thi Anh Tuyet
    const sql = `INSERT INTO documents (user_id, file_name, file_url, file_hash, doc_type, status) VALUES (?, ?, ?, ?, 'cv', 'completed')`;
    const [rows] = await db.query(sql, [userId, req.file.originalname, result.secure_url, result.signature]);

    res.status(201).json({ success: true, message: 'Upload thành công!', data: { document_id: rows.insertId, url: result.secure_url } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi upload file.' });
  }
};

// --- TÌM KIẾM TÀI LIỆU ---
exports.getAllDocuments = async (req, res) => {
  try {
    const { fileName } = req.query;
    let sql = 'SELECT * FROM documents';
    let params = [];
    if (fileName) { sql += ' WHERE file_name LIKE ?'; params.push(`%${fileName}%`); }
    const [rows] = await db.query(sql, params);
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi tìm kiếm.' });
  }
};

// --- XÓA TÀI LIỆU ---
exports.deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.query('DELETE FROM documents WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy file!' });
    res.status(200).json({ success: true, message: 'Đã xóa thành công!' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi khi xóa.' });
  }
};

// --- LẤY CV CỦA TÔI ---
exports.getMyDocuments = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM documents WHERE user_id = ?', [2]);
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi lấy dữ liệu cá nhân.' });
  }
};