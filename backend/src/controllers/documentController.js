const crypto = require('crypto');
const https = require('https');
const db = require('../config/db');
const documentQueue = require('../services/documentQueue');
const searchService = require('../services/searchService');

function getUserId(req, fallback = 2) {
  return req.user?.id || fallback;
}

function toDocumentResponse(row = {}) {
  return {
    id: row.id,
    userId: row.user_id,
    filename: row.file_name,
    name: row.file_name,
    url: row.file_url,
    fileUrl: row.file_url,
    storageProvider: row.storage_provider,
    status: row.status,
    docType: row.doc_type,
    uploadedAt: row.created_at,
    createdAt: row.created_at,
    processedAt: row.processed_at
  };
}

exports.uploadCV = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Vui lòng chọn file CV.' });

    const userId = getUserId(req);
    const fileUrl = req.file.secure_url || req.file.path;
    const fileName = req.file.originalname || req.file.filename || 'cv.pdf';
    const hashSource = `${fileName}:${fileUrl}:${Date.now()}`;
    const fileHash = crypto.createHash('sha256').update(hashSource).digest('hex');

    const [result] = await db.query(
      `
      INSERT INTO documents (
        user_id, file_name, file_url, storage_provider, file_hash, doc_type, status
      ) VALUES (?, ?, ?, 'cloudinary', ?, 'cv', 'pending')
      `,
      [userId, fileName, fileUrl, fileHash]
    );

    const [[row]] = await db.query('SELECT * FROM documents WHERE id = ?', [result.insertId]);
    await documentQueue.enqueueDocument(result.insertId);
    res.status(201).json(toDocumentResponse(row));
  } catch (error) {
    console.error('Upload CV error:', error);
    res.status(500).json({ message: 'Lỗi upload CV', error: error.message });
  }
};

exports.getMyDocuments = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM documents WHERE user_id = ? AND doc_type = "cv" AND deleted_at IS NULL ORDER BY created_at DESC',
      [getUserId(req)]
    );
    res.json(rows.map(toDocumentResponse));
  } catch (error) {
    console.error('Get my CVs error:', error);
    res.status(500).json({ message: 'Lỗi lấy danh sách CV', error: error.message });
  }
};

exports.getAllDocuments = async (req, res) => {
  try {
    const params = [];
    const where = ['deleted_at IS NULL'];
    if (req.query.fileName || req.query.q) {
      where.push('file_name LIKE ?');
      params.push(`%${req.query.fileName || req.query.q}%`);
    }

    const [rows] = await db.query(
      `SELECT * FROM documents WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 100`,
      params
    );
    const items = rows.map(toDocumentResponse);
    res.json({ total: items.length, items, data: items });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ message: 'Lỗi lấy tài liệu', error: error.message });
  }
};

exports.searchDocuments = async (req, res) => {
  try {
    const result = await searchService.search({
      q: req.query.q || req.query.keyword || '',
      type: req.query.type || 'cv',
      location: req.query.location || '',
      page: req.query.page,
      limit: req.query.limit
    });
    res.json(result);
  } catch (error) {
    console.error('Search documents error:', error);
    res.status(500).json({ message: 'Lỗi tìm kiếm tài liệu', error: error.message });
  }
};

exports.deleteDocument = async (req, res) => {
  try {
    const [result] = await db.query(
      'UPDATE documents SET deleted_at = NOW() WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [req.params.id, getUserId(req)]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Không tìm thấy CV.' });
    res.json({ success: true, message: 'Đã xóa CV.' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ message: 'Lỗi xóa CV', error: error.message });
  }
};

exports.viewDocument = async (req, res) => {
  try {
    const [[document]] = await db.query(
      'SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [req.params.id]
    );

    if (!document) return res.status(404).send('Không tìm thấy CV.');
    if (document.doc_type !== 'cv') return res.status(400).send('Tài liệu không phải CV.');

    const fileName = document.file_name || 'cv.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');

    https.get(document.file_url, (upstream) => {
      if (upstream.statusCode >= 300 && upstream.statusCode < 400 && upstream.headers.location) {
        https.get(upstream.headers.location, (redirected) => redirected.pipe(res))
          .on('error', () => res.status(502).end('Không tải được file CV.'));
        return;
      }

      if (upstream.statusCode !== 200) {
        res.status(upstream.statusCode || 502).end('Không tải được file CV.');
        return;
      }

      upstream.pipe(res);
    }).on('error', (error) => {
      console.error('View document error:', error);
      res.status(502).send('Không tải được file CV.');
    });
  } catch (error) {
    console.error('View document error:', error);
    res.status(500).send('Lỗi xem CV.');
  }
};
