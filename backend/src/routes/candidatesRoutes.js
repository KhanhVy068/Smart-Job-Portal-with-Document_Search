const express = require('express');
const candidateController = require('../controllers/candidateController');

const router = express.Router();

router.get('/', candidateController.getCandidates);
router.get('/recent', candidateController.getCandidates);
router.get('/search', candidateController.searchCandidates);
router.post('/save', candidateController.saveCandidate);
router.get('/saved', candidateController.getSavedCandidates);
router.delete('/saved/:id', candidateController.removeSavedCandidate);
router.patch('/:id/status', candidateController.updateCandidateStatus);

module.exports = router;
