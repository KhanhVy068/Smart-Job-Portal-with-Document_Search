const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const upload = require('../middleware/upload');

// 1. Tìm kiếm tài liệu (Toàn hệ thống)
router.get('/search', documentController.getAllDocuments);

// 2. Lấy danh sách CV của riêng tôi (User ID: 2)
router.get('/my-cv', documentController.getMyDocuments);

// 3. Upload CV mới
router.post('/upload-cv', upload.single('cv_file'), documentController.uploadCV);

// 4. Xóa CV theo ID
router.delete('/:id', documentController.deleteDocument);

module.exports = router;