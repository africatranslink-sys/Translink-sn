const assert = require('node:assert/strict');
const { test } = require('node:test');
const { FREE_PLAN, PLANS, isPlanAllowedForRole } = require('./subscriptionPlans');

test('defines the requested monthly prices and fleet quotas', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(PLANS).map(([id, plan]) => [id, [plan.monthlyAmountXof, plan.maxTrucks, plan.maxDrivers]])),
    {
      INDIVIDUEL: [5000, 1, 1],
      PETITE_ENTREPRISE: [10000, 3, 3],
      GRANDE_ENTREPRISE: [15000, null, null],
      CHARGEUR: [2500, 0, 0],
    },
  );
  assert.equal(FREE_PLAN.maxTrucks, 1);
});

test('offers only the appropriate plans to each account type', () => {
  assert.equal(isPlanAllowedForRole('INDIVIDUEL', 'CHAUFFEUR'), true);
  assert.equal(isPlanAllowedForRole('INDIVIDUEL', 'CHAUFFEUR', 12), false);
  assert.equal(isPlanAllowedForRole('PETITE_ENTREPRISE', 'TRANSPORTEUR'), true);
  assert.equal(isPlanAllowedForRole('GRANDE_ENTREPRISE', 'ENTREPRISE'), true);
  assert.equal(isPlanAllowedForRole('CHARGEUR', 'CHARGEUR'), true);
  assert.equal(isPlanAllowedForRole('CHARGEUR', 'TRANSPORTEUR'), false);
});
