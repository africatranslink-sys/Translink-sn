const nodemailer = require('nodemailer');
const db = require('../config/db');
const { createMailTransporter } = require('../../../shared/mailTransporter');
const { escapeHtml, renderMailTemplate } = require('../../../shared/mailTemplate');
const { createNewsletterUnsubscribeToken } = require('../../../shared/newsletterToken');
const { validateCampaign } = require('../../../shared/newsletterCampaign');

const getEligibleCount = async () => {
  const { rows } = await db.query(
    `SELECT COUNT(*)::INTEGER AS count
     FROM users
     WHERE newsletter_consent_at IS NOT NULL
       AND email IS NOT NULL
       AND BTRIM(email) <> '';`
  );
  return rows[0].count;
};

const campaignStatusQuery = `
  SELECT id, subject, status, recipient_count, processed_count, sent_count,
         failed_count, skipped_count, error_message, created_at, completed_at
  FROM newsletter_campaigns
`;

const renderPersonalized = (value, user) => value
  .replace(/\{\{\s*nom\s*\}\}/gi, user.nom || 'utilisateur')
  .replace(/\{\{\s*email\s*\}\}/gi, user.email || '');

const createUnsubscribeUrl = (userId) => {
  const baseUrl = (process.env.FRONTEND_URL || 'https://translink-africa.servehttp.com').replace(/\/+$/, '');
  const token = createNewsletterUnsubscribeToken(userId);
  return `${baseUrl}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
};

const sendToUser = async (transporter, from, campaign, user) => {
  if (!user.id) return false;
  const { rows } = await db.query(
    'SELECT id, nom, email, newsletter_consent_at FROM users WHERE id = $1;',
    [user.id]
  );
  const currentUser = rows[0];
  if (!currentUser?.newsletter_consent_at || !currentUser.email?.trim()) return false;
  const subject = campaign.subject;
  const message = renderPersonalized(campaign.message, currentUser);
  const unsubscribeUrl = createUnsubscribeUrl(currentUser.id);
  const safeMessage = escapeHtml(message).replace(/\r?\n/g, '<br>');
  const unsubscribeHtml = `<p style="margin-top:28px;color:#71818a;font-size:12px;line-height:1.6">Vous recevez ce message car votre compte Translink-Africa est inscrit aux communications par e-mail. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#526772">Se désabonner</a>.</p>`;
  await transporter.sendMail({
    from,
    to: currentUser.email,
    subject,
    text: `Bonjour ${currentUser.nom || 'utilisateur'},\n\n${message}\n\nVous recevez ce message car votre compte Translink-Africa est inscrit aux communications par e-mail.\nPour vous désabonner, ouvrez : ${unsubscribeUrl}`,
    html: renderMailTemplate({
      title: subject,
      name: currentUser.nom,
      intro: 'Une communication de Translink-Africa vous est adressée.',
      content: `<div style="color:#526772;font-size:15px;line-height:1.7">${safeMessage}</div>${unsubscribeHtml}`
    })
  });
};

const runCampaign = async (campaign, transporter, from) => {
  const campaignId = campaign.id;
  let lastRecipientId = 0;
  let processed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  try {
    while (true) {
      const { rows: recipients } = await db.query(
        `SELECT campaign_recipients.id AS recipient_id, users.id, users.nom, users.email
         FROM newsletter_campaign_recipients AS campaign_recipients
         LEFT JOIN users ON users.id = campaign_recipients.user_id
         WHERE campaign_recipients.campaign_id = $1
           AND campaign_recipients.id > $2
         ORDER BY campaign_recipients.id
         LIMIT 50;`,
        [campaignId, lastRecipientId]
      );
      if (!recipients.length) break;
      lastRecipientId = recipients[recipients.length - 1].recipient_id;

      for (let index = 0; index < recipients.length; index += 5) {
        const batch = recipients.slice(index, index + 5);
        const results = await Promise.allSettled(batch.map((user) => sendToUser(transporter, from, campaign, user)));
        for (let resultIndex = 0; resultIndex < results.length; resultIndex += 1) {
          const result = results[resultIndex];
          if (result.status === 'rejected') failed += 1;
          else if (result.value) sent += 1;
          else skipped += 1;
        }
        processed += batch.length;
        await db.query(
          `UPDATE newsletter_campaigns
           SET processed_count = $1, sent_count = $2, failed_count = $3, skipped_count = $4
           WHERE id = $5 AND status = 'EN_COURS';`,
          [processed, sent, failed, skipped, campaignId]
        );
      }
    }

    const status = failed === 0 ? 'TERMINE' : sent === 0 ? 'ECHEC' : 'PARTIEL';
    await db.query(
      `UPDATE newsletter_campaigns
       SET status = $1,
           processed_count = $2,
           sent_count = $3,
           failed_count = $4,
           skipped_count = $5,
           error_message = CASE WHEN $4 > 0 THEN 'Certains messages n’ont pas pu être envoyés via SMTP.' ELSE NULL END,
           completed_at = CURRENT_TIMESTAMP
       WHERE id = $6;`,
      [status, processed, sent, failed, skipped, campaignId]
    );
  } catch (error) {
    console.error(`Erreur pendant le publipostage ${campaignId}:`, error.message);
    await db.query(
      `UPDATE newsletter_campaigns
       SET status = 'ECHEC', processed_count = $1, sent_count = $2,
           failed_count = GREATEST(recipient_count - $1, $3), skipped_count = $4,
           error_message = 'L’envoi a été interrompu. Consultez la configuration SMTP puis relancez une campagne.',
           completed_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND status = 'EN_COURS';`,
      [processed, sent, failed, skipped, campaignId]
    );
  } finally {
    transporter.close();
  }
};

