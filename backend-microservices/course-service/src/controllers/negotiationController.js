const CourseModel = require('../models/courseModel');
const NegotiationModel = require('../models/negotiationModel');
const { emitCourseUpdated, emitNegotiationUpdated, emitUserEvent } = require('../sockets');

const createConversation = async (req, res) => {
  const demandeId = Number(req.body.demande_id);
  const camionId = Number(req.body.camion_id);
  const chauffeurId = req.body.chauffeur_id == null ? null : Number(req.body.chauffeur_id);
  if (!Number.isSafeInteger(demandeId) || demandeId <= 0 || !Number.isSafeInteger(camionId) || camionId <= 0
    || (chauffeurId != null && (!Number.isSafeInteger(chauffeurId) || chauffeurId <= 0))) {
    return res.status(400).json({ error: 'Identifiants de demande, camion ou chauffeur invalides.' });
  }
  if (!['CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Seul le propriétaire du camion peut démarrer une négociation.' });
  }
  try {
    const conversation = await NegotiationModel.createConversation({
      demandeId,
      camionId,
      ownerId: req.user.id,
      ownerRole: req.user.role,
      driverId: chauffeurId,
    });
    emitUserEvent(conversation.chargeur_id, 'chat:new-conversation', conversation);
    return res.status(200).json({ conversation });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Impossible de démarrer la négociation.' });
  }
};

const listConversations = async (req, res) => {
  const demandeId = req.query.demande_id == null ? null : Number(req.query.demande_id);
  if (demandeId != null && (!Number.isSafeInteger(demandeId) || demandeId <= 0)) {
    return res.status(400).json({ error: 'Identifiant de demande invalide.' });
  }
  try {
    const conversations = await NegotiationModel.listConversations(req.user.id, demandeId);
    return res.json(conversations);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de charger les négociations.' });
  }
};

const getHistory = async (req, res) => {
  const conversationId = Number(req.params.id);
  if (!Number.isSafeInteger(conversationId) || conversationId <= 0) {
    return res.status(400).json({ error: 'Identifiant de conversation invalide.' });
  }
  try {
    const history = await NegotiationModel.getHistory(conversationId, req.user.id);
    return res.json(history);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Impossible de charger les messages.' });
  }
};

const acceptProposal = async (req, res) => {
  const conversationId = Number(req.params.id);
  const proposalId = Number(req.params.proposalId);
  if (![conversationId, proposalId].every((id) => Number.isSafeInteger(id) && id > 0)) {
    return res.status(400).json({ error: 'Identifiant de négociation invalide.' });
  }
  try {
    const accepted = await CourseModel.acceptNegotiatedPrice({ conversationId, proposalId, actorId: req.user.id });
    const course = await CourseModel.findDetails(accepted.course.id);
    if (course) {
      emitCourseUpdated({
        ...course,
        expediteur_id: course.chargeur_id,
        camion_proprietaire_id: course.proprietaire_id,
        camion_chauffeur_id: course.chauffeur_id,
      });
    }
    emitNegotiationUpdated(conversationId, 'chat:proposal-updated', {
      conversationId,
      proposalId,
      statut: 'ACCEPTEE',
      courseId: accepted.course.id,
      agreedPrice: accepted.agreedPrice,
    });
    emitNegotiationUpdated(conversationId, 'chat:conversation-updated', {
      conversationId,
      statut: 'ACCEPTEE',
      courseId: accepted.course.id,
    });
    for (const closedConversationId of accepted.closedConversationIds || []) {
      emitNegotiationUpdated(closedConversationId, 'chat:conversation-updated', {
        conversationId: closedConversationId,
        statut: 'ANNULEE',
      });
    }
    return res.json({ message: 'Prix accepté et camion affecté.', course: course || accepted.course });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Impossible d’accepter cette proposition.' });
  }
};

const rejectProposal = async (req, res) => {
  const conversationId = Number(req.params.id);
  const proposalId = Number(req.params.proposalId);
  if (![conversationId, proposalId].every((id) => Number.isSafeInteger(id) && id > 0)) {
    return res.status(400).json({ error: 'Identifiant de négociation invalide.' });
  }
  try {
    const proposal = await NegotiationModel.rejectPriceProposal(conversationId, proposalId, req.user.id);
    emitNegotiationUpdated(conversationId, 'chat:proposal-updated', proposal);
    return res.json({ proposal });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Impossible de refuser cette proposition.' });
  }
};

const cancelAcceptedCourse = async (req, res) => {
  const courseId = Number(req.params.id);
  if (!Number.isSafeInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ error: 'Identifiant de course invalide.' });
  }
  try {
    const cancelled = await CourseModel.cancelAcceptedByChargeur(courseId, req.user.id);
    const course = await CourseModel.findDetails(courseId);
    const updatedCourse = course || { ...cancelled, statut: 'ANNULEE' };
    emitCourseUpdated({
      ...updatedCourse,
      expediteur_id: updatedCourse.chargeur_id,
      camion_proprietaire_id: updatedCourse.proprietaire_id || cancelled.proprietaire_id,
      camion_chauffeur_id: updatedCourse.chauffeur_id || cancelled.chauffeur_id,
    });
    for (const conversationId of cancelled.negotiation_conversation_ids || []) {
      emitNegotiationUpdated(conversationId, 'chat:conversation-updated', { conversationId, statut: 'ANNULEE' });
    }
    return res.json({ message: 'Course annulée.', course: updatedCourse });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Impossible d’annuler cette course.' });
  }
};

module.exports = {
  createConversation,
  listConversations,
  getHistory,
  acceptProposal,
  rejectProposal,
  cancelAcceptedCourse,
};
