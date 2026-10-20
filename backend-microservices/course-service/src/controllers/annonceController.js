const DemandeModel = require('../models/demandeModel');
const DisponibiliteModel = require('../models/disponibiliteModel');

// --- Demandes de transport (Chargeurs) ---

const createDemande = async (req, res) => {
  try {
    const { ville_depart, ville_arrivee, nature_marchandise, tonnage, type_camion_requis, date_chargement, prix_propose } = req.body;

    const newDemande = await DemandeModel.create({
      chargeur_id: req.user.id,
      ville_depart,
      ville_arrivee,
      nature_marchandise,
      tonnage,
      type_camion_requis,
      date_chargement,
      prix_propose
    });

    res.status(201).json({
      message: 'Demande de transport publiée avec succès',
      demande: newDemande
    });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Erreur lors de la publication de la demande' });
  }
};

const getDemandes = async (req, res) => {
  try {
    const demandes = await DemandeModel.findActive();
    res.json(demandes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération des demandes' });
  }
};

// --- Disponibilités de camions (Transporteurs) ---

const createDisponibilite = async (req, res) => {
  try {
    const { camion_id, position_actuelle, destinations_possibles, disponibilite_date } = req.body;

    const newDispo = await DisponibiliteModel.create({
      camion_id,
      position_actuelle,
      destinations_possibles,
      disponibilite_date
    });

    res.status(201).json({
      message: 'Disponibilité du camion publiée avec succès',
      disponibilite: newDispo
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la publication de la disponibilité' });
  }
};

const getDisponibilites = async (req, res) => {
  try {
    const dispos = await DisponibiliteModel.findActive();
    res.json(dispos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération des disponibilités' });
  }
};

// --- Matching Simple (Section 5.5 Suggestion de trajet retour) ---

const getSuggestionsRetour = async (req, res) => {
  try {
    const { ville_actuelle } = req.query; // Ville où le camion vient d'arriver

    if (!ville_actuelle) {
      return res.status(400).json({ error: 'La ville actuelle est requise pour les suggestions.' });
    }

    // Récupérer les demandes qui partent de la ville actuelle
    const demandes = await DemandeModel.findActive();
    const suggestions = demandes.filter(d => d.ville_depart.toLowerCase() === ville_actuelle.toLowerCase());

    res.json(suggestions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération des suggestions' });
  }
};
const db = require('../config/db');

// ... (existing code up to getSuggestionsRetour)

const generateWhatsAppLink = async (req, res) => {
  try {
    const { type, id } = req.params; // type = 'demande' ou 'disponibilite'
    
    let query = '';
    let message = '';
    
    if (type === 'demande') {
      query = `
        SELECT u.telephone_whatsapp, d.ville_depart, d.ville_arrivee, d.nature_marchandise 
        FROM demandes d
        JOIN users u ON d.chargeur_id = u.id
        WHERE d.id = $1
      `;
    } else if (type === 'disponibilite') {
      query = `
        SELECT u.telephone_whatsapp, d.position_actuelle, d.destinations_possibles 
        FROM disponibilites d
        JOIN camions c ON d.camion_id = c.id
        JOIN users u ON c.transporteur_id = u.id
        WHERE d.id = $1
      `;
    } else {
      return res.status(400).json({ error: 'Type invalide. Utilisez "demande" ou "disponibilite".' });
    }

    const result = await db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Annonce non trouvée.' });
    }

    const data = result.rows[0];
    const telephone = data.telephone_whatsapp.replace(/[^0-9]/g, ''); // Nettoyer le numéro
    
    if (type === 'demande') {
      message = `Bonjour, je suis intéressé par votre demande de transport de ${data.ville_depart} à ${data.ville_arrivee} pour ${data.nature_marchandise}. Est-ce toujours d'actualité ?`;
    } else {
      message = `Bonjour, je suis intéressé par votre camion actuellement à ${data.position_actuelle} (Destinations: ${data.destinations_possibles}). Est-ce toujours d'actualité ?`;
    }

    const encodedMessage = encodeURIComponent(message);
    const whatsappLink = `https://wa.me/${telephone}?text=${encodedMessage}`;

    res.json({ link: whatsappLink });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la génération du lien WhatsApp' });
  }
};

module.exports = {
  createDemande,
  getDemandes,
  createDisponibilite,
  getDisponibilites,
  getSuggestionsRetour,
  generateWhatsAppLink
};
