const CourseModel = require('../models/courseModel');
const DemandeModel = require('../models/demandeModel');
const CamionModel = require('../models/camionModel');

const createCourse = async (req, res) => {
  try {
    const { demande_id, camion_id } = req.body;

    const newCourse = await CourseModel.create({
      demande_id,
      camion_id
    });

    // Mettre à jour les statuts
    await DemandeModel.updateStatus(demande_id, 'CAMION_TROUVE');
    await CamionModel.updateStatus(camion_id, 'EN_MISSION');

    res.status(201).json({
      message: 'Course créée (camion trouvé)',
      course: newCourse
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la création de la course' });
  }
};

const updateCourseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;

    const validStatuses = ['CHARGEMENT', 'LIVRAISON', 'SOLDE_REGLE'];
    if (!validStatuses.includes(statut)) {
      return res.status(400).json({ error: 'Statut de course invalide.' });
    }

    const realDateFields = {};
    if (statut === 'CHARGEMENT') {
      realDateFields.date_chargement_reelle = new Date();
    } else if (statut === 'LIVRAISON') {
      realDateFields.date_livraison_reelle = new Date();
    }

    const updatedCourse = await CourseModel.updateStatus(id, statut, realDateFields);
    if (!updatedCourse) {
      return res.status(404).json({ error: 'Course non trouvée.' });
    }

    // Libérer le camion si la course est terminée
    if (statut === 'SOLDE_REGLE') {
       await CamionModel.updateStatus(updatedCourse.camion_id, 'DISPONIBLE');
    }

    res.json({
      message: `Statut de la course mis à jour : ${statut}`,
      course: updatedCourse
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de la course' });
  }
};

module.exports = {
  createCourse,
  updateCourseStatus
};
