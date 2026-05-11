/**
 * @swagger
 * tags:
 *   name: Profile
 *   description: API quản lý hồ sơ cá nhân (cần token)
 */

/**
 * @swagger
 * /api/profile:
 *   get:
 *     summary: Lấy thông tin cá nhân
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin người dùng
 *       401:
 *         description: Chưa đăng nhập hoặc token hết hạn
 *       500:
 *         description: Lỗi server
 *   put:
 *     summary: Cập nhật thông tin cá nhân
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *                 example: Nguyễn Văn B
 *               phone:
 *                 type: string
 *                 example: 0987654321
 *               avatar_url:
 *                 type: string
 *                 example: https://...
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       401:
 *         description: Chưa đăng nhập
 *       500:
 *         description: Lỗi server
 */

const express = require('express');
const { isAuth } = require('../middleware/authMiddleware');
const { getProfile, updateProfile } = require('../controllers/ProfileController');

const router = express.Router();

router.get('/', isAuth, getProfile);
router.put('/', isAuth, updateProfile);



module.exports = router;