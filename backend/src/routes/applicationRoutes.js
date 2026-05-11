const express = require('express');
const applicationController = require('../controllers/applicationController');

const router = express.Router();

router.post('/apply', applicationController.applyJob);
router.get('/', applicationController.getApplicantsByJob);
router.get('/my', applicationController.getMyApplications);
router.get('/my-applications', applicationController.getMyApplications);
router.get('/job/:jobId/applicants', applicationController.getApplicantsByJob);
router.get('/:id', applicationController.getApplicationById);
router.patch('/:id/status', applicationController.updateApplicationStatus);

module.exports = router;
