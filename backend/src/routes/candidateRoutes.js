const express = require('express');
const documentController = require('../controllers/documentController');
const applicationController = require('../controllers/applicationController');
const { pdfUpload } = require('../config/cloudinary');
const { isAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/cv', isAuth, documentController.getMyDocuments);
router.post('/cv/upload', isAuth, pdfUpload.single('cv'), documentController.uploadCV);
router.delete('/cv/:id', isAuth, documentController.deleteDocument);
router.get('/applications', isAuth, applicationController.getMyApplications);

module.exports = router;
