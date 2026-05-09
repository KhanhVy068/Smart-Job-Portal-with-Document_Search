const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// Tuyến đường lấy thông số thống kê
router.get('/stats', adminController.getStats);

module.exports = router;