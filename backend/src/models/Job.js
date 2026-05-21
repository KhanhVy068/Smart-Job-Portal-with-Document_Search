const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Job = sequelize.define('Job', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    employer_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    category_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    title: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    location: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    salary_min: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true
    },
    salary_max: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true
    },
    currency: {
        type: DataTypes.ENUM('VND', 'USD'),
        defaultValue: 'VND'
    },
    job_type: {
        type: DataTypes.ENUM('Full-time', 'Part-time', 'Freelance', 'Remote'),
        defaultValue: 'Full-time'
    },
    status: {
        type: DataTypes.ENUM('open', 'closed'),
        defaultValue: 'open'
    },
    expiry_date: {
        type: DataTypes.DATE,
        allowNull: false
    },
    experience_required: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    positions_available: {
        type: DataTypes.INTEGER,
        defaultValue: 1
    },
    benefits: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    requirements: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    skills: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'jobs',
    timestamps: true,
    createdAt: 'posted_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    paranoid: true
});

module.exports = Job;
