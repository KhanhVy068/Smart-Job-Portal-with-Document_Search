const express = require('express');
const employerController = require('../controllers/employerController');
const { isAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/header', isAuth, employerController.getHeader);
router.get('/settings', isAuth, employerController.getSettings);
router.patch('/settings/company', isAuth, employerController.updateCompany);
router.patch('/settings/account', isAuth, employerController.updateAccount);
router.patch('/settings/notifications', isAuth, employerController.updateNotifications);

module.exports = router;
