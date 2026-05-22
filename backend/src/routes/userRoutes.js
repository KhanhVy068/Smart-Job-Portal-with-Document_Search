const express = require('express');
const { getProfile, updateProfile, uploadAvatar, avatarUpload } = require('../controllers/ProfileController');
const { isAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/profile', isAuth, getProfile);
router.put('/profile', isAuth, updateProfile);
router.post('/profile/avatar', isAuth, avatarUpload.single('avatar'), uploadAvatar);

module.exports = router;
