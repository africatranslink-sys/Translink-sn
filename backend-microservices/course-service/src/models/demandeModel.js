const db = require('../config/db');
const { assertChargeurCanPublish } = require('../../../shared/subscriptionEntitlements');

class DemandeModel {
  static async create(demande) {
    const { chargeur_id, ville_depart, ville_arrivee, nature_marchandise, tonnage, type_camion_requis, date_chargement, prix_propose } = demande;
    const query = `
      INSERT INTO demandes_transport 
      (chargeur_id, ville_depart, ville_arrivee, nature_marchandise, tonnage, type_camion_requis, date_chargement, prix_propose)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const values = [chargeur_id, ville_depart, ville_arrivee, nature_marchandise, tonnage, type_camion_requis, date_chargement, prix_propose];
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: userRows } = await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE;', [chargeur_id]);
      if (!userRows[0]) throw Object.assign(new Error('Compte chargeur introuvable.'), { statusCode: 404 });
      await assertChargeurCanPublish(client, chargeur_id);
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
      ORDER BY d.date_creation DESC;
    `;
    const { rows } = await db.query(query);
    return rows;
  }

  static async updateStatus(id, statut) {
    const query = 'UPDATE demandes_transport SET statut = $1 WHERE id = $2 RETURNING *;';
    const { rows } = await db.query(query, [statut, id]);
    return rows[0];
  }
}

module.exports = DemandeModel;
