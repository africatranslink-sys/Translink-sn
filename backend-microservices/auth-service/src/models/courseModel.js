const db = require('../config/db');

class CourseModel {
  static async create(course) {
    const { demande_id, camion_id } = course;
    const query = `
      INSERT INTO courses (demande_id, camion_id, statut)
      VALUES ($1, $2, 'CAMION_TROUVE')
      RETURNING *;
    `;
    const values = [demande_id, camion_id];
    const { rows } = await db.query(query, values);
    return rows[0];
  }

  static async findById(id) {
    const query = 'SELECT * FROM courses WHERE id = $1;';
    const { rows } = await db.query(query, [id]);
    return rows[0];
  }

  static async updateStatus(id, statut, realDateFields = {}) {
    let query = 'UPDATE courses SET statut = $1';
    const values = [statut, id];
    let idx = 3;
    
    if (realDateFields.date_chargement_reelle) {
      query += `, date_chargement_reelle = $${idx++}`;
      values.push(realDateFields.date_chargement_reelle);
    }
    if (realDateFields.date_livraison_reelle) {
      query += `, date_livraison_reelle = $${idx++}`;
      values.push(realDateFields.date_livraison_reelle);
    }

    query += ` WHERE id = $2 RETURNING *;`;
    
    const { rows } = await db.query(query, values);
    return rows[0];
  }
}

module.exports = CourseModel;
