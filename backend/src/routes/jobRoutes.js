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

const router = express.Router();

router.get('/', getJobs);
router.get('/my', getMyJobs);
router.post('/', createJob);
router.post('/create', createJob);
router.post('/:id/apply', applyToJob);
router.get('/:id/applications', (req, res, next) => {
  req.params.jobId = req.params.id;
  require('../controllers/applicationController').getApplicantsByJob(req, res, next);
});
router.get('/:id', getJobById);
router.put('/:id', updateJob);
router.patch('/:id', updateJob);
router.delete('/:id', deleteJob);

module.exports = router;
