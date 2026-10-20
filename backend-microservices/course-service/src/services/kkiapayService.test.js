const assert = require('node:assert/strict');
const { test } = require('node:test');
const { verifyWebhookSecret } = require('./kkiapayService');

test('accepts a matching KKiaPay webhook hash', () => {
  assert.equal(verifyWebhookSecret('configured-hash', 'configured-hash'), true);
});

test('rejects missing, unconfigured, or mismatched webhook hashes', () => {
  assert.equal(verifyWebhookSecret(undefined, 'configured-hash'), false);
  assert.equal(verifyWebhookSecret('provided-hash', ''), false);
  assert.equal(verifyWebhookSecret('incorrect', 'configured-hash'), false);
});
