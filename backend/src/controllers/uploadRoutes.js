const express = require('express');
const { isAuth } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinary');
const { uploadFile } = require('../controllers/UploadController');

const router = express.Router();

// POST /api/upload - Upload file (cần đăng nhập)
router.post('/', isAuth, upload.single('file'), uploadFile);

module.exports = router;