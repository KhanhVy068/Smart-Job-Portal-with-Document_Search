/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: API xác thực người dùng
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Đăng ký tài khoản mới
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - full_name
 *               - email
 *               - password
 *             properties:
 *               full_name:
 *                 type: string
 *                 example: Nguyễn Văn A
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: 123456
 *               role:
 *                 type: string
 *                 enum: [candidate, employer, admin]
 *                 example: candidate
 *     responses:
 *       201:
 *         description: Đăng ký thành công
 *       400:
 *         description: Email đã tồn tại hoặc thiếu dữ liệu
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Đăng nhập
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       200:
 *         description: Đăng nhập thành công, trả về token
 *       401:
 *         description: Sai email hoặc mật khẩu
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Quên mật khẩu - Gửi yêu cầu đặt lại mật khẩu
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 description: Email đã đăng ký
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Reset token đã được tạo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Link reset mật khẩu đã được tạo
 *                 resetToken:
 *                   type: string
 *                   example: abc123def456...
 *       404:
 *         description: Email không tồn tại trong hệ thống
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Đặt lại mật khẩu mới
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - new_password
 *             properties:
 *               token:
 *                 type: string
 *                 description: Reset token nhận được từ email
 *                 example: abc123def456...
 *               new_password:
 *                 type: string
 *                 description: Mật khẩu mới (tối thiểu 6 ký tự)
 *                 example: 654321
 *     responses:
 *       200:
 *         description: Đặt lại mật khẩu thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đặt lại mật khẩu thành công
 *       400:
 *         description: Token không hợp lệ hoặc đã hết hạn
 *       500:
 *         description: Lỗi server
 */


const express = require('express');
const { register, login } = require('../controllers/AuthController');
const { forgotPassword, resetPassword } = require('../controllers/ForgotPasswordController');

const router = express.Router();

// POST /api/auth/register - Đăng ký tài khoản
router.post('/register', register);

// POST /api/auth/login - Đăng nhập
router.post('/login', login);

// POST /api/auth/forgot-password - Quên mật khẩu (tạo reset token)
router.post('/forgot-password', forgotPassword);

// POST /api/auth/reset-password - Đặt lại mật khẩu
router.post('/reset-password', resetPassword);

module.exports = router;