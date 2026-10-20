const CamionModel = require('../models/camionModel');
const db = require('../config/db');

const registerCamion = async (req, res) => {
  try {
    if (req.user.role === 'CHAUFFEUR') {
      const { rows } = await db.query('SELECT employeur_id FROM users WHERE id = $1;', [req.user.id]);
      if (!rows[0]) return res.status(404).json({ error: 'Utilisateur introuvable.' });
      if (rows[0].employeur_id) {
        return res.status(403).json({ error: 'Seul un chauffeur indépendant peut ajouter un camion à son espace.' });
      }
    }

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

const assignCamionDriver = async (req, res) => {
  const rawDriverId = req.body?.chauffeur_id;
  const driverId = rawDriverId === null || rawDriverId === '' ? null : Number(rawDriverId);
  if (driverId !== null && (!Number.isSafeInteger(driverId) || driverId <= 0)) {
    return res.status(400).json({ error: 'Sélectionnez un chauffeur valide ou retirez l’affectation.' });
  }

  try {
    const camion = await CamionModel.assignDriver(req.params.id, req.user.id, driverId);
    return res.json({
      message: driverId === null ? 'Chauffeur retiré du camion.' : 'Chauffeur affecté au camion.',
      camion,
    });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('Truck driver assignment failed:', error.message);
    return res.status(500).json({ error: 'Impossible de modifier le chauffeur affecté à ce camion.' });
  }
};

const updateCamionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;

    if (!['DISPONIBLE', 'EN_MISSION', 'INDISPONIBLE'].includes(statut)) {
      return res.status(400).json({ error: 'Statut invalide.' });
    }

    const updatedCamion = await CamionModel.updateStatus(id, statut, req.user.id);
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

const deleteCamion = async (req, res) => {
  try {
    const deletedCamion = await CamionModel.deleteByOwner(req.params.id, req.user.id);
    if (!deletedCamion) {
      return res.status(409).json({ error: 'Ce camion est introuvable ou lié à une course. Son historique est conservé.' });
    }
    res.json({ message: 'Camion supprimé.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la suppression du camion.' });
  }
};

module.exports = {
  registerCamion,
  getMyCamions,
  assignCamionDriver,
  updateCamionDetails,
  updateCamionStatus,
  deleteCamion
};
