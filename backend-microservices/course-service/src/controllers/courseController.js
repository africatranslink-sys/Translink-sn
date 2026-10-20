const CourseModel = require('../models/courseModel');
const { emitPosition, emitPositionRemoved, emitCourseUpdated, emitNegotiationUpdated } = require('../sockets');
const { cachePosition, getActivePositions, removePosition } = require('../../../shared/redis');

const createCourse = async (req, res) => {
  try {
    const { demande_id, camion_id } = req.body;

    const ownerRoles = ['TRANSPORTEUR', 'ENTREPRISE', 'CHAUFFEUR'];
    if (!ownerRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Seul le propriétaire du camion peut accepter cette offre.' });
    }

    const newCourseRaw = await CourseModel.acceptOffer({
      demandeId: demande_id,
      camionId: camion_id,
      ownerId: req.user.id,
      ownerRole: req.user.role,
      driverId: req.body.chauffeur_id || (req.user.role === 'CHAUFFEUR' ? req.user.id : null)
    });
    for (const conversationId of newCourseRaw.closed_negotiation_ids || []) {
      emitNegotiationUpdated(conversationId, 'chat:conversation-updated', { conversationId, statut: 'ANNULEE' });
    }

    const newCourse = await CourseModel.findDetails(newCourseRaw.id);
    if (newCourse) {
      emitCourseUpdated({
        ...newCourse,
        expediteur_id: newCourse.chargeur_id,
        camion_proprietaire_id: newCourse.proprietaire_id,
        camion_chauffeur_id: newCourse.chauffeur_id,
      });
    }

    res.status(201).json({
      message: 'Course créée (camion trouvé)',
      course: newCourse || newCourseRaw
    });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la création de la course' });
  }
};

const getMyCourses = async (req, res) => {
  try {
    const courses = await CourseModel.findByActor(req.user.id, req.user.role);
    return res.json(courses);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erreur lors de la récupération de vos courses.' });
  }
};

const updateCourseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;

    const previousStatus = { CHARGEMENT: 'CAMION_TROUVE', LIVRAISON: 'CHARGEMENT', LIVREE: 'LIVRAISON', TERMINEE: 'LIVREE' }[statut];
    if (!previousStatus) {
      return res.status(400).json({ error: 'Statut de course invalide.' });
    }

    const currentCourse = await CourseModel.findDetails(id);
    if (!currentCourse) return res.status(404).json({ error: 'Course non trouvée.' });

    const userId = String(req.user.id);
    const isFleetOwner = ['ENTREPRISE', 'TRANSPORTEUR'].includes(req.user.role)
      && String(currentCourse.proprietaire_id) === userId;
    const assignedDriverId = currentCourse.chauffeur_assigne_id || currentCourse.chauffeur_id;
    const isAssignedDriver = req.user.role === 'CHAUFFEUR' && String(assignedDriverId) === userId;
    if (statut === 'TERMINEE') {
      if (!isFleetOwner) return res.status(403).json({ error: 'Seul le propriétaire du camion peut confirmer la livraison.' });
    } else if (!isAssignedDriver && !(statut === 'LIVREE' && req.user.role === 'CHAUFFEUR' && currentCourse.proprietaire_role === 'CHAUFFEUR' && String(currentCourse.proprietaire_id) === userId)) {
      return res.status(403).json({ error: 'Seul le chauffeur affecté peut mettre à jour sa mission.' });
    }

    if (currentCourse.statut !== previousStatus) {
      return res.status(409).json({ error: 'Cette étape ne correspond pas à l’état actuel de la course.' });
    }

    if (statut === 'CHARGEMENT' && currentCourse.paiement_statut_avance !== 'VALIDE') {
      return res.status(409).json({ error: 'Le chargement ne peut commencer qu’après validation de l’avance de 50 %.' });
    }

    if (statut === 'LIVREE' && currentCourse.proprietaire_role === 'CHAUFFEUR') {
      const privateCourse = await CourseModel.completePrivateDelivery(id, req.user.id);
      if (!privateCourse) return res.status(409).json({ error: 'La livraison a déjà été mise à jour.' });
      const privateDetails = await CourseModel.findDetails(id);
      if (privateDetails) emitCourseUpdated({ ...privateDetails, expediteur_id: privateDetails.chargeur_id, camion_proprietaire_id: privateDetails.proprietaire_id, camion_chauffeur_id: privateDetails.chauffeur_id });
      emitPositionRemoved(id);
      return res.json({ message: 'Livraison confirmée; le camion est disponible pour un trajet retour.', course: privateDetails || privateCourse });
    }

    if (statut === 'TERMINEE') {
      const completedCourse = await CourseModel.acknowledgeDelivery(id, req.user.id);
      const completedDetails = await CourseModel.findDetails(id);
      if (completedDetails) emitCourseUpdated({ ...completedDetails, expediteur_id: completedDetails.chargeur_id, camion_proprietaire_id: completedDetails.proprietaire_id, camion_chauffeur_id: completedDetails.chauffeur_id });
      emitPositionRemoved(id);
      return res.json({ message: 'Livraison confirmée; le camion est de nouveau disponible.', course: completedDetails || completedCourse });
    }

    const realDateFields = {};
    if (statut === 'CHARGEMENT') {
      realDateFields.date_chargement_reelle = new Date();
    } else if (statut === 'LIVRAISON') {
      realDateFields.date_livraison_reelle = new Date();
    }

    const updatedCourseRaw = await CourseModel.updateStatus(id, statut, realDateFields, previousStatus);
    if (!updatedCourseRaw) {
      return res.status(409).json({ error: 'La course a été modifiée. Actualisez son état avant de continuer.' });
    }

    const updatedCourse = await CourseModel.findDetails(id);
    if (updatedCourse) {
      emitCourseUpdated({
        ...updatedCourse,
        expediteur_id: updatedCourse.chargeur_id,
        camion_proprietaire_id: updatedCourse.proprietaire_id,
        camion_chauffeur_id: updatedCourse.chauffeur_id,
      });
    }

    res.json({
      message: `Statut de la course mis à jour : ${statut}`,
      course: updatedCourse || updatedCourseRaw
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de la course' });
  }
};

