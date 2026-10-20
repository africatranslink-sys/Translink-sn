const DocumentModel = require('../models/documentModel');
const db = require('../config/db');
const fs = require('fs');
const path = require('path');
const { escapeHtml, renderMailTemplate } = require('../../../shared/mailTemplate');
const { createMailTransporter } = require('../../../shared/mailTransporter');
const { getRequiredDocuments, getMissingRequiredDocuments } = require('../../../shared/requiredDocuments');
const nodemailer = require('nodemailer');

const sendConfiguredMail = async (options) => {
  const smtp = await createMailTransporter(db, nodemailer);
  if (!smtp) {
    console.warn('E-mail non envoyé : configuration SMTP absente ou invalide (hôte/expéditeur).');
    return false;
  }
  await smtp.transporter.sendMail({ ...options, from: smtp.from });
  return true;
};

const vehicleDocumentTypes = new Set(['CARTE_GRISE_RECTO', 'CARTE_GRISE_VERSO', 'ASSURANCE', 'PHOTO_CAMION']);

const notifyDocumentsApproved = async (user) => {
  if (!user.email) return false;
  const transporterRole = user.role || 'utilisateur';
  return sendConfiguredMail({
    to: user.email,
    subject: 'Translink-Africa - Votre dossier est validé',
    text: `Bonjour ${user.nom},\n\nVotre dossier ${transporterRole} a été vérifié et validé par l’administration.\n\nL’équipe Translink-Africa`,
    html: renderMailTemplate({
      title: 'Votre dossier est validé',
      name: user.nom,
      intro: `Votre dossier ${transporterRole} a été vérifié et validé par l’administration.`,
      content: '<div style="display:inline-block;padding:10px 14px;background:#e8f7ef;color:#047857;border-radius:6px;font-size:13px;font-weight:bold">DOSSIER VALIDÉ</div>'
    })
  });
};

const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni.' });
    }

    const { type_document } = req.body;
    const camion_id = req.body.camion_id ? Number(req.body.camion_id) : null;
    if (!type_document) {
      return res.status(400).json({ error: 'Le type de document est requis.' });
    }

    if (vehicleDocumentTypes.has(type_document)) {
      if (!Number.isSafeInteger(camion_id) || camion_id <= 0) {
        return res.status(400).json({ error: 'Ce document doit être associé à un camion.' });
      }
      const { rows } = await db.query(
        `SELECT c.id,
                (SELECT COUNT(*)::int FROM documents d WHERE d.camion_id = c.id AND d.type_document::text = 'PHOTO_CAMION') AS photo_count
         FROM camions c
         WHERE c.id = $1 AND c.proprietaire_id = $2;`,
        [camion_id, req.user.id]
      );
      if (!rows[0]) return res.status(403).json({ error: 'Vous ne pouvez joindre des documents qu’à un camion de votre flotte.' });
      if (type_document === 'PHOTO_CAMION' && Number(rows[0].photo_count) >= 4) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        return res.status(409).json({ error: 'Un camion peut avoir au maximum 4 photos.' });
      }
    } else {
      if (camion_id) return res.status(400).json({ error: 'Ce document doit être associé au profil, pas à un camion.' });
      const allowedTypes = new Set([
        ...getRequiredDocuments(req.user.role),
        ...(req.user.role === 'CHAUFFEUR' ? ['PERMIS'] : [])
      ]);
      if (!allowedTypes.has(type_document)) {
        return res.status(403).json({ error: 'Ce type de document ne correspond pas à votre profil.' });
      }
    }

    const fichier_url = `/uploads/${req.file.filename}`;

    const newDocument = await DocumentModel.create({
      utilisateur_id: req.user.id,
      camion_id: camion_id || null,
      type_document,
      fichier_url
    });

    res.status(201).json({
      message: 'Document téléversé avec succès',
      document: newDocument
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors du téléversement du document' });
  }
};

