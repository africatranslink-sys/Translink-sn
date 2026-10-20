const test = require('node:test');
const assert = require('node:assert/strict');
const { getAccountAccessError } = require('./accountAccess');

test('allows validated accounts', () => {
  assert.equal(getAccountAccessError('VALIDE'), null);
});

test('blocks pending, refused, and suspended accounts with distinct messages', () => {
  assert.match(getAccountAccessError('EN_ATTENTE'), /attente de validation/);
  assert.match(getAccountAccessError('REFUSE'), /a été refusé/);
  assert.match(getAccountAccessError('SUSPENDU'), /suspendu/);
});
