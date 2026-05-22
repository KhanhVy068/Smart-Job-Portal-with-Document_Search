const express = require('express');
const candidateController = require('../controllers/candidateController');
const { isAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', candidateController.getCandidates);
router.get('/recent', candidateController.getCandidates);
router.get('/search', candidateController.searchCandidates);
router.post('/', isAuth, candidateController.saveCandidate);
router.post('/save', isAuth, candidateController.saveCandidate);
router.get('/ids', isAuth, candidateController.getSavedCandidateIds);
router.get('/saved-candidates', isAuth, candidateController.getSavedCandidates);
router.get('/saved', isAuth, candidateController.getSavedCandidates);
router.get('/saved-ids', isAuth, candidateController.getSavedCandidateIds);
router.delete('/:id', isAuth, candidateController.removeSavedCandidate);
router.delete('/saved/:id', isAuth, candidateController.removeSavedCandidate);
router.patch('/:id/status', candidateController.updateCandidateStatus);

module.exports = router;
