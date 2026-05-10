/**
 * @swagger
 * tags:
 *   name: Jobs
 *   description: API quản lý việc làm
 */

/**
 * @swagger
 * /api/jobs:
 *   get:
 *     summary: Lấy danh sách việc làm (phân trang, lọc)
 *     tags: [Jobs]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: Số trang
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *         description: Số lượng mỗi trang
 *       - in: query
 *         name: location
 *         schema: { type: string }
 *         description: Lọc theo địa điểm (VD: HCM)
 *       - in: query
 *         name: category_id
 *         schema: { type: integer }
 *         description: Lọc theo danh mục
 *       - in: query
 *         name: job_type
 *         schema: { type: string, enum: [Full-time, Part-time, Freelance, Remote] }
 *         description: Lọc theo hình thức làm việc
 *     responses:
 *       200:
 *         description: Thành công
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /api/jobs/{id}:
 *   get:
 *     summary: Lấy chi tiết một việc làm
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: ID của việc làm
 *     responses:
 *       200:
 *         description: Chi tiết việc làm
 *       404:
 *         description: Không tìm thấy
 *       500:
 *         description: Lỗi server
 */

const express = require('express');
const { getJobs, getJobById } = require('../controllers/JobController');

const router = express.Router();


// GET /api/jobs - Lấy danh sách jobs (công khai, không cần đăng nhập)
router.get('/', getJobs);

// GET /api/jobs/:id - Lấy chi tiết job (công khai)
router.get('/:id', getJobById);

module.exports = router;