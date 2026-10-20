const CamionModel = require('../models/camionModel');

const registerCamion = async (req, res) => {
  try {
    const { type_vehicule, capacite_tonnes, plaque_immatriculation } = req.body;

    const newCamion = await CamionModel.create({
      proprietaire_id: req.user.id,
      type_vehicule,
      capacite_tonnes,
      plaque_immatriculation
    }, req.user.role === 'CHAUFFEUR');

    res.status(201).json({
      message: 'Camion enregistré avec succès',
      camion: newCamion
    });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    if (error.code === '23505') { // Unique constraint violation (postgres)
      return res.status(400).json({ error: 'Cette plaque d\'immatriculation existe déjà.' });
    }
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement du camion' });
  }
};

const updateCamionDetails = async (req, res) => {
  try {
    const { type_vehicule, capacite_tonnes, plaque_immatriculation } = req.body;
    const capacity = Number(capacite_tonnes);
    if (!type_vehicule?.trim() || !Number.isFinite(capacity) || capacity <= 0 || !plaque_immatriculation?.trim()) {
      return res.status(400).json({ error: 'Renseignez le type, une capacité valide et la plaque du camion.' });
    }

    const camion = await CamionModel.updateDetails(req.params.id, req.user.id, {
      type_vehicule: type_vehicule.trim(),
      capacite_tonnes: capacity,
      plaque_immatriculation: plaque_immatriculation.trim().toUpperCase(),
    });
    if (!camion) return res.status(404).json({ error: 'Camion introuvable, non détenu par votre compte ou actuellement en mission.' });
    return res.json({ message: 'Informations du camion mises à jour.', camion });
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Cette plaque d’immatriculation existe déjà.' });
    console.error(error);
    return res.status(500).json({ error: 'Impossible de mettre à jour ce camion.' });
  }
};

const getMyCamions = async (req, res) => {
  try {
    const camions = await CamionModel.findByProprietaireId(req.user.id);
    res.json(camions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération des camions' });
  }
};

const updateCamionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;

    if (!['DISPONIBLE', 'EN_MISSION', 'INDISPONIBLE'].includes(statut)) {
      return res.status(400).json({ error: 'Statut invalide.' });
    }

    const updatedCamion = await CamionModel.updateStatus(id, statut);
    if (!updatedCamion) {
      return res.status(404).json({ error: 'Camion non trouvé.' });
    }

    res.json({
      message: 'Statut mis à jour',
      camion: updatedCamion
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du statut' });
  }
};

module.exports = {
  registerCamion,
  getMyCamions,
  updateCamionDetails,
  updateCamionStatus
};
