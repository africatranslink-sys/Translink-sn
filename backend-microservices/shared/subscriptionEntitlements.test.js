const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  assertTruckWithinPlan,
  getFreeTierTruckId,
  hasPaidAccess,
  assertCanAddTruck,
  assertCanAddDriver,
  assertChargeurCanPublish,
} = require('./subscriptionEntitlements');

test('paid access is true only when the database confirms it', async () => {
  assert.equal(await hasPaidAccess({ query: async () => ({ rows: [{ has_paid_access: true }] }) }, 7), true);
  assert.equal(await hasPaidAccess({ query: async () => ({ rows: [{ has_paid_access: false }] }) }, 7), false);
  assert.equal(await hasPaidAccess({ query: async () => ({ rows: [] }) }, 7), false);
});

test('small-business access enforces its truck and driver limits', async () => {
  const clientWithCounts = (trucks, drivers) => ({
    query: async (sql) => {
      if (sql.includes('active_subscription.plan')) {
        return { rows: [{ role: 'TRANSPORTEUR', trial_active: false, active_plan: 'PETITE_ENTREPRISE', employeur_id: null }] };
      }
      if (sql.includes('COUNT(*)::int AS total FROM camions')) return { rows: [{ total: trucks }] };
      return { rows: [{ total: drivers }] };
    },
  });

  await assertCanAddTruck(clientWithCounts(2, 0), 7);
  await assert.rejects(assertCanAddTruck(clientWithCounts(3, 0), 7), { statusCode: 403, message: /3 camion/ });
  await assertCanAddDriver(clientWithCounts(0, 2), 7);
  await assert.rejects(assertCanAddDriver(clientWithCounts(0, 3), 7), { statusCode: 403, message: /3 chauffeur/ });
});

test('chargeur publication requires its paid monthly plan', async () => {
  const client = (activePlan) => ({
    query: async () => ({ rows: [{ role: 'CHARGEUR', trial_active: false, active_plan: activePlan, employeur_id: null }] }),
  });
  await assertChargeurCanPublish(client('CHARGEUR'), 9);
  await assert.rejects(assertChargeurCanPublish(client(null), 9), { statusCode: 403, message: /2 500 FCFA/ });
});

test('free plan selects the oldest truck as its usable truck', async () => {
  assert.equal(await getFreeTierTruckId({ query: async () => ({ rows: [{ id: 12 }] }) }, 7), 12);
  assert.equal(await getFreeTierTruckId({ query: async () => ({ rows: [] }) }, 7), null);
});

test('free plan rejects using a truck other than its allowed truck', async () => {
  const client = {
    query: async (sql) => {
      if (sql.includes('active_subscription.plan')) {
        return { rows: [{ role: 'TRANSPORTEUR', trial_active: false, active_plan: null, employeur_id: null }] };
      }
      return { rows: [{ id: 12 }] };
    },
  };
  await assertTruckWithinPlan(client, 7, 12);
  await assert.rejects(
    assertTruckWithinPlan(client, 7, 14),
    { statusCode: 403, message: /1 camion/ },
  );
});
