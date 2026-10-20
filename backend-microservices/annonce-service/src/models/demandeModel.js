const db = require('../config/db');
const { assertChargeurCanPublish } = require('../../../shared/subscriptionEntitlements');

class DemandeModel {
  static async create(demande) {
    const { chargeur_id, ville_depart, ville_arrivee, nature_marchandise, tonnage, type_camion_requis, date_chargement, heure_chargement, prix_propose, exigences_particulieres, quartier_chargement, position_lng, position_lat } = demande;
    const query = `
      INSERT INTO demandes_transport 
      (chargeur_id, ville_depart, ville_arrivee, nature_marchandise, tonnage, type_camion_requis, date_chargement, heure_chargement, prix_propose, exigences_particulieres, quartier_chargement, position_lng, position_lat)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *;
    `;
    const values = [chargeur_id, ville_depart, ville_arrivee, nature_marchandise, tonnage, type_camion_requis, date_chargement, heure_chargement || null, prix_propose, exigences_particulieres || null, quartier_chargement, position_lng, position_lat];
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: userRows } = await client.query('SELECT id, role FROM users WHERE id = $1 FOR UPDATE;', [chargeur_id]);
      const user = userRows[0];
      if (!user) throw Object.assign(new Error('Compte utilisateur introuvable.'), { statusCode: 404 });
      if (user.role === 'CHARGEUR') await assertChargeurCanPublish(client, chargeur_id);
      else if (user.role !== 'ADMIN') {
        throw Object.assign(new Error('La publication de demandes est réservée aux chargeurs.'), { statusCode: 403 });
      }
      const { rows } = await client.query(query, values);
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async findActive() {
    const query = `
      SELECT d.*, u.nom as chargeur_nom, u.telephone_whatsapp as contact
      FROM demandes_transport d
      JOIN users u ON d.chargeur_id = u.id
      WHERE d.statut = 'PUBLIEE'
        AND d.suppression_prevue_le IS NULL
      ORDER BY d.date_creation DESC;
    `;
    const { rows } = await db.query(query);
    return rows;
  }

  static async findByChargeurId(chargeur_id) {
    const query = `
      SELECT d.*, c.id AS course_id, c.statut AS course_statut, c.date_creation AS course_date_creation,
             ca.plaque_immatriculation, ca.type_vehicule, ca.capacite_tonnes,
             owner.nom AS transporteur_nom, owner.telephone_whatsapp AS transporteur_telephone,
             driver.nom AS chauffeur_nom, driver.telephone_whatsapp AS chauffeur_telephone
      FROM demandes_transport d
      LEFT JOIN courses c ON c.demande_id = d.id
      LEFT JOIN camions ca ON ca.id = c.camion_id
      LEFT JOIN users owner ON owner.id = ca.proprietaire_id
      LEFT JOIN users driver ON driver.id = ca.chauffeur_id
      WHERE d.chargeur_id = $1
      ORDER BY d.date_creation DESC;
    `;
    const { rows } = await db.query(query, [chargeur_id]);
    return rows;
  }

