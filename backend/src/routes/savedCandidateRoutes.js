

const express = require('express');
const router = express.Router();
const savedCandidateController = require('../controllers/savedCandidateController');
const { isAuth } = require('../middleware/authMiddleware');

router.get('/', isAuth, savedCandidateController.getSavedCandidates);
router.get('/ids', isAuth, savedCandidateController.getSavedCandidateIds);
router.post('/', isAuth, savedCandidateController.saveCandidate);
router.delete('/:candidateId', isAuth, savedCandidateController.unsaveCandidate);

module.exports = router;
