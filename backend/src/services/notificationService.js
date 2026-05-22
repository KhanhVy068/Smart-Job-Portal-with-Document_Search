const db = require('../config/db');

let ensurePromise = null;

function getUserId(req) {
  return req.user?.id;
}

async function ensureNotificationsTable() {
  if (!ensurePromise) {
    ensurePromise = db.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type VARCHAR(80) NOT NULL DEFAULT 'system',
        title VARCHAR(255) NOT NULL,
        message TEXT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_notifications_user_read (user_id, is_read),
        INDEX idx_notifications_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch(error => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}

async function createNotification({ userId, type = 'system', title, message = '' }) {
  if (!userId || !title) return null;
  await ensureNotificationsTable();
  const [result] = await db.query(
    'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)',
    [userId, type, title, message]
  );
  return result.insertId;
}

function toNotification(row = {}) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    message: row.message || '',
    isRead: Boolean(row.is_read),
    is_read: Boolean(row.is_read),
    createdAt: row.created_at
  };
}

async function listNotifications(userId, limit = 20) {
  await ensureNotificationsTable();
  const [rows] = await db.query(
    `SELECT * FROM notifications
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [userId, Number(limit) || 20]
  );
  const [[countRow]] = await db.query(
    'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = FALSE',
    [userId]
  );
  return {
    unread: Number(countRow?.unread || 0),
    items: rows.map(toNotification),
    notifications: rows.map(toNotification)
  };
}

exports.ensureNotificationsTable = ensureNotificationsTable;
exports.createNotification = createNotification;

exports.getNotifications = async (req, res) => {
  try {
    const payload = await listNotifications(getUserId(req), req.query.limit || 20);
    res.json(payload);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Lỗi lấy thông báo', error: error.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    await ensureNotificationsTable();
    const userId = getUserId(req);
    const id = req.params.id;
    if (id === 'all') {
      await db.query('UPDATE notifications SET is_read = TRUE WHERE user_id = ?', [userId]);
    } else {
      await db.query('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [id, userId]);
    }
    res.json({ success: true, ...(await listNotifications(userId)) });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ message: 'Lỗi cập nhật thông báo', error: error.message });
  }
};
