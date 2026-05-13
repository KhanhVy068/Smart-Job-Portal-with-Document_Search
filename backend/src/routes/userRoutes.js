const express = require('express');
const { getProfile, updateProfile } = require('../controllers/ProfileController');
const { isAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/profile', isAuth, getProfile);
router.put('/profile', isAuth, updateProfile);

module.exports = router;
