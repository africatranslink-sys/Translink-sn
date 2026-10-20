const nodemailer = require('nodemailer');
const db = require('../config/db');
const { createMailTransporter } = require('../../../shared/mailTransporter');
const { escapeHtml, renderMailTemplate } = require('../../../shared/mailTemplate');

const sendProfileInvitation = async ({ email, name, role, token, temporaryPassword }) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const invitationUrl = `${frontendUrl}/invitation?token=${encodeURIComponent(token)}`;

  try {
    const smtp = await createMailTransporter(db, nodemailer);
    if (!smtp) {
      console.warn(`SMTP non configuré. Lien d’invitation pour ${email}: ${invitationUrl}`);
      return { invitationUrl, delivered: false, temporaryPassword };
    }
    await smtp.transporter.sendMail({
      from: smtp.from,
      to: email,
      subject: `Translink-Africa - Complétez votre profil ${name}`,
      text: `Bonjour ${name},\n\nUn compte ${role} Translink-Africa a été créé pour vous.\nMot de passe temporaire : ${temporaryPassword}\n\nComplétez vos documents ici : ${invitationUrl}\n\nAprès validation de votre compte, vous pourrez modifier ce mot de passe dans Paramètres. Ce lien expire dans 72 heures.`,
      html: renderMailTemplate({
        title: 'Bienvenue sur Translink-Africa',
        name,
        intro: `Un compte ${role} a été créé pour vous par l’administration.`,
        content: `<div style="padding:18px;background:#f3f6f8;border-radius:10px"><div style="font-size:12px;color:#526772">MOT DE PASSE TEMPORAIRE</div><div style="margin-top:8px;font-size:22px;font-weight:bold;letter-spacing:1px;color:#123b4a">${escapeHtml(temporaryPassword)}</div></div><p style="color:#526772;line-height:1.6">Ce lien est personnel et expire dans 72 heures. Après approbation, vous pourrez modifier votre mot de passe dans vos paramètres.</p>`,
        actionLabel: 'Compléter mon profil',
        actionUrl: invitationUrl
      }),
    });
    return { invitationUrl, delivered: true };
  } catch (error) {
    console.warn(`Envoi email impossible, fallback vers lien d’invitation pour ${email}:`, error.message);
    return { invitationUrl, delivered: false, temporaryPassword };
  }
};

const sendAccountStatusEmail = async ({ email, name, role, status }) => {
  if (!email) {
    console.warn(`Notification de statut non envoyée pour ${email || 'email absent'} : SMTP non configuré.`);
    return false;
  }

  const labels = {
    VALIDE: 'approuvé',
    REFUSE: 'refusé',
    SUSPENDU: 'suspendu'
  };
  const statusLabel = labels[status] || status.toLowerCase();

  try {
    const smtp = await createMailTransporter(db, nodemailer);
    if (!smtp) return false;
    await smtp.transporter.sendMail({
      from: smtp.from,
      to: email,
      subject: `Translink-Africa - Statut de votre compte : ${statusLabel}`,
      text: `Bonjour ${name || ''},\n\nVotre compte Translink-Africa (${role || 'utilisateur'}) a été ${statusLabel}.\n\nCordialement,\nL'équipe Translink-Africa`,
      html: renderMailTemplate({
        title: 'Statut de votre compte',
        name: name || 'utilisateur',
        intro: `Votre compte ${role || 'utilisateur'} a été mis à jour par l’administration.`,
        content: `<div style="display:inline-block;padding:10px 14px;background:${status === 'VALIDE' ? '#e8f7ef' : '#fff1f2'};color:${status === 'VALIDE' ? '#047857' : '#be123c'};border-radius:6px;font-weight:bold">${escapeHtml(statusLabel.toUpperCase())}</div>`
      })
    });
    return true;
  } catch (error) {
    console.warn(`Notification de statut impossible pour ${email}:`, error.message);
    return false;
  }
};

