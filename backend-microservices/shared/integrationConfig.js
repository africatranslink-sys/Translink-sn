const crypto = require('crypto');

const getEncryptionKey = () => {
  const configuredKey = process.env.INTEGRATION_CONFIG_ENCRYPTION_KEY;
  if (!configuredKey) throw new Error('INTEGRATION_CONFIG_ENCRYPTION_KEY n’est pas configurée.');
  return crypto.createHash('sha256').update(configuredKey).digest();
};

const encryptConfig = (config) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(config), 'utf8'),
    cipher.final(),
  ]);
  return {
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
    ciphertext: ciphertext.toString('hex'),
  };
};

const decryptConfig = ({ iv, auth_tag: authTag, encrypted_config: ciphertext }) => {
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8'));
};

const getIntegrationConfig = async (db, serviceKey) => {
  const { rows } = await db.query(
    'SELECT encrypted_config, iv, auth_tag FROM service_integrations WHERE service_key = $1;',
    [serviceKey],
  );
  return rows[0] ? decryptConfig(rows[0]) : null;
};

const saveIntegrationConfig = async (db, serviceKey, config, updatedBy) => {
  const encrypted = encryptConfig(config);
  const { rows } = await db.query(`
    INSERT INTO service_integrations (service_key, encrypted_config, iv, auth_tag, updated_by, updated_at)
    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    ON CONFLICT (service_key) DO UPDATE SET encrypted_config = EXCLUDED.encrypted_config,
      iv = EXCLUDED.iv, auth_tag = EXCLUDED.auth_tag, updated_by = EXCLUDED.updated_by,
      updated_at = CURRENT_TIMESTAMP
    RETURNING service_key, updated_at;
  `, [serviceKey, encrypted.ciphertext, encrypted.iv, encrypted.authTag, updatedBy]);
  return rows[0];
};

module.exports = { getIntegrationConfig, saveIntegrationConfig };