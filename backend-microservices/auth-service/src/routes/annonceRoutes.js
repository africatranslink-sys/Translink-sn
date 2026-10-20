const express = require('express');
const router = express.Router();
const annonceController = require('../controllers/annonceController');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');

// Demandes (Chargeurs)
router.post('/demandes', verifyToken, verifyRole(['CHARGEUR']), annonceController.createDemande);
router.get('/demandes', verifyToken, annonceController.getDemandes);

// Disponibilites (Transporteurs)
router.post('/disponibilites', verifyToken, verifyRole(['CHAUFFEUR', 'ENTREPRISE']), annonceController.createDisponibilite);
router.get('/disponibilites', verifyToken, annonceController.getDisponibilites);

// Suggestions retour
router.get('/suggestions-retour', verifyToken, verifyRole(['CHAUFFEUR', 'ENTREPRISE']), annonceController.getSuggestionsRetour);

// Generate WhatsApp Link
router.get('/whatsapp-link/:type/:id', verifyToken, annonceController.generateWhatsAppLink);

module.exports = router;
