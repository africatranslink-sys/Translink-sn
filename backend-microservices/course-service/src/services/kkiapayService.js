const crypto = require('crypto');
const { kkiapay } = require('@kkiapay-org/nodejs-sdk');
const db = require('../config/db');
const { getIntegrationConfig } = require('../../../shared/integrationConfig');

const SUPPORTED_COUNTRIES = new Set(['BJ', 'CI', 'TG', 'SN', 'NE']);

const getConfig = async () => {
  const saved = await getIntegrationConfig(db, 'kkiapay');
  const config = saved || {
    publicKey: process.env.KKIAPAY_PUBLIC_KEY,
    privateKey: process.env.KKIAPAY_PRIVATE_KEY,
    secretKey: process.env.KKIAPAY_SECRET_KEY,
    webhookSecretHash: process.env.KKIAPAY_WEBHOOK_SECRET_HASH,
    sandbox: process.env.KKIAPAY_SANDBOX !== 'false',
    countries: process.env.KKIAPAY_COUNTRIES || 'SN,BJ,CI,TG,NE',
  };

  if (!config.publicKey || !config.privateKey || !config.secretKey) {
    throw Object.assign(new Error('KKiaPay n’est pas configuré dans Administration > Services externes.'), { statusCode: 503 });
  }

  const countries = String(config.countries || 'SN,BJ,CI,TG,NE')
    .split(',')
    .map((country) => country.trim().toUpperCase())
    .filter((country) => SUPPORTED_COUNTRIES.has(country));

  return {
    publicKey: config.publicKey,
    privateKey: config.privateKey,
    secretKey: config.secretKey,
    webhookSecretHash: config.webhookSecretHash || '',
    sandbox: config.sandbox === true || config.sandbox === 'true',
    countries: countries.length ? countries : ['SN'],
  };
};

const getClient = (config) => kkiapay({
  privatekey: config.privateKey,
  publickey: config.publicKey,
  secretkey: config.secretKey,
  ...(config.sandbox ? { sandbox: true } : {}),
});

const verifyTransaction = async (transactionId) => {
  const config = await getConfig();
  const client = getClient(config);
  const transaction = await client.verify(transactionId);
  return { config, transaction };
};

const verifyWebhookSecret = (providedSecret, expectedSecret) => {
  if (typeof providedSecret !== 'string' || !expectedSecret) return false;
  const provided = Buffer.from(providedSecret);
  const expected = Buffer.from(expectedSecret);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
};

module.exports = { getConfig, verifyTransaction, verifyWebhookSecret };
