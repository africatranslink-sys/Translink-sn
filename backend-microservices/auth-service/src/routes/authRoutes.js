const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const integrationConfigController = require('../controllers/integrationConfigController');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const validateRequest = require('../middlewares/validateRequest');
const { loginSchema } = require('../validators/authValidator');
const upload = require('../config/upload');
const registrationDocumentTypes = [
  'CARTE_IDENTITE_RECTO',
  'CARTE_IDENTITE_VERSO',
  'NINEA',
  'REGISTRE_COMMERCE',
  'LICENCE_TRANSPORT',
  'PERMIS'
];
const uploadRegistrationDocuments = upload.fields(registrationDocumentTypes.map((name) => ({ name, maxCount: 1 })));

router.get('/public-config/mapbox', integrationConfigController.getPublicMapboxConfig);
router.post('/register', uploadRegistrationDocuments, authController.register);
router.post('/login', validateRequest(loginSchema), authController.login);
router.get('/invitation/:token', authController.getInvitation);
router.post('/invitation/:token/complete', uploadRegistrationDocuments, authController.completeInvitation);
router.post('/newsletter/unsubscribe', authController.unsubscribeNewsletter);
router.get('/profile', verifyToken, authController.getProfile);
router.get('/login-history', verifyToken, authController.getLoginHistory);
router.get('/profile/payment-accounts', verifyToken, authController.getPaymentAccounts);
router.put('/profile', verifyToken, authController.updateProfile);
router.put('/profile/newsletter-consent', verifyToken, authController.updateNewsletterConsent);
router.put('/profile/payment-accounts/:method', verifyToken, authController.savePaymentAccount);
router.post('/profile/avatar', verifyToken, upload.single('avatar'), authController.uploadAvatar);
router.put('/profile/password', verifyToken, authController.changePassword);
router.post('/invite-chauffeur', verifyToken, authController.inviteChauffeur);
router.get('/chauffeurs/me', verifyToken, authController.getMyChauffeurs);
router.put('/chauffeurs/:id/status', verifyToken, authController.updateChauffeurStatus);
router.delete('/chauffeurs/:id', verifyToken, authController.deleteChauffeur);
router.get('/admin/integrations', verifyToken, verifyRole(['ADMIN']), integrationConfigController.getIntegrations);
router.get('/admin/integrations/password-status', verifyToken, verifyRole(['ADMIN']), integrationConfigController.getAdminConfigPasswordStatus);
router.post('/admin/integrations/verify-password', verifyToken, verifyRole(['ADMIN']), integrationConfigController.verifyAdminPassword);
router.post('/admin/integrations/smtp/secrets/reveal', verifyToken, verifyRole(['ADMIN']), integrationConfigController.revealSmtpCredentials);
router.post('/admin/integrations/admin-password/setup', verifyToken, verifyRole(['ADMIN']), integrationConfigController.setupAdminConfigPassword);
router.put('/admin/integrations/admin-password', verifyToken, verifyRole(['ADMIN']), integrationConfigController.changeAdminConfigPassword);
router.put('/admin/integrations/:serviceKey/maintenance', verifyToken, verifyRole(['ADMIN']), integrationConfigController.updateIntegrationMaintenance);
router.put('/admin/integrations/:serviceKey', verifyToken, verifyRole(['ADMIN']), integrationConfigController.updateIntegration);

module.exports = router;
