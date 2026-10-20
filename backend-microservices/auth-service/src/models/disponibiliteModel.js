const db = require('../config/db');

class DisponibiliteModel {
  static async create(disponibilite) {
    const { camion_id, position_actuelle, destinations_possibles, disponibilite_date } = disponibilite;
    const query = `
      INSERT INTO disponibilites_camion 
      (camion_id, position_actuelle, destinations_possibles, disponibilite_date)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const values = [camion_id, position_actuelle, destinations_possibles, disponibilite_date];
    const { rows } = await db.query(query, values);
    return rows[0];
  }

  static async findActive() {
    const query = `
      SELECT dc.*, c.type_vehicule, c.capacite_tonnes, u.nom as transporteur_nom, u.telephone_whatsapp as contact
      FROM disponibilites_camion dc
      JOIN camions c ON dc.camion_id = c.id
      JOIN users u ON c.proprietaire_id = u.id
      WHERE dc.statut = 'ACTIVE'
      ORDER BY dc.date_creation DESC;
    `;
    const { rows } = await db.query(query);
    return rows;
  }
}

module.exports = DisponibiliteModel;
