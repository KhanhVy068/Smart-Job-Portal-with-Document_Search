const db = require('../config/db');

// Đăng tin tuyển dụng (Đã thêm Validation)
exports.createJob = async (req, res) => {
  try {
    const { title, description, category_id, salary, location, job_type } = req.body;

    // --- LỚP BẢO VỆ DỮ LIỆU (VALIDATION) ---
    if (!title || title.trim().length < 5) {
      return res.status(400).json({ success: false, message: 'Tiêu đề công việc phải có ít nhất 5 ký tự.' });
    }
    if (!category_id || isNaN(category_id)) {
      return res.status(400).json({ success: false, message: 'Danh mục công việc không hợp lệ.' });
    }
    if (!salary || salary.trim() === "") {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập mức lương.' });
    }
    if (!location) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập địa điểm làm việc.' });
    }

    const employerId = 1; // Tạm thời fix cứng
    const sql = `INSERT INTO jobs (employer_id, category_id, title, description, salary, location, job_type, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`;
    
    const [result] = await db.query(sql, [employerId, category_id, title, description, salary, location, job_type]);
    res.status(201).json({ success: true, message: 'Đăng tin thành công!', jobId: result.insertId });
  } catch (error) {
    console.error('Create Job Error:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi tạo Job.' });
  }
};

// Lấy danh sách Job (Employer quản lý)
exports.getAllJobs = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM jobs WHERE employer_id = 1 ORDER BY posted_at DESC');
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi lấy danh sách.' });
  }
};

// Sửa tin tuyển dụng (Đã thêm Validation)
exports.updateJob = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, salary, location, job_type, status } = req.body;

    // Kiểm tra đầu vào khi sửa
    if (!title || title.trim().length < 5) {
      return res.status(400).json({ success: false, message: 'Tiêu đề cập nhật quá ngắn.' });
    }

    const sql = `UPDATE jobs SET title=?, description=?, salary=?, location=?, job_type=?, status=? WHERE id=?`;
    await db.query(sql, [title, description, salary, location, job_type, status, id]);
    res.status(200).json({ success: true, message: 'Cập nhật thành công!' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi cập nhật.' });
  }
};

// Xóa tin tuyển dụng
exports.deleteJob = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM jobs WHERE id = ?', [id]);
    res.status(200).json({ success: true, message: 'Đã xóa tin tuyển dụng!' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi khi xóa.' });
  }
};

// Lấy thông tin chi tiết
exports.getJobById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM jobs WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin công việc.' });
    }
    
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi lấy chi tiết.' });
  }
};