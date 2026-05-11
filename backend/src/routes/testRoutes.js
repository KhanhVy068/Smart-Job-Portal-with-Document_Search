const express = require('express');
const { isAuth } = require('../middleware/authMiddleware');
const { isEmployer, isCandidate, isAdmin } = require('../middleware/roleMiddleware');
const { getProfile, getEmployerOnly, getCandidateOnly, getAdminOnly } = require('../controllers/TestController');

const router = express.Router();

// Route chỉ cần đăng nhập
router.get('/profile', isAuth, getProfile);

// Route chỉ Employer
router.get('/employer-only', isAuth, isEmployer, getEmployerOnly);

// Route chỉ Candidate
router.get('/candidate-only', isAuth, isCandidate, getCandidateOnly);

// Route chỉ Admin
router.get('/admin-only', isAuth, isAdmin, getAdminOnly);

module.exports = router;