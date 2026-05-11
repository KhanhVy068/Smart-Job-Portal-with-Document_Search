const express = require('express');
const documentController = require('../controllers/documentController');
const { pdfUpload } = require('../config/cloudinary');

const router = express.Router();

router.get('/search', documentController.searchDocuments);
router.get('/list', documentController.getAllDocuments);
router.get('/my-cv', documentController.getMyDocuments);
router.get('/:id/view', documentController.viewDocument);
router.post('/upload-cv', pdfUpload.single('cv_file'), documentController.uploadCV);
router.delete('/:id', documentController.deleteDocument);

module.exports = router;
