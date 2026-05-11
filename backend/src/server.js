
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const sequelize = require('./config/database');
const db = require('./models');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./config/swagger');
// Import routes
const authRoutes = require('./routes/authRoutes');
const testRoutes = require('./routes/testRoutes');
const jobRoutes = require('./routes/jobRoutes');
const profileRoutes = require('./routes/profileRoutes');
const app = express();
const PORT = process.env.PORT || 5000;
const uploadRoutes = require('./routes/uploadRoutes');

const adminRoutes = require('./routes/adminRoutes');



// Middleware
app.use(cors());
app.use(express.json());

// Kiểm tra kết nối database
sequelize.authenticate()
    .then(() => console.log('✅ Kết nối MySQL thành công!'))
    .catch(err => console.log('❌ Lỗi kết nối MySQL:', err));

// Sync database
db.sequelize.sync({ alter: false })
    .then(() => console.log('✅ Database sync completed'))
    .catch(err => console.log('❌ Sync error:', err));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));
// Routes
app.use('/api/auth', authRoutes);
app.use('/api/test', testRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/upload', uploadRoutes);

app.use('/admin', adminRoutes);
// Route mẫu
app.get('/', (req, res) => {
    res.json({ message: 'Smart Job Portal API đang chạy!' });
});

// Khởi động server
app.listen(PORT, () => {
    console.log(` Server đang chạy tại http://localhost:${PORT}`);
});
