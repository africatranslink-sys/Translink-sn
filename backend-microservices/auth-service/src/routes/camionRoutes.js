const express = require('express');
const router = express.Router();
const camionController = require('../controllers/camionController');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');

router.post('/', verifyToken, verifyRole(['CHAUFFEUR', 'ENTREPRISE']), camionController.registerCamion);
router.get('/me', verifyToken, verifyRole(['CHAUFFEUR', 'ENTREPRISE']), camionController.getMyCamions);
router.put('/:id/status', verifyToken, verifyRole(['CHAUFFEUR', 'ENTREPRISE']), camionController.updateCamionStatus);

module.exports = router;
