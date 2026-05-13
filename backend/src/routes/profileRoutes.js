const express = require('express');
const { getProfile, updateProfile } = require('../controllers/ProfileController');
const { isAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', isAuth, getProfile);
router.put('/', isAuth, updateProfile);

module.exports = router;
