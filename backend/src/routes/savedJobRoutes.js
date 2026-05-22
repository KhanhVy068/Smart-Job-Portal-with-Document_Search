const express = require('express');
const savedJobController = require('../controllers/savedJobController');
const { isAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', isAuth, savedJobController.getSavedJobs);
router.get('/ids', isAuth, savedJobController.getSavedJobIds);
router.post('/', isAuth, savedJobController.saveJob);
router.delete('/:jobId', isAuth, savedJobController.unsaveJob);

module.exports = router;
