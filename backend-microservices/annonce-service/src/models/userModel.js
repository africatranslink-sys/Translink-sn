const db = require('../config/db');

class UserModel {
  static async create(user) {
    const { nom, telephone_whatsapp, email, mot_de_passe, ville, role } = user;
    const query = `
      INSERT INTO users (nom, telephone_whatsapp, email, mot_de_passe, ville, role)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, nom, telephone_whatsapp, email, ville, role, statut_verification, date_creation;
    `;
    const values = [nom, telephone_whatsapp, email, mot_de_passe, ville, role];
    const { rows } = await db.query(query, values);
    return rows[0];
  }

  static async findByTelephone(telephone_whatsapp) {
    const query = 'SELECT * FROM users WHERE telephone_whatsapp = $1;';
    const { rows } = await db.query(query, [telephone_whatsapp]);
    return rows[0];
  }

  static async findById(id) {
    const query = 'SELECT id, nom, telephone_whatsapp, email, ville, role, statut_verification, abonnement_actif, date_creation FROM users WHERE id = $1;';
    const { rows } = await db.query(query, [id]);
    return rows[0];
  }

  static async updateStatus(id, statut) {
    const query = 'UPDATE users SET statut_verification = $1 WHERE id = $2 RETURNING *;';
    const { rows } = await db.query(query, [statut, id]);
    return rows[0];
  }
}

module.exports = UserModel;
