const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  createNewsletterUnsubscribeToken,
  verifyNewsletterUnsubscribeToken
} = require('./newsletterToken');

test('newsletter unsubscribe tokens contain the intended user id', () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'newsletter-test-secret';
  try {
    const token = createNewsletterUnsubscribeToken(42);
    assert.equal(verifyNewsletterUnsubscribeToken(token), 42);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test('rejects signed tokens issued for a different purpose', () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'newsletter-test-secret';
  try {
    const payload = Buffer.from(JSON.stringify({
      userId: 42,
      purpose: 'login',
      expiresAt: Math.floor(Date.now() / 1000) + 60
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', process.env.JWT_SECRET).update(payload).digest('base64url');
    assert.throws(() => verifyNewsletterUnsubscribeToken(`${payload}.${signature}`), /Jeton de désabonnement invalide/);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
