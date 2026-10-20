const { getPlan, FREE_PLAN } = require('./subscriptionPlans');

const hasPaidAccess = async (client, userId) => {
  const { rows } = await client.query(`
    SELECT (
      (date_debut_essai <= CURRENT_TIMESTAMP AND date_fin_essai > CURRENT_TIMESTAMP)
      OR EXISTS (
        SELECT 1 FROM abonnements
        WHERE utilisateur_id = users.id AND statut = 'ACTIF'
          AND date_debut <= CURRENT_TIMESTAMP AND date_fin > CURRENT_TIMESTAMP
      )
    ) AS has_paid_access
    FROM users
    WHERE id = $1;
  `, [userId]);
  return rows[0]?.has_paid_access === true;
};

const getUserEntitlements = async (client, userId) => {
  const { rows } = await client.query(`
    SELECT u.role, u.date_debut_essai, u.date_fin_essai, u.employeur_id,
           active_subscription.plan AS active_plan,
           (u.role IN ('CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR')
             AND u.date_debut_essai <= CURRENT_TIMESTAMP
             AND u.date_fin_essai > CURRENT_TIMESTAMP) AS trial_active
    FROM users u
    LEFT JOIN LATERAL (
      SELECT plan FROM abonnements
      WHERE utilisateur_id = u.id AND statut = 'ACTIF'
        AND date_debut <= CURRENT_TIMESTAMP AND date_fin > CURRENT_TIMESTAMP
      ORDER BY date_fin DESC
      LIMIT 1
    ) active_subscription ON TRUE
    WHERE u.id = $1;
  `, [userId]);
  const user = rows[0];
  if (!user) return null;

  const trialActive = user.trial_active === true;
  const paidPlan = getPlan(user.active_plan);
  const plan = trialActive
    ? { id: 'ESSAI', maxTrucks: null, maxDrivers: null }
    : paidPlan || FREE_PLAN;

  return {
    role: user.role,
    employeurId: user.employeur_id,
    plan,
    trialActive,
    paid: Boolean(paidPlan),
    chargeurCanPublish: user.role === 'CHARGEUR' && user.active_plan === 'CHARGEUR',
  };
};

const getFreeTierTruckId = async (client, userId) => {
  const { rows } = await client.query(`
    SELECT id FROM camions
    WHERE proprietaire_id = $1
    ORDER BY date_ajout ASC, id ASC
    LIMIT 1;
  `, [userId]);
  return rows[0]?.id ?? null;
};

const assertCanAddTruck = async (client, userId) => {
  const entitlements = await getUserEntitlements(client, userId);
  if (!entitlements || !['CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR'].includes(entitlements.role)) {
    throw Object.assign(new Error('Votre compte ne peut pas enregistrer de camion.'), { statusCode: 403 });
  }
  if (entitlements.plan.maxTrucks == null) return entitlements;
  const { rows } = await client.query(
    'SELECT COUNT(*)::int AS total FROM camions WHERE proprietaire_id = $1;',
    [userId],
  );
  if (Number(rows[0]?.total || 0) >= entitlements.plan.maxTrucks) {
    throw Object.assign(
      new Error(`La formule ${entitlements.plan.id === 'GRATUIT' ? 'gratuite' : entitlements.plan.id} autorise ${entitlements.plan.maxTrucks} camion(s) au maximum. Choisissez une formule supérieure pour étendre votre flotte.`),
      { statusCode: 403 },
    );
  }
  return entitlements;
};

const assertCanAddDriver = async (client, userId) => {
  const entitlements = await getUserEntitlements(client, userId);
  if (!entitlements || !['ENTREPRISE', 'TRANSPORTEUR'].includes(entitlements.role)) {
    throw Object.assign(new Error('Seul un transporteur ou une entreprise peut inviter un chauffeur.'), { statusCode: 403 });
  }
  if (entitlements.plan.maxDrivers == null) return entitlements;
  const { rows } = await client.query(
    "SELECT COUNT(*)::int AS total FROM users WHERE employeur_id = $1 AND role = 'CHAUFFEUR';",
    [userId],
  );
  if (Number(rows[0]?.total || 0) >= entitlements.plan.maxDrivers) {
    throw Object.assign(
      new Error(`Votre formule ${entitlements.plan.id === 'GRATUIT' ? 'gratuite' : entitlements.plan.id} autorise ${entitlements.plan.maxDrivers} chauffeur(s) au maximum. Choisissez une formule supérieure pour inviter davantage de chauffeurs.`),
      { statusCode: 403 },
    );
  }
  return entitlements;
};

const assertTruckWithinPlan = async (client, userId, truckId) => {
  const entitlements = await getUserEntitlements(client, userId);
  if (!entitlements || entitlements.plan.maxTrucks == null) return;
  const { rows } = await client.query(`
    SELECT id FROM camions
    WHERE proprietaire_id = $1
    ORDER BY date_ajout ASC, id ASC
    LIMIT $2;
  `, [userId, entitlements.plan.maxTrucks]);
  if (!rows.some((row) => String(row.id) === String(truckId))) {
    throw Object.assign(
      new Error(`Votre formule autorise ${entitlements.plan.maxTrucks} camion(s) opérationnel(s). Choisissez une formule supérieure pour publier ou accepter des offres avec un autre camion.`),
      { statusCode: 403 },
    );
  }
};

const assertChargeurCanPublish = async (client, userId) => {
  const entitlements = await getUserEntitlements(client, userId);
  if (!entitlements || entitlements.role !== 'CHARGEUR') {
    throw Object.assign(new Error('La publication de demandes est réservée aux comptes chargeur.'), { statusCode: 403 });
  }
  if (!entitlements.chargeurCanPublish) {
    throw Object.assign(new Error('Un abonnement chargeur de 2 500 FCFA par mois est requis pour publier des demandes.'), { statusCode: 403 });
  }
};

module.exports = {
  hasPaidAccess,
  getFreeTierTruckId,
  getUserEntitlements,
  assertCanAddTruck,
  assertCanAddDriver,
  assertTruckWithinPlan,
  assertChargeurCanPublish,
};