const notifyDocumentsSubmitted = async (req, res) => {
  try {
    const { rows: users } = await db.query('SELECT id, nom, email, telephone_whatsapp, role FROM users WHERE id = $1;', [req.user.id]);
    const user = users[0];
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    const { rows: submittedDocuments } = await db.query(
      `SELECT DISTINCT type_document::text AS type_document
       FROM documents
       WHERE utilisateur_id = $1 AND camion_id IS NULL;`,
      [user.id]
    );
    const missingDocuments = getMissingRequiredDocuments(
      user.role,
      submittedDocuments.map((document) => document.type_document)
    );
    if (missingDocuments.length) {
      return res.status(400).json({
        error: `Dossier incomplet. Documents manquants : ${missingDocuments.join(', ')}.`,
        missing_documents: missingDocuments
      });
    }
    await db.query(
      'UPDATE users SET documents_submitted_at = CURRENT_TIMESTAMP WHERE id = $1;',
      [user.id]
    );
    const userName = user?.nom || `Utilisateur #${req.user.id}`;
    
    await db.query(
      `INSERT INTO notifications (utilisateur_id, titre, message)
       SELECT id, $1, $2 FROM users WHERE role = 'ADMIN';`,
      ['Nouveaux documents à vérifier', `${userName} a envoyé ses documents pour vérification.`]
    );

    let adminEmailsSent = 0;
    let adminEmailRecipients = 0;
    try {
      const { rows: admins } = await db.query(
        `SELECT email FROM users
         WHERE role = 'ADMIN' AND email IS NOT NULL AND BTRIM(email) <> '';`
      );
      adminEmailRecipients = admins.length;
      const frontendUrl = (process.env.FRONTEND_URL || 'https://translink-africa.servehttp.com').replace(/\/+$/, '');
      const reviewUrl = `${frontendUrl}/admin/documents?userId=${encodeURIComponent(user.id)}`;
      const emailResults = await Promise.allSettled(admins.map(({ email }) => sendConfiguredMail({
        to: email,
        subject: 'Translink-Africa - Nouveau dossier à vérifier',
        text: `Un nouveau dossier est prêt à être vérifié.\n\nNom : ${userName}\nRôle : ${user?.role || 'Non renseigné'}\nE-mail : ${user?.email || 'Non renseigné'}\nTéléphone : ${user?.telephone_whatsapp || 'Non renseigné'}\n\nConsulter les documents : ${reviewUrl}`,
        html: renderMailTemplate({
          title: 'Nouveau dossier à vérifier',
          name: 'Administration',
          intro: `${userName} a transmis les documents de son compte ${user?.role || ''} et son dossier est prêt pour vérification.`,
          content: `<p style="margin:0;color:#526772;font-size:14px;line-height:1.7">E-mail : ${escapeHtml(user?.email || 'Non renseigné')}<br>Téléphone : ${escapeHtml(user?.telephone_whatsapp || 'Non renseigné')}</p>`,
          actionLabel: 'Examiner le dossier',
          actionUrl: reviewUrl
        })
      })));
      adminEmailsSent = emailResults.filter((result) => result.status === 'fulfilled' && result.value).length;
      emailResults.forEach((result) => {
        if (result.status === 'rejected') {
          console.warn('E-mail d’alerte admin non envoyé:', result.reason?.message || result.reason);
        }
      });
      if (adminEmailsSent < adminEmailRecipients) {
        console.warn(`Alerte e-mail admin partielle : ${adminEmailsSent}/${adminEmailRecipients} messages envoyés.`);
      }
    } catch (mailError) {
      console.warn('Impossible d’envoyer l’alerte e-mail de nouveau dossier aux administrateurs:', mailError.message);
    }

    let emailEnvoye = false;
    if (user?.email) {
      try {
        emailEnvoye = await sendConfiguredMail({
          to: user.email,
          subject: 'Translink-Africa - Votre compte est en cours de vérification',
          text: `Bonjour ${userName},\n\nVotre compte a bien été créé et vos documents ont été transmis avec succès. Ils sont actuellement en cours de vérification par notre équipe.\n\nVous serez notifié(e) dès que votre profil sera validé.\n\nL'équipe Translink-Africa`,
          html: renderMailTemplate({
            title: 'Documents en cours de vérification',
            name: userName,
            intro: 'Votre compte a bien été créé et vos documents ont été transmis avec succès.',
            content: '<p style="margin:0;color:#526772;font-size:15px;line-height:1.7">Notre équipe les examine actuellement. Vous recevrez un e-mail dès que votre profil sera validé.</p>'
          })
        });
      } catch (mailError) {
        console.warn('Erreur lors de l’envoi de l’e-mail de confirmation de documents:', mailError.message);
      }
    }

    res.status(201).json({
      message: emailEnvoye
        ? 'Documents transmis. L’e-mail de confirmation a été envoyé.'
        : 'Documents transmis, mais l’e-mail de confirmation n’a pas pu être envoyé.',
      email_envoye: emailEnvoye,
      admin_emails_envoyes: adminEmailsSent,
      admin_email_destinataires: adminEmailRecipients
    });
  } catch (error) {
    if (error.code === '42P01') return res.status(503).json({ error: 'Le système de notification n’est pas disponible.' });
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de l’envoi de la notification.' });
  }
};

const validateDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { statut, motif } = req.body;

    if (!['EN_ATTENTE', 'VALIDE', 'REFUSE'].includes(statut)) {
      return res.status(400).json({ error: 'Statut invalide.' });
    }

    const normalizedReason = typeof motif === 'string' ? motif.trim() : '';
    if (statut === 'REFUSE' && normalizedReason.length < 3) {
      return res.status(400).json({ error: 'Le motif du refus est obligatoire et doit contenir au moins 3 caractères.' });
    }
    if (normalizedReason.length > 1000) {
      return res.status(400).json({ error: 'Le motif du refus ne peut pas dépasser 1000 caractères.' });
    }

    const updatedDocument = await DocumentModel.updateStatus(id, statut, statut === 'REFUSE' ? normalizedReason : null);
    if (!updatedDocument) {
      return res.status(404).json({ error: 'Document non trouvé.' });
    }

    const { rows: userRows } = await db.query('SELECT id, nom, email, role, employeur_id, statut_verification FROM users WHERE id = $1;', [updatedDocument.utilisateur_id]);
    const user = userRows[0];
    let emailEnvoye = null;
    let compteStatutMisAJour = false;

    if (statut === 'VALIDE' || (statut === 'REFUSE' && user?.statut_verification === 'VALIDE')) {
      const required = getRequiredDocuments(user?.role);
      const { rows } = await db.query(
        `SELECT u.nom, u.email, u.role,
                COUNT(DISTINCT d.type_document) FILTER (WHERE d.type_document::text = ANY($2::text[]) AND d.statut = 'VALIDE') AS validated_count
         FROM users u LEFT JOIN documents d ON d.utilisateur_id = u.id
         WHERE u.id = $1
         GROUP BY u.id;`,
        [updatedDocument.utilisateur_id, required]
      );
      const validatedUser = rows[0];
      const dossierComplet = validatedUser && required.length > 0
        && Number(validatedUser.validated_count) >= required.length;

      if (dossierComplet && user.statut_verification === 'EN_ATTENTE') {
        const { rowCount } = await db.query(
          `UPDATE users SET statut_verification = 'VALIDE'
           WHERE id = $1 AND statut_verification = 'EN_ATTENTE';`,
          [updatedDocument.utilisateur_id]
        );
        compteStatutMisAJour = rowCount > 0;
        if (compteStatutMisAJour) {
          try {
            emailEnvoye = await notifyDocumentsApproved(validatedUser);
          } catch (mailError) {
            console.warn('E-mail de validation non envoyé:', mailError.message);
            emailEnvoye = false;
          }
        }
      } else if (!dossierComplet && statut === 'REFUSE' && user.statut_verification === 'VALIDE'
        && required.includes(updatedDocument.type_document)) {
        await db.query(
          `UPDATE users SET statut_verification = 'EN_ATTENTE'
           WHERE id = $1 AND statut_verification = 'VALIDE';`,
          [updatedDocument.utilisateur_id]
        );
        compteStatutMisAJour = true;
      }
    }

    if (statut === 'REFUSE' && user?.email) {
      try {
        const docName = updatedDocument.type_document || 'le document';
        const refusalReason = updatedDocument.motif_refus;
        emailEnvoye = await sendConfiguredMail({
          to: user.email,
          subject: 'Translink-Africa - Document refusé',
          text: `Bonjour ${user.nom},\n\nVotre document "${docName}" a été refusé pour le motif suivant :\n\n"${refusalReason}"\n\nVeuillez contacter l’administration de Translink-Africa pour transmettre une version corrigée.\n\nL'équipe Translink-Africa`,
          html: renderMailTemplate({
            title: 'Document refusé',
            name: user.nom,
            intro: `Après vérification, nous n’avons pas pu valider le document ${docName}.`,
            content: `<div style="padding:16px;background:#fff1f2;border-left:4px solid #be123c;color:#526772;font-size:14px;line-height:1.6"><strong style="color:#881337">Motif du refus</strong><br>${escapeHtml(refusalReason)}</div><p style="margin:18px 0 0;color:#526772;font-size:14px;line-height:1.6">Veuillez contacter l’administration pour transmettre une version corrigée.</p>`,
            accentColor: '#FF6A3D'
          })
        });
      } catch (mailError) {
        console.warn('E-mail de refus non envoyé:', mailError.message);
        emailEnvoye = false;
      }
    }

    res.json({
      message: `Document ${statut.toLowerCase()}`,
      document: updatedDocument,
      compte_statut_mis_a_jour: compteStatutMisAJour,
      statut_compte: compteStatutMisAJour
        ? (statut === 'VALIDE' ? 'VALIDE' : 'EN_ATTENTE')
        : user?.statut_verification,
      email_envoye: emailEnvoye
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la validation du document' });
  }
};

const deleteDocument = async (req, res) => {
  try {
    const deletedDocument = await DocumentModel.deleteById(
      req.params.id,
      req.user.id,
      req.user.role === 'ADMIN'
    );
    if (!deletedDocument) return res.status(404).json({ error: 'Document non trouvé.' });

    const filename = path.basename(deletedDocument.fichier_url || '');
    if (filename) {
      const filePath = path.resolve(__dirname, '../../uploads', filename);
      try {
        await fs.promises.unlink(filePath);
      } catch (error) {
        if (error.code !== 'ENOENT') console.warn('Fichier de document non supprimé:', error.message);
      }
    }

    res.json({ message: 'Document supprimé.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la suppression du document.' });
  }
};

const getUserDocuments = async (req, res) => {
  try {
    const documents = await DocumentModel.findByUserId(req.user.id);
    res.json(documents);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération des documents' });
  }
};

module.exports = {
  uploadDocument,
  notifyDocumentsSubmitted,
  validateDocument,
  deleteDocument,
  getUserDocuments
};