const sendAccountDeletedEmail = async ({ email, name }) => {
  if (!email) {
    console.warn(`Notification de suppression non envoyée pour ${email || 'email absent'} : SMTP non configuré.`);
    return false;
  }

  try {
    const smtp = await createMailTransporter(db, nodemailer);
    if (!smtp) return false;
    await smtp.transporter.sendMail({
      from: smtp.from,
      to: email,
      subject: 'Translink-Africa - Compte supprimé',
      text: `Bonjour ${name || ''},\n\nVotre compte Translink-Africa a été supprimé par l'administration.\n\nCordialement,\nL'équipe Translink-Africa`,
      html: renderMailTemplate({
        title: 'Compte supprimé',
        name: name || 'utilisateur',
        intro: 'Votre compte Translink-Africa a été supprimé par l’administration.',
        content: '<p style="color:#526772;line-height:1.6">Si vous pensez qu’il s’agit d’une erreur, veuillez contacter l’administration de la plateforme.</p>'
      })
    });
    return true;
  } catch (error) {
    console.warn(`Notification de suppression impossible pour ${email}:`, error.message);
    return false;
  }
};

const sendSubscriptionReminderEmail = async ({ email, name, reminderType, plan, expiresAt }) => {
  if (!email) return false;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const subscriptionUrl = `${frontendUrl}/abonnement`;
  const formattedDate = new Date(expiresAt).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Dakar',
  });
  const isTrial = reminderType === 'TRIAL_ENDING';
  const isShipper = plan === 'CHARGEUR';
  const subject = isTrial
    ? 'Translink-Africa - Votre essai gratuit arrive à échéance'
    : isShipper
      ? 'Translink-Africa - Renouvelez votre abonnement chargeur'
      : 'Translink-Africa - Pensez au renouvellement de votre abonnement';
  const intro = isTrial
    ? `Votre période d’essai gratuit se termine le ${formattedDate}.`
    : isShipper
      ? `Votre abonnement chargeur se termine le ${formattedDate}.`
      : `Votre abonnement mensuel se termine le ${formattedDate}.`;
  const content = isTrial
    ? 'À la fin de l’essai, votre compte passe à l’offre gratuite limitée à un camion opérationnel. Consultez Mon abonnement pour souscrire si vous souhaitez utiliser plusieurs camions.'
    : isShipper
      ? 'Le renouvellement n’est pas automatique. À l’échéance, vous devrez renouveler votre abonnement chargeur pour publier de nouvelles demandes de transport.'
      : 'Le renouvellement n’est pas automatique. À l’échéance, votre compte repasse à l’offre gratuite limitée à un camion opérationnel. Renouvelez depuis Mon abonnement pour continuer à utiliser plusieurs camions.';
  try {
    const smtp = await createMailTransporter(db, nodemailer);
    if (!smtp) {
      console.warn(`Rappel d’abonnement non envoyé à ${email} : SMTP non configuré.`);
      return false;
    }
    await smtp.transporter.sendMail({
      from: smtp.from,
      to: email,
      subject,
      text: `Bonjour ${name || ''},\n\n${intro}\n${content}\n\nGérer mon abonnement : ${subscriptionUrl}\n\nL’équipe Translink-Africa`,
      html: renderMailTemplate({
        title: isTrial ? 'Votre essai se termine bientôt' : 'Votre abonnement arrive à échéance',
        name: name || 'utilisateur',
        intro,
        content: `<p style="color:#526772;line-height:1.6">${escapeHtml(content)}</p>`,
        actionLabel: 'Gérer mon abonnement',
        actionUrl: subscriptionUrl,
      }),
    });
    return true;
  } catch (error) {
    console.error(`Rappel d’abonnement impossible pour ${email}:`, error.message);
    return false;
  }
};

module.exports = {
  sendProfileInvitation,
  sendAccountStatusEmail,
  sendAccountDeletedEmail,
  sendSubscriptionReminderEmail,
};
