const db = require('../config/db');

function nowIso() {
  return new Date().toISOString();
}

exports.getMe = async (req, res) => {
  try {
    const userId = req.user?.id || 3;
    const [[user]] = await db.query(
      'SELECT id, full_name, email, role, avatar_url FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    res.json({
      user: {
        id: user?.id || 3,
        fullName: user?.full_name || 'Quản trị hệ thống',
        email: user?.email || 'admin@smartjob.vn',
        role: user?.role || 'admin',
        avatarUrl: user?.avatar_url || ''
      },
      notifications: { unread: 0 }
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy thông tin admin', error: error.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const [[userCount]] = await db.query('SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL');
    const [[jobCount]] = await db.query('SELECT COUNT(*) AS total FROM jobs WHERE deleted_at IS NULL');
    const [[appCount]] = await db.query('SELECT COUNT(*) AS total FROM applications WHERE deleted_at IS NULL');
    const [[docCount]] = await db.query('SELECT COUNT(*) AS total FROM documents WHERE deleted_at IS NULL');

    res.json({
      totalUsers: userCount.total,
      totalJobs: jobCount.total,
      totalApplications: appCount.total,
      totalDocuments: docCount.total,
      data: {
        totalUsers: userCount.total,
        totalJobs: jobCount.total,
        totalApplications: appCount.total,
        totalDocuments: docCount.total
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ message: 'Lỗi lấy thống kê', error: error.message });
  }
};

exports.getDashboard = async (req, res) => {
  try {
    const [[stats]] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS totalUsers,
        (SELECT COUNT(*) FROM users WHERE role = 'employer' AND deleted_at IS NULL) AS totalEmployers,
        (SELECT COUNT(*) FROM jobs WHERE deleted_at IS NULL) AS totalJobs,
        (SELECT COUNT(*) FROM jobs WHERE status = 'open' AND deleted_at IS NULL) AS activeJobs,
        (SELECT COUNT(*) FROM applications WHERE deleted_at IS NULL) AS totalApplications,
        (SELECT COUNT(*) FROM documents WHERE deleted_at IS NULL) AS totalDocuments
    `);
    const [recentUsers] = await db.query('SELECT id, full_name AS fullName, email, role, created_at AS createdAt FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 6');
    const [recentJobs] = await db.query('SELECT id, title, status, posted_at AS createdAt FROM jobs WHERE deleted_at IS NULL ORDER BY posted_at DESC LIMIT 6');
    const [recentApplications] = await db.query(`
      SELECT a.id, a.status, a.applied_at AS createdAt, u.full_name AS name, j.title AS title
      FROM applications a
      JOIN users u ON u.id = a.candidate_id
      JOIN jobs j ON j.id = a.job_id
      WHERE a.deleted_at IS NULL
      ORDER BY a.applied_at DESC LIMIT 8
    `);

    res.json({
      overview: stats,
      recentUsers,
      recentJobs,
      pendingApprovals: recentJobs.filter(job => job.status === 'open'),
      recentActivity: recentApplications.map(item => ({
        type: 'application',
        title: item.name,
        description: `Ứng tuyển ${item.title}`,
        createdAt: item.createdAt
      })),
      analytics: {
        jobs: [{ label: 'Jobs', value: stats.totalJobs }],
        users: [{ label: 'Users', value: stats.totalUsers }],
        applications: [{ label: 'CV', value: stats.totalApplications }]
      },
      highlights: {
        topCompany: { name: 'Smart Job Portal', jobs: stats.totalJobs },
        hotJob: recentJobs[0] || {},
        activeUsers: recentUsers[0] || {}
      },
      system: { serverStatus: 'online', storageUsage: Math.min(stats.totalDocuments * 5, 100), backgroundJobs: 'idle' },
      alerts: []
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi dashboard admin', error: error.message });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, full_name, email, role, phone, avatar_url, is_verified, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC'
    );
    res.json({ total: users.length, users, items: users, data: users });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ message: 'Lỗi lấy danh sách người dùng', error: error.message });
  }
};

exports.getUserById = async (req, res) => {
  const [[user]] = await db.query('SELECT id, full_name, email, role, phone, avatar_url, is_verified, created_at FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
  res.json({ ...user, fullName: user.full_name });
};

exports.createUser = async (req, res) => {
  const bcrypt = require('bcryptjs');
  const fullName = req.body.fullName || req.body.full_name || req.body.name;
  const passwordHash = await bcrypt.hash(req.body.password || '123456', 10);
  const [result] = await db.query(
    'INSERT INTO users (full_name, email, password_hash, role, phone, is_verified) VALUES (?, ?, ?, ?, ?, TRUE)',
    [fullName, req.body.email, passwordHash, req.body.role || 'candidate', req.body.phone || null]
  );
  req.params.id = result.insertId;
  return exports.getUserById(req, res);
};

exports.updateUser = async (req, res) => {
  await db.query(
    'UPDATE users SET full_name = COALESCE(?, full_name), email = COALESCE(?, email), role = COALESCE(?, role), phone = COALESCE(?, phone) WHERE id = ?',
    [req.body.fullName || req.body.full_name || req.body.name || null, req.body.email || null, req.body.role || null, req.body.phone || null, req.params.id]
  );
  return exports.getUserById(req, res);
};

exports.deleteUser = async (req, res) => {
  await db.query('UPDATE users SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
  res.json({ success: true });
};

exports.blockUser = async (req, res) => {
  try {
    await db.query('UPDATE users SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Đã khóa người dùng' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khóa người dùng', error: error.message });
  }
};

exports.unblockUser = async (req, res) => {
  try {
    await db.query('UPDATE users SET deleted_at = NULL WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Đã mở khóa người dùng' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi mở khóa người dùng', error: error.message });
  }
};

exports.getAllJobs = async (req, res) => {
  try {
    const [jobs] = await db.query(
      `
      SELECT j.*, u.full_name AS employer_name, c.name AS category_name
      FROM jobs j
      LEFT JOIN users u ON u.id = j.employer_id
      LEFT JOIN job_categories c ON c.id = j.category_id
      WHERE j.deleted_at IS NULL
      ORDER BY j.posted_at DESC
      `
    );
    res.json({ total: jobs.length, jobs, items: jobs, data: jobs });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy danh sách việc làm', error: error.message });
  }
};

exports.deleteJob = async (req, res) => {
  try {
    const [result] = await db.query('UPDATE jobs SET deleted_at = NOW(), status = "closed" WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Không tìm thấy việc làm' });
    res.json({ success: true, message: 'Đã xóa việc làm' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi xóa việc làm', error: error.message });
  }
};

exports.getAdminDocuments = async (req, res) => {
  const [docs] = await db.query(`
    SELECT d.*, u.full_name AS candidateName, u.email
    FROM documents d
    LEFT JOIN users u ON u.id = d.user_id
    WHERE d.deleted_at IS NULL
    ORDER BY d.created_at DESC LIMIT 100
  `);
  const items = docs.map(doc => ({
    id: doc.id,
    candidateName: doc.candidateName,
    email: doc.email,
    fileName: doc.file_name,
    filename: doc.file_name,
    fileUrl: doc.file_url,
    url: doc.file_url,
    status: doc.status,
    type: doc.doc_type,
    createdAt: doc.created_at,
    uploadedAt: doc.created_at
  }));
  res.json({ total: items.length, items, documents: items, data: items });
};

exports.getAdminDocumentById = async (req, res) => {
  req.query = req.query || {};
  const [rows] = await db.query('SELECT * FROM documents WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy tài liệu' });
  res.json(rows[0]);
};

exports.updateDocumentStatus = async (req, res) => {
  await db.query('UPDATE documents SET status = ? WHERE id = ?', [req.params.action === 'approve' ? 'completed' : 'failed', req.params.id]);
  res.json({ success: true });
};

exports.deleteDocument = async (req, res) => {
  await db.query('UPDATE documents SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
  res.json({ success: true });
};

exports.getStorage = async (req, res) => {
  const [docs] = await db.query('SELECT id, file_name, file_url, doc_type, status, created_at FROM documents WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 100');
  const files = docs.map(doc => ({ id: doc.id, name: doc.file_name, url: doc.file_url, type: doc.doc_type, status: doc.status, createdAt: doc.created_at }));
  res.json({ usage: Math.min(files.length * 5, 100), files, items: files, data: files, config: { provider: 'cloudinary' } });
};

exports.genericOk = async (req, res) => {
  res.json({ success: true, updatedAt: nowIso() });
};

exports.getReports = async (req, res) => {
  const [[stats]] = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS users,
      (SELECT COUNT(*) FROM jobs WHERE deleted_at IS NULL) AS jobs,
      (SELECT COUNT(*) FROM applications WHERE deleted_at IS NULL) AS applications,
      (SELECT COUNT(*) FROM documents WHERE deleted_at IS NULL) AS documents
  `);
  res.json({ summary: stats, items: [], data: [], generatedAt: nowIso() });
};

exports.getSettings = async (req, res) => {
  res.json({
    auth: { registration: true, emailVerification: false },
    search: { provider: 'none', enabled: false },
    storage: { provider: 'cloudinary' },
    security: { loginAttemptLimit: 5 }
  });
};

exports.getBackgroundJobs = async (req, res) => {
  res.json({ total: 0, items: [], jobs: [], data: [], queue: { status: 'idle' } });
};

exports.getSearchAnalytics = async (req, res) => {
  res.json({ total: 0, items: [], data: [], latency: [], filters: [] });
};

exports.getAllCategories = async (req, res) => {
  try {
    const [categories] = await db.query('SELECT * FROM job_categories WHERE deleted_at IS NULL ORDER BY name');
    res.json({ total: categories.length, categories, items: categories, data: categories });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy danh mục', error: error.message });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, slug, parent_id } = req.body;
    if (!name || !slug) return res.status(400).json({ message: 'Thiếu name hoặc slug' });

    const [result] = await db.query(
      'INSERT INTO job_categories (name, slug, parent_id) VALUES (?, ?, ?)',
      [name, slug, parent_id || null]
    );
    const [[category]] = await db.query('SELECT * FROM job_categories WHERE id = ?', [result.insertId]);
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi tạo danh mục', error: error.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    await db.query(
      'UPDATE job_categories SET name = COALESCE(?, name), slug = COALESCE(?, slug), parent_id = ? WHERE id = ?',
      [req.body.name || null, req.body.slug || null, req.body.parent_id || null, req.params.id]
    );
    const [[category]] = await db.query('SELECT * FROM job_categories WHERE id = ?', [req.params.id]);
    if (!category) return res.status(404).json({ message: 'Không tìm thấy danh mục' });
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi cập nhật danh mục', error: error.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const [result] = await db.query('UPDATE job_categories SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Không tìm thấy danh mục' });
    res.json({ success: true, message: 'Đã xóa danh mục' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi xóa danh mục', error: error.message });
  }
};
