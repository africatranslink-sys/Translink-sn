const fs = require('fs');
const { getIntegrationConfig } = require('./integrationConfig');

const createMailTransporter = async (db, nodemailer) => {
  if (!nodemailer?.createTransport) throw new Error('Le client Nodemailer du service appelant est requis.');
  const environmentConfig = {
    host: String(process.env.SMTP_HOST || '').trim(),
    from: String(process.env.SMTP_FROM || '').trim(),
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE,
    user: String(process.env.SMTP_USER || '').trim(),
    password: String(process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '').trim(),
  };
  const environmentConfigIsComplete = environmentConfig.host
    && environmentConfig.from
    && (!environmentConfig.user || environmentConfig.password);
  const saved = environmentConfigIsComplete ? null : await getIntegrationConfig(db, 'smtp');
  const config = environmentConfigIsComplete ? environmentConfig : saved;
  const host = String(config ? config.host || '' : environmentConfig.host).trim();
  const from = String(config ? config.from || '' : environmentConfig.from).trim();
  if (!host || !from || /example\.com|localhost/i.test(host)) return null;

  const port = Number(config ? config.port : environmentConfig.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('La configuration SMTP doit utiliser un port valide entre 1 et 65535.');
  }
  const secureValue = config ? config.secure : environmentConfig.secure;
  const secure = secureValue === true || secureValue === 'true';
  const user = String(config ? config.user || '' : environmentConfig.user).trim();
  let password = String(config ? config.password || '' : environmentConfig.password).trim();
  if (user && !password) {
    throw new Error('La configuration SMTP fournit un nom d’utilisateur sans mot de passe.');
  }
  if (/^smtp\.gmail\.com$/i.test(host)) password = password.replace(/\s/g, '');
  const tlsCaPath = process.env.SMTP_TLS_CA_PATH;
  const tls = tlsCaPath ? { ca: fs.readFileSync(tlsCaPath) } : undefined;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass: password } : undefined,
    tls,
  });
  return { transporter, from };
};

module.exports = { createMailTransporter };