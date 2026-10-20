const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs/promises');
const db = require('../config/db');
const UserModel = require('../models/userModel');
const { getRequiredDocuments, getMissingRequiredDocuments } = require('../../../shared/requiredDocuments');
const { registerSchema } = require('../validators/authValidator');
const { createSession, publishUserSocketEvent } = require('../../../shared/redis');
const { escapeHtml, renderMailTemplate } = require('../../../shared/mailTemplate');
const { createMailTransporter } = require('../../../shared/mailTransporter');
const { getAccountAccessError } = require('../../../shared/accountAccess');
const { verifyNewsletterUnsubscribeToken } = require('../../../shared/newsletterToken');
const { assertCanAddDriver } = require('../../../shared/subscriptionEntitlements');
const nodemailer = require('nodemailer');

const sendConfiguredMail = async (options) => {
  const smtp = await createMailTransporter(db, nodemailer);
  if (!smtp) return false;
  await smtp.transporter.sendMail({ ...options, from: smtp.from });
  return true;
};

const publishProfileUpdate = async (profile) => {
  try {
    await publishUserSocketEvent(profile.id, 'profile:updated', profile);
  } catch (error) {
    console.error('Impossible de diffuser la mise à jour du profil :', error.message);
  }
};

const sendChauffeurAccountNotice = async ({ chauffeur, employerName, suspended }) => {
  const title = suspended ? 'Votre compte chauffeur a été suspendu' : 'La suspension de votre compte est levée';
  const intro = suspended
    ? `${employerName} a suspendu votre compte chauffeur sur Translink-Africa. Vous ne pouvez plus accéder à votre espace tant que la suspension n’est pas levée.`
    : `${employerName} a levé la suspension de votre compte chauffeur. Vous pouvez de nouveau accéder à votre espace Translink-Africa.`;
  const text = `Bonjour ${chauffeur.nom},\n\n${intro}\n\nL’équipe Translink-Africa`;
  const content = suspended
    ? '<p style="margin:0;color:#526772;font-size:15px;line-height:1.7">Pour toute question concernant cette décision, contactez votre transporteur ou votre entreprise.</p>'
    : '<p style="margin:0;color:#526772;font-size:15px;line-height:1.7">Vous pouvez vous reconnecter avec vos identifiants habituels.</p>';

  return sendConfiguredMail({
    to: chauffeur.email,
    subject: `Translink-Africa - ${title}`,
    text,
    html: renderMailTemplate({ title, name: chauffeur.nom, intro, content }),
  });
};

