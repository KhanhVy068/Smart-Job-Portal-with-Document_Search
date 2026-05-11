/**
 * @swagger
 * tags:
 *   name: Jobs
 *   description: API quản lý việc làm
 */

const express = require('express');
const {
  getJobs,
  getJobById,
  createJob,
  updateJob,
  deleteJob
} = require('../controllers/JobController');

const router = express.Router();

router.get('/', getJobs);
router.get('/:id', getJobById);

router.post('/create', createJob);
router.put('/:id', updateJob);
router.delete('/:id', deleteJob);

module.exports = router;
