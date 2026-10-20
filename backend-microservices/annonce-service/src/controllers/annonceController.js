const db = require('../config/db');
const DemandeModel = require('../models/demandeModel');
const DisponibiliteModel = require('../models/disponibiliteModel');
const { sendAnnouncementPublishedEmail, sendAnnouncementRemovedEmail } = require('../services/mailService');

// --- Demandes de transport (Chargeurs) ---

const createDemande = async (req, res) => {
  try {
    const { ville_depart, ville_arrivee, nature_marchandise, tonnage, type_camion_requis, date_chargement, heure_chargement, prix_propose, exigences_particulieres, quartier_chargement, position_lng, position_lat } = req.body;
    const longitude = Number(position_lng);
    const latitude = Number(position_lat);
    const neighborhood = typeof quartier_chargement === 'string' ? quartier_chargement.trim() : '';
    if (position_lng === '' || position_lng == null || position_lat === '' || position_lat == null
      || !Number.isFinite(longitude) || !Number.isFinite(latitude)
      || Math.abs(longitude) > 180 || Math.abs(latitude) > 90 || !neighborhood) {
      return res.status(400).json({ error: 'Indiquez le point sur la carte ou ses coordonnées, puis renseignez le quartier ou un repère.' });
    }

    const newDemande = await DemandeModel.create({
      chargeur_id: req.user.id,
      ville_depart,
      ville_arrivee,
      nature_marchandise,
      tonnage,
      type_camion_requis,
      date_chargement,
      heure_chargement,
      prix_propose,
      exigences_particulieres,
      quartier_chargement: neighborhood,
      position_lng: longitude,
      position_lat: latitude
    });

    await db.query(`
      INSERT INTO notifications (utilisateur_id, titre, message)
      SELECT id, 'Nouvelle annonce publiée', $1
      FROM users
      WHERE role IN ('TRANSPORTEUR', 'ENTREPRISE', 'CHAUFFEUR', 'ADMIN')
        AND id != $2;
    `, [`Une nouvelle annonce de transport a été publiée : ${ville_depart} → ${ville_arrivee} • ${nature_marchandise}.`, req.user.id]);

    const { rows: recipients } = await db.query(`
      SELECT nom, email
      FROM users
      WHERE role IN ('TRANSPORTEUR', 'ENTREPRISE', 'CHAUFFEUR', 'ADMIN')
        AND id != $1 AND email IS NOT NULL;
    `, [req.user.id]);
    const emailResults = await Promise.allSettled(recipients.map((recipient) => sendAnnouncementPublishedEmail({
      email: recipient.email,
      name: recipient.nom,
      offer: newDemande,
    })));

    res.status(201).json({
      message: 'Demande de transport publiée avec succès',
      demande: newDemande,
      emailsEnvoyes: emailResults.filter((result) => result.status === 'fulfilled' && result.value).length,
    });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Erreur lors de la publication de la demande' });
  }
};

const renewMyDemande = async (req, res) => {
  const demandeId = Number(req.params.id);
  if (!Number.isSafeInteger(demandeId) || demandeId <= 0) {
    return res.status(400).json({ error: 'Identifiant de demande invalide.' });
  }
  const { ville_depart, ville_arrivee, nature_marchandise, tonnage, type_camion_requis, date_chargement, heure_chargement, prix_propose, exigences_particulieres, quartier_chargement, position_lng, position_lat } = req.body;
  const longitude = Number(position_lng);
  const latitude = Number(position_lat);
  const neighborhood = typeof quartier_chargement === 'string' ? quartier_chargement.trim() : '';
  if (!ville_depart || !ville_arrivee || !nature_marchandise || !type_camion_requis || !date_chargement
    || !Number.isFinite(Number(tonnage)) || Number(tonnage) <= 0
    || !/^\d{4}-\d{2}-\d{2}$/.test(date_chargement)
    || (heure_chargement && !/^([01]\d|2[0-3]):[0-5]\d$/.test(heure_chargement))
    || !Number.isFinite(longitude) || !Number.isFinite(latitude)
    || Math.abs(longitude) > 180 || Math.abs(latitude) > 90 || !neighborhood
    || (prix_propose != null && prix_propose !== '' && (!Number.isFinite(Number(prix_propose)) || Number(prix_propose) < 0))) {
    return res.status(400).json({ error: 'Complétez les informations de l’annonce et sélectionnez son point de chargement.' });
  }
  try {
    const demande = await DemandeModel.renewExpiredByChargeur(demandeId, req.user.id, {
      ville_depart, ville_arrivee, nature_marchandise, tonnage: Number(tonnage), type_camion_requis,
      date_chargement, heure_chargement: heure_chargement || null,
      prix_propose: prix_propose ? Number(prix_propose) : null,
      exigences_particulieres: exigences_particulieres || null,
      quartier_chargement: neighborhood, position_lng: longitude, position_lat: latitude,
    });
    res.json({ message: 'Votre annonce a été renouvelée et republiée.', demande });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Impossible de renouveler cette annonce.' });
  }
};

const getDemandesForAdmin = async (req, res) => {
  try {
    res.json(await DemandeModel.findForAdmin());
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Impossible de récupérer les annonces.' });
  }
};

const removeDemandeByAdmin = async (req, res) => {
  const reason = typeof req.body?.motif === 'string' ? req.body.motif.trim() : '';
  if (reason.length < 5) return res.status(400).json({ error: 'Le motif doit contenir au moins 5 caractères.' });
  try {
    const demande = await DemandeModel.removePublishedByAdmin(req.params.id, req.user.id, reason);
    const emailEnvoye = await sendAnnouncementRemovedEmail({
      email: demande.chargeur_email,
      name: demande.chargeur_nom,
      offer: demande,
      reason,
    });
    res.json({ message: 'Annonce supprimée et archivée.', emailEnvoye });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Impossible de supprimer cette annonce.' });
  }
};

