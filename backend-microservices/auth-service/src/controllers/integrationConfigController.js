const bcrypt = require('bcrypt');
const db = require('../config/db');
const { getIntegrationConfig, saveIntegrationConfig } = require('../../../shared/integrationConfig');

const SERVICE_DEFINITIONS = [
  {
    key: 'paypal',
    name: 'PayPal Checkout & Payouts',
    description: 'Encaissement des avances et soldes, puis reversements vers un e-mail PayPal.',
    backendConnected: true,
    fields: [
      { key: 'mode', label: 'Environnement', type: 'select', options: ['sandbox', 'live'], required: true },
      { key: 'clientId', label: 'Client ID', type: 'secret', required: true },
      { key: 'clientSecret', label: 'Client Secret', type: 'secret', required: true },
      { key: 'xofToUsdRate', label: 'USD pour 1 XOF', type: 'number', step: '0.00000001', required: true },
      { key: 'transactionFeeRate', label: 'Frais de réception (taux décimal)', type: 'number', step: '0.0001', required: true },
      { key: 'transactionFeeFixedUsd', label: 'Frais fixes de réception (USD)', type: 'number', step: '0.01', required: true },
      { key: 'payoutFeeRate', label: 'Frais de reversement (taux décimal)', type: 'number', step: '0.0001', required: true },
      { key: 'payoutFeeCapUsd', label: 'Plafond des frais par reversement (USD)', type: 'number', step: '0.01', required: true },
    ],
  },
  {
    key: 'kkiapay',
    name: 'KKiaPay',
    description: 'Encaissements d’abonnements et de courses par mobile money, carte ou wallet. Le compte et les clés doivent être activés par KKiaPay.',
    backendConnected: true,
    fields: [
      { key: 'publicKey', label: 'Clé publique', type: 'text', required: true },
      { key: 'privateKey', label: 'Clé privée', type: 'secret', required: true },
      { key: 'secretKey', label: 'Clé secrète', type: 'secret', required: true },
      { key: 'webhookSecretHash', label: 'Secret hash du webhook', type: 'secret' },
      { key: 'sandbox', label: 'Mode Sandbox (test)', type: 'checkbox' },
      { key: 'countries', label: 'Pays autorisés (codes séparés par des virgules)', type: 'text' },
    ],
  },
  {
    key: 'smtp',
    name: 'E-mail SMTP',
    description: 'Envoi des invitations, notifications et messages de la plateforme.',
    backendConnected: true,
    fields: [
      { key: 'host', label: 'Serveur SMTP', type: 'text', required: true },
      { key: 'port', label: 'Port', type: 'number', required: true },
      { key: 'secure', label: 'Connexion TLS directe', type: 'checkbox' },
      { key: 'from', label: 'Adresse expéditeur', type: 'email', required: true },
      { key: 'user', label: 'Nom d’utilisateur SMTP', type: 'secret' },
      { key: 'password', label: 'Mot de passe SMTP', type: 'secret' },
    ],
  },
  {
    key: 'wave',
    name: 'Wave',
    description: 'Clés marchandes et secret de webhook pour le paiement mobile.',
    backendConnected: false,
    fields: [
      { key: 'mode', label: 'Environnement', type: 'select', options: ['sandbox', 'live'], required: true },
      { key: 'apiKey', label: 'Clé API', type: 'secret', required: true },
      { key: 'webhookSecret', label: 'Secret webhook', type: 'secret', required: true },
    ],
  },
  {
    key: 'orangeMoney',
    name: 'Orange Money',
    description: 'Identifiants marchand et paramètres Web Payment.',
    backendConnected: false,
    fields: [
      { key: 'mode', label: 'Environnement', type: 'select', options: ['sandbox', 'live'], required: true },
      { key: 'clientId', label: 'Client ID', type: 'secret', required: true },
      { key: 'clientSecret', label: 'Client Secret', type: 'secret', required: true },
      { key: 'merchantKey', label: 'Clé marchand', type: 'secret', required: true },
      { key: 'currency', label: 'Code devise', type: 'text', required: true },
    ],
  },
  {
    key: 'subscriptionPayments',
    name: 'Abonnements — paiements manuels',
    description: 'Coordonnées affichées aux acteurs pour régler leur abonnement mensuel de 5 000 FCFA après les 14 jours d’essai.',
    backendConnected: true,
    fields: [
      { key: 'waveEnabled', label: 'Accepter Wave', type: 'checkbox' },
      { key: 'waveAccountName', label: 'Titulaire du compte Wave', type: 'text' },
      { key: 'waveAccountNumber', label: 'Numéro du compte Wave', type: 'text' },
      { key: 'orangeMoneyEnabled', label: 'Accepter Orange Money', type: 'checkbox' },
      { key: 'orangeMoneyAccountName', label: 'Titulaire du compte Orange Money', type: 'text' },
      { key: 'orangeMoneyAccountNumber', label: 'Numéro du compte Orange Money', type: 'text' },
      { key: 'bankTransferEnabled', label: 'Accepter le virement bancaire', type: 'checkbox' },
      { key: 'bankName', label: 'Nom de la banque', type: 'text' },
      { key: 'bankAccountName', label: 'Titulaire du compte bancaire', type: 'text' },
      { key: 'bankAccountNumber', label: 'Numéro de compte ou IBAN', type: 'text' },
      { key: 'paymentInstructions', label: 'Consignes de paiement', type: 'text' },
    ],
  },
  {
    key: 'mapbox',
    name: 'Mapbox',
    description: 'Cartes, géocodage et recherche de lieux dans les formulaires et le suivi.',
    backendConnected: true,
    fields: [
      { key: 'token', label: 'Token public Mapbox', type: 'secret', required: true },
    ],
  },
];

