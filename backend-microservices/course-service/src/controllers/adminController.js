const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../config/db');
const AdminModel = require('../models/adminModel');
const { getRequiredDocuments, getMissingRequiredDocuments } = require('../../../shared/requiredDocuments');
const { sendProfileInvitation, sendAccountStatusEmail, sendAccountDeletedEmail } = require('../services/mailService');

const getDashboardStats = async (req, res) => {
  try {
    const stats = await AdminModel.getDashboardStats();
    res.status(200).json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques: ' + err.message });
  }
};

const getUsers = async (req, res) => {
  try {
    res.json(await AdminModel.getUsers());
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs' });
  }
};

const getDocuments = async (req, res) => {
  try {
    res.json(await AdminModel.getDocuments(req.query.userId));
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la récupération des documents' });
  }
};

const updateUserStatus = async (req, res) => {
  try {
    if (!['EN_ATTENTE', 'VALIDE', 'REFUSE', 'SUSPENDU'].includes(req.body.statut)) {
      return res.status(400).json({ error: 'Statut utilisateur invalide.' });
    }

    if (req.body.statut === 'VALIDE') {
      const { rows: userRows } = await db.query('SELECT id, role FROM users WHERE id = $1;', [req.params.id]);
      const user = userRows[0];
      if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé.' });
      const requiredDocuments = getRequiredDocuments(user.role);
      if (requiredDocuments.length) {
        const { rows: documentRows } = await db.query(
          `SELECT type_document::text AS type_document, statut::text AS statut
           FROM documents
           WHERE utilisateur_id = $1 AND camion_id IS NULL
             AND type_document::text = ANY($2::text[]);`,
          [user.id, requiredDocuments]
        );
        const missingDocuments = getMissingRequiredDocuments(
          user.role,
          documentRows.map((document) => document.type_document)
        );
        if (missingDocuments.length) {
          return res.status(409).json({
            error: `Impossible de valider ce compte. Documents manquants : ${missingDocuments.join(', ')}.`,
            missing_documents: missingDocuments
          });
        }
        if (documentRows.some((document) => document.statut !== 'VALIDE')) {
          return res.status(409).json({ error: 'Tous les documents obligatoires doivent être approuvés avant de valider le compte.' });
        }
      }
    }

    const user = await AdminModel.updateUserStatus(req.params.id, req.body.statut);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    }

    const notificationEnvoyee = user.statut_verification === 'EN_ATTENTE'
      ? null
      : await sendAccountStatusEmail({
        email: user.email,
        name: user.nom,
        role: user.role,
        status: user.statut_verification
      });

    res.json({ ...user, notification_envoyee: notificationEnvoyee });
  } catch (err) {
    console.error('Erreur updateUserStatus:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de l’utilisateur' });
  }
};

const createUser = async (req, res) => {
  try {
    const { nom, email, telephone_whatsapp, ville, role } = req.body;
    if (!nom || !email || !telephone_whatsapp || !ville || !role) {
      return res.status(400).json({ error: 'Le nom, email, téléphone, ville et rôle sont obligatoires.' });
    }

    const invitationToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(invitationToken).digest('hex');
    const temporaryPassword = crypto.randomBytes(6).toString('base64url');
    const placeholderPassword = await bcrypt.hash(temporaryPassword, 10);

    const { rows } = await db.query(
      `INSERT INTO users (nom, telephone_whatsapp, email, mot_de_passe, ville, role, statut_verification, invitation_token_hash, invitation_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'EN_ATTENTE', $7, NOW() + INTERVAL '72 hours')
       RETURNING id, nom, email, telephone_whatsapp, ville, role, statut_verification;`,
      [nom, telephone_whatsapp.replace(/\D/g, ''), email, placeholderPassword, ville, role, tokenHash]
    );

    const invitation = await sendProfileInvitation({ email, name: nom, role, token: invitationToken, temporaryPassword });

    res.status(201).json({
      user: rows[0],
      invitationSent: invitation.delivered,
      invitationUrl: invitation.delivered ? undefined : invitation.invitationUrl,
      temporaryPassword: invitation.delivered ? undefined : temporaryPassword
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Cet email ou ce numéro est déjà utilisé.' });
    }
    res.status(500).json({ error: 'Erreur lors de la création du compte.' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const deleted = await AdminModel.deleteUser(req.params.id);
    if (!deleted) {
      return res.status(400).json({ error: 'Le compte admin ne peut pas être supprimé ou le compte est introuvable.' });
    }
    const notificationEnvoyee = await sendAccountDeletedEmail({ email: deleted.email, name: deleted.nom });
    res.json({ message: 'Utilisateur supprimé.', notification_envoyee: notificationEnvoyee });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
};

module.exports = {
  getDashboardStats,
  getUsers,
  getDocuments,
  updateUserStatus,
  createUser,
  deleteUser
};
