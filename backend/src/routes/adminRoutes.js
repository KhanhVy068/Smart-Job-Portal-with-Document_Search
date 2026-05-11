
/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: API quản trị (chỉ admin mới có quyền)
 */

/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: Lấy danh sách tất cả người dùng (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách người dùng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   example: 10
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       full_name: { type: string }
 *                       email: { type: string }
 *                       role: { type: string }
 *                       is_blocked: { type: boolean }
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền admin
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /admin/users/{id}/block:
 *   put:
 *     summary: Khóa người dùng (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: ID của người dùng cần khóa
 *     responses:
 *       200:
 *         description: Đã khóa user thành công
 *       404:
 *         description: Không tìm thấy user
 *       403:
 *         description: Không có quyền admin
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /admin/users/{id}/unblock:
 *   put:
 *     summary: Mở khóa người dùng (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: ID của người dùng cần mở khóa
 *     responses:
 *       200:
 *         description: Đã mở khóa user thành công
 *       404:
 *         description: Không tìm thấy user
 *       403:
 *         description: Không có quyền admin
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /admin/jobs:
 *   get:
 *     summary: Lấy danh sách tất cả việc làm (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách việc làm
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   example: 5
 *                 jobs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       title: { type: string }
 *                       employer_id: { type: integer }
 *                       status: { type: string }
 *                       location: { type: string }
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền admin
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /admin/jobs/{id}:
 *   delete:
 *     summary: Xóa việc làm bất kỳ (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: ID của việc làm cần xóa
 *     responses:
 *       200:
 *         description: Đã xóa việc làm thành công
 *       404:
 *         description: Không tìm thấy việc làm
 *       403:
 *         description: Không có quyền admin
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /admin/categories:
 *   get:
 *     summary: Lấy danh sách tất cả danh mục (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách danh mục
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       name: { type: string }
 *                       slug: { type: string }
 *                       parent_id: { type: integer }
 *       403:
 *         description: Không có quyền admin
 *       500:
 *         description: Lỗi server
 *   post:
 *     summary: Tạo danh mục mới (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - slug
 *             properties:
 *               name:
 *                 type: string
 *                 description: Tên danh mục
 *                 example: Frontend Developer
 *               slug:
 *                 type: string
 *                 description: Đường dẫn thân thiện
 *                 example: frontend-developer
 *               parent_id:
 *                 type: integer
 *                 description: ID danh mục cha (nếu có)
 *                 example: null
 *     responses:
 *       201:
 *         description: Tạo danh mục thành công
 *       400:
 *         description: Thiếu name hoặc slug
 *       403:
 *         description: Không có quyền admin
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /admin/categories/{id}:
 *   put:
 *     summary: Cập nhật danh mục (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: ID danh mục cần cập nhật
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Frontend Developer Pro
 *               slug:
 *                 type: string
 *                 example: frontend-developer-pro
 *               parent_id:
 *                 type: integer
 *                 example: null
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       404:
 *         description: Không tìm thấy danh mục
 *       403:
 *         description: Không có quyền admin
 *       500:
 *         description: Lỗi server
 *   delete:
 *     summary: Xóa danh mục (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: ID danh mục cần xóa
 *     responses:
 *       200:
 *         description: Xóa danh mục thành công
 *       404:
 *         description: Không tìm thấy danh mục
 *       403:
 *         description: Không có quyền admin
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /admin/stats:
 *   get:
 *     summary: Xem thống kê tổng quan (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thống kê hệ thống
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalUsers:
 *                   type: integer
 *                   description: Tổng số người dùng
 *                   example: 15
 *                 totalJobs:
 *                   type: integer
 *                   description: Tổng số tin tuyển dụng
 *                   example: 8
 *                 totalApplications:
 *                   type: integer
 *                   description: Tổng số đơn ứng tuyển
 *                   example: 23
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền admin
 *       500:
 *         description: Lỗi server
 */

const express = require('express');
const { isAuth } = require('../middleware/authMiddleware');
const { isAdmin } = require('../middleware/roleMiddleware');
const { 
    getAllUsers, blockUser, unblockUser, 
    getAllJobs, deleteJob,
    getAllCategories, createCategory, updateCategory, deleteCategory,
    getStats  
} = require('../controllers/AdminController');

const router = express.Router();

// Tất cả các route admin đều cần isAuth + isAdmin
router.use(isAuth, isAdmin);

// GET /admin/users - Xem danh sách users
router.get('/users', getAllUsers);

// PUT /admin/users/:id/block - Khóa user
router.put('/users/:id/block', blockUser);

// PUT /admin/users/:id/unblock - Mở khóa user
router.put('/users/:id/unblock', unblockUser);

// GET /admin/jobs - Xem danh sách jobs
router.get('/jobs', getAllJobs);

// DELETE /admin/jobs/:id - Xóa job
router.delete('/jobs/:id', deleteJob);


// Categories management
router.get('/categories', getAllCategories);
router.post('/categories', createCategory);
router.put('/categories/:id', updateCategory);
router.delete('/categories/:id', deleteCategory);

router.get('/stats', getStats);

module.exports = router;