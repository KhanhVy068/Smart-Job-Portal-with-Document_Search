const db = require('../models');
const Job = db.Job;
const JobCategory = db.JobCategory;
const User = db.User;
const { Op } = require('sequelize');

// GET /api/jobs - Lấy danh sách jobs (phân trang, lọc theo category, location)
const getJobs = async (req, res) => {
    try {
        const { page = 1, limit = 10, category_id, location, job_type, search } = req.query;
        
        const offset = (page - 1) * limit;
        
        // Xây dựng điều kiện where
        let where = { status: 'open' };
        
        if (category_id) {
            where.category_id = category_id;
        }
        
        if (location) {
            where.location = { [Op.like]: `%${location}%` };
        }
        
        if (job_type) {
            where.job_type = job_type;
        }
        
        if (search) {
            where[Op.or] = [
                { title: { [Op.like]: `%${search}%` } },
                { description: { [Op.like]: `%${search}%` } }
            ];
        }
        
        // Lấy danh sách jobs
        const { count, rows } = await Job.findAndCountAll({
            where,
            include: [
                { model: User, as: 'employer', attributes: ['id', 'full_name', 'email'] },
                { model: JobCategory, as: 'category', attributes: ['id', 'name', 'slug'] }
            ],
            attributes: { exclude: ['deleted_at'] },
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['posted_at', 'DESC']]
        });
        
        res.json({
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(count / limit),
            data: rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};

// GET /api/jobs/:id - Lấy chi tiết job
const getJobById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const job = await Job.findOne({
            where: { id, status: 'open' },
            include: [
                { model: User, as: 'employer', attributes: ['id', 'full_name', 'email', 'phone', 'avatar_url'] },
                { model: JobCategory, as: 'category', attributes: ['id', 'name', 'slug'] }
            ],
            attributes: { exclude: ['deleted_at'] }
        });
        
        if (!job) {
            return res.status(404).json({ message: 'Không tìm thấy việc làm' });
        }
        
        res.json(job);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};

module.exports = { getJobs, getJobById };