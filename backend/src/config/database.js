const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'job_portal',
  process.env.DB_USER || 'job_user',
  process.env.DB_PASSWORD || process.env.DB_PASS || 'job_pass',
  {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    dialect: 'mysql',
    logging: false
  }
);

module.exports = sequelize;
