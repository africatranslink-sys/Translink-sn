const express = require('express');
const router = express.Router();
const camionController = require('../controllers/camionController');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');

router.post('/', verifyToken, verifyRole(['CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR']), camionController.registerCamion);
router.get('/me', verifyToken, verifyRole(['CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR']), camionController.getMyCamions);
router.put('/:id/chauffeur', verifyToken, verifyRole(['ENTREPRISE', 'TRANSPORTEUR']), camionController.assignCamionDriver);
router.put('/:id', verifyToken, verifyRole(['CHAUFFEUR']), camionController.updateCamionDetails);
router.put('/:id/status', verifyToken, verifyRole(['CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR']), camionController.updateCamionStatus);
router.delete('/:id', verifyToken, verifyRole(['CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR']), camionController.deleteCamion);

module.exports = router;
