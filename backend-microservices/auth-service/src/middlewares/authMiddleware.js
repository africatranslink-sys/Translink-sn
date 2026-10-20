const jwt = require('jsonwebtoken');
const { isSessionActive } = require('../../../shared/redis');
const { getAccountAccessError } = require('../../../shared/accountAccess');
const db = require('../config/db');

const registrationDocumentRequests = new Set([
  'POST /api/documents/upload',
  'POST /api/documents/submitted',
  'POST /upload',
  'POST /submitted'
]);

const verifyToken = async (req, res, next) => {
  const token = req.header('Authorization');

  if (!token) {
    return res.status(401).json({ error: 'Accès refusé, aucun token fourni.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
  } catch (error) {
    return res.status(400).json({ error: 'Token invalide.' });
  }

  if (decoded.sid) {
    try {
      if (!await isSessionActive(decoded.sid, decoded.id)) {
        return res.status(401).json({ error: 'Session expirée ou invalide.' });
      }
    } catch (error) {
      console.error('Vérification de session Redis impossible:', error.message);
      return res.status(503).json({ error: 'Service de session temporairement indisponible.' });
    }
  }

  try {
    const { rows } = await db.query('SELECT role, statut_verification FROM users WHERE id = $1;', [decoded.id]);
    if (!rows[0]) return res.status(401).json({ error: 'Ce compte n’existe plus.' });
    const user = rows[0];

    if (decoded.registrationOnly) {
      const requestPath = (req.originalUrl || req.path).split('?')[0];
      const requestKey = `${req.method} ${requestPath}`;
      if (!registrationDocumentRequests.has(requestKey)) {
        return res.status(403).json({ error: 'Ce jeton est réservé au dépôt des documents de vérification.' });
      }
      if (user.statut_verification !== 'EN_ATTENTE') {
        return res.status(403).json({ error: getAccountAccessError(user.statut_verification) || 'Ce jeton de dépôt n’est plus valide.' });
      }
    } else {
      const accountAccessError = getAccountAccessError(user.statut_verification);
      if (accountAccessError) {
        return res.status(403).json({ error: accountAccessError, statut_verification: user.statut_verification });
      }
    }

    req.user = { ...decoded, role: user.role, statut_verification: user.statut_verification };
  } catch (error) {
    console.error('Vérification du statut utilisateur impossible:', error.message);
    return res.status(503).json({ error: 'Service de compte temporairement indisponible.' });
  }

  return next();
};

const verifyRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès interdit pour ce rôle.' });
    }
    next();
  };
};

module.exports = {
  verifyToken,
  verifyRole
};
