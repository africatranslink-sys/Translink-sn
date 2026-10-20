const nodemailer = require('nodemailer');
const db = require('../config/db');
const { createMailTransporter } = require('../../../shared/mailTransporter');
const { escapeHtml, renderMailTemplate } = require('../../../shared/mailTemplate');

const sendMail = async ({ email, subject, title, name, intro, content }) => {
  if (!email) return false;
  try {
    const smtp = await createMailTransporter(db, nodemailer);
    if (!smtp) return false;
    await smtp.transporter.sendMail({
      from: smtp.from,
      to: email,
      subject,
      text: `${intro}\n\n${content.replace(/<[^>]*>/g, ' ')}`,
      html: renderMailTemplate({ title, name, intro, content }),
    });
    return true;
  } catch (error) {
    console.warn(`E-mail annonce non envoyé à ${email}:`, error.message);
    return false;
  }
};

const sendAnnouncementPublishedEmail = ({ email, name, offer }) => sendMail({
  email,
  name,
  subject: `Translink-Africa - Nouvelle offre ${offer.ville_depart} → ${offer.ville_arrivee}`,
  title: 'Nouvelle annonce de transport',
  intro: 'Une nouvelle annonce vient d’être publiée sur Translink-Africa.',
  content: `<p><strong>Trajet :</strong> ${escapeHtml(offer.ville_depart)} → ${escapeHtml(offer.ville_arrivee)}</p><p><strong>Marchandise :</strong> ${escapeHtml(offer.nature_marchandise)}</p><p><strong>Tonnage :</strong> ${escapeHtml(offer.tonnage)} tonnes</p><p><strong>Date prévue :</strong> ${escapeHtml(offer.date_chargement)}</p>`,
});

const sendAnnouncementRemovedEmail = ({ email, name, offer, reason }) => sendMail({
  email,
  name,
  subject: 'Translink-Africa - Votre annonce a été retirée',
  title: 'Annonce retirée de la plateforme',
  intro: 'L’administration a retiré cette annonce de la plateforme.',
  content: `<p><strong>Trajet :</strong> ${escapeHtml(offer.ville_depart)} → ${escapeHtml(offer.ville_arrivee)}</p><p><strong>Motif :</strong> ${escapeHtml(reason)}</p><p>Vous pouvez contacter l’assistance si vous souhaitez obtenir des précisions.</p>`,
});

module.exports = { sendAnnouncementPublishedEmail, sendAnnouncementRemovedEmail };