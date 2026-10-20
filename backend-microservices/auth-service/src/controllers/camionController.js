const CamionModel = require('../models/camionModel');

const registerCamion = async (req, res) => {
  try {
    const { type_vehicule, capacite_tonnes, plaque_immatriculation } = req.body;

    const newCamion = await CamionModel.create({
      proprietaire_id: req.user.id,
      type_vehicule,
      capacite_tonnes,
      plaque_immatriculation
    });

    res.status(201).json({
      message: 'Camion enregistré avec succès',
      camion: newCamion
    });
  } catch (error) {
    if (error.code === '23505') { // Unique constraint violation (postgres)
      return res.status(400).json({ error: 'Cette plaque d\'immatriculation existe déjà.' });
    }
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement du camion' });
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
  updateCamionStatus
};
