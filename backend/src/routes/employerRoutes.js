const express = require('express');
const employerController = require('../controllers/employerController');
const { isAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/header', isAuth, employerController.getHeader);
router.get('/cv-search', isAuth, employerController.searchEmployerCvs);
router.get('/candidates/search', isAuth, employerController.searchEmployerCvs);
router.get('/cv-detail', isAuth, employerController.getEmployerCvDetail);
router.get('/settings', isAuth, employerController.getSettings);
router.patch('/settings/company', isAuth, employerController.updateCompany);
router.patch('/settings/account', isAuth, employerController.updateAccount);
router.patch('/settings/notifications', isAuth, employerController.updateNotifications);


module.exports = router;
