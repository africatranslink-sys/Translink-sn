const express = require('express');
const router = express.Router();
const paiementController = require('../controllers/paiementController');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');

router.post('/', verifyToken, verifyRole(['CHARGEUR']), paiementController.initiatePaiement);
router.get('/mien', verifyToken, paiementController.getMyTransactions);
router.get('/admin/fonds', verifyToken, verifyRole(['ADMIN']), paiementController.getAdminFunds);
router.get('/admin/paypal-fee-recommendations', verifyToken, verifyRole(['ADMIN']), paiementController.getPayPalFeeRecommendations);
router.get('/admin/transactions', verifyToken, verifyRole(['ADMIN']), paiementController.getAdminTransactionHistory);
router.post('/:id/paypal/:tranche/order', verifyToken, verifyRole(['CHARGEUR']), paiementController.createPayPalOrder);
router.post('/:id/paypal/:tranche/capture', verifyToken, verifyRole(['CHARGEUR']), paiementController.capturePayPalOrder);
router.post('/:id/kkiapay/:tranche/checkout', verifyToken, verifyRole(['CHARGEUR']), paiementController.createKkiapayCourseCheckout);
router.post('/:id/kkiapay/:tranche/confirm', verifyToken, verifyRole(['CHARGEUR']), paiementController.confirmKkiapayCoursePayment);
router.post('/abonnements', verifyToken, verifyRole(['CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR', 'CHARGEUR']), paiementController.createSubscription);
router.get('/abonnements/config', verifyToken, verifyRole(['CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR', 'CHARGEUR']), paiementController.getSubscriptionPaymentOptions);
router.get('/abonnements/mien', verifyToken, verifyRole(['CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR', 'CHARGEUR']), paiementController.getMySubscription);
router.put('/abonnements/:id/reference', verifyToken, verifyRole(['CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR', 'CHARGEUR']), paiementController.submitSubscriptionReference);
router.post('/abonnements/:id/kkiapay/checkout', verifyToken, verifyRole(['CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR', 'CHARGEUR']), paiementController.createKkiapaySubscriptionCheckout);
router.post('/abonnements/:id/kkiapay/confirm', verifyToken, verifyRole(['CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR', 'CHARGEUR']), paiementController.confirmKkiapaySubscriptionPayment);
router.put('/abonnements/:id/valider', verifyToken, verifyRole(['ADMIN']), paiementController.validateSubscription);
router.get('/admin/file', verifyToken, verifyRole(['ADMIN']), paiementController.getAdminQueue);
router.put('/admin/:id/reversement/:tranche', verifyToken, verifyRole(['ADMIN']), paiementController.recordOwnerPayout);
router.put('/:id/avance', verifyToken, verifyRole(['ADMIN', 'CHARGEUR']), paiementController.validerAvance);
router.put('/:id/solde', verifyToken, verifyRole(['ADMIN', 'CHARGEUR']), paiementController.validerSolde);

// Route Webhook pour Wave / Orange Money (Pas de verifyToken, sécurisé par verifyWebhookSignature)
router.post('/webhook/kkiapay', paiementController.handleKkiapayWebhook);
router.post('/webhook', paiementController.webhook);

module.exports = router;
