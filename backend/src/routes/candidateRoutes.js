const express = require('express');
const documentController = require('../controllers/documentController');
const applicationController = require('../controllers/applicationController');
const { pdfUpload } = require('../config/cloudinary');

const router = express.Router();

router.get('/cv', documentController.getMyDocuments);
router.post('/cv/upload', pdfUpload.single('cv'), documentController.uploadCV);
router.delete('/cv/:id', documentController.deleteDocument);
router.get('/applications', applicationController.getMyApplications);

module.exports = router;
