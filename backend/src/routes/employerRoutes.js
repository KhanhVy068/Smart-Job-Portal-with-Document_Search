const express = require('express');
const employerController = require('../controllers/employerController');

const router = express.Router();

router.get('/header', employerController.getHeader);
router.get('/settings', employerController.getSettings);
router.patch('/settings/company', employerController.updateCompany);
router.patch('/settings/account', employerController.updateAccount);
router.patch('/settings/notifications', employerController.updateNotifications);

module.exports = router;
