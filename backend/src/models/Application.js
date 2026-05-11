const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Application = sequelize.define('Application', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    job_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    candidate_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    cv_document_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    cover_letter: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    expected_salary: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('pending', 'reviewed', 'shortlisted', 'interviewed', 'offered', 'hired', 'rejected'),
        defaultValue: 'pending'
    },
    rejection_reason: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    reviewed_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'applications',
    timestamps: true,
    createdAt: 'applied_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    paranoid: true
});

module.exports = Application;