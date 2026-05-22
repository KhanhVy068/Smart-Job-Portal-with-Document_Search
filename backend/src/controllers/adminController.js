const db = require('../config/db');
const notificationService = require('../services/notificationService');
const { documentQueue, DOCUMENT_QUEUE_NAME } = require('../services/documentQueue');
const documentWorker = require('../services/documentWorker');
const fs = require('fs/promises');
const path = require('path');

let adminSchemaPromise = null;

function clampInt(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function pagination(query) {
  const page = clampInt(query.page, 1, 1, 100000);
  const limit = clampInt(query.limit, 10, 1, 100);
  return { page, limit, offset: (page - 1) * limit };
}

function likeTerm(value) {
  return `%${String(value || '').trim()}%`;
}

function appendDateFilter(where, params, column, value) {
  if (value === 'today') where.push(`DATE(${column}) = CURDATE()`);
  if (value === '7d') where.push(`${column} >= DATE_SUB(NOW(), INTERVAL 7 DAY)`);
  if (value === '30d') where.push(`${column} >= DATE_SUB(NOW(), INTERVAL 30 DAY)`);
  if (value === 'old') where.push(`${column} < DATE_SUB(NOW(), INTERVAL 180 DAY)`);
}

function rangeWhere(query, column = 'created_at') {
  const where = [];
  const params = [];
  const range = query.range || '7d';

  if (range === 'today') where.push(`DATE(${column}) = CURDATE()`);
  else if (range === '7d') where.push(`${column} >= DATE_SUB(NOW(), INTERVAL 7 DAY)`);
  else if (range === '30d') where.push(`${column} >= DATE_SUB(NOW(), INTERVAL 30 DAY)`);
  else if (range === 'custom') {
    if (query.startDate) {
      where.push(`${column} >= ?`);
      params.push(query.startDate);
    }
    if (query.endDate) {
      where.push(`${column} < DATE_ADD(?, INTERVAL 1 DAY)`);
      params.push(query.endDate);
    }
  }

  return { sql: where.length ? ` AND ${where.join(' AND ')}` : '', params };
}

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function storageLimitBytes() {
  const raw = process.env.STORAGE_LIMIT_BYTES || process.env.STORAGE_LIMIT || '';
  const direct = Number(raw);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const match = String(raw).trim().match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)?$/i);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = (match[2] || 'B').toUpperCase();
  const multipliers = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
  return Math.round(value * (multipliers[unit] || 1));
}

async function scanDirectoryStorage(root) {
  const result = { bytes: 0, files: 0 };

  async function walk(dir) {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        return;
      }
      if (!entry.isFile()) return;
      try {
        const stat = await fs.stat(fullPath);
        result.bytes += stat.size;
        result.files += 1;
      } catch {
        // Ignore files that disappear while scanning.
      }
    }));
  }

  await walk(root);
  return result;
}

async function getStorageMetrics() {
  await ensureAdminSchema();
  const [[dbStorage]] = await db.query(`
    SELECT COUNT(*) AS dbFiles, COALESCE(SUM(file_size), 0) AS dbBytes
    FROM documents
    WHERE deleted_at IS NULL
  `);

  const roots = [
    process.env.UPLOAD_DIR,
    path.resolve(__dirname, '../../uploads'),
    path.resolve(__dirname, '../../../uploads')
  ].filter(Boolean);

  const uniqueRoots = [...new Set(roots)];
  const localParts = await Promise.all(uniqueRoots.map(scanDirectoryStorage));
  const local = localParts.reduce((sum, item) => ({
    bytes: sum.bytes + item.bytes,
    files: sum.files + item.files
  }), { bytes: 0, files: 0 });

  const usedBytes = Number(dbStorage.dbBytes || 0) + local.bytes;
  const filesCount = Number(dbStorage.dbFiles || 0) + local.files;
  const limitBytes = storageLimitBytes();
  const storagePercent = limitBytes > 0 ? Math.min((usedBytes / limitBytes) * 100, 100) : null;

  return {
    usedBytes,
    filesCount,
    dbBytes: Number(dbStorage.dbBytes || 0),
    dbFiles: Number(dbStorage.dbFiles || 0),
    localBytes: local.bytes,
    localFiles: local.files,
    limitBytes,
    storagePercent
  };
}

async function getBackgroundStatus() {
  try {
    const counts = await documentQueue.getJobCounts('waiting', 'active', 'delayed');
    const active = Number(counts.active || 0);
    const waiting = Number(counts.waiting || 0);
    const delayed = Number(counts.delayed || 0);
    return {
      status: active > 0 || waiting > 0 || delayed > 0 ? 'processing' : 'idle',
      counts: { active, waiting, delayed }
    };
  } catch {
    const [[processing]] = await db.query(`
      SELECT COUNT(*) AS total
      FROM documents
      WHERE deleted_at IS NULL AND status IN ('pending', 'processing')
    `);
    return {
      status: Number(processing.total || 0) > 0 ? 'processing' : 'idle',
      counts: { active: Number(processing.total || 0), waiting: 0, delayed: 0 }
    };
  }
}

function fileTypeExpression(column = 'file_name') {
  return `LOWER(SUBSTRING_INDEX(${column}, '.', -1))`;
}

async function ignoreDuplicateDDL(sql) {
  try {
    await db.query(sql);
  } catch (error) {
    const duplicateColumn = error.code === 'ER_DUP_FIELDNAME';
    const duplicateKey = error.code === 'ER_DUP_KEYNAME';
    if (!duplicateColumn && !duplicateKey) throw error;
  }
}

