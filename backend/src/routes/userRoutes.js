const express = require('express');
const { getProfile, updateProfile } = require('../controllers/ProfileController');

const router = express.Router();

router.get('/profile', getProfile);
router.put('/profile', updateProfile);

module.exports = router;
