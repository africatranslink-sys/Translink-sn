const db = require('../config/db');
const { sendSubscriptionReminderEmail } = require('./mailService');

const REMINDER_LOCK_ID = 732041911;

const queueDueReminders = async (client) => {
  await client.query(`
    INSERT INTO subscription_reminder_emails (
      reminder_key, reminder_type, utilisateur_id, abonnement_id, date_echeance
    )
    SELECT
      'trial:' || u.id || ':' || u.date_fin_essai::date,
      'TRIAL_ENDING', u.id, NULL, u.date_fin_essai
    FROM users u
    WHERE u.statut_verification = 'VALIDE'
      AND u.role IN ('CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR')
      AND u.email IS NOT NULL AND BTRIM(u.email) <> ''
      AND u.date_debut_essai IS NOT NULL
      AND u.date_fin_essai > CURRENT_TIMESTAMP
      AND u.date_fin_essai <= CURRENT_TIMESTAMP + INTERVAL '5 days'
      AND NOT EXISTS (
        SELECT 1 FROM abonnements s
        WHERE s.utilisateur_id = u.id AND s.statut = 'ACTIF' AND s.date_fin > CURRENT_TIMESTAMP
      )
    ON CONFLICT (reminder_key) DO NOTHING;
  `);

  await client.query(`
    INSERT INTO subscription_reminder_emails (
      reminder_key, reminder_type, utilisateur_id, abonnement_id, date_echeance
    )
    SELECT
      'subscription:' || s.id || ':' || s.date_fin::date,
      'SUBSCRIPTION_RENEWAL', u.id, s.id, s.date_fin
    FROM abonnements s
    JOIN users u ON u.id = s.utilisateur_id
    WHERE s.statut = 'ACTIF'
      AND s.date_debut <= CURRENT_TIMESTAMP
      AND s.date_fin > CURRENT_TIMESTAMP
      AND s.date_fin <= CURRENT_TIMESTAMP + INTERVAL '5 days'
      AND u.statut_verification = 'VALIDE'
      AND u.email IS NOT NULL AND BTRIM(u.email) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM abonnements newer
        WHERE newer.utilisateur_id = s.utilisateur_id
          AND newer.statut = 'ACTIF'
          AND newer.date_debut >= s.date_fin
      )
    ON CONFLICT (reminder_key) DO NOTHING;
  `);
};

const sendPendingReminders = async (client) => {
  const { rows } = await client.query(`
    SELECT reminder.reminder_key, reminder.reminder_type,
           reminder.date_echeance, user_record.email, user_record.nom,
           subscription.plan AS plan
    FROM subscription_reminder_emails reminder
    JOIN users user_record ON user_record.id = reminder.utilisateur_id
    LEFT JOIN abonnements subscription ON subscription.id = reminder.abonnement_id
    WHERE reminder.status = 'PENDING'
    ORDER BY reminder.created_at
    LIMIT 100;
  `);

  for (const reminder of rows) {
    const delivered = await sendSubscriptionReminderEmail({
      email: reminder.email,
      name: reminder.nom,
      reminderType: reminder.reminder_type,
      plan: reminder.plan,
      expiresAt: reminder.date_echeance,
    });
    await client.query(`
      UPDATE subscription_reminder_emails
      SET status = CASE WHEN $2 THEN 'SENT' ELSE 'PENDING' END,
          attempts = attempts + 1,
          last_error = CASE WHEN $2 THEN NULL ELSE 'Échec d’envoi SMTP; nouvelle tentative planifiée.' END,
          sent_at = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE sent_at END,
          updated_at = CURRENT_TIMESTAMP
      WHERE reminder_key = $1 AND status = 'PENDING';
    `, [reminder.reminder_key, delivered]);
  }
};

const runSubscriptionReminderJob = async () => {
  const client = await db.pool.connect();
  let lockAcquired = false;
  try {
    const lockResult = await client.query('SELECT pg_try_advisory_lock($1) AS acquired;', [REMINDER_LOCK_ID]);
    lockAcquired = lockResult.rows[0]?.acquired === true;
    if (!lockAcquired) return;
    await queueDueReminders(client);
    await sendPendingReminders(client);
  } catch (error) {
    console.error('Échec de la tâche de rappels d’abonnement:', error.message);
  } finally {
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock($1);', [REMINDER_LOCK_ID]);
      } catch (error) {
        console.error('Impossible de libérer le verrou des rappels d’abonnement:', error.message);
      }
    }
    client.release();
  }
};

module.exports = { runSubscriptionReminderJob };
