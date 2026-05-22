const express = require('express');
const notificationController = require('../services/notificationService');
const { isAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', isAuth, notificationController.getNotifications);
router.patch('/:id/read', isAuth, notificationController.markAsRead);

module.exports = router;
