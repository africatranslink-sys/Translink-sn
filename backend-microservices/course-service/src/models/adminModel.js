const db = require('../config/db');

class AdminModel {
  static async getDashboardStats() {
    const usersQuery = `
      SELECT role, COUNT(*) as count 
      FROM users 
      GROUP BY role;
    `;

    const camionsQuery = `
      SELECT COUNT(*) as total_camions FROM camions;
    `;

    const coursesQuery = `
      SELECT statut, COUNT(*) as count 
      FROM courses 
      GROUP BY statut;
    `;

    const revenusQuery = `
      SELECT COALESCE(SUM(commission), 0) as revenus_totaux
      FROM courses 
      WHERE statut = 'SOLDE_REGLE';
    `;

    const usersByMonthQuery = `
      SELECT to_char(calendar.month, 'YYYY-MM') AS month, COUNT(u.id)::int AS count
      FROM generate_series(
        date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
        date_trunc('month', CURRENT_DATE),
        INTERVAL '1 month'
      ) AS calendar(month)
      LEFT JOIN users u ON date_trunc('month', u.date_creation) = calendar.month
      GROUP BY calendar.month
      ORDER BY calendar.month;
    `;

    const coursesByMonthQuery = `
      SELECT to_char(calendar.month, 'YYYY-MM') AS month, COUNT(c.id)::int AS count
      FROM generate_series(
        date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
        date_trunc('month', CURRENT_DATE),
        INTERVAL '1 month'
      ) AS calendar(month)
      LEFT JOIN courses c ON date_trunc('month', c.date_creation) = calendar.month
      GROUP BY calendar.month
      ORDER BY calendar.month;
    `;

    const revenusByMonthQuery = `
      SELECT to_char(calendar.month, 'YYYY-MM') AS month,
             COALESCE(SUM(c.commission), 0)::numeric AS revenus
      FROM generate_series(
        date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
        date_trunc('month', CURRENT_DATE),
        INTERVAL '1 month'
      ) AS calendar(month)
      LEFT JOIN courses c
        ON date_trunc('month', c.date_livraison_reelle) = calendar.month
        AND c.statut = 'SOLDE_REGLE'
      GROUP BY calendar.month
      ORDER BY calendar.month;
    `;

    const camionsByStatusQuery = `
      SELECT statut, COUNT(*)::int AS count
      FROM camions
      GROUP BY statut
      ORDER BY statut;
    `;

    const usersByStatusQuery = `
      SELECT statut_verification AS statut, COUNT(*)::int AS count
      FROM users
      GROUP BY statut_verification
      ORDER BY statut_verification;
    `;

    const annoncesByStatusQuery = `
      SELECT statut, COUNT(*)::int AS count
      FROM demandes_transport
      GROUP BY statut
      ORDER BY statut;
    `;

    const annoncesByMonthQuery = `
      SELECT to_char(calendar.month, 'YYYY-MM') AS month, COUNT(d.id)::int AS count
      FROM generate_series(
        date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
        date_trunc('month', CURRENT_DATE),
        INTERVAL '1 month'
      ) AS calendar(month)
      LEFT JOIN demandes_transport d ON date_trunc('month', d.date_creation) = calendar.month
      GROUP BY calendar.month
      ORDER BY calendar.month;
    `;

    const documentsByStatusQuery = `
      SELECT statut, COUNT(*)::int AS count
      FROM documents
      GROUP BY statut
      ORDER BY statut;
    `;

    const paiementsByStatusQuery = `
      SELECT 'AVANCE' AS type, statut_avance AS statut, COUNT(*)::int AS count
      FROM paiements
      GROUP BY statut_avance
      UNION ALL
      SELECT 'SOLDE' AS type, statut_solde AS statut, COUNT(*)::int AS count
      FROM paiements
      GROUP BY statut_solde
      ORDER BY type, statut;
    `;

    const [usersResult, camionsResult, coursesResult, revenusResult, usersByMonthResult, coursesByMonthResult, revenusByMonthResult, camionsByStatusResult, usersByStatusResult, annoncesByStatusResult, annoncesByMonthResult, documentsByStatusResult, paiementsByStatusResult] = await Promise.all([
      db.query(usersQuery),
      db.query(camionsQuery),
      db.query(coursesQuery),
      db.query(revenusQuery),
      db.query(usersByMonthQuery),
      db.query(coursesByMonthQuery),
      db.query(revenusByMonthQuery),
      db.query(camionsByStatusQuery),
      db.query(usersByStatusQuery),
      db.query(annoncesByStatusQuery),
      db.query(annoncesByMonthQuery),
      db.query(documentsByStatusQuery),
      db.query(paiementsByStatusQuery)
    ]);

    return {
      users: usersResult.rows,
      camions: camionsResult.rows[0].total_camions,
      courses: coursesResult.rows,
      revenus: revenusResult.rows[0].revenus_totaux,
      usersByMonth: usersByMonthResult.rows,
      coursesByMonth: coursesByMonthResult.rows,
      revenusByMonth: revenusByMonthResult.rows,
      camionsByStatus: camionsByStatusResult.rows,
      usersByStatus: usersByStatusResult.rows,
      annoncesByStatus: annoncesByStatusResult.rows,
      annoncesByMonth: annoncesByMonthResult.rows,
      documentsByStatus: documentsByStatusResult.rows,
      paiementsByStatus: paiementsByStatusResult.rows
    };
  }

