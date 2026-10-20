const express = require('express');
const router = express.Router();
const annonceController = require('../controllers/annonceController');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');

// Demandes (Chargeurs)
router.post('/demandes', verifyToken, verifyRole(['CHARGEUR', 'ADMIN']), annonceController.createDemande);
router.get('/demandes/miennes', verifyToken, verifyRole(['CHARGEUR', 'ADMIN']), annonceController.getMesDemandes);
router.post('/demandes/miennes/:id/renouveler', verifyToken, verifyRole(['CHARGEUR']), annonceController.renewMyDemande);
router.delete('/demandes/miennes/:id', verifyToken, verifyRole(['CHARGEUR']), annonceController.cancelMyDemande);
router.get('/admin/demandes', verifyToken, verifyRole(['ADMIN']), annonceController.getDemandesForAdmin);
router.delete('/admin/demandes/:id', verifyToken, verifyRole(['ADMIN']), annonceController.removeDemandeByAdmin);
router.get('/demandes', verifyToken, annonceController.getDemandes);

// Disponibilites (Transporteurs)
router.post('/disponibilites', verifyToken, verifyRole(['CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR']), annonceController.createDisponibilite);
router.get('/positions/miennes', verifyToken, verifyRole(['CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR']), annonceController.getMesPositions);
router.get('/disponibilites', verifyToken, annonceController.getDisponibilites);

// Suggestions retour
router.get('/suggestions-retour', verifyToken, verifyRole(['CHAUFFEUR', 'ENTREPRISE']), annonceController.getSuggestionsRetour);

// Generate WhatsApp Link
router.get('/whatsapp-link/:type/:id', verifyToken, annonceController.generateWhatsAppLink);

module.exports = router;
