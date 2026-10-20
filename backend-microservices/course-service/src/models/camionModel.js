const db = require('../config/db');

class CamionModel {
  static async create(camion, independentDriver = false) {
    const { proprietaire_id, type_vehicule, capacite_tonnes, plaque_immatriculation } = camion;
    const query = `INSERT INTO camions (proprietaire_id, type_vehicule, capacite_tonnes, plaque_immatriculation)
      VALUES ($1, $2, $3, $4) RETURNING *;`;
    const values = [proprietaire_id, type_vehicule, capacite_tonnes, plaque_immatriculation];

    if (!independentDriver) {
      const { rows } = await db.query(query, values);
      return rows[0];
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: userRows } = await client.query(
        'SELECT employeur_id FROM users WHERE id = $1 FOR UPDATE;',
        [proprietaire_id]
      );
      if (!userRows[0] || userRows[0].employeur_id) {
        throw Object.assign(new Error('Seul un chauffeur indépendant peut enregistrer son camion.'), { statusCode: 403 });
      }
      const { rows: truckRows } = await client.query(
        'SELECT id FROM camions WHERE proprietaire_id = $1 LIMIT 1;',
        [proprietaire_id]
      );
      if (truckRows[0]) {
        throw Object.assign(new Error('Un chauffeur indépendant ne peut enregistrer qu’un seul camion. Modifiez les informations de votre camion existant.'), { statusCode: 409 });
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

  static async findByProprietaireId(userId) {
    const query = 'SELECT * FROM camions WHERE proprietaire_id = $1 OR chauffeur_id = $1;';
    const { rows } = await db.query(query, [userId]);
    return rows;
  }

  static async updateStatus(id, statut) {
    const query = 'UPDATE camions SET statut = $1 WHERE id = $2 RETURNING *;';
    const { rows } = await db.query(query, [statut, id]);
    return rows[0];
  }

  static async updateDetails(id, ownerId, camion) {
    const { type_vehicule, capacite_tonnes, plaque_immatriculation } = camion;
    const { rows } = await db.query(`
      UPDATE camions
      SET type_vehicule = $1, capacite_tonnes = $2, plaque_immatriculation = $3
      WHERE id = $4 AND proprietaire_id = $5 AND statut <> 'EN_MISSION'
      RETURNING *;
    `, [type_vehicule, capacite_tonnes, plaque_immatriculation, id, ownerId]);
    return rows[0];
  }
}

module.exports = CamionModel;
