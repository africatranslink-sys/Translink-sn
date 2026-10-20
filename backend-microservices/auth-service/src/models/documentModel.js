const db = require('../config/db');

class DocumentModel {
  static async create(document) {
    const { utilisateur_id, type_document, fichier_url } = document;
    const query = `
      INSERT INTO documents (utilisateur_id, camion_id, type_document, fichier_url)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const values = [utilisateur_id, document.camion_id || null, type_document, fichier_url];
    const { rows } = await db.query(query, values);
    return rows[0];
  }

  static async findByUserId(utilisateur_id) {
    const query = `
      SELECT d.*, c.plaque_immatriculation AS camion_plaque
      FROM documents d
      LEFT JOIN camions c ON c.id = d.camion_id
      WHERE d.utilisateur_id = $1
      ORDER BY d.date_ajout DESC;
    `;
    const { rows } = await db.query(query, [utilisateur_id]);
    return rows;
  }

  static async updateStatus(id, statut, motifRefus = null) {
    const query = `
      UPDATE documents
      SET statut = $1::user_status,
          motif_refus = $3::text
      WHERE id = $2
      RETURNING *;
    `;
    const { rows } = await db.query(query, [statut, id, motifRefus]);
    return rows[0];
  }

  static async deleteById(id, userId, isAdmin) {
    const { rows } = await db.query(
      'DELETE FROM documents WHERE id = $1 AND ($2::boolean OR utilisateur_id = $3) RETURNING id, fichier_url;',
      [id, isAdmin, userId]
    );
    return rows[0];
  }
}

module.exports = DocumentModel;
