const express = require('express');
const candidateController = require('../controllers/candidateController');
const { isAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', candidateController.getCandidates);
router.get('/recent', candidateController.getCandidates);
router.get('/search', candidateController.searchCandidates);
router.post('/save', isAuth, candidateController.saveCandidate);
router.get('/saved', isAuth, candidateController.getSavedCandidates);
router.get('/saved-ids', isAuth, candidateController.getSavedCandidateIds);
router.delete('/saved/:id', isAuth, candidateController.removeSavedCandidate);
router.patch('/:id/status', candidateController.updateCandidateStatus);

module.exports = router;
