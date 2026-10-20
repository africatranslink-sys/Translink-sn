const db = require('../config/db');

class CourseModel {
  static async create(course) {
    const { demande_id, camion_id } = course;
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: demandRows } = await client.query(
        'SELECT id, statut FROM demandes_transport WHERE id = $1 FOR UPDATE;',
        [demande_id]
      );
      if (!demandRows[0]) {
        throw Object.assign(new Error('Cette demande est introuvable.'), { statusCode: 404 });
      }
      if (demandRows[0].statut !== 'PUBLIEE') {
        throw Object.assign(new Error('Cette demande n’est plus disponible.'), { statusCode: 409 });
      }

      const { rows } = await client.query(`
        INSERT INTO courses (demande_id, camion_id, statut)
        VALUES ($1, $2, 'CAMION_TROUVE')
        RETURNING *;
      `, [demande_id, camion_id]);
      await client.query("UPDATE demandes_transport SET statut = 'CAMION_TROUVE' WHERE id = $1;", [demande_id]);
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
