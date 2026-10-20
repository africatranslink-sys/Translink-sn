const db = require('../config/db');

class DocumentModel {
  static async create(document) {
    const { utilisateur_id, type_document, fichier_url } = document;
    const query = `
      INSERT INTO documents (utilisateur_id, type_document, fichier_url)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const values = [utilisateur_id, type_document, fichier_url];
    const { rows } = await db.query(query, values);
    return rows[0];
  }

  static async findByUserId(utilisateur_id) {
    const query = 'SELECT * FROM documents WHERE utilisateur_id = $1;';
    const { rows } = await db.query(query, [utilisateur_id]);
    return rows;
  }

  static async updateStatus(id, statut) {
    const query = 'UPDATE documents SET statut = $1 WHERE id = $2 RETURNING *;';
    const { rows } = await db.query(query, [statut, id]);
    return rows[0];
  }
}

module.exports = DocumentModel;
