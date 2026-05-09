const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');

// Tuyến đường lấy tất cả tin (Employer quản lý)
router.get('/', jobController.getAllJobs);

// Tuyến đường lấy chi tiết 1 tin
router.get('/:id', jobController.getJobById);

// Tuyến đường đăng tin mới
router.post('/create', jobController.createJob);

// Tuyến đường cập nhật tin
router.put('/:id', jobController.updateJob);

// Tuyến đường xóa tin
router.delete('/:id', jobController.deleteJob);

module.exports = router;