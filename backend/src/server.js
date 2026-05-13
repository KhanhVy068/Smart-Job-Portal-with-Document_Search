const express = require('express');
const cors = require('cors');
require('dotenv').config();

const db = require('./config/db');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./config/swagger');

const adminRoutes = require('./routes/adminRoutes');
const applicationRoutes = require('./routes/applicationRoutes');
const authRoutes = require('./routes/authRoutes');
const candidateRoutes = require('./routes/candidateRoutes');
const candidatesRoutes = require('./routes/candidatesRoutes');
const documentRoutes = require('./routes/documentRoutes');
const employerRoutes = require('./routes/employerRoutes');
const jobRoutes = require('./routes/jobRoutes');
const profileRoutes = require('./routes/profileRoutes');
const searchRoutes = require('./routes/searchRoutes');
const testRoutes = require('./routes/testRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const userRoutes = require('./routes/userRoutes');
const documentWorker = require('./services/documentWorker');
const searchService = require('./services/searchService');
const documentQueue = require('./services/documentQueue');
const performanceLogService = require('./services/performanceLogService');


const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

db.query('SELECT 1')
  .then(() => console.log('Database connected. Use database/db.sql as the source schema.'))
  .catch(err => console.error('Database connection error:', err.message));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

app.use('/api/auth', authRoutes);
app.use('/api/test', testRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/user', userRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/employer', employerRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/candidate', candidateRoutes);
app.use('/api/candidates', candidatesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/admin', adminRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Smart Job Portal API đang chạy!' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({ message: err.message || 'Lỗi server' });
});
 
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
  performanceLogService.ensurePerformanceLogsTable()
    .then(() => console.log('Performance log table ready.'))
    .catch(err => console.warn('Performance log table warning:', err.message));

  documentWorker.start();
  documentQueue.enqueuePendingDocuments(db)
    .then(count => console.log(`Pending documents enqueued: ${count}`))
    .catch(err => console.warn('Enqueue pending documents warning:', err.message));

  searchService.reindexAll()
    .then(result => console.log(`Search index ready (${result.engine}, indexed: ${result.indexed}).`))
    .catch(err => console.warn('Search index startup warning:', err.message));
});
