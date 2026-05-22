const express = require('express');
const cors = require('cors');
const path = require('path');
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
const savedJobRoutes = require('./routes/savedJobRoutes');
const savedCandidateRoutes = require('./routes/savedCandidateRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const testRoutes = require('./routes/testRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const userRoutes = require('./routes/userRoutes');
const documentWorker = require('./services/documentWorker');
const searchService = require('./services/searchService');
const documentQueue = require('./services/documentQueue');
const performanceLogService = require('./services/performanceLogService');
const candidateController = require('./controllers/candidateController');
const savedJobController = require('./controllers/savedJobController');
const savedCandidateController = require('./controllers/savedCandidateController');
const notificationService = require('./services/notificationService');


const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '..', '..', 'uploads')));

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
app.use('/api/saved-jobs', savedJobRoutes);
app.use('/api/saved-candidates', savedCandidateRoutes);
app.use('/api/candidates/saved', savedCandidateRoutes);
app.use('/api/notifications', notificationRoutes);
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

  candidateController.ensureSavedCandidatesTable()
    .then(() => console.log('Saved candidates table ready.'))
    .catch(err => console.warn('Saved candidates table warning:', err.message));

  savedJobController.ensureSavedJobsTable()
    .then(() => console.log('Saved jobs table ready.'))
    .catch(err => console.warn('Saved jobs table warning:', err.message));

  savedCandidateController.ensureSavedCandidatesTable()
    .then(() => console.log('Saved candidate route table ready.'))
    .catch(err => console.warn('Saved candidate route table warning:', err.message));

  notificationService.ensureNotificationsTable()
    .then(() => console.log('Notifications table ready.'))
    .catch(err => console.warn('Notifications table warning:', err.message));

  documentWorker.start();
  documentQueue.documentQueue.resume()
    .then(() => console.log('Document extraction queue resumed.'))
    .catch(err => console.warn('Resume document queue warning:', err.message));
  documentQueue.enqueuePendingDocuments(db)
    .then(count => console.log(`Pending documents enqueued: ${count}`))
    .catch(err => console.warn('Enqueue pending documents warning:', err.message));

  searchService.reindexAll()
    .then(result => console.log(`Search index ready (${result.engine}, indexed: ${result.indexed}).`))
    .catch(err => console.warn('Search index startup warning:', err.message));
});
