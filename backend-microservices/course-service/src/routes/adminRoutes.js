const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const systemController = require('../controllers/systemController');
const newsletterRoutes = require('./newsletterRoutes');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');

router.use('/newsletter', newsletterRoutes);
router.get('/system/overview', verifyToken, verifyRole(['ADMIN']), systemController.getSystemOverview);
router.get('/system/logs', verifyToken, verifyRole(['ADMIN']), systemController.getSystemLogs);
router.get('/dashboard/stats', verifyToken, verifyRole(['ADMIN']), adminController.getDashboardStats);
router.get('/users', verifyToken, verifyRole(['ADMIN']), adminController.getUsers);
router.get('/documents', verifyToken, verifyRole(['ADMIN']), adminController.getDocuments);
router.put('/users/:id/status', verifyToken, verifyRole(['ADMIN']), adminController.updateUserStatus);
router.post('/users', verifyToken, verifyRole(['ADMIN']), adminController.createUser);
router.delete('/users/:id', verifyToken, verifyRole(['ADMIN']), adminController.deleteUser);

module.exports = router;