async function ensureAdminSchema() {
  if (!adminSchemaPromise) {
    adminSchemaPromise = (async () => {
      await ignoreDuplicateDDL('ALTER TABLE users ADD COLUMN is_blocked BOOLEAN DEFAULT FALSE AFTER is_verified');
      await ignoreDuplicateDDL("ALTER TABLE jobs ADD COLUMN review_status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved' AFTER status");
      await ignoreDuplicateDDL('ALTER TABLE jobs ADD COLUMN is_reported BOOLEAN DEFAULT FALSE AFTER review_status');
      await ignoreDuplicateDDL("ALTER TABLE documents ADD COLUMN moderation_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending' AFTER status");
      await ignoreDuplicateDDL('ALTER TABLE documents ADD COLUMN file_size BIGINT DEFAULT 0 AFTER file_url');
      await documentWorker.ensureExtractionSchema();
      await db.query(`
        CREATE TABLE IF NOT EXISTS reports (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          type ENUM('job', 'cv', 'user') NOT NULL,
          target_id INT NOT NULL,
          reporter_id INT NULL,
          reason VARCHAR(255) NULL,
          description TEXT NULL,
          status ENUM('pending', 'resolved', 'rejected') DEFAULT 'pending',
          resolved_by INT NULL,
          resolved_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          deleted_at TIMESTAMP NULL,
          INDEX idx_reports_type_status (type, status),
          INDEX idx_reports_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch(error => {
      adminSchemaPromise = null;
      throw error;
    });
  }
  return adminSchemaPromise;
}


function nowIso() {
  return new Date().toISOString();
}

async function formatBullJob(job) {
  const state = await job.getState();

  return {
    id: job.id,
    name: job.name,
    queueName: DOCUMENT_QUEUE_NAME,
    status: state,
    state,
    progress: job.progress,
    attempts: job.attemptsMade,
    maxAttempts: job.opts?.attempts || 1,
    createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
    startedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    duration: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : null,
    payload: job.data,
    result: job.returnvalue,
    error: job.failedReason || '',
    logs: [],
    retryHistory: []
  };
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
    await ensureAdminSchema();
    const storage = await getStorageMetrics();
    const background = await getBackgroundStatus();
    const [[stats]] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS totalUsers,
        (SELECT COUNT(*) FROM users WHERE role = 'employer' AND deleted_at IS NULL) AS totalEmployers,
        (SELECT COUNT(*) FROM jobs WHERE deleted_at IS NULL) AS totalJobs,
        (SELECT COUNT(*) FROM jobs WHERE status = 'open' AND deleted_at IS NULL) AS activeJobs,
        (SELECT COUNT(*) FROM applications WHERE deleted_at IS NULL) AS totalApplications,
        (SELECT COUNT(*) FROM documents WHERE doc_type = 'cv' AND deleted_at IS NULL) AS totalDocuments
    `);
    const [recentUsers] = await db.query('SELECT id, full_name AS fullName, email, role, created_at AS createdAt FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 6');
    const [recentJobs] = await db.query('SELECT id, title, status, review_status, posted_at AS createdAt FROM jobs WHERE deleted_at IS NULL ORDER BY posted_at DESC LIMIT 6');
    const [recentApplications] = await db.query(`
      SELECT a.id, a.status, a.applied_at AS createdAt, u.full_name AS name, j.title AS title
      FROM applications a
      JOIN users u ON u.id = a.candidate_id
      JOIN jobs j ON j.id = a.job_id
      WHERE a.deleted_at IS NULL
      ORDER BY a.applied_at DESC LIMIT 8
    `);

    res.json({
      users: stats.totalUsers,
      jobs: stats.totalJobs,
      cvs: stats.totalDocuments,
      storageUsed: storage.usedBytes,
      storageUsedText: formatBytes(storage.usedBytes),
      storageFiles: storage.filesCount,
      storagePercent: storage.storagePercent === null ? null : Number(storage.storagePercent.toFixed(1)),
      backgroundStatus: background.status,
      overview: {
        ...stats,
        totalApplications: stats.totalDocuments,
        totalCVs: stats.totalDocuments,
        storageUsed: storage.usedBytes,
        storageUsedText: formatBytes(storage.usedBytes),
        storageFiles: storage.filesCount,
        storagePercent: storage.storagePercent === null ? null : Number(storage.storagePercent.toFixed(1))
      },
      recentUsers,
      recentJobs,
      pendingApprovals: recentJobs.filter(job => job.review_status === 'pending'),
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
      system: {
        serverStatus: 'online',
        storageUsage: storage.storagePercent,
        storageUsageText: storage.storagePercent === null
          ? `${formatBytes(storage.usedBytes)} / ${storage.filesCount} files`
          : `${Number(storage.storagePercent.toFixed(1))}%`,
        storageUsed: storage.usedBytes,
        storageUsedText: formatBytes(storage.usedBytes),
        storageFiles: storage.filesCount,
        storageLimit: storage.limitBytes,
        storageLimitText: storage.limitBytes ? formatBytes(storage.limitBytes) : '',
        backgroundJobs: background.status,
        backgroundCounts: background.counts
      },
      alerts: []
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi dashboard admin', error: error.message });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    await ensureAdminSchema();
    const { page, limit, offset } = pagination(req.query);
    const q = req.query.q || req.query.search || '';
    const where = ['deleted_at IS NULL'];
    const params = [];

    if (q) {
      where.push('(full_name LIKE ? OR email LIKE ?)');
      params.push(likeTerm(q), likeTerm(q));
    }
    if (req.query.role) {
      const role = req.query.role === 'user' ? 'candidate' : req.query.role;
      where.push('role = ?');
      params.push(role);
    }
    if (req.query.status === 'banned' || req.query.status === 'blocked') where.push('is_blocked = TRUE');
    if (req.query.status === 'active') where.push('is_blocked = FALSE AND is_verified = TRUE');
    if (req.query.status === 'pending') where.push('is_blocked = FALSE AND is_verified = FALSE');

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM users ${whereSql}`, params);
    const [users] = await db.query(
      `
      SELECT
        id, full_name, email, role, phone, avatar_url, is_verified, is_blocked, created_at,
        CASE WHEN is_blocked THEN 'banned' WHEN is_verified = FALSE THEN 'pending' ELSE 'active' END AS status
      FROM users
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    const [[stats]] = await db.query(`
      SELECT
        COUNT(*) AS totalUsers,
        SUM(DATE(created_at) = CURDATE()) AS newToday,
        SUM(is_blocked = FALSE AND is_verified = TRUE) AS activeUsers,
        SUM(is_blocked = TRUE) AS bannedUsers
      FROM users
      WHERE deleted_at IS NULL
    `);

    res.json({ total, page, limit, users, items: users, data: users, stats });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ message: 'Lỗi lấy danh sách người dùng', error: error.message });
  }
};

exports.getUserById = async (req, res) => {
  await ensureAdminSchema();
  const [[user]] = await db.query(`
    SELECT id, full_name, email, role, phone, avatar_url, is_verified, is_blocked, created_at,
      CASE WHEN is_blocked THEN 'banned' WHEN is_verified = FALSE THEN 'pending' ELSE 'active' END AS status
    FROM users
    WHERE id = ? AND deleted_at IS NULL
  `, [req.params.id]);
  if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
  res.json({ ...user, fullName: user.full_name });
};

exports.createUser = async (req, res) => {
  await ensureAdminSchema();
  const bcrypt = require('bcryptjs');
  const fullName = req.body.fullName || req.body.full_name || req.body.name;
  const passwordHash = await bcrypt.hash(req.body.password || '123456', 10);
  const status = req.body.status || 'active';
  const [result] = await db.query(
    'INSERT INTO users (full_name, email, password_hash, role, phone, is_verified, is_blocked) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      fullName,
      req.body.email,
      passwordHash,
      req.body.role === 'user' ? 'candidate' : req.body.role || 'candidate',
      req.body.phone || null,
      status !== 'pending',
      status === 'banned' || status === 'blocked'
    ]
  );
  req.params.id = result.insertId;
  return exports.getUserById(req, res);
};

exports.updateUser = async (req, res) => {
  await ensureAdminSchema();
  const status = req.body.status;
  await db.query(
    `
    UPDATE users
    SET
      full_name = COALESCE(?, full_name),
      email = COALESCE(?, email),
      role = COALESCE(?, role),
      phone = COALESCE(?, phone),
      is_blocked = CASE WHEN ? IN ('banned', 'blocked') THEN TRUE WHEN ? = 'active' THEN FALSE ELSE is_blocked END,
      is_verified = CASE WHEN ? = 'pending' THEN FALSE WHEN ? = 'active' THEN TRUE ELSE is_verified END
    WHERE id = ? AND deleted_at IS NULL
    `,
    [
      req.body.fullName || req.body.full_name || req.body.name || null,
      req.body.email || null,
      req.body.role === 'user' ? 'candidate' : req.body.role || null,
      req.body.phone || null,
      status || null,
      status || null,
      status || null,
      status || null,
      req.params.id
    ]
  );
  return exports.getUserById(req, res);
};

exports.deleteUser = async (req, res) => {
  if (String(req.user?.id || '') === String(req.params.id)) {
    return res.status(400).json({ message: 'Không thể xóa chính tài khoản admin đang đăng nhập' });
  }
  await db.query('UPDATE users SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
  res.json({ success: true });
};

exports.blockUser = async (req, res) => {
  try {
    if (String(req.user?.id || '') === String(req.params.id)) {
      return res.status(400).json({ message: 'Không thể khóa chính tài khoản admin đang đăng nhập' });
    }
    await ensureAdminSchema();
    await db.query('UPDATE users SET is_blocked = TRUE WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    await notificationService.createNotification({
      userId: req.params.id,
      type: 'account_locked',
      title: 'Tài khoản đã bị khóa',
      message: 'Tài khoản của bạn đã bị quản trị viên khóa.'
    });
    res.json({ success: true, message: 'Đã khóa người dùng' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khóa người dùng', error: error.message });
  }
};

exports.unblockUser = async (req, res) => {
  try {
    await ensureAdminSchema();
    await db.query('UPDATE users SET is_blocked = FALSE, is_verified = TRUE WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    await notificationService.createNotification({
      userId: req.params.id,
      type: 'account_unlocked',
      title: 'Tài khoản đã được mở khóa',
      message: 'Tài khoản của bạn đã được quản trị viên mở khóa.'
    });
    res.json({ success: true, message: 'Đã mở khóa người dùng' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi mở khóa người dùng', error: error.message });
  }
};

exports.updateUserStatus = async (req, res) => {
  try {
    await ensureAdminSchema();
    const status = String(req.body?.status || '').toLowerCase();
    const locked = ['locked', 'lock', 'blocked', 'banned', 'disabled'].includes(status);
    if (locked && String(req.user?.id || '') === String(req.params.id)) {
      return res.status(400).json({ message: 'Không thể khóa chính tài khoản admin đang đăng nhập' });
    }
    await db.query(
      'UPDATE users SET is_blocked = ?, is_verified = CASE WHEN ? = FALSE THEN TRUE ELSE is_verified END WHERE id = ? AND deleted_at IS NULL',
      [locked, locked, req.params.id]
    );
    res.json({ success: true, status: locked ? 'locked' : 'active' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi cập nhật trạng thái người dùng', error: error.message });
  }
};

exports.bulkDeleteUsers = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ message: 'Danh sách user cần xóa trống' });
    if (ids.includes(Number(req.user?.id))) {
      return res.status(400).json({ message: 'Không thể xóa chính tài khoản admin đang đăng nhập' });
    }
    const [result] = await db.query('UPDATE users SET deleted_at = NOW() WHERE id IN (?) AND deleted_at IS NULL', [ids]);
    res.json({ success: true, deleted: result.affectedRows || 0 });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi xóa nhiều người dùng', error: error.message });
  }
};

exports.bulkUpdateUsersStatus = async (req, res) => {
  try {
    await ensureAdminSchema();
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ message: 'Danh sách user cần cập nhật trống' });
    if (ids.includes(Number(req.user?.id))) {
      return res.status(400).json({ message: 'Không thể khóa chính tài khoản admin đang đăng nhập' });
    }
    const status = String(req.body?.status || 'locked').toLowerCase();
    const locked = ['locked', 'lock', 'blocked', 'banned', 'disabled'].includes(status);
    const [result] = await db.query('UPDATE users SET is_blocked = ? WHERE id IN (?) AND deleted_at IS NULL', [locked, ids]);
    res.json({ success: true, updated: result.affectedRows || 0, status: locked ? 'locked' : 'active' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi cập nhật nhiều người dùng', error: error.message });
  }
};

exports.getAllJobs = async (req, res) => {
  try {
    await ensureAdminSchema();
    const { page, limit, offset } = pagination(req.query);
    const q = req.query.q || req.query.search || '';
    const where = ['j.deleted_at IS NULL'];
    const params = [];

    if (q) {
      where.push('(j.title LIKE ? OR u.full_name LIKE ? OR ep.company_name LIKE ? OR j.location LIKE ?)');
      params.push(likeTerm(q), likeTerm(q), likeTerm(q), likeTerm(q));
    }
    if (req.query.status) {
      if (req.query.status === 'active') where.push("j.status = 'open' AND j.review_status = 'approved'");
      else if (req.query.status === 'pending') where.push("j.review_status = 'pending'");
      else if (req.query.status === 'reported') where.push('j.is_reported = TRUE');
      else if (req.query.status === 'closed' || req.query.status === 'expired') where.push("j.status = 'closed'");
      else if (req.query.status === 'rejected' || req.query.status === 'banned') where.push("j.review_status = 'rejected'");
    }
    if (req.query.company) {
      where.push('(u.full_name LIKE ? OR ep.company_name LIKE ?)');
      params.push(likeTerm(req.query.company), likeTerm(req.query.company));
    }
    if (req.query.location) {
      where.push('j.location LIKE ?');
      params.push(likeTerm(req.query.location));
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const [[{ total }]] = await db.query(`
      SELECT COUNT(*) AS total
      FROM jobs j
      LEFT JOIN users u ON u.id = j.employer_id
      LEFT JOIN employer_profiles ep ON ep.user_id = j.employer_id
      ${whereSql}
    `, params);

    const [jobs] = await db.query(
      `
      SELECT
        j.*,
        u.full_name AS employer_name,
        ep.company_name,
        c.name AS category_name,
        COUNT(a.id) AS applicationsCount
      FROM jobs j
      LEFT JOIN users u ON u.id = j.employer_id
      LEFT JOIN employer_profiles ep ON ep.user_id = j.employer_id
      LEFT JOIN job_categories c ON c.id = j.category_id
      LEFT JOIN applications a ON a.job_id = j.id AND a.deleted_at IS NULL
      ${whereSql}
      GROUP BY j.id, u.full_name, ep.company_name, c.name
      ORDER BY j.posted_at DESC
      LIMIT ? OFFSET ?
      `
      ,
      [...params, limit, offset]
    );

    const [[stats]] = await db.query(
      `
      SELECT
        COUNT(*) AS totalJobs,
        SUM(status = 'open' AND review_status = 'approved') AS activeJobs,
        SUM(review_status = 'pending') AS pendingJobs,
        SUM(is_reported = TRUE) AS reportedJobs
      FROM jobs
      WHERE deleted_at IS NULL
      `
    );
    res.json({ total, page, limit, jobs, items: jobs, data: jobs, stats });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy danh sách việc làm', error: error.message });
  }
};

exports.getJobById = async (req, res) => {
  try {
    await ensureAdminSchema();
    const [[job]] = await db.query(
      `
      SELECT j.*, u.full_name AS employer_name, ep.company_name, ep.website, ep.industry, ep.description AS company_description, c.name AS category_name
      FROM jobs j
      LEFT JOIN users u ON u.id = j.employer_id
      LEFT JOIN employer_profiles ep ON ep.user_id = j.employer_id
      LEFT JOIN job_categories c ON c.id = j.category_id
      WHERE j.id = ? AND j.deleted_at IS NULL
      `,
      [req.params.id]
    );
    if (!job) return res.status(404).json({ message: 'Không tìm thấy việc làm' });

    const [applications] = await db.query(
      `
      SELECT a.id, a.status, a.applied_at AS createdAt, u.full_name AS candidateName, u.email, d.file_name AS fileName, d.file_url AS fileUrl
      FROM applications a
      LEFT JOIN users u ON u.id = a.candidate_id
      LEFT JOIN documents d ON d.id = a.cv_document_id
      WHERE a.job_id = ? AND a.deleted_at IS NULL
      ORDER BY a.applied_at DESC
      LIMIT 10
      `,
      [req.params.id]
    );

    res.json({
      job: {
        ...job,
        companyName: job.company_name || job.employer_name,
        company: {
          name: job.company_name || job.employer_name,
          website: job.website,
          industry: job.industry,
          description: job.company_description
        },
        applicationsCount: applications.length
      },
      applications
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy chi tiết việc làm', error: error.message });
  }
};

exports.updateJobStatus = async (req, res) => {
  try {
    await ensureAdminSchema();
    const action = req.params.action;
    if (action === 'approve') {
      await db.query("UPDATE jobs SET review_status = 'approved', status = 'open' WHERE id = ? AND deleted_at IS NULL", [req.params.id]);
      return res.json({ success: true, message: 'Đã duyệt tin' });
    }
    if (action === 'ban' || action === 'reject') {
      await db.query("UPDATE jobs SET review_status = 'rejected', status = 'closed' WHERE id = ? AND deleted_at IS NULL", [req.params.id]);
      return res.json({ success: true, message: 'Đã từ chối tin' });
    }
    if (action === 'resolve-report') {
      await db.query('UPDATE jobs SET is_reported = FALSE WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
      return res.json({ success: true, message: 'Đã xử lý báo cáo tin' });
    }
    return res.status(400).json({ message: 'Action không hợp lệ' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi cập nhật trạng thái việc làm', error: error.message });
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

exports.bulkDeleteJobs = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ message: 'Danh sách job cần xóa trống' });
    const [result] = await db.query('UPDATE jobs SET deleted_at = NOW(), status = "closed" WHERE id IN (?) AND deleted_at IS NULL', [ids]);
    res.json({ success: true, deleted: result.affectedRows || 0 });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi xóa nhiều việc làm', error: error.message });
  }
};

exports.getAdminDocuments = async (req, res) => {
  try {
    await ensureAdminSchema();
    const { page, limit, offset } = pagination(req.query);
    const q = req.query.q || req.query.search || '';
    const type = req.query.type || req.query.fileType || '';
    const job = req.query.job || req.query.jobId || '';
    const where = ["d.deleted_at IS NULL", "d.doc_type = 'cv'"];
    const params = [];

    if (q) {
      where.push('(u.full_name LIKE ? OR u.email LIKE ? OR d.file_name LIKE ? OR j.title LIKE ?)');
      params.push(likeTerm(q), likeTerm(q), likeTerm(q), likeTerm(q));
    }
    if (req.query.status) {
      if (['pending', 'approved', 'rejected'].includes(req.query.status)) {
        where.push('d.moderation_status = ?');
        params.push(req.query.status);
      } else {
        where.push('d.status = ?');
        params.push(req.query.status);
      }
    }
    if (type) {
      where.push(`${fileTypeExpression('d.file_name')} = ?`);
      params.push(String(type).toLowerCase());
    }
    if (job && /^\d+$/.test(String(job))) {
      where.push('a.job_id = ?');
      params.push(Number(job));
    } else if (job) {
      where.push('j.title LIKE ?');
      params.push(likeTerm(job));
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const [[{ total }]] = await db.query(
      `
      SELECT COUNT(DISTINCT d.id) AS total
      FROM documents d
      LEFT JOIN users u ON u.id = d.user_id
      LEFT JOIN applications a ON a.cv_document_id = d.id AND a.deleted_at IS NULL
      LEFT JOIN jobs j ON j.id = a.job_id
      ${whereSql}
      `,
      params
    );

    const [docs] = await db.query(
      `
      SELECT
        d.id, d.file_name, d.file_url, d.file_size, d.doc_type, d.status, d.extraction_status,
        d.desired_position, d.extracted_summary, d.extracted_skills, d.moderation_status, d.created_at,
        u.full_name AS candidateName, u.email,
        MAX(j.title) AS jobTitle
      FROM documents d
      LEFT JOIN users u ON u.id = d.user_id
      LEFT JOIN applications a ON a.cv_document_id = d.id AND a.deleted_at IS NULL
      LEFT JOIN jobs j ON j.id = a.job_id
      ${whereSql}
      GROUP BY d.id, d.file_name, d.file_url, d.file_size, d.doc_type, d.status, d.extraction_status,
               d.desired_position, d.extracted_summary, d.extracted_skills, d.moderation_status, d.created_at, u.full_name, u.email
      ORDER BY d.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    const items = docs.map(doc => ({
      id: doc.id,
      candidateName: doc.candidateName,
      email: doc.email,
      fileName: doc.file_name,
      filename: doc.file_name,
      fileUrl: doc.file_url,
      url: doc.file_url,
      fileSize: Number(doc.file_size || 0),
      size: Number(doc.file_size || 0),
      status: doc.moderation_status || doc.status,
      processingStatus: doc.status,
      extractionStatus: doc.extraction_status || doc.status,
      desiredPosition: doc.desired_position || '',
      summary: doc.extracted_summary || '',
      type: doc.doc_type,
      fileType: String(doc.file_name || '').split('.').pop(),
      jobApplied: doc.jobTitle,
      jobTitle: doc.jobTitle,
      createdAt: doc.created_at,
      uploadedAt: doc.created_at
    }));

    const [[stats]] = await db.query(`
      SELECT
        COUNT(*) AS totalDocuments,
        SUM(DATE(created_at) = CURDATE()) AS todayDocuments,
        SUM(moderation_status = 'pending') AS pendingDocuments,
        SUM(moderation_status = 'rejected') AS rejectedDocuments,
        COALESCE(SUM(file_size), 0) AS storageBytes
      FROM documents
      WHERE deleted_at IS NULL AND doc_type = 'cv'
    `);

    res.json({
      total,
      page,
      limit,
      items,
      documents: items,
      data: items,
      stats: { ...stats, storageUsed: formatBytes(stats.storageBytes) },
      storage: { usedBytes: Number(stats.storageBytes || 0), usedText: formatBytes(stats.storageBytes) }
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy danh sách CV', error: error.message });
  }
};

exports.getAdminDocumentById = async (req, res) => {
  try {
    await ensureAdminSchema();
    const [[doc]] = await db.query(
      `
      SELECT d.*, u.full_name AS candidateName, u.email, MAX(j.title) AS jobTitle
      FROM documents d
      LEFT JOIN users u ON u.id = d.user_id
      LEFT JOIN applications a ON a.cv_document_id = d.id AND a.deleted_at IS NULL
      LEFT JOIN jobs j ON j.id = a.job_id
      WHERE d.id = ? AND d.deleted_at IS NULL
      GROUP BY d.id, u.full_name, u.email
      `,
      [req.params.id]
    );
    if (!doc) return res.status(404).json({ message: 'Không tìm thấy tài liệu' });
    const document = {
      ...doc,
      candidateName: doc.candidateName,
      fileName: doc.file_name,
      fileUrl: doc.file_url,
      fileSize: Number(doc.file_size || 0),
      status: doc.moderation_status || doc.status,
      uploadedAt: doc.created_at,
      jobApplied: doc.jobTitle
    };
    res.json({ document, cv: document, detail: document });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy chi tiết tài liệu', error: error.message });
  }
};

exports.viewAdminDocument = async (req, res) => {
  try {
    await ensureAdminSchema();
    const [[doc]] = await db.query('SELECT file_url FROM documents WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!doc) return res.status(404).json({ message: 'Không tìm thấy tài liệu' });
    if (!doc.file_url) return res.status(404).json({ message: 'Tài liệu chưa có file_url để xem' });
    res.redirect(doc.file_url);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi mở tài liệu', error: error.message });
  }
};

exports.updateDocumentStatus = async (req, res) => {
  await ensureAdminSchema();
  const status = req.params.action === 'approve' ? 'approved' : 'rejected';
  await db.query('UPDATE documents SET moderation_status = ? WHERE id = ? AND deleted_at IS NULL', [status, req.params.id]);
  res.json({ success: true });
};

exports.reextractCvs = async (req, res) => {
  try {
    await ensureAdminSchema();
    const includeFailed = req.body?.includeFailed !== false;
    const limit = Math.min(Math.max(Number(req.body?.limit || req.query.limit || 50), 1), 200);
    const statuses = includeFailed ? ['pending', 'processing', 'failed'] : ['pending', 'processing'];
    const placeholders = statuses.map(() => '?').join(',');
    const [rows] = await db.query(
      `SELECT id
       FROM documents
       WHERE deleted_at IS NULL
         AND doc_type = 'cv'
         AND (
           extraction_status IN (${placeholders})
           OR extraction_status IS NULL
           OR extracted_text IS NULL
         )
       ORDER BY created_at ASC
       LIMIT ?`,
      [...statuses, limit]
    );

    let enqueued = 0;
    const directResults = [];
    for (const row of rows) {
      try {
        await documentQueue.enqueueDocument(row.id);
        enqueued += 1;
      } catch (error) {
        const result = await documentWorker.processDocument(row.id).catch(err => ({ id: row.id, status: 'failed', error: err.message }));
        directResults.push(result);
      }
    }

    res.json({
      success: true,
      total: rows.length,
      enqueued,
      processedDirectly: directResults.length,
      results: directResults,
      message: rows.length ? 'Đã gửi CV vào hàng đợi trích xuất.' : 'Không có CV pending cần trích xuất.'
    });
  } catch (error) {
    console.error('Re-extract CVs error:', error);
    res.status(500).json({ message: 'Lỗi re-extract CV', error: error.message });
  }
};

exports.deleteDocument = async (req, res) => {
  await db.query('UPDATE documents SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
  res.json({ success: true });
};

exports.getStorage = async (req, res) => {
  try {
    await ensureAdminSchema();
    const { page, limit, offset } = pagination(req.query);
    const q = req.query.q || req.query.search || '';
    const where = ['d.deleted_at IS NULL'];
    const params = [];

    if (q) {
      where.push('(d.file_name LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)');
      params.push(likeTerm(q), likeTerm(q), likeTerm(q));
    }
    if (req.query.user) {
      where.push('(u.full_name LIKE ? OR u.email LIKE ?)');
      params.push(likeTerm(req.query.user), likeTerm(req.query.user));
    }
    if (req.query.type) {
      where.push(`${fileTypeExpression('d.file_name')} = ?`);
      params.push(String(req.query.type).toLowerCase());
    }
    if (req.query.status) {
      where.push('(d.status = ? OR d.moderation_status = ?)');
      params.push(req.query.status, req.query.status);
    }
    if (req.query.size === 'small') where.push('COALESCE(d.file_size, 0) < 1048576');
    if (req.query.size === 'medium') where.push('COALESCE(d.file_size, 0) BETWEEN 1048576 AND 10485760');
    if (req.query.size === 'large') where.push('COALESCE(d.file_size, 0) > 10485760');
    appendDateFilter(where, params, 'd.created_at', req.query.date);

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const [[{ total }]] = await db.query(`
      SELECT COUNT(*) AS total
      FROM documents d
      LEFT JOIN users u ON u.id = d.user_id
      ${whereSql}
    `, params);
    const [docs] = await db.query(
      `
      SELECT d.id, d.file_name, d.file_url, d.file_size, d.doc_type, d.status, d.moderation_status, d.created_at, u.full_name AS ownerName, u.email
      FROM documents d
      LEFT JOIN users u ON u.id = d.user_id
      ${whereSql}
      ORDER BY d.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    const [categories] = await db.query(`
      SELECT ${fileTypeExpression('file_name')} AS label, COUNT(*) AS count, COALESCE(SUM(file_size), 0) AS size
      FROM documents
      WHERE deleted_at IS NULL
      GROUP BY ${fileTypeExpression('file_name')}
      ORDER BY size DESC
    `);
    const [users] = await db.query(`
      SELECT u.full_name AS name, u.email, COUNT(d.id) AS filesCount, COALESCE(SUM(d.file_size), 0) AS size
      FROM documents d
      LEFT JOIN users u ON u.id = d.user_id
      WHERE d.deleted_at IS NULL
      GROUP BY u.id, u.full_name, u.email
      ORDER BY size DESC
      LIMIT 6
    `);
    const storage = await getStorageMetrics();
    const limitBytes = storage.limitBytes;
    const usedBytes = storage.usedBytes;
    const availableBytes = limitBytes > 0 ? Math.max(limitBytes - usedBytes, 0) : 0;
    const files = docs.map(doc => ({
      id: doc.id,
      name: doc.file_name,
      fileName: doc.file_name,
      url: doc.file_url,
      fileUrl: doc.file_url,
      type: String(doc.file_name || '').split('.').pop() || doc.doc_type,
      category: doc.doc_type,
      size: Number(doc.file_size || 0),
      fileSize: Number(doc.file_size || 0),
      ownerName: doc.ownerName || doc.email,
      status: doc.moderation_status || doc.status,
      createdAt: doc.created_at,
      uploadedAt: doc.created_at
    }));

    res.json({
      total,
      page,
      limit,
      files,
      items: files,
      data: files,
      overview: {
        totalStorage: limitBytes > 0 ? formatBytes(limitBytes) : 'Không giới hạn',
        filesCount: storage.filesCount,
        usedStorage: formatBytes(usedBytes),
        availableStorage: limitBytes > 0 ? formatBytes(availableBytes) : '--',
        usedPercent: storage.storagePercent
      },
      stats: {
        totalStorage: limitBytes > 0 ? formatBytes(limitBytes) : 'Không giới hạn',
        filesCount: storage.filesCount,
        usedStorage: formatBytes(usedBytes),
        availableStorage: limitBytes > 0 ? formatBytes(availableBytes) : '--',
        usedPercent: storage.storagePercent
      },
      categories: categories.map(item => ({ ...item, sizeText: formatBytes(item.size) })),
      users: users.map(item => ({ ...item, storageUsed: formatBytes(item.size), sizeText: formatBytes(item.size) })),
      config: { provider: process.env.STORAGE_PROVIDER || 'cloudinary', totalLimit: formatBytes(limitBytes) }
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy dữ liệu lưu trữ', error: error.message });
  }
};

exports.genericOk = async (req, res) => {
  res.json({ success: true, updatedAt: nowIso() });
};

async function buildReportsSummary(req) {
  await ensureAdminSchema();
  const performanceLogService = require('../services/performanceLogService');
  await performanceLogService.ensurePerformanceLogsTable();

  const userRange = rangeWhere(req.query, 'created_at');
  const jobRange = rangeWhere(req.query, 'posted_at');
  const appRange = rangeWhere(req.query, 'applied_at');
  const logRange = rangeWhere(req.query, 'created_at');
  const reportRange = rangeWhere(req.query, 'r.created_at');

  const [[stats]] = await db.query(
    `
    SELECT
      (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS totalUsers,
      (SELECT COUNT(*) FROM jobs WHERE deleted_at IS NULL) AS totalJobs,
      (SELECT COUNT(*) FROM applications WHERE deleted_at IS NULL) AS totalApplications,
      (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL${userRange.sql}) AS usersInRange
    `,
    userRange.params
  );

  stats.growth = Number(stats.totalUsers || 0) > 0
    ? Number(((Number(stats.usersInRange || 0) / Number(stats.totalUsers || 1)) * 100).toFixed(1))
    : 0;

  const [userGrowth] = await db.query(
    `
    SELECT DATE(created_at) AS date, COUNT(*) AS count
    FROM users
    WHERE deleted_at IS NULL${userRange.sql}
    GROUP BY DATE(created_at)
    ORDER BY DATE(created_at)
    `,
    userRange.params
  );

  const [jobsPosted] = await db.query(
    `
    SELECT DATE(posted_at) AS date, COUNT(*) AS count
    FROM jobs
    WHERE deleted_at IS NULL${jobRange.sql}
    GROUP BY DATE(posted_at)
    ORDER BY DATE(posted_at)
    `,
    jobRange.params
  );

  const [applicationsTrend] = await db.query(
    `
    SELECT DATE(applied_at) AS date, COUNT(*) AS count
    FROM applications
    WHERE deleted_at IS NULL${appRange.sql}
    GROUP BY DATE(applied_at)
    ORDER BY DATE(applied_at)
    `,
    appRange.params
  );

  const [usersByRole] = await db.query(`
    SELECT role, COUNT(*) AS count
    FROM users
    WHERE deleted_at IS NULL
    GROUP BY role
    ORDER BY count DESC
  `);

  const [jobsByCategory] = await db.query(`
    SELECT COALESCE(c.name, 'Chưa phân loại') AS category, COUNT(*) AS count
    FROM jobs j
    LEFT JOIN job_categories c ON c.id = j.category_id
    WHERE j.deleted_at IS NULL
    GROUP BY COALESCE(c.name, 'Chưa phân loại')
    ORDER BY count DESC
    LIMIT 10
  `);

  const [[jobsStatus]] = await db.query(`
    SELECT
      SUM(j.status = 'open' AND COALESCE(j.review_status, 'approved') = 'approved') AS active,
      SUM(j.status = 'closed' OR j.expiry_date < CURDATE()) AS expired,
      SUM(COALESCE(j.review_status, 'approved') = 'pending') AS pending,
      SUM(COALESCE(j.is_reported, FALSE) = TRUE) AS reported
    FROM jobs j
    WHERE j.deleted_at IS NULL
  `);

  const [topJobs] = await db.query(`
    SELECT j.title, COUNT(a.id) AS applications
    FROM jobs j
    LEFT JOIN applications a ON a.job_id = j.id AND a.deleted_at IS NULL
    WHERE j.deleted_at IS NULL
    GROUP BY j.id, j.title
    ORDER BY applications DESC, j.posted_at DESC
    LIMIT 10
  `);

  const [cvByJob] = await db.query(`
    SELECT j.title AS jobTitle, COUNT(a.id) AS count
    FROM applications a
    LEFT JOIN jobs j ON j.id = a.job_id
    WHERE a.deleted_at IS NULL
    GROUP BY j.id, j.title
    ORDER BY count DESC
    LIMIT 10
  `);

  const [[rateStats]] = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM applications WHERE deleted_at IS NULL) AS applications,
      (SELECT COUNT(*) FROM jobs WHERE deleted_at IS NULL) AS jobs,
      (SELECT COUNT(*) FROM applications WHERE deleted_at IS NULL AND status IN ('hired', 'offered')) AS converted
  `);

  const applicationRate = Number(rateStats.jobs || 0) > 0
    ? Number((Number(rateStats.applications || 0) / Number(rateStats.jobs || 1)).toFixed(2))
    : 0;
  const conversionRate = Number(rateStats.applications || 0) > 0
    ? Number(((Number(rateStats.converted || 0) / Number(rateStats.applications || 1)) * 100).toFixed(1))
    : 0;

  const [topKeywords] = await db.query(
    `
    SELECT COALESCE(NULLIF(TRIM(query_text), ''), '(empty)') AS keyword, COUNT(*) AS count
    FROM performance_logs
    WHERE event_type = 'search'${logRange.sql}
    GROUP BY COALESCE(NULLIF(TRIM(query_text), ''), '(empty)')
    ORDER BY count DESC
    LIMIT 10
    `,
    logRange.params
  );

  const [[noResult]] = await db.query(
    `
    SELECT COUNT(*) AS count
    FROM performance_logs
    WHERE event_type = 'search' AND result_count = 0${logRange.sql}
    `,
    logRange.params
  );

  const [reportRows] = await db.query(
    `
    SELECT r.id, r.type, r.target_id AS targetId, reporter.full_name AS reporterName, r.reason, r.description, r.status, r.created_at AS createdAt,
      CASE
        WHEN r.type = 'job' THEN j.title
        WHEN r.type = 'cv' THEN d.file_name
        WHEN r.type = 'user' THEN target.full_name
        ELSE CAST(r.target_id AS CHAR)
      END AS targetName
    FROM reports r
    LEFT JOIN users reporter ON reporter.id = r.reporter_id
    LEFT JOIN jobs j ON r.type = 'job' AND j.id = r.target_id
    LEFT JOIN documents d ON r.type = 'cv' AND d.id = r.target_id
    LEFT JOIN users target ON r.type = 'user' AND target.id = r.target_id
    WHERE r.deleted_at IS NULL${reportRange.sql}
    ORDER BY r.created_at DESC
    LIMIT 100
    `,
    reportRange.params
  );

  let reports = reportRows;
  if (!reports.length) {
    const [reportedJobs] = await db.query(`
      SELECT id, 'job' AS type, id AS targetId, title AS targetName, NULL AS reporterName,
        'reported' AS reason, 'Tin tuyển dụng được đánh dấu báo cáo' AS description,
        'pending' AS status, updated_at AS createdAt
      FROM jobs
      WHERE deleted_at IS NULL AND is_reported = TRUE
      ORDER BY updated_at DESC
      LIMIT 100
    `);
    reports = reportedJobs;
  }

  const [userRows] = await db.query(`
    SELECT full_name AS name, email, role,
      CASE WHEN is_blocked THEN 'locked' WHEN is_verified = FALSE THEN 'pending' ELSE 'active' END AS status,
      created_at AS createdAt
    FROM users
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 100
  `);
  const [jobRows] = await db.query(`
    SELECT j.title, COALESCE(ep.company_name, u.full_name) AS company, c.name AS category, j.status, COUNT(a.id) AS applications
    FROM jobs j
    LEFT JOIN employer_profiles ep ON ep.user_id = j.employer_id
    LEFT JOIN users u ON u.id = j.employer_id
    LEFT JOIN job_categories c ON c.id = j.category_id
    LEFT JOIN applications a ON a.job_id = j.id AND a.deleted_at IS NULL
    WHERE j.deleted_at IS NULL
    GROUP BY j.id, ep.company_name, u.full_name, c.name
    ORDER BY j.posted_at DESC
    LIMIT 100
  `);
  const [applicationRows] = await db.query(`
    SELECT u.full_name AS candidateName, j.title AS jobTitle, a.status, a.applied_at AS createdAt,
      CASE WHEN a.status IN ('hired', 'offered') THEN 'converted' ELSE 'open' END AS conversion
    FROM applications a
    LEFT JOIN users u ON u.id = a.candidate_id
    LEFT JOIN jobs j ON j.id = a.job_id
    WHERE a.deleted_at IS NULL
    ORDER BY a.applied_at DESC
    LIMIT 100
  `);

  return {
    stats: {
      totalUsers: Number(stats.totalUsers || 0),
      totalJobs: Number(stats.totalJobs || 0),
      totalApplications: Number(stats.totalApplications || 0),
      growth: stats.growth
    },
    overview: {
      totalUsers: Number(stats.totalUsers || 0),
      totalJobs: Number(stats.totalJobs || 0),
      totalApplications: Number(stats.totalApplications || 0),
      growth: stats.growth
    },
    charts: { userGrowth, jobsPosted, applicationsTrend },
    details: {
      usersByRole,
      jobsByCategory,
      jobsStatus: {
        active: Number(jobsStatus.active || 0),
        expired: Number(jobsStatus.expired || 0),
        pending: Number(jobsStatus.pending || 0),
        reported: Number(jobsStatus.reported || 0)
      },
      topJobs,
      cvByJob,
      applicationRate,
      conversionRate,
      topKeywords,
      noResultSearches: Number(noResult.count || 0)
    },
    modules: {
      users: {
        newUsers: Number(stats.usersInRange || 0),
        activeUsers: Number(stats.totalUsers || 0),
        usersByRole
      },
      jobs: {
        jobsByCategory,
        activeExpired: `Active ${Number(jobsStatus.active || 0)} / Expired ${Number(jobsStatus.expired || 0)}`,
        topJob: topJobs[0]?.title || '--'
      },
      applications: {
        cvByJob,
        applyRate: `${applicationRate}`,
        conversionRate: `${conversionRate}%`
      },
      search: {
        topKeywords,
        noResultSearches: Number(noResult.count || 0),
        ctr: '--'
      }
    },
    ranking: {
      jobs: topJobs.map(item => ({ title: item.title, count: item.applications })),
      companies: [],
      users: usersByRole.map(item => ({ name: item.role, count: item.count }))
    },
    tables: { users: userRows, jobs: jobRows, applications: applicationRows, reports },
    reports,
    items: reports,
    data: reports,
    total: reports.length,
    generatedAt: nowIso()
  };
}

exports.getReportsSummary = async (req, res) => {
  try {
    res.json(await buildReportsSummary(req));
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy report summary', error: error.message });
  }
};

exports.getReports = async (req, res) => {
  try {
    if (!req.query.page && !req.query.limit && !req.query.type && !req.query.status) {
      return res.json(await buildReportsSummary(req));
    }
    await ensureAdminSchema();
    const { page, limit, offset } = pagination(req.query);
    const date = rangeWhere(req.query, 'r.created_at');
    const where = ['r.deleted_at IS NULL'];
    const params = [];
    if (req.query.type) {
      where.push('r.type = ?');
      params.push(req.query.type);
    }
    if (req.query.status) {
      where.push('r.status = ?');
      params.push(req.query.status);
    }
    const whereSql = `WHERE ${where.join(' AND ')}${date.sql}`;
    const allParams = [...params, ...date.params];

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM reports r ${whereSql}`, allParams);
    const [items] = await db.query(
      `
      SELECT r.*, reporter.full_name AS reporterName,
        CASE
          WHEN r.type = 'job' THEN j.title
          WHEN r.type = 'cv' THEN d.file_name
          WHEN r.type = 'user' THEN target.full_name
          ELSE CAST(r.target_id AS CHAR)
        END AS targetName
      FROM reports r
      LEFT JOIN users reporter ON reporter.id = r.reporter_id
      LEFT JOIN jobs j ON r.type = 'job' AND j.id = r.target_id
      LEFT JOIN documents d ON r.type = 'cv' AND d.id = r.target_id
      LEFT JOIN users target ON r.type = 'user' AND target.id = r.target_id
      ${whereSql}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...allParams, limit, offset]
    );

    const [[overview]] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS totalUsers,
        (SELECT COUNT(*) FROM jobs WHERE deleted_at IS NULL) AS totalJobs,
        (SELECT COUNT(*) FROM applications WHERE deleted_at IS NULL) AS totalApplications,
        (SELECT COUNT(*) FROM jobs WHERE deleted_at IS NULL AND is_reported = TRUE) AS reportedJobs,
        (SELECT COUNT(*) FROM reports WHERE deleted_at IS NULL AND type = 'cv') AS reportedCVs,
        (SELECT COUNT(*) FROM reports WHERE deleted_at IS NULL AND type = 'user') AS reportedUsers,
        (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS growth
    `);

    const reportRows = items.map(item => ({
      id: item.id,
      type: item.type,
      targetId: item.target_id,
      targetName: item.targetName,
      reporterName: item.reporterName,
      reason: item.reason,
      description: item.description,
      status: item.status,
      createdAt: item.created_at
    }));

    const [userRows] = await db.query('SELECT full_name AS name, email, role, CASE WHEN is_blocked THEN "banned" WHEN is_verified = FALSE THEN "pending" ELSE "active" END AS status, created_at AS createdAt FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 30');
    const [jobRows] = await db.query('SELECT j.title, COALESCE(ep.company_name, u.full_name) AS company, c.name AS category, j.status, COUNT(a.id) AS applications FROM jobs j LEFT JOIN employer_profiles ep ON ep.user_id = j.employer_id LEFT JOIN users u ON u.id = j.employer_id LEFT JOIN job_categories c ON c.id = j.category_id LEFT JOIN applications a ON a.job_id = j.id AND a.deleted_at IS NULL WHERE j.deleted_at IS NULL GROUP BY j.id, ep.company_name, u.full_name, c.name ORDER BY j.posted_at DESC LIMIT 30');
    const [applicationRows] = await db.query('SELECT u.full_name AS candidateName, j.title AS jobTitle, a.status, a.applied_at AS createdAt, 0 AS conversion FROM applications a LEFT JOIN users u ON u.id = a.candidate_id LEFT JOIN jobs j ON j.id = a.job_id WHERE a.deleted_at IS NULL ORDER BY a.applied_at DESC LIMIT 30');

    res.json({
      total,
      page,
      limit,
      overview,
      stats: overview,
      summary: overview,
      items: reportRows,
      data: reportRows,
      reports: reportRows,
      tables: { users: userRows, jobs: jobRows, applications: applicationRows, reports: reportRows },
      modules: {
        users: { newUsers: overview.growth, activeUsers: overview.totalUsers, reportedUsers: overview.reportedUsers },
        jobs: { reportedJobs: overview.reportedJobs, totalJobs: overview.totalJobs },
        applications: { totalApplications: overview.totalApplications, reportedCVs: overview.reportedCVs },
        search: {}
      },
      generatedAt: nowIso()
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy báo cáo', error: error.message });
  }
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
  try {
    const counts = await documentQueue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'paused'
    );

    const jobs = await documentQueue.getJobs(
      ['waiting', 'active', 'completed', 'failed', 'delayed'],
      0,
      99,
      false
    );

    const items = await Promise.all(jobs.map(formatBullJob));

    res.json({
      total: items.length,
      items,
      jobs: items,
      data: items,
      stats: {
        totalJobs:
          Number(counts.waiting || 0) +
          Number(counts.active || 0) +
          Number(counts.completed || 0) +
          Number(counts.failed || 0) +
          Number(counts.delayed || 0),
        pendingJobs: counts.waiting || 0,
        runningJobs: counts.active || 0,
        completedJobs: counts.completed || 0,
        failedJobs: counts.failed || 0,
        retryJobs: counts.delayed || 0
      },
      queue: {
        name: DOCUMENT_QUEUE_NAME,
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
        retry: counts.delayed || 0,
        paused: counts.paused || 0,
        status: counts.paused ? 'paused' : 'running',
        workerStatus: counts.active > 0 ? 'processing' : 'idle',
        retrySystem: 'enabled'
      }
    });
  } catch (error) {
    res.status(500).json({
      message: 'Lỗi đọc trạng thái background jobs',
      error: error.message
    });
  }
};


exports.getSearchAnalytics = async (req, res) => {
  try {
    const performanceLogService = require('../services/performanceLogService');
    await performanceLogService.ensurePerformanceLogsTable();
    const date = rangeWhere(req.query, 'created_at');
    const baseWhere = `WHERE event_type = 'search'${date.sql}`;
    const params = date.params;

    const [items] = await db.query(
      `
      SELECT
        id,
        event_type AS eventType,
        engine,
        query_text AS queryText,
        filters,
        result_count AS resultCount,
        latency_ms AS latencyMs,
        user_id AS userId,
        created_at AS createdAt
      FROM performance_logs
      ${baseWhere}
      ORDER BY created_at DESC
      LIMIT 100
      `,
      params
    );

    const [[summary]] = await db.query(
      `
      SELECT
        COUNT(*) AS totalSearches,
        COUNT(DISTINCT user_id) AS uniqueUsers,
        SUM(DATE(created_at) = CURDATE()) AS searchesToday,
        SUM(result_count = 0) AS noResultSearches,
        ROUND(AVG(latency_ms), 2) AS avgLatencyMs,
        MAX(latency_ms) AS maxLatencyMs,
        MIN(latency_ms) AS minLatencyMs
      FROM performance_logs
      ${baseWhere}
      `,
      params
    );

    const [trends] = await db.query(
      `
      SELECT
        DATE(created_at) AS label,
        COUNT(*) AS value
      FROM performance_logs
      ${baseWhere}
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at)
      `,
      params
    );

    const [topKeywords] = await db.query(
      `
      SELECT
        COALESCE(NULLIF(TRIM(query_text), ''), '(empty)') AS keyword,
        COUNT(*) AS count,
        ROUND(AVG(result_count), 0) AS resultCount
      FROM performance_logs
      ${baseWhere}
      GROUP BY COALESCE(NULLIF(TRIM(query_text), ''), '(empty)')
      ORDER BY count DESC
      LIMIT 10
      `,
      params
    );

    const [noResults] = await db.query(
      `
      SELECT
        COALESCE(NULLIF(TRIM(query_text), ''), '(empty)') AS keyword,
        COUNT(*) AS count,
        0 AS resultCount
      FROM performance_logs
      ${baseWhere} AND result_count = 0
      GROUP BY COALESCE(NULLIF(TRIM(query_text), ''), '(empty)')
      ORDER BY count DESC
      LIMIT 10
      `,
      params
    );

    res.json({
      total: summary.totalSearches,
      overview: summary,
      summary: {
        ...summary,
        total: summary.totalSearches
      },
      totalSearches: summary.totalSearches,
      uniqueUsers: summary.uniqueUsers,
      searchesToday: summary.searchesToday,
      noResultSearches: summary.noResultSearches,
      items,
      data: items,
      trends,
      searchTrends: trends,
      topKeywords,
      noResults,
      table: topKeywords.map(item => ({
        keyword: item.keyword,
        count: item.count,
        resultCount: item.resultCount,
        clicks: 0,
        ctr: 0,
        applyConversion: 0
      }))
    });
  } catch (error) {
    res.status(500).json({
      message: 'Lỗi lấy search analytics',
      error: error.message
    });
  }
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

exports.getBackgroundJobById = async (req, res) => {
  try {
    const job = await documentQueue.getJob(req.params.id);

    if (!job) {
      return res.status(404).json({ message: 'Không tìm thấy background job' });
    }

    const detail = await formatBullJob(job);

    res.json({
      job: detail,
      detail,
      ...detail
    });
  } catch (error) {
    res.status(500).json({
      message: 'Lỗi lấy chi tiết background job',
      error: error.message
    });
  }
};

exports.retryBackgroundJob = async (req, res) => {
  try {
    const job = await documentQueue.getJob(req.params.id);

    if (!job) {
      return res.status(404).json({ message: 'Không tìm thấy background job' });
    }

    await job.retry();

    res.json({
      success: true,
      message: `Đã retry job #${job.id}`
    });
  } catch (error) {
    res.status(500).json({
      message: 'Không retry được background job',
      error: error.message
    });
  }
};

exports.deleteBackgroundJob = async (req, res) => {
  try {
    const job = await documentQueue.getJob(req.params.id);

    if (!job) {
      return res.status(404).json({ message: 'Không tìm thấy background job' });
    }

    await job.remove();

    res.json({
      success: true,
      message: `Đã xóa job #${req.params.id}`
    });
  } catch (error) {
    res.status(500).json({
      message: 'Không xóa được background job',
      error: error.message
    });
  }
};

exports.controlBackgroundQueue = async (req, res) => {
  try {
    const action = req.params.action;

    if (action === 'pause') {
      await documentQueue.pause();
      return res.json({ success: true, status: 'paused' });
    }

    if (action === 'resume') {
      await documentQueue.resume();
      return res.json({ success: true, status: 'running' });
    }

    return res.status(400).json({ message: 'Action không hợp lệ' });
  } catch (error) {
    res.status(500).json({
      message: 'Không điều khiển được queue',
      error: error.message
    });
  }
};
