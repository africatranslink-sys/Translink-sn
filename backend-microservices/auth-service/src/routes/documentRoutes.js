const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const upload = require('../config/upload');

// User routes
router.post('/upload', verifyToken, upload.single('document'), documentController.uploadDocument);
router.post('/submitted', verifyToken, documentController.notifyDocumentsSubmitted);
router.get('/', verifyToken, documentController.getUserDocuments);

// Admin routes
router.put('/:id/validate', verifyToken, verifyRole(['ADMIN']), documentController.validateDocument);
router.delete('/:id', verifyToken, documentController.deleteDocument);

module.exports = router;
