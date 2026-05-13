const express = require('express');
const {
  getJobs,
  getMyJobs,
  getJobById,
  createJob,
  updateJob,
  deleteJob,
  applyToJob
} = require('../controllers/jobController');
const { isAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', getJobs);
router.get('/my', isAuth, getMyJobs);
router.post('/', isAuth, createJob);
router.post('/create', isAuth, createJob);
router.post('/:id/apply', isAuth, applyToJob);
router.get('/:id/applications', isAuth, (req, res, next) => {
  req.params.jobId = req.params.id;
  require('../controllers/applicationController').getApplicantsByJob(req, res, next);
});
router.get('/:id', getJobById);
router.put('/:id', isAuth, updateJob);
router.patch('/:id', isAuth, updateJob);
router.delete('/:id', isAuth, deleteJob);

module.exports = router;
