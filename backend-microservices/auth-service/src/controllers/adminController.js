const AdminModel = require('../models/adminModel');

const getDashboardStats = async (req, res) => {
  try {
    const stats = await AdminModel.getDashboardStats();
    res.status(200).json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques: ' + err.message });
  }
};

module.exports = {
  getDashboardStats
};