const getDemandes = async (req, res) => {
  try {
    if (req.user.role === 'CHAUFFEUR') {
      const { rows } = await db.query('SELECT employeur_id FROM users WHERE id = $1;', [req.user.id]);
      if (rows[0]?.employeur_id) return res.status(403).json({ error: 'Les offres sont gérées par votre entreprise.' });
    }
    const demandes = await DemandeModel.findActive();
    res.json(demandes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération des demandes' });
  }
};

const getMesDemandes = async (req, res) => {
  try {
    const demandes = await DemandeModel.findByChargeurId(req.user.id);
    res.json(demandes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération de vos demandes' });
  }
};

const cancelMyDemande = async (req, res) => {
  const demandeId = Number(req.params.id);
  if (!Number.isSafeInteger(demandeId) || demandeId <= 0) {
    return res.status(400).json({ error: 'Identifiant de demande invalide.' });
  }
  try {
    const demande = await DemandeModel.cancelPublishedByChargeur(demandeId, req.user.id);
    res.json({ message: 'Demande annulée.', demande });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Impossible d’annuler cette demande.' });
  }
};

// --- Disponibilités de camions (Transporteurs) ---

const createDisponibilite = async (req, res) => {
  try {
    const { camion_id, position_actuelle, destinations_possibles, disponibilite_date, position_lng, position_lat, destination_lng, destination_lat } = req.body;
    const coordinates = [position_lng, position_lat, destination_lng, destination_lat].map(Number);
    if (!camion_id || !position_actuelle || !destinations_possibles || !disponibilite_date || !coordinates.every(Number.isFinite)
      || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[2]) > 180 || Math.abs(coordinates[1]) > 90 || Math.abs(coordinates[3]) > 90) {
      return res.status(400).json({ error: 'Sélectionnez un camion, deux villes et une date valide.' });
    }

    const newDispo = await DisponibiliteModel.create({
      camion_id,
      position_actuelle,
      destinations_possibles,
      disponibilite_date,
      position_lng: coordinates[0],
      position_lat: coordinates[1],
      destination_lng: coordinates[2],
      destination_lat: coordinates[3],
      user_id: req.user.id
    });
    if (!newDispo) return res.status(403).json({ error: 'Ce camion ne fait pas partie de votre flotte.' });

    res.status(201).json({
      message: 'Disponibilité du camion publiée avec succès',
      disponibilite: newDispo
    });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la publication de la disponibilité' });
  }
};

const getDisponibilites = async (req, res) => {
  try {
    const dispos = await DisponibiliteModel.findActive({ ville_depart: req.query.ville_depart, ville_destination: req.query.ville_destination });
    res.json(dispos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération des disponibilités' });
  }
};

const getMesPositions = async (req, res) => {
  try {
    res.json(await DisponibiliteModel.findActiveByUserId(req.user.id));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération des trajets de votre flotte.' });
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

const generateWhatsAppLink = async (req, res) => {
  try {
    const { type, id } = req.params; // type = 'demande' ou 'disponibilite'
    
    let query = '';
    let message = '';
    
    if (type === 'demande') {
      query = `
        SELECT u.telephone_whatsapp, d.ville_depart, d.ville_arrivee, d.nature_marchandise 
        FROM demandes_transport d
        JOIN users u ON d.chargeur_id = u.id
        WHERE d.id = $1 AND d.statut = 'PUBLIEE'
      `;
    } else if (type === 'disponibilite') {
      query = `
        SELECT u.telephone_whatsapp, d.position_actuelle, d.destinations_possibles 
        FROM disponibilites_camion d
        JOIN camions c ON d.camion_id = c.id
        JOIN users u ON c.proprietaire_id = u.id
        LEFT JOIN LATERAL (
          SELECT plan FROM abonnements
          WHERE utilisateur_id = u.id AND statut = 'ACTIF'
            AND date_debut <= CURRENT_TIMESTAMP AND date_fin > CURRENT_TIMESTAMP
          ORDER BY date_fin DESC LIMIT 1
        ) subscription ON TRUE
        WHERE d.id = $1 AND d.statut = 'ACTIVE'
          AND c.id IN (
            SELECT eligible_truck.id FROM camions eligible_truck
            WHERE eligible_truck.proprietaire_id = u.id
            ORDER BY eligible_truck.date_ajout ASC, eligible_truck.id ASC
            LIMIT CASE
              WHEN u.date_debut_essai <= CURRENT_TIMESTAMP AND u.date_fin_essai > CURRENT_TIMESTAMP THEN 2147483647
              WHEN subscription.plan = 'GRANDE_ENTREPRISE' THEN 2147483647
              WHEN subscription.plan = 'PRO' THEN 2147483647
              WHEN subscription.plan = 'PETITE_ENTREPRISE' THEN 3
              WHEN subscription.plan = 'INDIVIDUEL' THEN 1
              ELSE 1
            END
          )
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
  renewMyDemande,
  getDemandesForAdmin,
  removeDemandeByAdmin,
  getDemandes,
  getMesDemandes,
  cancelMyDemande,
  createDisponibilite,
  getDisponibilites,
  getMesPositions,
  getSuggestionsRetour,
  generateWhatsAppLink
};
