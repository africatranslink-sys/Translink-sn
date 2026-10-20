const PLANS = Object.freeze({
  INDIVIDUEL: Object.freeze({
    id: 'INDIVIDUEL',
    name: 'Individuel privé',
    monthlyAmountXof: 5000,
    maxTrucks: 1,
    maxDrivers: 1,
    roles: ['CHAUFFEUR'],
    features: ['Publier et accepter des offres avec un camion', 'Un chauffeur autorisé'],
  }),
  PETITE_ENTREPRISE: Object.freeze({
    id: 'PETITE_ENTREPRISE',
    name: 'Petite entreprise',
    monthlyAmountXof: 10000,
    maxTrucks: 3,
    maxDrivers: 3,
    roles: ['ENTREPRISE', 'TRANSPORTEUR'],
    features: ['Gestion d’une flotte jusqu’à 3 camions', 'Inviter jusqu’à 3 chauffeurs'],
  }),
  GRANDE_ENTREPRISE: Object.freeze({
    id: 'GRANDE_ENTREPRISE',
    name: 'Grande entreprise',
    monthlyAmountXof: 15000,
    maxTrucks: null,
    maxDrivers: null,
    roles: ['ENTREPRISE', 'TRANSPORTEUR'],
    features: ['Flotte et chauffeurs sans limite', 'Visibilité prioritaire des disponibilités'],
  }),
  CHARGEUR: Object.freeze({
    id: 'CHARGEUR',
    name: 'Chargeur',
    monthlyAmountXof: 2500,
    maxTrucks: 0,
    maxDrivers: 0,
    roles: ['CHARGEUR'],
    features: ['Publier des demandes de transport pendant la période active'],
  }),
});

const FREE_PLAN = Object.freeze({
  id: 'GRATUIT',
  name: 'Offre gratuite',
  monthlyAmountXof: 0,
  maxTrucks: 1,
  maxDrivers: null,
  features: ['Un camion opérationnel'],
});

const LEGACY_PRO_PLAN = Object.freeze({
  id: 'PRO',
  name: 'Formule transport historique',
  monthlyAmountXof: 5000,
  maxTrucks: null,
  maxDrivers: null,
  roles: ['CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR'],
  features: ['Accès transport historique conservé'],
});

const getPlan = (planId) => PLANS[planId] || (planId === 'PRO' ? LEGACY_PRO_PLAN : null);

const isPlanAllowedForRole = (planId, role, employeurId = null) => {
  const plan = PLANS[planId];
  if (!plan || !plan.roles.includes(role)) return false;
  return role !== 'CHAUFFEUR' || employeurId == null;
};

module.exports = { PLANS, FREE_PLAN, getPlan, isPlanAllowedForRole };