const publishPosition = async (req, res) => {
  try {
    const { lat, lng } = req.body || {};
    const latitude = Number(lat);
    const longitude = Number(lng);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'Coordonnées GPS invalides.' });
    }

    const course = await CourseModel.findTrackingCourse(req.params.id);
    if (!course || !course.camion_id) {
      return res.status(404).json({ error: 'Course active ou véhicule introuvable.' });
    }
    if (String(course.proprietaire_id) !== String(req.user.id) && String(course.chauffeur_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Ce véhicule ne vous est pas assigné.' });
    }

    const position = {
      id: course.camion_id,
      busId: course.camion_id,
      courseId: course.id,
      vehicleId: course.camion_id,
      immatriculation: course.plaque_immatriculation,
      name: course.plaque_immatriculation,
      status: course.statut,
      lat: latitude,
      lng: longitude,
      origin: course.ville_depart,
      destination: course.ville_arrivee,
      horodatage: new Date().toISOString(),
      coordinates: [longitude, latitude],
    };

    await cachePosition(position);
    emitPosition(position);
    return res.status(202).json({ message: 'Position GPS enregistrée.', position });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erreur lors de l’enregistrement de la position GPS.' });
  }
};

const getPositions = async (req, res) => {
  try {
    const courseIds = await CourseModel.findTrackableIds(req.user.id, req.user.role);
    const positions = await getActivePositions(courseIds);
    return res.json(positions.map((position) => ({
      ...position,
      coordinates: position.coordinates || [position.lng, position.lat],
    })));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erreur lors de la récupération des positions GPS.' });
  }
};

const declineAssignedCourse = async (req, res) => {
  try {
    const course = await CourseModel.declineAssignedCourse(req.params.id, req.user.id);
    return res.json({ message: 'Mission déclinée. L’offre est de nouveau disponible.', courseId: course.id });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Impossible de décliner cette mission.' });
  }
};

module.exports = {
  createCourse,
  getPositions,
  getMyCourses,
  publishPosition,
  updateCourseStatus,
  declineAssignedCourse,
};
