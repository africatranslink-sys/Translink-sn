const db = require('../config/db');
const { assertTruckWithinPlan } = require('../../../shared/subscriptionEntitlements');

class DisponibiliteModel {
  static async create(disponibilite) {
    const { camion_id, position_actuelle, destinations_possibles, disponibilite_date, position_lng, position_lat, destination_lng, destination_lat, user_id } = disponibilite;
    const query = `
      INSERT INTO disponibilites_camion 
      (camion_id, position_actuelle, destinations_possibles, disponibilite_date, position_lng, position_lat, destination_lng, destination_lat)
      SELECT $1, $2, $3, $4, $5, $6, $7, $8
      WHERE EXISTS (SELECT 1 FROM camions WHERE id = $1 AND proprietaire_id = $9)
      ON CONFLICT (camion_id) WHERE statut = 'ACTIVE'
      DO UPDATE SET position_actuelle = EXCLUDED.position_actuelle,
                    destinations_possibles = EXCLUDED.destinations_possibles,
                    disponibilite_date = EXCLUDED.disponibilite_date,
                    position_lng = EXCLUDED.position_lng,
                    position_lat = EXCLUDED.position_lat,
                    destination_lng = EXCLUDED.destination_lng,
                    destination_lat = EXCLUDED.destination_lat,
                    date_creation = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const values = [camion_id, position_actuelle, destinations_possibles, disponibilite_date, position_lng, position_lat, destination_lng, destination_lat, user_id];
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: userRows } = await client.query(
        'SELECT id FROM users WHERE id = $1 FOR UPDATE;',
        [user_id],
      );
      if (!userRows[0]) {
        await client.query('ROLLBACK');
        return undefined;
      }
      const { rows: truckRows } = await client.query(
        'SELECT id FROM camions WHERE id = $1 AND proprietaire_id = $2;',
        [camion_id, user_id],
      );
      if (!truckRows[0]) {
        await client.query('ROLLBACK');
        return undefined;
      }
      await assertTruckWithinPlan(client, user_id, camion_id);
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

  static async findActive({ ville_depart, ville_destination } = {}) {
    const query = `
      SELECT dc.*, c.type_vehicule, c.capacite_tonnes, c.plaque_immatriculation,
             u.nom as transporteur_nom, u.telephone_whatsapp as contact, u.description as transporteur_description,
             subscription.plan AS forfait_transport
      FROM disponibilites_camion dc
      JOIN camions c ON dc.camion_id = c.id
      JOIN users u ON c.proprietaire_id = u.id
      LEFT JOIN LATERAL (
        SELECT plan FROM abonnements
        WHERE utilisateur_id = u.id AND statut = 'ACTIF'
          AND date_debut <= CURRENT_TIMESTAMP AND date_fin > CURRENT_TIMESTAMP
        ORDER BY date_fin DESC LIMIT 1
      ) subscription ON TRUE
      WHERE dc.statut = 'ACTIVE'
        AND c.id IN (
          SELECT eligible_truck.id
          FROM camions eligible_truck
          WHERE eligible_truck.proprietaire_id = u.id
          ORDER BY eligible_truck.date_ajout ASC, eligible_truck.id ASC
          LIMIT CASE
            WHEN u.date_debut_essai <= CURRENT_TIMESTAMP AND u.date_fin_essai > CURRENT_TIMESTAMP THEN 2147483647
            WHEN subscription.plan = 'GRANDE_ENTREPRISE' THEN 2147483647
            WHEN subscription.plan = 'PRO' THEN 2147483647
            WHEN subscription.plan = 'PETITE_ENTREPRISE' THEN 3
            WHEN subscription.plan = 'INDIVIDUEL' THEN 1
            ELSE 1
          END
        )
        AND ($1::text IS NULL OR LOWER(dc.position_actuelle) = LOWER($1))
        AND ($2::text IS NULL OR LOWER(dc.destinations_possibles) = LOWER($2))
      ORDER BY CASE subscription.plan
          WHEN 'GRANDE_ENTREPRISE' THEN 3
          WHEN 'PRO' THEN 3
          WHEN 'PETITE_ENTREPRISE' THEN 2
          WHEN 'INDIVIDUEL' THEN 1
          ELSE 0
        END DESC,
        dc.date_creation DESC;
    `;
    const { rows } = await db.query(query, [ville_depart || null, ville_destination || null]);
    return rows;
  }

  static async findActiveByUserId(userId) {
    const query = `
      SELECT dc.id, dc.camion_id, dc.position_actuelle AS origin, dc.destinations_possibles AS destination,
             dc.position_lng, dc.position_lat, dc.destination_lng, dc.destination_lat,
             c.plaque_immatriculation AS name, c.statut, c.type_vehicule, c.capacite_tonnes,
             u.nom AS transporteur_nom, u.description AS transporteur_description
      FROM disponibilites_camion dc
      JOIN camions c ON c.id = dc.camion_id
      JOIN users u ON u.id = c.proprietaire_id
      LEFT JOIN LATERAL (
        SELECT plan FROM abonnements
        WHERE utilisateur_id = u.id AND statut = 'ACTIF'
          AND date_debut <= CURRENT_TIMESTAMP AND date_fin > CURRENT_TIMESTAMP
        ORDER BY date_fin DESC LIMIT 1
      ) subscription ON TRUE
      WHERE dc.statut = 'ACTIVE' AND (c.proprietaire_id = $1 OR c.chauffeur_id = $1)
        AND c.id IN (
          SELECT eligible_truck.id
          FROM camions eligible_truck
          WHERE eligible_truck.proprietaire_id = u.id
          ORDER BY eligible_truck.date_ajout ASC, eligible_truck.id ASC
          LIMIT CASE
            WHEN u.date_debut_essai <= CURRENT_TIMESTAMP AND u.date_fin_essai > CURRENT_TIMESTAMP THEN 2147483647
            WHEN subscription.plan = 'GRANDE_ENTREPRISE' THEN 2147483647
            WHEN subscription.plan = 'PRO' THEN 2147483647
            WHEN subscription.plan = 'PETITE_ENTREPRISE' THEN 3
            WHEN subscription.plan = 'INDIVIDUEL' THEN 1
            ELSE 1
          END
        )
      ORDER BY dc.date_creation DESC;
    `;
    const { rows } = await db.query(query, [userId]);
    return rows.map((row) => ({
      ...row,
      coordinates: row.position_lng == null || row.position_lat == null ? null : [row.position_lng, row.position_lat],
      route: row.position_lng == null || row.position_lat == null || row.destination_lng == null || row.destination_lat == null
        ? []
        : [[row.position_lng, row.position_lat], [row.destination_lng, row.destination_lat]],
      status: row.statut === 'EN_MISSION' ? 'En mission' : 'Disponibilité publiée'
    }));
  }
}

module.exports = DisponibiliteModel;
