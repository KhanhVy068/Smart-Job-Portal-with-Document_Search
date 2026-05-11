const db = require('../config/db');

exports.getStats = async (req, res) => {
  try {
    // Thực hiện đếm song song các bảng
    const [[userCount]] = await db.query('SELECT COUNT(*) as total FROM users');
    const [[jobCount]] = await db.query('SELECT COUNT(*) as total FROM jobs');
    const [[appCount]] = await db.query('SELECT COUNT(*) as total FROM applications');

    res.status(200).json({
      success: true,
      data: {
        totalUsers: userCount.total,
        totalJobs: jobCount.total,
        totalApplications: appCount.total
      }
    });
  } catch (error) {
    console.error('Admin Stats Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Đã xảy ra lỗi khi truy xuất số liệu thống kê.' 
    });
  }
};