const isSecretField = (field) => field.type === 'secret';

const getEnvironmentConfig = (serviceKey) => {
  if (serviceKey === 'paypal') return {
    mode: process.env.PAYPAL_MODE || 'sandbox',
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    xofToUsdRate: process.env.PAYPAL_XOF_TO_USD_RATE || '',
    transactionFeeRate: process.env.PAYPAL_TRANSACTION_FEE_RATE || '',
    transactionFeeFixedUsd: process.env.PAYPAL_TRANSACTION_FEE_FIXED_USD || '',
    payoutFeeUsd: process.env.PAYPAL_PAYOUT_FEE_USD || '',
    payoutFeeRate: process.env.PAYPAL_PAYOUT_FEE_RATE || '',
    payoutFeeCapUsd: process.env.PAYPAL_PAYOUT_FEE_CAP_USD || '',
  };
  if (serviceKey === 'smtp') return {
    host: process.env.SMTP_HOST || '',
    port: process.env.SMTP_PORT || '587',
    secure: process.env.SMTP_SECURE === 'true',
    from: process.env.SMTP_FROM || '',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '',
  };
  if (serviceKey === 'kkiapay') return {
    publicKey: process.env.KKIAPAY_PUBLIC_KEY || '',
    privateKey: process.env.KKIAPAY_PRIVATE_KEY || '',
    secretKey: process.env.KKIAPAY_SECRET_KEY || '',
    webhookSecretHash: process.env.KKIAPAY_WEBHOOK_SECRET_HASH || '',
    sandbox: process.env.KKIAPAY_SANDBOX !== 'false',
    countries: process.env.KKIAPAY_COUNTRIES || 'SN,BJ,CI,TG,NE',
  };
  if (serviceKey === 'mapbox') return { token: process.env.MAPBOX_PUBLIC_TOKEN || '' };
  return {};
};

const getCurrentConfiguration = async (serviceKey) => {
  const saved = await getIntegrationConfig(db, serviceKey);
  return saved || getEnvironmentConfig(serviceKey);
};

const getAdminConfigPasswordHash = async () => {
  const { rows } = await db.query('SELECT password_hash FROM admin_integration_password WHERE id = 1;');
  return rows[0]?.password_hash || null;
};

const matchesAdminAccountPassword = async (userId, providedPassword) => {
  const { rows } = await db.query('SELECT mot_de_passe FROM users WHERE id = $1;', [userId]);
  if (!rows[0]?.mot_de_passe) throw new Error('Admin account password is unavailable.');
  return bcrypt.compare(String(providedPassword || ''), rows[0].mot_de_passe);
};

const getAdminConfigPasswordStatus = async (req, res) => {
  try {
    const passwordHash = await getAdminConfigPasswordHash();
    return res.json({ configured: Boolean(passwordHash) });
  } catch (error) {
    console.error('Admin configuration password status read failed:', error.message);
    return res.status(503).json({ error: 'Base non initialisée pour le mot de passe de configuration. Exécutez npm run db:init dans le service Auth.' });
  }
};

