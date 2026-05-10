const { upload } = require('../config/cloudinary');

const uploadFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Không có file nào được gửi lên' });
        }
        
        res.json({
            message: 'Upload thành công',
            file_url: req.file.path,
            file_name: req.file.filename,
            format: req.file.format,
            size: req.file.size
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi upload file', error: error.message });
    }
};

module.exports = { uploadFile };