const db = require('../config/db');

class AdminModel {
  static async getDashboardStats() {
    // Nombre total d'utilisateurs par rôle
    const usersQuery = `
      SELECT role, COUNT(*) as count 
      FROM users 
      GROUP BY role;
    `;
    
    // Nombre total de camions
    const camionsQuery = `
      SELECT COUNT(*) as total_camions FROM camions;
    `;

    // Nombre de courses par statut
    const coursesQuery = `
      SELECT statut, COUNT(*) as count 
      FROM courses 
      GROUP BY statut;
    `;

    // Total des revenus (somme des commissions des courses terminées)
    const revenusQuery = `
      SELECT COALESCE(SUM(commission), 0) as revenus_totaux
      FROM courses 
      WHERE statut = 'SOLDE_REGLE';
    `;

    const [usersResult, camionsResult, coursesResult, revenusResult] = await Promise.all([
      db.query(usersQuery),
      db.query(camionsQuery),
      db.query(coursesQuery),
      db.query(revenusQuery)
    ]);

    return {
      users: usersResult.rows,
      camions: camionsResult.rows[0].total_camions,
      courses: coursesResult.rows,
      revenus: revenusResult.rows[0].revenus_totaux
    };
  }
}

module.exports = AdminModel;
