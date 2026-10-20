const db = require('../config/db');

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
    const { rows } = await db.query(query, values);
    return rows[0];
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
