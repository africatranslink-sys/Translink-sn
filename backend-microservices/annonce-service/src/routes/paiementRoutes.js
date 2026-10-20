const express = require('express');
const router = express.Router();
const paiementController = require('../controllers/paiementController');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');

router.post('/', verifyToken, verifyRole(['CHARGEUR']), paiementController.initiatePaiement);
router.put('/:id/avance', verifyToken, verifyRole(['ADMIN', 'CHARGEUR']), paiementController.validerAvance);
router.put('/:id/solde', verifyToken, verifyRole(['ADMIN', 'CHARGEUR']), paiementController.validerSolde);

// Route Webhook pour Wave / Orange Money (Pas de verifyToken, sécurisé par verifyWebhookSignature)
router.post('/webhook', paiementController.webhook);

module.exports = router;
