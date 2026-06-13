const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const db = require('../config/db');
const documentQueue = require('../services/documentQueue');
const searchService = require('../services/searchService');
const documentWorker = require('../services/documentWorker');

function getUserId(req, fallback = 2) {
  return req.user?.id || fallback;
}

async function ensureDocumentUploadSchema() {
  try {
    await db.query('ALTER TABLE documents ADD COLUMN file_size BIGINT DEFAULT 0 AFTER file_url');
  } catch (error) {
    if (error.code !== 'ER_DUP_FIELDNAME') throw error;
  }
  await documentWorker.ensureExtractionSchema();
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

function toDocumentResponse(row = {}) {
  return {
    id: row.id,
    userId: row.user_id,
    filename: row.file_name,
    name: row.file_name,
    url: row.file_url,
    fileUrl: row.file_url,
    fileSize: Number(row.file_size || 0),
    size: Number(row.file_size || 0),
    storageProvider: row.storage_provider,
    status: row.status,
    extractionStatus: row.extraction_status || row.status || 'pending',
    extraction_status: row.extraction_status || row.status || 'pending',
    docType: row.doc_type,
    extractedText: row.extracted_text || '',
    extractedSkills: normalizeSkills(row.extracted_skills),
    skills: normalizeSkills(row.extracted_skills),
    desiredPosition: row.desired_position || '',
    desired_position: row.desired_position || '',
    experienceYears: row.experience_years ?? null,
    experience_years: row.experience_years ?? null,
    summary: row.extracted_summary || '',
    uploadedAt: row.created_at,
    createdAt: row.created_at,
    processedAt: row.processed_at,
    extractedAt: row.extracted_at
  };
}

exports.uploadCV = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Vui lòng chọn file CV.' });

    await ensureDocumentUploadSchema();
    const userId = getUserId(req);
    const fileUrl = req.file.secure_url || req.file.path;
    const fileName = req.file.originalname || req.file.filename || 'cv.pdf';
    const fileSize = Number(req.file.size || req.file.bytes || 0);
    const hashSource = `${fileName}:${fileUrl}:${Date.now()}`;
    const fileHash = crypto.createHash('sha256').update(hashSource).digest('hex');

    const [result] = await db.query(
      `
      INSERT INTO documents (
        user_id, file_name, file_url, file_size, storage_provider, file_hash, doc_type, status, extraction_status
      ) VALUES (?, ?, ?, ?, 'cloudinary', ?, 'cv', 'pending', 'pending')
      `,
      [userId, fileName, fileUrl, fileSize, fileHash]
    );

    const [[row]] = await db.query('SELECT * FROM documents WHERE id = ?', [result.insertId]);
    documentQueue.enqueueDocument(result.insertId).catch(error => {
      console.warn('Queue unavailable, extracting document directly:', error.message);
      documentWorker.processDocument(result.insertId).catch(err => {
        console.warn('Direct document extraction warning:', err.message);
      });
    });
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

    if (document.storage_provider === 'local' || String(document.file_url || '').startsWith('/uploads/')) {
      const relativePath = String(document.file_url || '').replace(/^\/+/, '');
      const uploadsRoot = path.resolve(__dirname, '..', '..', '..', 'uploads');
      const filePath = path.resolve(__dirname, '..', '..', '..', relativePath);

      if (!filePath.startsWith(uploadsRoot) || !fs.existsSync(filePath)) {
        return res.status(404).end('KhÃ´ng tÃ¬m tháº¥y file CV.');
      }

      return fs.createReadStream(filePath)
        .on('error', (error) => {
          console.error('Read local CV error:', error);
          if (!res.headersSent) res.status(500).end('KhÃ´ng táº£i Ä‘Æ°á»£c file CV.');
        })
        .pipe(res);
    }

    if (/^https?:\/\//i.test(document.file_url)) {
        return res.redirect(document.file_url);
      }

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
