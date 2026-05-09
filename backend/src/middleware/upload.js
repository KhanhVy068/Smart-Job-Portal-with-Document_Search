const multer = require('multer');
const path = require('path');
const storage = multer.diskStorage({});

// Bộ lọc: Chỉ cho phép upload file PDF, DOC hoặc DOCX
const fileFilter = (req, file, cb) => {
  const filetypes = /pdf|doc|docx/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Lỗi: Chỉ chấp nhận định dạng file PDF, DOC hoặc DOCX!'));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } 
});

module.exports = upload;