const db = require('../config/db');
const { assertCanAddTruck } = require('../../../shared/subscriptionEntitlements');

class CamionModel {
  static async create(camion, independentDriver = false) {
    const { proprietaire_id, type_vehicule, capacite_tonnes, plaque_immatriculation } = camion;
    const query = `
      INSERT INTO camions (proprietaire_id, type_vehicule, capacite_tonnes, plaque_immatriculation)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const values = [proprietaire_id, type_vehicule, capacite_tonnes, plaque_immatriculation];
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: userRows } = await client.query(
        'SELECT employeur_id FROM users WHERE id = $1 FOR UPDATE;',
        [proprietaire_id]
      );
      if (!userRows[0] || (independentDriver && userRows[0].employeur_id)) {
        throw Object.assign(new Error('Seul un chauffeur indépendant peut enregistrer son camion.'), { statusCode: 403 });
      }
      const { rows: truckRows } = await client.query(
        'SELECT id FROM camions WHERE proprietaire_id = $1 ORDER BY date_ajout ASC, id ASC;',
        [proprietaire_id]
      );
      if (independentDriver && truckRows[0]) {
        throw Object.assign(new Error('Un chauffeur indépendant ne peut enregistrer qu’un seul camion. Configurez les informations de votre camion existant.'), { statusCode: 409 });
      }
      await assertCanAddTruck(client, proprietaire_id);
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
    const query = `
      SELECT c.*,
             driver.nom AS chauffeur_nom,
             driver.telephone_whatsapp AS chauffeur_telephone,
             COALESCE(
               json_agg(json_build_object('id', d.id, 'fichier_url', d.fichier_url, 'date_ajout', d.date_ajout)
                 ORDER BY d.date_ajout DESC)
                 FILTER (WHERE d.id IS NOT NULL),
               '[]'::json
             ) AS photos
      FROM camions c
      LEFT JOIN documents d
        ON d.camion_id = c.id
       AND d.utilisateur_id = c.proprietaire_id
       AND d.type_document::text = 'PHOTO_CAMION'
      LEFT JOIN users driver ON driver.id = c.chauffeur_id
      WHERE c.proprietaire_id = $1 OR c.chauffeur_id = $1
      GROUP BY c.id, driver.id
      ORDER BY c.date_ajout DESC;
    `;
    const { rows } = await db.query(query, [userId]);
    return rows;
  }

  static async updateStatus(id, statut, userId) {
    const query = 'UPDATE camions SET statut = $1 WHERE id = $2 AND (proprietaire_id = $3 OR chauffeur_id = $3) RETURNING *;';
    const { rows } = await db.query(query, [statut, id, userId]);
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

  static async assignDriver(id, ownerId, driverId) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: truckRows } = await client.query(
        'SELECT id, statut FROM camions WHERE id = $1 AND proprietaire_id = $2 FOR UPDATE;',
        [id, ownerId],
      );
      const truck = truckRows[0];
      if (!truck) throw Object.assign(new Error('Camion introuvable dans votre flotte.'), { statusCode: 404 });
      if (truck.statut === 'EN_MISSION') {
        throw Object.assign(new Error('Terminez la mission en cours avant de modifier le chauffeur du camion.'), { statusCode: 409 });
      }

      if (driverId !== null) {
        const { rows: driverRows } = await client.query(
          `SELECT id FROM users
           WHERE id = $1 AND employeur_id = $2 AND role = 'CHAUFFEUR'
           FOR UPDATE;`,
          [driverId, ownerId],
        );
        if (!driverRows[0]) {
          throw Object.assign(new Error('Ce chauffeur ne fait pas partie de votre flotte.'), { statusCode: 403 });
        }

        const { rows: assignmentRows } = await client.query(
          'SELECT id FROM camions WHERE chauffeur_id = $1 AND id <> $2 LIMIT 1;',
          [driverId, id],
        );
        if (assignmentRows[0]) {
          throw Object.assign(new Error('Ce chauffeur est déjà affecté à un autre camion de votre flotte.'), { statusCode: 409 });
        }
      }

      const { rows } = await client.query(`
        UPDATE camions
        SET chauffeur_id = $1
        WHERE id = $2 AND proprietaire_id = $3
        RETURNING *;
      `, [driverId, id, ownerId]);
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async deleteByOwner(id, userId) {
    const query = `
      DELETE FROM camions AS camion
      WHERE camion.id = $1
        AND camion.proprietaire_id = $2
        AND camion.statut <> 'EN_MISSION'
        AND NOT EXISTS (
          SELECT 1 FROM courses WHERE camion_id = camion.id
        )
      RETURNING camion.id;
    `;
    const { rows } = await db.query(query, [id, userId]);
    return rows[0];
  }
}

module.exports = CamionModel;