  static async getUsers() {
    const query = `
      SELECT u.id, u.nom, u.telephone_whatsapp, u.email, u.ville, u.numero_cni_nin,
             u.role, u.statut_verification, u.date_creation, u.documents_submitted_at,
             latest_document.date_ajout AS last_document_upload_at,
             latest_login.date_connexion AS last_login_at,
             latest_login.adresse_ip AS last_login_ip,
             latest_login.navigateur AS last_login_browser,
             latest_login.appareil AS last_login_device,
             latest_login.machine AS last_login_machine
      FROM users u
      LEFT JOIN LATERAL (
        SELECT MAX(d.date_ajout) AS date_ajout
        FROM documents d
        WHERE d.utilisateur_id = u.id
      ) latest_document ON TRUE
      LEFT JOIN LATERAL (
        SELECT lh.date_connexion, lh.adresse_ip, lh.navigateur, lh.appareil, lh.machine
        FROM login_history lh
        WHERE lh.utilisateur_id = u.id
        ORDER BY lh.date_connexion DESC, lh.id DESC
        LIMIT 1
      ) latest_login ON TRUE
      ORDER BY u.date_creation DESC;
    `;
    const { rows } = await db.query(query);
    return rows;
  }

  static async getDocuments(userId) {
    const query = `
            SELECT d.id, d.type_document, d.fichier_url, d.statut, d.motif_refus, d.date_ajout,
              d.camion_id, c.plaque_immatriculation AS camion_plaque,
              u.id AS utilisateur_id, u.nom AS utilisateur_nom, u.email, u.telephone_whatsapp, u.role,
              u.date_creation AS utilisateur_date_inscription,
              u.documents_submitted_at AS utilisateur_date_soumission_documents
      FROM documents d
      JOIN users u ON u.id = d.utilisateur_id
      LEFT JOIN camions c ON c.id = d.camion_id
      ${userId ? 'WHERE u.id = $1' : ''}
      ORDER BY d.date_ajout DESC;
    `;
    const { rows } = await db.query(query, userId ? [userId] : []);
    return rows;
  }

  static async updateUserStatus(id, statut) {
    const query = `
      UPDATE users
      SET statut_verification = $1::user_status,
          date_debut_essai = CASE
            WHEN $1::user_status = 'VALIDE'::user_status AND role IN ('CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR')
              THEN COALESCE(date_debut_essai, CURRENT_TIMESTAMP)
            ELSE date_debut_essai
          END,
          date_fin_essai = CASE
            WHEN $1::user_status = 'VALIDE'::user_status AND role IN ('CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR')
              THEN COALESCE(date_fin_essai, CURRENT_TIMESTAMP + INTERVAL '14 days')
            ELSE date_fin_essai
          END
      WHERE id = $2
      RETURNING id, nom, email, role, statut_verification, date_debut_essai, date_fin_essai;
    `;
    const { rows } = await db.query(query, [statut, id]);
    return rows[0];
  }

  static async deleteUser(id) {
    const { rows } = await db.query('DELETE FROM users WHERE id = $1 AND role <> \'ADMIN\' RETURNING id, nom, email;', [id]);
    return rows[0];
  }
}

module.exports = AdminModel;
