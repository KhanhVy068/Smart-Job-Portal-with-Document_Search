const db = require('../models');
const User = db.User;
const { Op } = require('sequelize');

// GET /admin/users - Xem danh sách tất cả users (chỉ admin)
const getAllUsers = async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: { exclude: ['password_hash', 'reset_token', 'reset_token_expiry'] }
        });
        res.json({
            total: users.length,
            users: users
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};

// PUT /admin/users/:id/block - Khóa user
const blockUser = async (req, res) => {
    try {
        const { id } = req.params;
        
        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ message: 'Không tìm thấy user' });
        }
        
        await user.update({ is_blocked: true });
        res.json({ message: 'Đã khóa user thành công', user });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};

// PUT /admin/users/:id/unblock - Mở khóa user
const unblockUser = async (req, res) => {
    try {
        const { id } = req.params;
        
        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ message: 'Không tìm thấy user' });
        }
        
        await user.update({ is_blocked: false });
        res.json({ message: 'Đã mở khóa user thành công', user });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};

// GET /admin/jobs - Xem danh sách tất cả jobs (chỉ admin)
const getAllJobs = async (req, res) => {
    try {
        const jobs = await db.Job.findAll({
            include: [
                { model: db.User, as: 'employer', attributes: ['id', 'full_name', 'email'] },
                { model: db.JobCategory, as: 'category', attributes: ['id', 'name'] }
            ],
            order: [['posted_at', 'DESC']]
        });
        res.json({
            total: jobs.length,
            jobs: jobs
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};

// DELETE /admin/jobs/:id - Xóa job bất kỳ (chỉ admin)
const deleteJob = async (req, res) => {
    try {
        const { id } = req.params;
        
        const job = await db.Job.findByPk(id);
        if (!job) {
            return res.status(404).json({ message: 'Không tìm thấy việc làm' });
        }
        
        await job.destroy();
        res.json({ message: 'Đã xóa việc làm thành công' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};
// GET /admin/categories - Xem danh sách categories
const getAllCategories = async (req, res) => {
    try {
        const categories = await db.JobCategory.findAll({
            order: [['name', 'ASC']]
        });
        res.json({
            total: categories.length,
            categories: categories
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};

// POST /admin/categories - Tạo category mới
const createCategory = async (req, res) => {
    try {
        const { name, slug, parent_id } = req.body;
        
        if (!name || !slug) {
            return res.status(400).json({ message: 'Vui lòng nhập name và slug' });
        }
        
        const category = await db.JobCategory.create({
            name,
            slug,
            parent_id: parent_id || null
        });
        
        res.status(201).json({
            message: 'Tạo danh mục thành công',
            category
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};

// PUT /admin/categories/:id - Cập nhật category
const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, slug, parent_id } = req.body;
        
        const category = await db.JobCategory.findByPk(id);
        if (!category) {
            return res.status(404).json({ message: 'Không tìm thấy danh mục' });
        }
        
        await category.update({
            name: name || category.name,
            slug: slug || category.slug,
            parent_id: parent_id !== undefined ? parent_id : category.parent_id
        });
        
        res.json({
            message: 'Cập nhật danh mục thành công',
            category
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};

// DELETE /admin/categories/:id - Xóa category
const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        
        const category = await db.JobCategory.findByPk(id);
        if (!category) {
            return res.status(404).json({ message: 'Không tìm thấy danh mục' });
        }
        
        await category.destroy();
        res.json({ message: 'Xóa danh mục thành công' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};
// GET /admin/stats - Thống kê số lượng users, jobs, applications
const getStats = async (req, res) => {
    try {
        const totalUsers = await db.User.count();
        const totalJobs = await db.Job.count();
       const totalApplications = await db.Application.count(); 
        
        res.json({
            totalUsers: totalUsers,
            totalJobs: totalJobs,
            totalApplications: totalApplications
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};

module.exports = { 
    getAllUsers, 
    blockUser, 
    unblockUser, 
    getAllJobs, 
    deleteJob,
    getAllCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    getStats  
};