const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
require('dotenv').config();

// Cấu hình Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Cấu hình storage cho multer
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'smart-job-portal',  // Thư mục trên Cloudinary
        allowed_formats: ['jpg', 'png', 'pdf', 'jpeg'],
        resource_type: 'auto'
    }
});

const upload = multer({ storage: storage });

module.exports = { cloudinary, upload };