const express = require('express');
const negotiationController = require('../controllers/negotiationController');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');

const router = express.Router();
const participants = ['CHARGEUR', 'CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR'];

router.get('/', verifyToken, verifyRole(participants), negotiationController.listConversations);
router.post('/', verifyToken, verifyRole(['CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR']), negotiationController.createConversation);
router.get('/:id/messages', verifyToken, verifyRole(participants), negotiationController.getHistory);
router.post('/:id/proposals/:proposalId/accept', verifyToken, verifyRole(participants), negotiationController.acceptProposal);
router.post('/:id/proposals/:proposalId/reject', verifyToken, verifyRole(participants), negotiationController.rejectProposal);

module.exports = router;
