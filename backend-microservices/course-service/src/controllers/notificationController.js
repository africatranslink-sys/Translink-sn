const db = require('../config/db');

const getNotifications = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, titre, message, date_creation, lu, action_url, action_label
       FROM notifications
       WHERE utilisateur_id = $1
         AND titre NOT IN ('Statut de compte mis à jour')
       ORDER BY date_creation DESC
       LIMIT 20;`,
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    if (error.code === '42P01') return res.json([]);
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération des notifications.' });
  }
};

const markAsRead = async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE notifications
       SET lu = TRUE
       WHERE id = $1 AND utilisateur_id = $2
       RETURNING id, lu;`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Notification introuvable.' });
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de la notification.' });
  }
};

module.exports = { getNotifications, markAsRead };
