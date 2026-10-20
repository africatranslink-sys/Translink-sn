const PLATFORM_COMMISSION_RATE = Object.freeze({
  ENTREPRISE: 0.10,
  TRANSPORTEUR: 0.10,
  CHAUFFEUR: 0.15
});

const ANNUAL_DISCOUNT_RATE = 0.10;
const SUBSCRIPTION_MONTHLY_PRICES = Object.freeze({
  INDIVIDUEL: 5000,
  PETITE_ENTREPRISE: 10000,
  GRANDE_ENTREPRISE: 15000,
  CHARGEUR: 2500,
});

const calculateFreightSettlement = (amount, ownerRole) => {
  const total = Number(amount);
  const rate = PLATFORM_COMMISSION_RATE[ownerRole];
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error('Le montant du transport doit être un entier positif en FCFA.');
  if (rate == null) throw new Error('Le rôle du propriétaire ne permet pas de calculer une commission.');

  const advanceGross = Math.floor(total / 2);
  const balanceGross = total - advanceGross;
  const platformFeeTotal = Math.round(total * rate);
  const advancePlatformFee = Math.round(platformFeeTotal * advanceGross / total);
  const balancePlatformFee = platformFeeTotal - advancePlatformFee;

  return {
    currency: 'XOF',
    total,
    commissionRate: rate,
    platformFeeTotal,
    advance: {
      gross: advanceGross,
      platformFee: advancePlatformFee,
      ownerNet: advanceGross - advancePlatformFee
    },
    balance: {
      gross: balanceGross,
      platformFee: balancePlatformFee,
      ownerNet: balanceGross - balancePlatformFee
    },
    ownerNetTotal: total - platformFeeTotal
  };
};

const calculateSubscriptionQuote = (period = 'MONTHLY', plan = 'INDIVIDUEL') => {
  const monthlyAmount = SUBSCRIPTION_MONTHLY_PRICES[plan];
  if (monthlyAmount == null) throw new Error('Formule d’abonnement non prise en charge.');
  if (period === 'MONTHLY') {
    return { plan, period, currency: 'XOF', amount: monthlyAmount, discountRate: 0, months: 1 };
  }
  if (period === 'ANNUAL') {
    const regularAmount = monthlyAmount * 12;
    const amount = Math.round(regularAmount * (1 - ANNUAL_DISCOUNT_RATE));
    return { plan: 'PRO', period, currency: 'XOF', amount, regularAmount, saving: regularAmount - amount, discountRate: ANNUAL_DISCOUNT_RATE, months: 12 };
  }
  throw new Error('Période d’abonnement non prise en charge.');
};

module.exports = {
  PLATFORM_COMMISSION_RATE,
  SUBSCRIPTION_MONTHLY_PRICES,
  calculateFreightSettlement,
  calculateSubscriptionQuote,
};