const parseUserAgentDetails = (userAgent = '') => {
  const ua = userAgent || '';

  let navigateur = 'Inconnu';
  if (/EdgA?\//i.test(ua)) navigateur = 'Microsoft Edge';
  else if (/OPR\//i.test(ua)) navigateur = 'Opera';
  else if (/Chrome\//i.test(ua) && !/Safari\//i.test(ua)) navigateur = 'Google Chrome';
  else if (/Firefox\//i.test(ua)) navigateur = 'Mozilla Firefox';
  else if (/Safari\//i.test(ua)) navigateur = 'Safari';

  let appareil = 'Ordinateur';
  if (/Android/i.test(ua)) appareil = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) appareil = 'Apple iPhone/iPad';
  else if (/Windows/i.test(ua)) appareil = 'Windows';
  else if (/Mac OS/i.test(ua)) appareil = 'Mac OS';
  else if (/Linux/i.test(ua)) appareil = 'Linux';

  let machine = 'Inconnue';
  if (/Windows/i.test(ua)) machine = 'Windows';
  else if (/Mac OS/i.test(ua)) machine = 'Mac OS';
  else if (/Android/i.test(ua)) machine = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) machine = 'iPhone/iPad';
  else if (/Linux/i.test(ua)) machine = 'Linux';

  return { navigateur, appareil, machine };
};

const createSessionToken = async (payload) => {
  const sid = await createSession(payload.id);
  return jwt.sign({ ...payload, sid }, process.env.JWT_SECRET, { expiresIn: '24h' });
};

const createRegistrationToken = (user) => jwt.sign({
  id: user.id,
  role: user.role,
  registrationOnly: true
}, process.env.JWT_SECRET, { expiresIn: '2h' });

const getUploadedFiles = (req) => Object.values(req.files || {}).flat();

const discardUploadedFiles = async (files) => {
  await Promise.all(files.map(async (file) => {
    try {
      await fs.unlink(file.path);
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Impossible de supprimer un fichier de document temporaire:', error.message);
    }
  }));
};

const insertRequiredDocuments = async (client, userId, role, files) => {
  const requiredDocuments = getRequiredDocuments(role);
  const uploadedByType = new Map(files.map((file) => [file.fieldname, file]));
  const missingDocuments = getMissingRequiredDocuments(role, [...uploadedByType.keys()]);
  if (missingDocuments.length) return missingDocuments;

  for (const typeDocument of requiredDocuments) {
    const file = uploadedByType.get(typeDocument);
    await client.query(
      'INSERT INTO documents (utilisateur_id, type_document, fichier_url) VALUES ($1, $2, $3);',
      [userId, typeDocument, `/uploads/${file.filename}`]
    );
  }
  return [];
};

const register = async (req, res) => {
  const uploadedFiles = getUploadedFiles(req);
  let client;
  try {
    const { error: validationError } = registerSchema.validate(req.body, { abortEarly: true });
    if (validationError) {
      await discardUploadedFiles(uploadedFiles);
      return res.status(400).json({ error: validationError.details[0].message });
    }
    const { nom, email, mot_de_passe, ville, role } = req.body;
    const numero_cni_nin = String(req.body.numero_cni_nin || '').trim().replace(/\s+/g, '').toUpperCase();
    const telephone = req.body.telephone_whatsapp.replace(/\D/g, '');
    const missingDocuments = getMissingRequiredDocuments(role, uploadedFiles.map((file) => file.fieldname));
    if (missingDocuments.length) {
      await discardUploadedFiles(uploadedFiles);
      return res.status(400).json({
        error: `Inscription incomplète. Documents obligatoires manquants : ${missingDocuments.join(', ')}.`,
        missing_documents: missingDocuments
      });
    }
    const unexpectedDocuments = uploadedFiles.filter((file) => !getRequiredDocuments(role).includes(file.fieldname));
    if (unexpectedDocuments.length) {
      await discardUploadedFiles(uploadedFiles);
      return res.status(400).json({ error: 'Un ou plusieurs documents ne correspondent pas au rôle sélectionné.' });
    }

    const existingUser = await UserModel.findByTelephone(telephone);
    if (existingUser) {
      await discardUploadedFiles(uploadedFiles);
      return res.status(400).json({ error: 'Ce numéro WhatsApp est déjà utilisé.' });
    }

    const existingEmail = await UserModel.findByEmail(email);
    if (existingEmail) {
      await discardUploadedFiles(uploadedFiles);
      return res.status(400).json({ error: 'Cette adresse email est déjà utilisée.' });
    }

    if (await UserModel.findByCniNin(numero_cni_nin)) {
      await discardUploadedFiles(uploadedFiles);
      return res.status(400).json({ error: 'Ce numéro CNI/NIN est déjà utilisé.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(mot_de_passe, salt);

    client = await db.pool.connect();
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO users (
         nom, telephone_whatsapp, email, mot_de_passe, ville, numero_cni_nin,
         role, newsletter_consent_at, documents_submitted_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, nom, telephone_whatsapp, email, ville, role, statut_verification, newsletter_consent_at, date_creation;`,
      [nom, telephone, email, hashedPassword, ville, numero_cni_nin, role]
    );
    const newUser = rows[0];
    await insertRequiredDocuments(client, newUser.id, role, uploadedFiles);
    await client.query('COMMIT');

    const token = createRegistrationToken(newUser);

    res.status(201).json({
      message: 'Utilisateur créé avec succès. En attente de vérification des documents.',
      user: newUser,
      registrationToken: token
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch((rollbackError) => console.error('Échec de l’annulation de l’inscription:', rollbackError.message));
    await discardUploadedFiles(uploadedFiles);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Cet e-mail, téléphone ou numéro CNI/NIN est déjà utilisé.' });
    }
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la création de l\'utilisateur' });
  } finally {
    client?.release();
  }
};

const login = async (req, res) => {
  try {
    const { identifiant, mot_de_passe } = req.body;
    const isEmail = identifiant.includes('@');
    const telephone_whatsapp = identifiant.replace(/\D/g, '');

    // Check if user exists
    const user = isEmail
      ? await UserModel.findByEmail(identifiant)
      : await UserModel.findByTelephone(telephone_whatsapp);
    if (!user) {
      return res.status(400).json({ error: 'Identifiants invalides.' });
    }

    // Check password
    const isMatch = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
    if (!isMatch) {
      return res.status(400).json({ error: 'Identifiants invalides.' });
    }

    const accountAccessError = getAccountAccessError(user.statut_verification);
    if (accountAccessError) {
      return res.status(403).json({ error: accountAccessError, statut_verification: user.statut_verification });
    }

    const forwardedIp = req.headers['x-forwarded-for'];
    const clientIp = forwardedIp ? String(forwardedIp).split(',')[0].trim() : (req.ip || 'unknown');
    const userAgent = req.headers['user-agent'] || '';
    const userAgentDetails = parseUserAgentDetails(userAgent);

    await UserModel.addLoginHistory(
      user.id,
      clientIp,
      userAgentDetails.navigateur,
      userAgentDetails.appareil,
      userAgentDetails.machine,
      userAgent
    );

    // Create JWT
    const payload = {
      id: user.id,
      role: user.role,
      statut_verification: user.statut_verification
    };

    const token = await createSessionToken(payload);

    res.json({
      message: 'Connexion réussie',
      token,
      user: {
        id: user.id,
        nom: user.nom,
        role: user.role,
        statut_verification: user.statut_verification,
        employeur_id: user.employeur_id
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
};

const getInvitation = async (req, res) => {
  try {
    const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const { rows } = await db.query(
      `SELECT id, nom, email, telephone_whatsapp, ville, role, statut_verification
       FROM users
       WHERE invitation_token_hash = $1 AND invitation_expires_at > NOW();`,
      [tokenHash]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Cette invitation est invalide ou expirée.' });
    res.json({ user: rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la vérification de l’invitation.' });
  }
};

const completeInvitation = async (req, res) => {
  const uploadedFiles = getUploadedFiles(req);
  let client;
  try {
    const { mot_de_passe } = req.body;
    const newsletterConsent = req.body.newsletter_consent !== false;
    const numero_cni_nin = String(req.body.numero_cni_nin || '').trim().replace(/\s+/g, '').toUpperCase();
    if (!mot_de_passe || mot_de_passe.length < 6) {
      await discardUploadedFiles(uploadedFiles);
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
    }
    if (!/^[A-Z0-9/-]{5,50}$/.test(numero_cni_nin)) {
      await discardUploadedFiles(uploadedFiles);
      return res.status(400).json({ error: 'Veuillez fournir un numéro CNI/NIN valide.' });
    }
    const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const passwordHash = await bcrypt.hash(mot_de_passe, 10);
    client = await db.pool.connect();
    await client.query('BEGIN');
    const { rows: invitationRows } = await client.query(
      `SELECT id, role FROM users
       WHERE invitation_token_hash = $1 AND invitation_expires_at > NOW()
       FOR UPDATE;`,
      [tokenHash]
    );
    const invitedUser = invitationRows[0];
    if (!invitedUser) {
      await client.query('ROLLBACK');
      await discardUploadedFiles(uploadedFiles);
      return res.status(404).json({ error: 'Cette invitation est invalide ou expirée.' });
    }
    const missingDocuments = getMissingRequiredDocuments(invitedUser.role, uploadedFiles.map((file) => file.fieldname));
    if (missingDocuments.length) {
      await client.query('ROLLBACK');
      await discardUploadedFiles(uploadedFiles);
      return res.status(400).json({
        error: `Inscription incomplète. Documents obligatoires manquants : ${missingDocuments.join(', ')}.`,
        missing_documents: missingDocuments
      });
    }
    const unexpectedDocuments = uploadedFiles.filter((file) => !getRequiredDocuments(invitedUser.role).includes(file.fieldname));
    if (unexpectedDocuments.length) {
      await client.query('ROLLBACK');
      await discardUploadedFiles(uploadedFiles);
      return res.status(400).json({ error: 'Un ou plusieurs documents ne correspondent pas au rôle invité.' });
    }
    const { rows: duplicateCni } = await client.query(
      'SELECT id FROM users WHERE numero_cni_nin = $1 AND id <> $2;',
      [numero_cni_nin, invitedUser.id]
    );
    if (duplicateCni.length) {
      await client.query('ROLLBACK');
      await discardUploadedFiles(uploadedFiles);
      return res.status(400).json({ error: 'Ce numéro CNI/NIN est déjà utilisé.' });
    }

    const { rows } = await client.query(
      `UPDATE users
       SET mot_de_passe = $1, numero_cni_nin = $2, statut_verification = 'EN_ATTENTE',
           newsletter_consent_at = CASE WHEN $4 THEN CURRENT_TIMESTAMP ELSE NULL END,
           invitation_token_hash = NULL, invitation_expires_at = NULL,
           documents_submitted_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING id, nom, email, telephone_whatsapp, ville, role, statut_verification, employeur_id, newsletter_consent_at;`,
      [passwordHash, numero_cni_nin, invitedUser.id, newsletterConsent]
    );

    const user = rows[0];
    await insertRequiredDocuments(client, user.id, user.role, uploadedFiles);
    await client.query('COMMIT');
    const registrationToken = createRegistrationToken(user);
    res.json({ message: 'Compte activé. Vos documents sont requis avant toute connexion.', user, registrationToken });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch((rollbackError) => console.error('Échec de l’annulation de la finalisation d’invitation:', rollbackError.message));
    await discardUploadedFiles(uploadedFiles);
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de l’activation du compte.' });
  } finally {
    client?.release();
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await UserModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    const canManagePayments = await UserModel.canManagePaymentAccounts(req.user.id);
    res.json({
      ...user,
      payment_accounts: canManagePayments ? await UserModel.getPaymentAccounts(req.user.id) : []
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération du profil' });
  }
};

const getLoginHistory = async (req, res) => {
  try {
    const history = await UserModel.getLoginHistory(req.user.id);
    res.json(history);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l’historique' });
  }
};

const getPaymentAccounts = async (req, res) => {
  try {
    if (!await UserModel.canManagePaymentAccounts(req.user.id)) {
      return res.status(403).json({ error: 'La configuration des moyens de paiement est réservée aux acteurs de transport et de chargement.' });
    }
    res.json(await UserModel.getPaymentAccounts(req.user.id));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Impossible de récupérer les moyens de paiement.' });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { nom, email, ville, telephone_whatsapp, avatar_url } = req.body;
    const description = typeof req.body.description === 'string' ? req.body.description.trim().slice(0, 2000) : undefined;
    const normalizedPhone = telephone_whatsapp ? telephone_whatsapp.replace(/\D/g, '') : undefined;
    const updatedUser = await UserModel.updateProfile(req.user.id, {
      nom, email, ville, telephone_whatsapp: normalizedPhone, avatar_url,
      description: ['TRANSPORTEUR', 'ENTREPRISE', 'CHAUFFEUR'].includes(req.user.role) ? description : undefined
    });

    if (!updatedUser) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const canManagePayments = await UserModel.canManagePaymentAccounts(req.user.id);
    const profile = {
      ...updatedUser,
      payment_accounts: canManagePayments ? await UserModel.getPaymentAccounts(req.user.id) : []
    };
    await publishProfileUpdate(profile);
    res.json(profile);
  } catch (error) {
    console.error(error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Cette adresse email est déjà utilisée.' });
    }
    res.status(500).json({ error: 'Erreur lors de la mise à jour du profil' });
  }
};

const updateNewsletterConsent = async (req, res) => {
  if (typeof req.body?.newsletter_consent !== 'boolean') {
    return res.status(400).json({ error: 'Le choix de réception des newsletters doit être indiqué.' });
  }
  try {
    const user = await UserModel.setNewsletterConsent(req.user.id, req.body.newsletter_consent);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    await publishProfileUpdate(user);
    res.json({
      newsletter_consent: Boolean(user.newsletter_consent_at),
      newsletter_consent_at: user.newsletter_consent_at
    });
  } catch (error) {
    console.error('Erreur updateNewsletterConsent:', error);
    res.status(500).json({ error: 'Impossible d’enregistrer votre préférence newsletter.' });
  }
};

const unsubscribeNewsletter = async (req, res) => {
  if (typeof req.body?.token !== 'string' || !req.body.token) {
    return res.status(400).json({ error: 'Ce lien de désabonnement est invalide ou expiré.' });
  }
  try {
    const userId = verifyNewsletterUnsubscribeToken(req.body.token);
    await UserModel.setNewsletterConsent(userId, false);
    res.json({ message: 'Votre désabonnement a bien été pris en compte.' });
  } catch (error) {
    if (error.message === 'Jeton de désabonnement invalide ou expiré.') {
      return res.status(400).json({ error: 'Ce lien de désabonnement est invalide ou expiré.' });
    }
    console.error('Erreur unsubscribeNewsletter:', error);
    res.status(500).json({ error: 'Impossible de traiter le désabonnement.' });
  }
};

const savePaymentAccount = async (req, res) => {
  try {
    if (!await UserModel.canManagePaymentAccounts(req.user.id)) {
      return res.status(403).json({ error: 'La configuration des moyens de paiement est réservée aux acteurs de transport et de chargement.' });
    }

    const method = req.params.method;
    if (!['WAVE', 'ORANGE_MONEY', 'PAYPAL', 'BANQUE'].includes(method)) {
      return res.status(400).json({ error: 'Choisissez Wave, Orange Money, PayPal ou un compte bancaire.' });
    }

    const holder = String(req.body.holder || '').trim().slice(0, 255);
    const identifier = String(req.body.identifier || '').trim().slice(0, 120);
    const bank = method === 'BANQUE' ? String(req.body.bank || '').trim().slice(0, 150) : '';
    const canReceive = req.body.can_receive === true;
    const canSend = req.body.can_send === true;
    const isDefaultReceive = req.body.is_default_receive === true;
    const isDefaultSend = req.body.is_default_send === true;

    if (!holder || !identifier) {
      return res.status(400).json({ error: 'Renseignez le titulaire et les coordonnées du moyen de paiement.' });
    }
    if ((isDefaultReceive && !canReceive) || (isDefaultSend && !canSend)) {
      return res.status(400).json({ error: 'Un moyen par défaut doit être activé pour cette opération.' });
    }
    if (method === 'PAYPAL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
      return res.status(400).json({ error: 'Saisissez une adresse e-mail PayPal valide.' });
    }
    if (['WAVE', 'ORANGE_MONEY'].includes(method) && !/^\+\d{1,3}\d{6,14}$/.test(identifier.replace(/\s/g, ''))) {
      return res.status(400).json({ error: 'Saisissez un numéro de téléphone avec son indicatif international.' });
    }

    const result = await UserModel.savePaymentAccount(req.user.id, {
      method,
      holder,
      identifier,
      bank,
      can_receive: canReceive,
      can_send: canSend,
      is_default_receive: isDefaultReceive,
      is_default_send: isDefaultSend
    });
    await publishProfileUpdate({ ...result.user, payment_accounts: result.accounts });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Impossible d’enregistrer ce moyen de paiement.' });
  }
};

const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucune photo sélectionnée.' });
    }

    const avatar_url = `/uploads/${req.file.filename}`;
    const user = await UserModel.updateProfile(req.user.id, { avatar_url });
    if (user) await publishProfileUpdate(user);
    res.json({ avatar_url, user });
  } catch (error) {
    console.error(error);
    if (error.code === '42703') {
      return res.status(500).json({ error: 'La structure du profil est incomplète. Redémarrez le service Auth pour appliquer la migration.' });
    }
    res.status(500).json({ error: 'Erreur lors de l’enregistrement de la photo.' });
  }
};

const changePassword = async (req, res) => {
  try {
    const { ancien_mot_de_passe, nouveau_mot_de_passe } = req.body;
    if (!ancien_mot_de_passe || !nouveau_mot_de_passe || nouveau_mot_de_passe.length < 6) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' });
    }

    const user = await UserModel.findPasswordById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    }

    const valid = await bcrypt.compare(ancien_mot_de_passe, user.mot_de_passe);
    if (!valid) {
      return res.status(400).json({ error: 'L’ancien mot de passe est incorrect.' });
    }

    const passwordHash = await bcrypt.hash(nouveau_mot_de_passe, 10);
    await UserModel.updatePassword(req.user.id, passwordHash);
    res.json({ message: 'Mot de passe modifié avec succès.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la modification du mot de passe.' });
  }
};

const inviteChauffeur = async (req, res) => {
  let chauffeurId;
  try {
    const { nom, email, telephone_whatsapp, ville } = req.body;
    
    if (req.user.role !== 'TRANSPORTEUR' && req.user.role !== 'ENTREPRISE') {
      return res.status(403).json({ error: 'Seul un transporteur ou une entreprise peut inviter un chauffeur.' });
    }
    
    if (!nom || !email || !telephone_whatsapp || !ville) {
      return res.status(400).json({ error: 'Nom, e-mail, téléphone et ville sont requis pour inviter un chauffeur.' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: ownerRows } = await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE;', [req.user.id]);
      if (!ownerRows[0]) throw Object.assign(new Error('Compte transporteur introuvable.'), { statusCode: 404 });
      await assertCanAddDriver(client, req.user.id);
      const { rows: existingUser } = await client.query(
        'SELECT id FROM users WHERE telephone_whatsapp = $1 OR LOWER(email) = LOWER($2)',
        [telephone_whatsapp, email]
      );
      if (existingUser.length > 0) {
        throw Object.assign(new Error('Un utilisateur avec cet e-mail ou ce numéro de téléphone existe déjà.'), { statusCode: 409 });
      }
      const { rows } = await client.query(`
        INSERT INTO users (nom, email, telephone_whatsapp, ville, role, statut_verification, invitation_token_hash, invitation_expires_at, employeur_id, mot_de_passe)
        VALUES ($1, $2, $3, $4, 'CHAUFFEUR', 'EN_ATTENTE', $5, $6, $7, 'NOT_SET_YET') RETURNING id
      `, [nom, email, telephone_whatsapp, ville, tokenHash, expiresAt, req.user.id]);
      chauffeurId = rows[0].id;
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    const inviteLink = `${frontendUrl}/invitation?token=${rawToken}`;
    try {
      const sent = await sendConfiguredMail({
        to: email,
        subject: 'Invitation à rejoindre une flotte Translink-Africa',
        text: `Bonjour ${nom},\n\nVous avez été invité à rejoindre la flotte de ${req.user.nom || 'votre employeur'} sur Translink-Africa.\n\nOuvrez ce lien pour créer votre mot de passe et activer votre compte : ${inviteLink}\n\nCe lien expirera dans 48 heures.\n\nL’équipe Translink-Africa`,
        html: renderMailTemplate({
          title: 'Invitation à rejoindre une flotte',
          name: nom,
          intro: `Vous avez été invité à rejoindre la flotte de ${req.user.nom || 'votre employeur'} sur Translink-Africa.`,
          content: '<p style="margin:0;color:#526772;font-size:14px;line-height:1.6">Ce lien personnel expirera dans 48 heures.</p>',
          actionLabel: 'Activer mon compte',
          actionUrl: inviteLink
        })
      });
      if (!sent) throw new Error('Le service d’e-mail des invitations n’est pas configuré.');
    } catch (mailError) {
      console.error('Échec de l’envoi de l’invitation chauffeur:', mailError);
      try {
        await db.query('DELETE FROM users WHERE id = $1 AND invitation_token_hash = $2', [chauffeurId, tokenHash]);
      } catch (rollbackError) {
        console.error('Impossible de supprimer le compte chauffeur après échec SMTP:', rollbackError);
        return res.status(500).json({
          error: 'L’e-mail n’a pas pu être envoyé et le compte temporaire n’a pas pu être supprimé. Contactez le support.',
        });
      }
      return res.status(503).json({
        error: 'L’e-mail d’invitation n’a pas pu être envoyé. Vérifiez la configuration E-mail SMTP dans les intégrations administrateur puis réessayez.',
      });
    }

    res.status(201).json({
      message: 'Chauffeur invité avec succès. Un e-mail contenant son lien d’activation lui a été envoyé.',
      chauffeurId,
      invitationSent: true,
    });
  } catch (error) {
    console.error('Erreur inviteChauffeur:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Erreur lors de l\'invitation du chauffeur.' });
  }
};

const getMyChauffeurs = async (req, res) => {
  if (req.user.role !== 'TRANSPORTEUR' && req.user.role !== 'ENTREPRISE') {
    return res.status(403).json({ error: 'Seul un transporteur ou une entreprise peut consulter ses chauffeurs.' });
  }

  try {
    const { rows } = await db.query(
      `SELECT id, nom, email, telephone_whatsapp, ville, statut_verification, date_creation
       FROM users
       WHERE employeur_id = $1 AND role = 'CHAUFFEUR'
       ORDER BY date_creation DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Erreur getMyChauffeurs:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des chauffeurs.' });
  }
};

const updateChauffeurStatus = async (req, res) => {
  if (!['TRANSPORTEUR', 'ENTREPRISE'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Seul un transporteur ou une entreprise peut gérer ses chauffeurs.' });
  }

  const { id } = req.params;
  const { statut } = req.body;
  if (!['VALIDE', 'SUSPENDU'].includes(statut)) {
    return res.status(400).json({ error: 'Le statut demandé n’est pas autorisé.' });
  }

  try {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: drivers } = await client.query(
        `SELECT chauffeur.id, chauffeur.nom, chauffeur.email, employer.nom AS employeur_nom
           FROM users chauffeur
           JOIN users employer ON employer.id = chauffeur.employeur_id
           WHERE chauffeur.id = $1 AND chauffeur.employeur_id = $2 AND chauffeur.role = 'CHAUFFEUR'
           FOR UPDATE`,
          [id, req.user.id]
        );
        const chauffeur = drivers[0];
        if (!chauffeur) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Ce chauffeur est introuvable dans votre flotte.' });
        }

      if (statut === 'SUSPENDU') {
        const { rows: missions } = await client.query(
          `SELECT
             EXISTS (SELECT 1 FROM courses WHERE chauffeur_assigne_id = $1 AND statut <> 'SOLDE_REGLE')
             OR EXISTS (SELECT 1 FROM camions WHERE chauffeur_id = $1 AND statut = 'EN_MISSION')
             AS active_mission`,
          [id]
        );
        if (missions[0].active_mission) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'Ce chauffeur participe à une mission en cours. Terminez la mission avant de suspendre son compte.' });
        }
      }

      let notificationEmailSent = false;
      const suspended = statut === 'SUSPENDU';
      if (suspended) {
        if (chauffeur.email) {
          try {
            notificationEmailSent = await sendChauffeurAccountNotice({
              chauffeur,
              employerName: chauffeur.employeur_nom,
              suspended: true,
            });
          } catch (mailError) {
            console.error('Échec de l’envoi de la notification de suspension chauffeur:', mailError);
          }
        }
        if (!notificationEmailSent) {
          await client.query('ROLLBACK');
          return res.status(503).json({ error: 'La suspension est annulée car l’e-mail de notification n’a pas pu être envoyé. Vérifiez l’adresse du chauffeur et la configuration SMTP puis réessayez.' });
        }
      }

      const { rows } = await client.query(
        `UPDATE users SET statut_verification = $1
         WHERE id = $2 AND employeur_id = $3 AND role = 'CHAUFFEUR'
         RETURNING id, nom, statut_verification`,
        [statut, id, req.user.id]
      );
      const noticeMessage = suspended
        ? `Votre compte chauffeur a été suspendu par ${chauffeur.employeur_nom}. Vous ne pouvez plus accéder à votre espace tant que la suspension n’est pas levée.`
        : `La suspension de votre compte chauffeur a été levée par ${chauffeur.employeur_nom}. Vous pouvez de nouveau accéder à votre espace.`;
      await client.query(
        'INSERT INTO notifications (utilisateur_id, titre, message) VALUES ($1, $2, $3);',
        [id, suspended ? 'Compte suspendu' : 'Suspension levée', noticeMessage]
      );
      await client.query('COMMIT');
      if (!suspended && chauffeur.email) {
        try {
          notificationEmailSent = await sendChauffeurAccountNotice({
            chauffeur,
            employerName: chauffeur.employeur_nom,
            suspended: false,
          });
        } catch (mailError) {
          console.error('Échec de l’envoi de la notification de statut chauffeur:', mailError);
        }
      }
      const emailNotice = notificationEmailSent
        ? ' Un e-mail de notification a également été envoyé.'
        : ' La notification est enregistrée dans son compte, mais l’e-mail n’a pas pu être envoyé.';
      return res.json({
        chauffeur: rows[0],
        notificationEmailSent,
        message: `${suspended ? 'Compte chauffeur suspendu.' : 'Suspension du compte chauffeur levée.'}${emailNotice}`,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erreur updateChauffeurStatus:', error);
    return res.status(500).json({ error: 'Impossible de modifier le statut de ce chauffeur.' });
  }
};

const deleteChauffeur = async (req, res) => {
  if (!['TRANSPORTEUR', 'ENTREPRISE'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Seul un transporteur ou une entreprise peut gérer ses chauffeurs.' });
  }

  const { id } = req.params;
  try {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: drivers } = await client.query(
        `SELECT chauffeur.id, chauffeur.nom, chauffeur.email, employer.nom AS employeur_nom
         FROM users chauffeur
         JOIN users employer ON employer.id = chauffeur.employeur_id
         WHERE chauffeur.id = $1 AND chauffeur.employeur_id = $2 AND chauffeur.role = 'CHAUFFEUR'
         FOR UPDATE`,
        [id, req.user.id]
      );
      const chauffeur = drivers[0];
      if (!chauffeur) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Ce chauffeur est introuvable dans votre flotte.' });
      }

      const { rows: missions } = await client.query(
        `SELECT
           EXISTS (SELECT 1 FROM courses WHERE chauffeur_assigne_id = $1 AND statut <> 'SOLDE_REGLE')
           OR EXISTS (SELECT 1 FROM camions WHERE chauffeur_id = $1 AND statut = 'EN_MISSION')
           AS active_mission`,
        [id]
      );
      if (missions[0].active_mission) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Ce chauffeur participe à une mission en cours. Terminez la mission avant de supprimer son compte.' });
      }

      if (!chauffeur.email) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Ce chauffeur n’a pas d’adresse e-mail. Ajoutez-en une avant de supprimer son compte afin de le notifier.' });
      }
      let notificationSent = false;
      try {
        notificationSent = await sendConfiguredMail({
          to: chauffeur.email,
          subject: 'Translink-Africa - Suppression de votre compte chauffeur',
          text: `Bonjour ${chauffeur.nom},\n\n${chauffeur.employeur_nom} a supprimé votre compte chauffeur de sa flotte Translink-Africa. Ce compte ne peut plus être utilisé. Pour rejoindre de nouveau cette flotte, contactez votre transporteur ou votre entreprise.\n\nL’équipe Translink-Africa`,
          html: renderMailTemplate({
            title: 'Votre compte chauffeur a été supprimé',
            name: chauffeur.nom,
            intro: `${chauffeur.employeur_nom} a supprimé votre compte chauffeur de sa flotte Translink-Africa. Ce compte ne peut plus être utilisé.`,
            content: '<p style="margin:0;color:#526772;font-size:15px;line-height:1.7">Pour rejoindre de nouveau cette flotte, contactez votre transporteur ou votre entreprise.</p>',
          }),
        });
      } catch (mailError) {
        console.error('Échec de l’envoi de la notification de suppression chauffeur:', mailError);
      }
      if (!notificationSent) {
        await client.query('ROLLBACK');
        return res.status(503).json({ error: 'La suppression est annulée car l’e-mail de notification n’a pas pu être envoyé. Vérifiez la configuration SMTP puis réessayez.' });
      }

      await client.query('DELETE FROM users WHERE id = $1 AND employeur_id = $2 AND role = \'CHAUFFEUR\';', [id, req.user.id]);
      await client.query('COMMIT');
      return res.json({ message: 'Compte chauffeur supprimé. Un e-mail de notification a été envoyé au chauffeur.' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erreur deleteChauffeur:', error);
    return res.status(500).json({ error: 'Impossible de supprimer ce compte chauffeur.' });
  }
};

module.exports = {
  register,
  login,
  getInvitation,
  completeInvitation,
  getProfile,
  updateNewsletterConsent,
  unsubscribeNewsletter,
  getLoginHistory,
  getPaymentAccounts,
  updateProfile,
  savePaymentAccount,
  uploadAvatar,
  changePassword,
  inviteChauffeur,
  getMyChauffeurs,
  updateChauffeurStatus,
  deleteChauffeur
};