  static async cancelPublishedByChargeur(id, chargeurId) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        'SELECT * FROM demandes_transport WHERE id = $1 AND chargeur_id = $2 FOR UPDATE;',
        [id, chargeurId]
      );
      const demande = rows[0];
      if (!demande) throw Object.assign(new Error('Cette demande est introuvable.'), { statusCode: 404 });
      if (demande.statut !== 'PUBLIEE') {
        throw Object.assign(new Error('Seules les demandes publiées sans camion affecté peuvent être annulées.'), { statusCode: 409 });
      }

      const { rows: courseRows } = await client.query(
        'SELECT id FROM courses WHERE demande_id = $1 LIMIT 1;',
        [id]
      );
      if (courseRows.length) {
        throw Object.assign(new Error('Un camion a déjà été affecté à cette demande. Elle ne peut plus être annulée.'), { statusCode: 409 });
      }

      const { rows: updatedRows } = await client.query(
        "UPDATE demandes_transport SET statut = 'ANNULEE' WHERE id = $1 RETURNING *;",
        [id]
      );
      await client.query('COMMIT');
      return updatedRows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async renewExpiredByChargeur(id, chargeurId, demande) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: userRows } = await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE;', [chargeurId]);
      if (!userRows[0]) throw Object.assign(new Error('Compte chargeur introuvable.'), { statusCode: 404 });
      await assertChargeurCanPublish(client, chargeurId);
      const { rows } = await client.query(
        'SELECT *, suppression_prevue_le > CURRENT_TIMESTAMP AS renouvellement_possible FROM demandes_transport WHERE id = $1 AND chargeur_id = $2 FOR UPDATE;',
        [id, chargeurId]
      );
      const existing = rows[0];
      if (!existing) throw Object.assign(new Error('Cette demande est introuvable.'), { statusCode: 404 });
      if (existing.statut !== 'PUBLIEE' || !existing.renouvellement_possible) {
        throw Object.assign(new Error('Le délai de renouvellement de cette annonce est terminé.'), { statusCode: 409 });
      }

      const { rows: courseRows } = await client.query(
        'SELECT id FROM courses WHERE demande_id = $1 LIMIT 1;',
        [id]
      );
      if (courseRows.length) {
        throw Object.assign(new Error('Cette annonce est liée à une course et ne peut pas être renouvelée.'), { statusCode: 409 });
      }

      const { rows: updatedRows } = await client.query(`
        UPDATE demandes_transport
        SET ville_depart = $3, ville_arrivee = $4, nature_marchandise = $5,
            tonnage = $6, type_camion_requis = $7, date_chargement = $8,
            heure_chargement = $9, prix_propose = $10, exigences_particulieres = $11,
            quartier_chargement = $12, position_lng = $13, position_lat = $14,
            expiration_notifiee_at = NULL, suppression_prevue_le = NULL
        WHERE id = $1 AND chargeur_id = $2
          AND suppression_prevue_le > CURRENT_TIMESTAMP
          AND ($8::date + COALESCE($9::time, TIME '23:59:59')) > LOCALTIMESTAMP
        RETURNING *;
      `, [id, chargeurId, demande.ville_depart, demande.ville_arrivee, demande.nature_marchandise,
        demande.tonnage, demande.type_camion_requis, demande.date_chargement, demande.heure_chargement,
        demande.prix_propose, demande.exigences_particulieres, demande.quartier_chargement,
        demande.position_lng, demande.position_lat]);
      if (!updatedRows[0]) throw Object.assign(new Error('Choisissez une nouvelle date et heure dans le futur.'), { statusCode: 400 });

      await client.query(
        'UPDATE notifications SET lu = TRUE WHERE utilisateur_id = $1 AND action_url = $2;',
        [chargeurId, `/chargeur/demande?renouveler=${id}`]
      );
      await client.query('COMMIT');
      return updatedRows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async findForAdmin() {
    const { rows } = await db.query(`
      SELECT d.*, u.nom AS chargeur_nom, u.email AS chargeur_email
      FROM demandes_transport d
      JOIN users u ON u.id = d.chargeur_id
      ORDER BY d.date_creation DESC;
    `);
    return rows;
  }

  static async removePublishedByAdmin(id, adminId, reason) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT d.*, u.nom AS chargeur_nom, u.email AS chargeur_email
        FROM demandes_transport d
        JOIN users u ON u.id = d.chargeur_id
        WHERE d.id = $1
        FOR UPDATE OF d;
      `, [id]);
      const demande = rows[0];
      if (!demande) throw Object.assign(new Error('Cette annonce est introuvable.'), { statusCode: 404 });
      if (demande.statut !== 'PUBLIEE') {
        throw Object.assign(new Error('Seules les annonces encore publiées peuvent être supprimées.'), { statusCode: 409 });
      }

      const { rows: courseRows } = await client.query(
        'SELECT id FROM courses WHERE demande_id = $1 LIMIT 1;',
        [id]
      );
      if (courseRows.length) {
        throw Object.assign(new Error('Cette annonce est déjà liée à une course et ne peut pas être supprimée.'), { statusCode: 409 });
      }

      await client.query(`
        INSERT INTO annonces_moderation_archive
          (annonce_id, chargeur_id, chargeur_nom, chargeur_email, motif, annonce_data, supprime_par)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7);
      `, [demande.id, demande.chargeur_id, demande.chargeur_nom, demande.chargeur_email, reason, JSON.stringify(demande), adminId]);
      await client.query('DELETE FROM demandes_transport WHERE id = $1;', [id]);
      await client.query(
        `INSERT INTO notifications (utilisateur_id, titre, message)
         VALUES ($1, 'Annonce retirée de la plateforme', $2);`,
        [demande.chargeur_id, `Votre annonce ${demande.ville_depart} → ${demande.ville_arrivee} a été retirée par l’administration. Motif : ${reason}`]
      );
      await client.query('COMMIT');
      return demande;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async updateStatus(id, statut) {
    const query = 'UPDATE demandes_transport SET statut = $1 WHERE id = $2 RETURNING *;';
    const { rows } = await db.query(query, [statut, id]);
    return rows[0];
  }
}

module.exports = DemandeModel;
