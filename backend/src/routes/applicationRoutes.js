const express = require('express');
const router = express.Router();
const appController = require('../controllers/applicationController');

// Tuyến đường Candidate nộp đơn
router.post('/apply', appController.applyJob);

//Tuyến đường Candidate xem lịch sử đã nộp
router.get('/my-applications', appController.getMyApplications);

// Tuyến đường Employer xem danh sách ứng viên của một Job 
// Endpoint: GET /api/applications/job/:jobId/applicants
router.get('/job/:jobId/applicants', appController.getApplicantsByJob);

module.exports = router;