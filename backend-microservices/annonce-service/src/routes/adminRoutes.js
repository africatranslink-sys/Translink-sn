const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');

router.get('/dashboard/stats', verifyToken, verifyRole(['ADMIN']), adminController.getDashboardStats);

module.exports = router;