const getAudience = async (req, res) => {
  try {
    res.json({ eligible_count: await getEligibleCount() });
  } catch (error) {
    console.error('Erreur de lecture de l’audience newsletter:', error.message);
    res.status(500).json({ error: 'Impossible de compter les destinataires consentants.' });
  }
};

const getCampaigns = async (req, res) => {
  try {
    const { rows } = await db.query(`${campaignStatusQuery} ORDER BY created_at DESC LIMIT 10;`);
    res.json(rows);
  } catch (error) {
    console.error('Erreur de lecture des campagnes newsletter:', error.message);
    res.status(500).json({ error: 'Impossible de récupérer l’historique des campagnes.' });
  }
};

const getCampaign = async (req, res) => {
  try {
    const { rows } = await db.query(`${campaignStatusQuery} WHERE id = $1;`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Campagne introuvable.' });
    res.json(rows[0]);
  } catch (error) {
    console.error('Erreur de lecture du statut de campagne:', error.message);
    res.status(500).json({ error: 'Impossible de récupérer le statut de la campagne.' });
  }
};

const createCampaign = async (req, res) => {
  const { subject, message } = req.body || {};
  const validationError = validateCampaign({ subject, message });
  if (validationError) return res.status(400).json({ error: validationError });
  if (req.body?.confirmed !== true || !Number.isSafeInteger(req.body?.confirmed_recipient_count)) {
    return res.status(400).json({ error: 'Confirmez explicitement l’envoi avant de créer la campagne.' });
  }

  let smtp;
  let client;
  try {
    smtp = await createMailTransporter(db, nodemailer);
    if (!smtp) return res.status(503).json({ error: 'Le service SMTP n’est pas configuré.' });

    client = await db.pool.connect();
    await client.query('BEGIN');
    const { rows: countRows } = await client.query(
      `SELECT COUNT(*)::INTEGER AS count
       FROM users
       WHERE newsletter_consent_at IS NOT NULL
         AND email IS NOT NULL
         AND BTRIM(email) <> '';`
    );
    const recipientCount = countRows[0].count;
    if (!recipientCount) {
      await client.query('ROLLBACK');
      client.release();
      client = null;
      smtp.transporter.close();
      return res.status(400).json({ error: 'Aucun utilisateur n’a accepté la newsletter.' });
    }
    if (recipientCount !== req.body.confirmed_recipient_count) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Le nombre de destinataires a changé. Actualisez le compteur et confirmez de nouveau.' });
    }

    const { rows } = await client.query(
      `INSERT INTO newsletter_campaigns (subject, message, recipient_count, created_by)
       VALUES ($1, $2, 0, $3)
       RETURNING id, subject, message, status, recipient_count, processed_count, sent_count, failed_count, skipped_count, created_at;`,
      [subject.trim(), message.trim(), req.user.id]
    );
    const campaign = rows[0];
    const { rowCount } = await client.query(
      `INSERT INTO newsletter_campaign_recipients (campaign_id, user_id)
       SELECT $1, id
       FROM users
       WHERE newsletter_consent_at IS NOT NULL
         AND email IS NOT NULL
         AND BTRIM(email) <> ''
       ON CONFLICT DO NOTHING;`,
      [campaign.id]
    );
    if (rowCount !== recipientCount) {
      await client.query('ROLLBACK');
      client.release();
      client = null;
      smtp.transporter.close();
      return res.status(409).json({ error: 'Le nombre de destinataires a changé. Actualisez le compteur et confirmez de nouveau.' });
    }
    await client.query('UPDATE newsletter_campaigns SET recipient_count = $1 WHERE id = $2;', [rowCount, campaign.id]);
    campaign.recipient_count = rowCount;
    await client.query('COMMIT');
    client.release();
    client = null;
    setImmediate(() => { void runCampaign(campaign, smtp.transporter, smtp.from); });
    res.status(202).json(campaign);
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
    if (smtp?.transporter) smtp.transporter.close();
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Une campagne est déjà en cours d’envoi.' });
    }
    console.error('Erreur de création de campagne newsletter:', error.message);
    res.status(500).json({ error: 'Impossible de démarrer la campagne.' });
  }
};

module.exports = { getAudience, getCampaigns, getCampaign, createCampaign };
