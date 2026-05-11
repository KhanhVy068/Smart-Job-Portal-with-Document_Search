const sequelize = require('../config/database');
const User = require('./User');
const JobCategory = require('./JobCategory');
const Job = require('./Job');
const Application = require('./Application');

// Định nghĩa associations (quan hệ giữa các bảng)
User.hasMany(Job, { foreignKey: 'employer_id', as: 'jobs' });
Job.belongsTo(User, { foreignKey: 'employer_id', as: 'employer' });

Job.belongsTo(JobCategory, { foreignKey: 'category_id', as: 'category' });
JobCategory.hasMany(Job, { foreignKey: 'category_id', as: 'jobs' });


User.hasMany(Application, { foreignKey: 'candidate_id', as: 'applications' });
Job.hasMany(Application, { foreignKey: 'job_id', as: 'applications' });
Application.belongsTo(User, { foreignKey: 'candidate_id', as: 'candidate' });
Application.belongsTo(Job, { foreignKey: 'job_id', as: 'job' });



const db = {
    sequelize,
    User,
    JobCategory,
    Job,
    Application
};

module.exports = db;