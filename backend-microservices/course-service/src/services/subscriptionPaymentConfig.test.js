const assert = require('node:assert/strict');
const { test } = require('node:test');
const { toPublicPaymentConfig } = require('./subscriptionPaymentConfig');
const { calculateSubscriptionQuote } = require('./financeService');

test('publishes only enabled subscription payment destinations', () => {
  const config = toPublicPaymentConfig({
    waveEnabled: true,
    waveAccountName: 'Translink',
    waveAccountNumber: '+221700000000',
    orangeMoneyEnabled: false,
    orangeMoneyAccountName: 'Old account',
    orangeMoneyAccountNumber: '+221711111111',
    bankTransferEnabled: true,
    bankName: 'Banque',
    bankAccountName: 'Translink SARL',
    bankAccountNumber: 'SN00TEST',
    paymentInstructions: 'Indiquez le nom de votre compte.',
    apiSecret: 'must not be returned',
  });

  assert.equal(config.trialDays, 14);
  assert.deepEqual(
    config.plans.map(({ id, monthlyAmountXof }) => [id, monthlyAmountXof]),
    [
      ['INDIVIDUEL', 5000],
      ['PETITE_ENTREPRISE', 10000],
      ['GRANDE_ENTREPRISE', 15000],
      ['CHARGEUR', 2500],
    ],
  );
  assert.deepEqual(config.methods.map((method) => method.key), ['WAVE', 'BANQUE']);
  assert.equal(config.methods[0].accountNumber, '+221700000000');
  assert.equal(Object.hasOwn(config, 'apiSecret'), false);
});

test('does not expose an incomplete payment setup', () => {
  assert.equal(toPublicPaymentConfig({ waveEnabled: true, waveAccountName: 'Translink' }), null);
  assert.equal(toPublicPaymentConfig(null), null);
});

test('monthly subscription prices vary by plan', () => {
  assert.equal(calculateSubscriptionQuote('MONTHLY', 'INDIVIDUEL').amount, 5000);
  assert.equal(calculateSubscriptionQuote('MONTHLY', 'PETITE_ENTREPRISE').amount, 10000);
  assert.equal(calculateSubscriptionQuote('MONTHLY', 'GRANDE_ENTREPRISE').amount, 15000);
  assert.equal(calculateSubscriptionQuote('MONTHLY', 'CHARGEUR').amount, 2500);
});
