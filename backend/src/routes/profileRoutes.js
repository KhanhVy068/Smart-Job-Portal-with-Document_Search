const express = require('express');
const { getProfile, updateProfile, uploadAvatar, avatarUpload } = require('../controllers/ProfileController');
const { isAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', isAuth, getProfile);
router.put('/', isAuth, updateProfile);
router.post('/avatar', isAuth, avatarUpload.single('avatar'), uploadAvatar);

module.exports = router;
