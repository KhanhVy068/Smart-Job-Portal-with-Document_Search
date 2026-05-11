const express = require('express');
const { upload } = require('../config/cloudinary');
const { uploadFile } = require('../controllers/UploadController');

const router = express.Router();

router.post('/', upload.single('file'), uploadFile);

module.exports = router;
