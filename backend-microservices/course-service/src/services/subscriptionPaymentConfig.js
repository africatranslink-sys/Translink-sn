const db = require('../config/db');
const { getIntegrationConfig } = require('../../../shared/integrationConfig');
const { PLANS } = require('../../../shared/subscriptionPlans');

const publicPlans = Object.values(PLANS).map(({ id, name, monthlyAmountXof, maxTrucks, maxDrivers, roles, features }) => ({
  id,
  name,
  monthlyAmountXof,
  maxTrucks,
  maxDrivers,
  roles,
  features,
}));

const toPublicPaymentConfig = (settings) => {
  if (!settings) return null;

  const methods = [];
  if (settings.waveEnabled && settings.waveAccountName && settings.waveAccountNumber) {
    methods.push({
      key: 'WAVE',
      label: 'Wave',
      accountName: settings.waveAccountName,
      accountNumber: settings.waveAccountNumber,
      instructions: settings.paymentInstructions || '',
    });
  }
  if (settings.orangeMoneyEnabled && settings.orangeMoneyAccountName && settings.orangeMoneyAccountNumber) {
    methods.push({
      key: 'ORANGE_MONEY',
      label: 'Orange Money',
      accountName: settings.orangeMoneyAccountName,
      accountNumber: settings.orangeMoneyAccountNumber,
      instructions: settings.paymentInstructions || '',
    });
  }
  if (settings.bankTransferEnabled && settings.bankName && settings.bankAccountName && settings.bankAccountNumber) {
    methods.push({
      key: 'BANQUE',
      label: 'Virement bancaire',
      bankName: settings.bankName,
      accountName: settings.bankAccountName,
      accountNumber: settings.bankAccountNumber,
      instructions: settings.paymentInstructions || '',
    });
  }

  if (!methods.length) return null;
  return { trialDays: 14, plans: publicPlans, methods };
};

const getSubscriptionPaymentConfig = async () => {
  const settings = await getIntegrationConfig(db, 'subscriptionPayments');
  const publicConfig = toPublicPaymentConfig(settings) || {
    trialDays: 14,
    plans: publicPlans,
    methods: [],
  };
  const kkiapay = await getIntegrationConfig(db, 'kkiapay');
  if (kkiapay?.publicKey && kkiapay?.privateKey && kkiapay?.secretKey) {
    publicConfig.methods.unshift({
      key: 'KKIAPAY',
      label: 'KKiaPay — Mobile Money, carte et wallet',
    });
  }
  if (!publicConfig.methods.length) {
    throw Object.assign(new Error('Les moyens de paiement des abonnements ne sont pas configurés.'), { statusCode: 503 });
  }
  return publicConfig;
};

module.exports = { getSubscriptionPaymentConfig, toPublicPaymentConfig };
