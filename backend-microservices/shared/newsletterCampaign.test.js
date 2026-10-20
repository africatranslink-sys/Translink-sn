const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_SUBJECT_LENGTH,
  MAX_MESSAGE_LENGTH,
  validateCampaign
} = require('./newsletterCampaign');

test('accepts a complete campaign within limits', () => {
  assert.equal(validateCampaign({ subject: 'Bonne fête', message: 'Bonjour {{nom}}' }), null);
});

test('requires subject and message', () => {
  assert.match(validateCampaign({ subject: '', message: 'Message' }), /objet.*obligatoire/i);
  assert.match(validateCampaign({ subject: 'Sujet', message: '  ' }), /message.*obligatoire/i);
  assert.match(validateCampaign({ subject: 'Sujet\ninjecté', message: 'Message' }), /une seule ligne/i);
});

test('enforces subject and message length limits', () => {
  assert.match(validateCampaign({ subject: 's'.repeat(MAX_SUBJECT_LENGTH + 1), message: 'Message' }), /objet ne peut pas dépasser/i);
  assert.match(validateCampaign({ subject: 'Sujet', message: 'm'.repeat(MAX_MESSAGE_LENGTH + 1) }), /message ne peut pas dépasser/i);
});
