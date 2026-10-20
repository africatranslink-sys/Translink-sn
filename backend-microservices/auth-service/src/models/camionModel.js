const db = require('../config/db');

class CamionModel {
  static async create(camion) {
    const { proprietaire_id, type_vehicule, capacite_tonnes, plaque_immatriculation } = camion;
    const query = `
      INSERT INTO camions (proprietaire_id, type_vehicule, capacite_tonnes, plaque_immatriculation)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const values = [proprietaire_id, type_vehicule, capacite_tonnes, plaque_immatriculation];
    const { rows } = await db.query(query, values);
    return rows[0];
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
}

module.exports = CamionModel;
