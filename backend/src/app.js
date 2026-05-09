const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Khởi tạo kết nối cơ sở dữ liệu
const db = require('./config/db');

const app = express();

// --- CẤU HÌNH MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// --- KHAI BÁO CÁC TUYẾN ĐƯỜNG (ROUTES) ---
const documentRoutes = require('./routes/documentRoutes');       // Quản lý tài liệu/CV
const jobRoutes = require('./routes/jobRoutes');               // Quản lý tin tuyển dụng
const applicationRoutes = require('./routes/applicationRoutes'); // Quản lý hồ sơ ứng tuyển
const adminRoutes = require('./routes/adminRoutes');             // Quản lý thống kê Admin

// --- ĐĂNG KÝ CÁC CỔNG API ---
app.use('/api/documents', documentRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/admin', adminRoutes);

// --- KIỂM TRA TRẠNG THÁI SERVER ---
app.get('/', (req, res) => {
  res.status(200).send('Hệ thống API Smart Job Portal đang hoạt động ổn định.');
});

// --- KHỞI CHẠY SERVER ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[Server]: Đang chạy tại cổng ${PORT}`);
  console.log(`[Endpoint]: http://localhost:${PORT}`);
});