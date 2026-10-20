const crypto = require('crypto');

const TOKEN_TTL_SECONDS = 10 * 365 * 24 * 60 * 60;
const INVALID_TOKEN_ERROR = 'Jeton de désabonnement invalide ou expiré.';

const getSecret = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET est requis pour signer les liens newsletter.');
  return process.env.JWT_SECRET;
};

const signPayload = (payload) => crypto
  .createHmac('sha256', getSecret())
  .update(payload)
  .digest('base64url');

const createNewsletterUnsubscribeToken = (userId) => {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error('Un identifiant utilisateur valide est requis.');
  }
  const payload = Buffer.from(JSON.stringify({
    userId,
    purpose: 'newsletter-unsubscribe',
    expiresAt: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  })).toString('base64url');
  return `${payload}.${signPayload(payload)}`;
};

const verifyNewsletterUnsubscribeToken = (token) => {
  if (typeof token !== 'string') throw new Error(INVALID_TOKEN_ERROR);
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error(INVALID_TOKEN_ERROR);

  const expected = Buffer.from(signPayload(parts[0]));
  const actual = Buffer.from(parts[1]);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new Error(INVALID_TOKEN_ERROR);
  }

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    throw new Error(INVALID_TOKEN_ERROR);
  }
  if (
    decoded.purpose !== 'newsletter-unsubscribe'
    || !Number.isSafeInteger(decoded.userId)
    || decoded.userId <= 0
    || !Number.isSafeInteger(decoded.expiresAt)
    || decoded.expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error(INVALID_TOKEN_ERROR);
  }
  return decoded.userId;
};

module.exports = { createNewsletterUnsubscribeToken, verifyNewsletterUnsubscribeToken };