const setupAdminConfigPassword = async (req, res) => {
  const { password, confirmation } = req.body || {};
  if (typeof password !== 'string' || password.length < 12 || password !== confirmation) {
    return res.status(400).json({ error: 'Saisissez deux fois le même mot de passe de configuration (12 caractères minimum).' });
  }

  try {
    if (await getAdminConfigPasswordHash()) {
      return res.status(409).json({ error: 'Le mot de passe est déjà initialisé. Utilisez le formulaire de vérification.' });
    }
    if (await matchesAdminAccountPassword(req.user.id, password)) {
      return res.status(400).json({ error: 'Le mot de passe de configuration doit être différent du mot de passe de connexion admin.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const { rows } = await db.query(
      `INSERT INTO admin_integration_password (id, password_hash, updated_by, updated_at)
       VALUES (1, $1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO NOTHING
       RETURNING id;`,
      [passwordHash, req.user.id],
    );
    if (!rows.length) return res.status(409).json({ error: 'Le mot de passe vient d’être initialisé. Réessayez avec celui-ci.' });
    return res.status(201).json({ configured: true });
  } catch (error) {
    console.error('Admin configuration password setup failed:', error.message);
    return res.status(503).json({ error: 'Impossible d’initialiser le mot de passe. Vérifiez que la base Auth est initialisée.' });
  }
};

const sanitizeConfiguration = (definition, config, maintenanceStatus = null) => {
  const values = {};
  const secrets = {};
  for (const field of definition.fields) {
    const value = config?.[field.key];
    if (isSecretField(field)) secrets[field.key] = Boolean(value);
    else if (value !== undefined) values[field.key] = value;
  }

  let configured = definition.fields
    .filter((field) => field.required)
    .every((field) => Boolean(config?.[field.key]));
  if (definition.key === 'subscriptionPayments') {
    configured = Boolean(
      (config?.waveEnabled && config.waveAccountName && config.waveAccountNumber)
      || (config?.orangeMoneyEnabled && config.orangeMoneyAccountName && config.orangeMoneyAccountNumber)
      || (config?.bankTransferEnabled && config.bankName && config.bankAccountName && config.bankAccountNumber),
    );
  }
  if (definition.key === 'kkiapay') {
    configured = Boolean(config?.publicKey && config?.privateKey && config?.secretKey);
  }

  return {
    ...definition,
    fields: definition.fields.map(({ key, label, type, options, required, step }) => ({ key, label, type, options, required, step })),
    values,
    secrets,
    configured,
    maintenance: maintenanceStatus ?? config?.maintenance === true,
    status: definition.backendConnected
      ? configured ? 'configured' : 'incomplete'
      : 'pending-integration',
  };
};

const getIntegrations = async (req, res) => {
  try {
    const { rows: maintenanceRows } = await db.query(
      'SELECT service_key, maintenance FROM service_integration_maintenance;',
    );
    const maintenanceByService = new Map(maintenanceRows.map(({ service_key, maintenance }) => [service_key, maintenance]));
    const configurations = await Promise.all(SERVICE_DEFINITIONS.map(async (definition) => {
      const config = await getCurrentConfiguration(definition.key);
      return sanitizeConfiguration(definition, config, maintenanceByService.get(definition.key) ?? null);
    }));
    res.json(configurations);
  } catch (error) {
    console.error('Integration settings read failed:', error.message);
    if (error.message.includes('INTEGRATION_CONFIG_ENCRYPTION_KEY')) {
      return res.status(503).json({ error: 'La clé INTEGRATION_CONFIG_ENCRYPTION_KEY est absente du service Auth. Renseignez la même clé que celle utilisée pour chiffrer les configurations déjà enregistrées.' });
    }
    res.status(503).json({ error: 'Impossible de lire les configurations. Vérifiez la base et la clé de chiffrement serveur.' });
  }
};

const getPublicMapboxConfig = async (req, res) => {
  try {
    const config = await getCurrentConfiguration('mapbox');
    res.set('Cache-Control', 'no-store');
    res.json({ token: config?.token || '' });
  } catch (error) {
    console.error('Public Mapbox config read failed:', error.message);
    res.status(503).json({ error: 'La configuration Mapbox est temporairement indisponible.' });
  }
};

const verifyAdminPassword = async (req, res) => {
  try {
    const passwordHash = await getAdminConfigPasswordHash();
    if (!passwordHash) return res.status(409).json({ error: 'Le mot de passe doit être initialisé.', setupRequired: true });
    if (!await bcrypt.compare(String(req.body?.password || ''), passwordHash)) {
      return res.status(403).json({ error: 'Mot de passe de configuration incorrect.' });
    }
    if (await matchesAdminAccountPassword(req.user.id, req.body?.password)) {
      return res.status(403).json({ error: 'Le mot de passe de configuration doit être différent du mot de passe de votre compte admin. Réinitialisez-le dans Paramètres.' });
    }
  } catch (error) {
    console.error('Admin configuration password check failed:', error.message);
    return res.status(503).json({ error: 'Impossible de vérifier le mot de passe de configuration.' });
  }
  return res.json({ verified: true });
};

const revealSmtpCredentials = async (req, res) => {
  try {
    const passwordHash = await getAdminConfigPasswordHash();
    if (!passwordHash) return res.status(409).json({ error: 'Initialisez d’abord le mot de passe de configuration.' });
    if (!await bcrypt.compare(String(req.body?.adminPassword || ''), passwordHash)) {
      return res.status(403).json({ error: 'Mot de passe de configuration incorrect.' });
    }
    if (await matchesAdminAccountPassword(req.user.id, req.body?.adminPassword)) {
      return res.status(403).json({ error: 'Le mot de passe de configuration doit être différent du mot de passe de votre compte admin.' });
    }

    const config = await getCurrentConfiguration('smtp') || {};
    res.set('Cache-Control', 'no-store, private');
    res.set('Pragma', 'no-cache');
    return res.json({
      secrets: {
        user: typeof config.user === 'string' ? config.user : '',
        password: typeof config.password === 'string' ? config.password : '',
      },
    });
  } catch (error) {
    console.error('SMTP credential reveal failed:', error.message);
    if (error.message.includes('INTEGRATION_CONFIG_ENCRYPTION_KEY')) {
      return res.status(503).json({ error: 'La clé de chiffrement des intégrations est absente. Renseignez la clé utilisée pour enregistrer les identifiants SMTP.' });
    }
    return res.status(503).json({ error: 'Impossible de récupérer les identifiants SMTP.' });
  }
};

const changeAdminConfigPassword = async (req, res) => {
  const { currentPassword, newPassword, confirmation } = req.body || {};
  if (typeof currentPassword !== 'string' || !currentPassword || typeof newPassword !== 'string' || newPassword.length < 12 || newPassword !== confirmation) {
    return res.status(400).json({ error: 'Renseignez l’ancien mot de passe et saisissez deux fois le même nouveau mot de passe (12 caractères minimum).' });
  }

  try {
    const currentHash = await getAdminConfigPasswordHash();
    if (!currentHash) return res.status(409).json({ error: 'Aucun mot de passe de configuration n’est initialisé. Utilisez le formulaire de première configuration.' });
    if (!await bcrypt.compare(currentPassword, currentHash)) {
      return res.status(403).json({ error: 'Ancien mot de passe de configuration incorrect.' });
    }
    if (await bcrypt.compare(newPassword, currentHash)) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit être différent de l’ancien.' });
    }
    if (await matchesAdminAccountPassword(req.user.id, newPassword)) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit être différent du mot de passe de connexion admin.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const { rows } = await db.query(
      'UPDATE admin_integration_password SET password_hash = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = 1 RETURNING id;',
      [passwordHash, req.user.id],
    );
    if (!rows.length) return res.status(409).json({ error: 'Le mot de passe de configuration a été réinitialisé par une autre session. Actualisez la page.' });
    return res.json({ message: 'Mot de passe de configuration modifié avec succès.' });
  } catch (error) {
    console.error('Admin configuration password update failed:', error.message);
    return res.status(503).json({ error: 'Impossible d’enregistrer le nouveau mot de passe de configuration.' });
  }
};

const updateIntegrationMaintenance = async (req, res) => {
  const definition = SERVICE_DEFINITIONS.find((service) => service.key === req.params.serviceKey);
  if (!definition) return res.status(404).json({ error: 'Service externe inconnu.' });
  if (typeof req.body?.maintenance !== 'boolean') {
    return res.status(400).json({ error: 'Statut de maintenance invalide.' });
  }

  try {
    const { rows } = await db.query(`
      INSERT INTO service_integration_maintenance (service_key, maintenance, updated_by, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (service_key) DO UPDATE SET
        maintenance = EXCLUDED.maintenance,
        updated_by = EXCLUDED.updated_by,
        updated_at = CURRENT_TIMESTAMP
      RETURNING service_key, maintenance;
    `, [definition.key, req.body.maintenance, req.user.id]);
    return res.json({ key: rows[0].service_key, maintenance: rows[0].maintenance });
  } catch (error) {
    console.error('Integration maintenance status update failed:', error.message);
    return res.status(503).json({ error: 'Impossible de modifier le statut de maintenance.' });
  }
};

const updateIntegration = async (req, res) => {
  try {
    const passwordHash = await getAdminConfigPasswordHash();
    if (!passwordHash) return res.status(409).json({ error: 'Initialisez d’abord le mot de passe de configuration.' });
    if (!await bcrypt.compare(String(req.body?.adminPassword || ''), passwordHash)) {
      return res.status(403).json({ error: 'Mot de passe de configuration incorrect.' });
    }
    if (await matchesAdminAccountPassword(req.user.id, req.body?.adminPassword)) {
      return res.status(403).json({ error: 'Le mot de passe de configuration doit être différent du mot de passe de votre compte admin. Réinitialisez-le dans Paramètres.' });
    }
  } catch (error) {
    console.error('Admin configuration password check failed:', error.message);
    return res.status(503).json({ error: 'Impossible de vérifier le mot de passe de configuration.' });
  }

  const definition = SERVICE_DEFINITIONS.find((service) => service.key === req.params.serviceKey);
  if (!definition) return res.status(404).json({ error: 'Service externe inconnu.' });

  const settings = req.body?.settings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return res.status(400).json({ error: 'Configuration invalide.' });
  }

  const allowedKeys = new Set(definition.fields.map((field) => field.key));
  const legacyPayPalKeys = definition.key === 'paypal' ? new Set(['payoutFeeUsd']) : new Set();
  if (Object.keys(settings).some((key) => !allowedKeys.has(key) && !legacyPayPalKeys.has(key))) {
    return res.status(400).json({ error: 'La configuration contient un champ non autorisé.' });
  }

  const clearSecrets = Array.isArray(req.body.clearSecrets) ? req.body.clearSecrets : [];
  const secretKeys = new Set(definition.fields.filter(isSecretField).map((field) => field.key));
  if (clearSecrets.some((key) => !secretKeys.has(key))) {
    return res.status(400).json({ error: 'Champ secret à supprimer invalide.' });
  }

  try {
    const existing = await getCurrentConfiguration(definition.key) || {};
    const nextConfig = { ...existing };
    if (definition.key === 'paypal') delete nextConfig.payoutFeeUsd;
    for (const field of definition.fields) {
      if (!Object.hasOwn(settings, field.key)) continue;
      const value = settings[field.key];
      if (isSecretField(field)) {
        if (typeof value === 'string' && value.length) nextConfig[field.key] = value;
      } else if (field.type === 'checkbox') {
        nextConfig[field.key] = value === true;
      } else if (typeof value === 'string' || typeof value === 'number') {
        nextConfig[field.key] = String(value).trim();
      } else {
        return res.status(400).json({ error: `Valeur invalide pour « ${field.label} ».` });
      }
    }
    for (const key of clearSecrets) delete nextConfig[key];

    const missingFields = definition.fields
      .filter((field) => field.required && !nextConfig[field.key])
      .map((field) => field.label);
    if (missingFields.length) {
      return res.status(400).json({ error: `Champs obligatoires manquants : ${missingFields.join(', ')}.` });
    }

    if (definition.key === 'paypal') {
      const exchangeRate = Number(nextConfig.xofToUsdRate);
      const transactionFeeRate = Number(nextConfig.transactionFeeRate);
      const fixedFee = Number(nextConfig.transactionFeeFixedUsd);
      const payoutFeeRate = Number(nextConfig.payoutFeeRate);
      const payoutFeeCap = Number(nextConfig.payoutFeeCapUsd);
      if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return res.status(400).json({ error: 'Le taux USD pour 1 XOF doit être supérieur à zéro.' });
      if (!Number.isFinite(transactionFeeRate) || transactionFeeRate < 0 || transactionFeeRate >= 1) return res.status(400).json({ error: 'Le taux des frais de réception doit être compris entre 0 et 1, sans atteindre 1.' });
      if (!Number.isFinite(fixedFee) || fixedFee < 0
        || !Number.isFinite(payoutFeeRate) || payoutFeeRate < 0 || payoutFeeRate >= 1
        || !Number.isFinite(payoutFeeCap) || payoutFeeCap < 0) {
        return res.status(400).json({ error: 'Les frais fixes PayPal doivent être des montants positifs ou nuls.' });
      }
    }

    if (definition.key === 'smtp') {
      const port = Number(nextConfig.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) return res.status(400).json({ error: 'Le port SMTP doit être un entier entre 1 et 65535.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextConfig.from || '')) return res.status(400).json({ error: 'L’adresse expéditeur SMTP est invalide.' });
    }

    if (definition.key === 'subscriptionPayments') {
      if (nextConfig.waveEnabled && (!nextConfig.waveAccountName || !nextConfig.waveAccountNumber)) {
        return res.status(400).json({ error: 'Renseignez le titulaire et le numéro du compte Wave activé.' });
      }
      if (nextConfig.orangeMoneyEnabled && (!nextConfig.orangeMoneyAccountName || !nextConfig.orangeMoneyAccountNumber)) {
        return res.status(400).json({ error: 'Renseignez le titulaire et le numéro du compte Orange Money activé.' });
      }
      if (nextConfig.bankTransferEnabled && (!nextConfig.bankName || !nextConfig.bankAccountName || !nextConfig.bankAccountNumber)) {
        return res.status(400).json({ error: 'Renseignez la banque, le titulaire et le numéro/IBAN du compte bancaire activé.' });
      }
      const enabledMethods = [
        nextConfig.waveEnabled && Boolean(nextConfig.waveAccountName && nextConfig.waveAccountNumber),
        nextConfig.orangeMoneyEnabled && Boolean(nextConfig.orangeMoneyAccountName && nextConfig.orangeMoneyAccountNumber),
        nextConfig.bankTransferEnabled && Boolean(nextConfig.bankName && nextConfig.bankAccountName && nextConfig.bankAccountNumber),
      ];
      if (!enabledMethods.some(Boolean)) {
        return res.status(400).json({ error: 'Activez au moins un moyen de paiement et renseignez toutes ses coordonnées.' });
      }
    }
    if (definition.key === 'kkiapay') {
      const countries = String(nextConfig.countries || 'SN,BJ,CI,TG,NE')
        .split(',')
        .map((country) => country.trim().toUpperCase())
        .filter(Boolean);
      const supportedCountries = new Set(['BJ', 'CI', 'TG', 'SN', 'NE']);
      if (!countries.length || countries.some((country) => !supportedCountries.has(country))) {
        return res.status(400).json({ error: 'Les pays KKiaPay doivent être choisis parmi BJ, CI, TG, SN et NE.' });
      }
      nextConfig.countries = countries.join(',');
    }

    await saveIntegrationConfig(db, definition.key, nextConfig, req.user.id);
    res.json(sanitizeConfiguration(definition, nextConfig));
  } catch (error) {
    console.error('Integration settings update failed:', error.message);
    if (error.message.includes('INTEGRATION_CONFIG_ENCRYPTION_KEY')) {
      return res.status(503).json({ error: 'La clé INTEGRATION_CONFIG_ENCRYPTION_KEY est absente du service Auth. Ajoutez-la à son fichier .env puis redémarrez le service.' });
    }
    if (error.message.includes('authenticate data')) {
      return res.status(503).json({ error: 'La configuration existante ne peut pas être déchiffrée. Restaurez la clé INTEGRATION_CONFIG_ENCRYPTION_KEY utilisée lors de son enregistrement avant toute modification.' });
    }
    return res.status(503).json({ error: 'Impossible d’enregistrer la configuration. Vérifiez la connexion à la base de données du service Auth.' });
  }
};

module.exports = {
  getIntegrations,
  updateIntegration,
  updateIntegrationMaintenance,
  getAdminConfigPasswordStatus,
  setupAdminConfigPassword,
  changeAdminConfigPassword,
  revealSmtpCredentials,
  getPublicMapboxConfig,
  verifyAdminPassword,
};