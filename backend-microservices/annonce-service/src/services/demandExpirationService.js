const db = require('../config/db');

const BATCH_SIZE = 50;
const SWEEP_INTERVAL_MS = 60_000;

async function runExpirationSweep() {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: expiredDemands } = await client.query(`
      SELECT d.*
      FROM demandes_transport d
      WHERE d.statut = 'PUBLIEE'
        AND d.suppression_prevue_le IS NULL
        AND d.date_chargement + COALESCE(d.heure_chargement, TIME '23:59:59') <= LOCALTIMESTAMP
        AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.demande_id = d.id)
      ORDER BY d.date_chargement, d.id
      LIMIT $1
      FOR UPDATE OF d SKIP LOCKED;
    `, [BATCH_SIZE]);

    for (const demande of expiredDemands) {
      await client.query(`
        UPDATE demandes_transport
        SET expiration_notifiee_at = LOCALTIMESTAMP,
            suppression_prevue_le = LOCALTIMESTAMP + INTERVAL '1 hour'
        WHERE id = $1;
      `, [demande.id]);
      await client.query(`
        INSERT INTO notifications (utilisateur_id, titre, message, action_url, action_label)
        VALUES ($1, $2, $3, $4, $5);
      `, [
        demande.chargeur_id,
        'Votre annonce va être supprimée',
        `La date de chargement de votre annonce ${demande.ville_depart} → ${demande.ville_arrivee} est passée. Elle sera supprimée dans une heure. Modifiez la date et renouvelez-la pour la republier.`,
        `/chargeur/demande?renouveler=${demande.id}`,
        'Modifier la date et renouveler',
      ]);
    }

    const { rows: deletionCandidates } = await client.query(`
      SELECT d.*, u.nom AS chargeur_nom, u.email AS chargeur_email
      FROM demandes_transport d
      LEFT JOIN users u ON u.id = d.chargeur_id
      WHERE d.statut = 'PUBLIEE'
        AND d.suppression_prevue_le <= LOCALTIMESTAMP
        AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.demande_id = d.id)
      ORDER BY d.suppression_prevue_le, d.id
      LIMIT $1
      FOR UPDATE OF d SKIP LOCKED;
    `, [BATCH_SIZE]);

    for (const demande of deletionCandidates) {
      await client.query(`
        INSERT INTO annonces_moderation_archive
          (annonce_id, chargeur_id, chargeur_nom, chargeur_email, motif, annonce_data, supprime_par)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, NULL);
      `, [
        demande.id,
        demande.chargeur_id,
        demande.chargeur_nom,
        demande.chargeur_email,
        'Suppression automatique après expiration de la date de chargement',
        JSON.stringify(demande),
      ]);
      await client.query('DELETE FROM demandes_transport WHERE id = $1;', [demande.id]);
    }

    await client.query('COMMIT');
    if (expiredDemands.length || deletionCandidates.length) {
      console.log(`Expiration annonces : ${expiredDemands.length} notification(s), ${deletionCandidates.length} suppression(s).`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Échec du traitement des annonces expirées :', error.message);
  } finally {
    client.release();
  }
}

function startDemandExpirationService() {
  let running = false;
  const sweep = async () => {
    if (running) return;
    running = true;
    try {
      await runExpirationSweep();
    } finally {
      running = false;
    }
  };
  void sweep();
  const interval = setInterval(sweep, SWEEP_INTERVAL_MS);
  return () => clearInterval(interval);
}

module.exports = { runExpirationSweep, startDemandExpirationService };
