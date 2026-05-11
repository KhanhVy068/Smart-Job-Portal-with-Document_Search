const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'smart-job-portal',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx'],
    resource_type: 'auto'
  }
});

const pdfStorage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => ({
    folder: 'smart-job-portal/cv',
    allowed_formats: ['pdf'],
    resource_type: 'raw',
    format: 'pdf',
    public_id: `${Date.now()}-${file.originalname
      .replace(/\.pdf$/i, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'cv'}`
  })
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }
});

const pdfUpload = multer({
  storage: pdfStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      const err = new Error('Chỉ chấp nhận file PDF.');
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  }
});

module.exports = { cloudinary, upload, pdfUpload };
