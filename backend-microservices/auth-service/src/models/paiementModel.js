const db = require('../config/db');

class PaiementModel {
  static async create(paiement) {
    const { course_id, montant_total, moyen_paiement } = paiement;
    const montant_avance = montant_total * 0.5;
    const montant_solde = montant_total * 0.5;

    const query = `
      INSERT INTO paiements (course_id, montant_total, montant_avance, montant_solde, moyen_paiement)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const values = [course_id, montant_total, montant_avance, montant_solde, moyen_paiement];
    const { rows } = await db.query(query, values);
    return rows[0];
  }

  static async updateAvance(id, reference) {
    const query = `
      UPDATE paiements 
      SET statut_avance = 'VALIDE', reference_transaction_avance = $1 
      WHERE id = $2 
      RETURNING *;
    `;
    const { rows } = await db.query(query, [reference, id]);
    return rows[0];
  }

  static async updateSolde(id, reference) {
    const query = `
      UPDATE paiements 
      SET statut_solde = 'VALIDE', reference_transaction_solde = $1 
      WHERE id = $2 
      RETURNING *;
    `;
    const { rows } = await db.query(query, [reference, id]);
    return rows[0];
  }
}

module.exports = PaiementModel;
