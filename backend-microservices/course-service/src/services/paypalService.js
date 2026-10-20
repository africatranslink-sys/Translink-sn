const crypto = require('crypto');
const db = require('../config/db');
const { getIntegrationConfig } = require('../../../shared/integrationConfig');

let cachedToken;
let tokenExpiresAt = 0;
let cachedTokenFingerprint;

const getConfig = async () => {
  const saved = await getIntegrationConfig(db, 'paypal');
  const mode = saved?.mode || process.env.PAYPAL_MODE || 'sandbox';
  if (!['sandbox', 'live'].includes(mode)) throw new Error('PAYPAL_MODE doit être sandbox ou live.');

  const clientId = saved?.clientId || process.env.PAYPAL_CLIENT_ID;
  const clientSecret = saved?.clientSecret || process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('PayPal n’est pas configuré. Ajoutez les clés API au backend.');

  return {
    baseUrl: mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com',
    clientId,
    clientSecret,
    xofToUsdRate: Number(saved?.xofToUsdRate ?? process.env.PAYPAL_XOF_TO_USD_RATE),
    transactionFeeRate: Number(saved?.transactionFeeRate ?? process.env.PAYPAL_TRANSACTION_FEE_RATE),
    transactionFeeFixedUsd: Number(saved?.transactionFeeFixedUsd ?? process.env.PAYPAL_TRANSACTION_FEE_FIXED_USD),
    payoutFeeRate: saved?.payoutFeeRate == null && process.env.PAYPAL_PAYOUT_FEE_RATE == null
      ? null
      : Number(saved?.payoutFeeRate ?? process.env.PAYPAL_PAYOUT_FEE_RATE),
    payoutFeeCapUsd: Number(saved?.payoutFeeCapUsd ?? process.env.PAYPAL_PAYOUT_FEE_CAP_USD ?? saved?.payoutFeeUsd ?? process.env.PAYPAL_PAYOUT_FEE_USD),
    legacyPayoutFeeUsd: Number(saved?.payoutFeeUsd ?? process.env.PAYPAL_PAYOUT_FEE_USD ?? 0),
  };
};

const getUsdAmount = (amountXof, config) => {
  const rate = config.xofToUsdRate;
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Définissez un taux PAYPAL_XOF_TO_USD_RATE supérieur à zéro.');
  }

  const amountUsd = (Number(amountXof) * rate).toFixed(2);
  if (!Number.isFinite(Number(amountUsd)) || Number(amountUsd) <= 0) {
    throw new Error('Le montant converti en USD est invalide.');
  }

  return { amountUsd, rate };
};

const getCheckoutQuote = (amountXof, config, payoutAmountXof = amountXof) => {
  const { amountUsd: baseAmountUsd, rate } = getUsdAmount(amountXof, config);
  const { transactionFeeRate, transactionFeeFixedUsd, payoutFeeRate, payoutFeeCapUsd, legacyPayoutFeeUsd } = config;
  const payoutUsd = Number((Number(payoutAmountXof) * rate).toFixed(2));
  const payoutFeeUsd = payoutFeeRate == null
    ? legacyPayoutFeeUsd
    : Math.min(payoutUsd * payoutFeeRate, payoutFeeCapUsd);
  if (
    !Number.isFinite(transactionFeeRate)
    || transactionFeeRate < 0
    || transactionFeeRate >= 1
    || !Number.isFinite(transactionFeeFixedUsd)
    || transactionFeeFixedUsd < 0
    || !Number.isFinite(payoutFeeUsd)
    || payoutFeeUsd < 0
    || (payoutFeeRate != null && (!Number.isFinite(payoutFeeRate) || payoutFeeRate < 0 || payoutFeeRate >= 1))
    || !Number.isFinite(payoutFeeCapUsd)
    || payoutFeeCapUsd < 0
  ) {
    throw new Error('Configurez le taux, le frais fixe et le frais de reversement PayPal dans le backend.');
  }

  const feesBeforeRate = Number(baseAmountUsd) + transactionFeeFixedUsd + payoutFeeUsd;
  const amountUsd = (Math.ceil((feesBeforeRate / (1 - transactionFeeRate)) * 100) / 100).toFixed(2);
  const estimatedFeesUsd = (Number(amountUsd) - Number(baseAmountUsd)).toFixed(2);
  return { baseAmountUsd, amountUsd, estimatedFeesUsd, rate };
};

const paypalRequest = async (path, options = {}, configOverride) => {
  const config = configOverride || await getConfig();
  const token = await PayPalService.getAccessToken(config);
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'La requête PayPal a échoué.');
    error.statusCode = response.status;
    error.paypal = {
      debugId: typeof data.debug_id === 'string' ? data.debug_id.slice(0, 100) : undefined,
      issues: Array.isArray(data.details)
        ? data.details.slice(0, 5).map((detail) => ({
          issue: typeof detail.issue === 'string' ? detail.issue.slice(0, 100) : undefined,
          description: typeof detail.description === 'string' ? detail.description.slice(0, 300) : undefined,
        }))
        : [],
    };
    throw error;
  }
  return data;
};

class PayPalService {
  static async getAccessToken(config) {
    const currentConfig = config || await getConfig();
    const fingerprint = crypto.createHash('sha256').update(`${currentConfig.clientId}:${currentConfig.clientSecret}:${currentConfig.baseUrl}`).digest('hex');
    if (cachedToken && cachedTokenFingerprint === fingerprint && Date.now() < tokenExpiresAt) return cachedToken;

    const { baseUrl, clientId, clientSecret } = currentConfig;
    const authorization = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authorization}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      const providerError = typeof data.error === 'string' ? data.error.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) : '';
      const error = new Error(
        response.status === 401 || providerError === 'invalid_client'
          ? `PayPal a refusé les identifiants du mode ${currentConfig.baseUrl.includes('sandbox') ? 'Sandbox' : 'Live'}. Vérifiez que le Client ID et le Secret proviennent de la même application REST PayPal et du même mode.`
          : `PayPal n’a pas délivré de jeton OAuth (HTTP ${response.status}${providerError ? `, ${providerError}` : ''}). Vérifiez la configuration PayPal et réessayez.`
      );
      error.statusCode = 502;
      console.error('PayPal OAuth token request failed:', {
        status: response.status,
        providerError: providerError || undefined,
        mode: currentConfig.baseUrl.includes('sandbox') ? 'sandbox' : 'live',
      });
      throw error;
    }

    cachedToken = data.access_token;
    cachedTokenFingerprint = fingerprint;
    tokenExpiresAt = Date.now() + Math.max(Number(data.expires_in || 300) - 60, 30) * 1000;
    return cachedToken;
  }

  static async convertXofToUsd(amountXof) {
    return getUsdAmount(amountXof, await getConfig());
  }

  static async quoteCheckoutAmount(amountXof, payoutAmountXof = amountXof) {
    return getCheckoutQuote(amountXof, await getConfig(), payoutAmountXof);
  }

  static async createCheckoutOrder({ paymentId, courseId, tranche, amountXof, payoutAmountXof }) {
    const config = await getConfig();
    const quote = getCheckoutQuote(amountXof, config, payoutAmountXof ?? amountXof);
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    const returnUrl = new URL('/chargeur/historique', frontendUrl);
    returnUrl.searchParams.set('paypal', 'return');
    returnUrl.searchParams.set('payment_id', String(paymentId));
    returnUrl.searchParams.set('tranche', tranche);

    const cancelUrl = new URL('/chargeur/historique', frontendUrl);
    cancelUrl.searchParams.set('paypal', 'cancel');
    cancelUrl.searchParams.set('payment_id', String(paymentId));

    const order = await paypalRequest('/v2/checkout/orders', {
      method: 'POST',
      headers: { 'PayPal-Request-Id': crypto.randomUUID() },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: `${paymentId}-${tranche}`,
          custom_id: `${paymentId}:${tranche}`,
          description: `Translink-Africa course ${courseId} - ${tranche.toLowerCase()}`,
          amount: { currency_code: 'USD', value: quote.amountUsd },
        }],
        application_context: {
          brand_name: 'Translink-Africa',
          user_action: 'PAY_NOW',
          return_url: returnUrl.toString(),
          cancel_url: cancelUrl.toString(),
        },
      }),
    }, config);

    const approvalUrl = order.links?.find((link) => ['approve', 'payer-action'].includes(link.rel))?.href;
    if (!order.id || !approvalUrl) throw new Error('PayPal n’a pas renvoyé de lien d’approbation.');
    return { orderId: order.id, approvalUrl, ...quote };
  }

  static async getOrder(orderId) {
    return paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  }

  static async captureOrder(orderId) {
    return paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: 'POST',
      headers: { 'PayPal-Request-Id': `capture-${orderId}` },
      body: '{}',
    });
  }

  static async getAccountBalances() {
    const config = await getConfig();
    const balances = await paypalRequest('/v1/reporting/balances', { method: 'GET' }, config);
    return (balances.balances || []).map((balance) => ({
      currency: balance.currency || balance.total_balance?.currency_code || balance.available_balance?.currency_code,
      total: balance.total_balance?.value ?? balance.total_balance,
      available: balance.available_balance?.value ?? balance.available_balance,
      withheld: balance.withheld_balance?.value ?? balance.withheld_balance,
    }));
  }

  static async getPayoutBatch(batchId) {
    return paypalRequest(`/v1/payments/payouts/${encodeURIComponent(batchId)}`);
  }

  static async getActualPayoutFeeUsd(batch, paymentId, tranche) {
    const items = batch?.items?.items || batch?.items || batch?.payout_batch_items || [];
    const senderItemId = `tl-${paymentId}-${String(tranche).toLowerCase()}`;
    const item = items.find((entry) => entry.sender_item_id === senderItemId)
      || (items.length === 1 ? items[0] : null);
    const fee = item?.payout_item_fee;
    if ((fee?.currency || fee?.currency_code) === 'USD' && Number.isFinite(Number(fee.value)) && Number(fee.value) >= 0) {
      return Number(fee.value);
    }

    const transactionId = item?.transaction_id;
    if (!transactionId) return null;
    try {
      const now = new Date();
      const createdAt = new Date(batch.batch_header?.time_created || now);
      const startDate = new Date(Math.max(createdAt.getTime() - 24 * 60 * 60 * 1000, now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000));
      const endDate = new Date(Math.min(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000, now.getTime()));
      if (startDate >= endDate) return null;
      const query = new URLSearchParams({
        transaction_id: transactionId,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        page_size: '100',
      });
      const report = await paypalRequest(`/v1/reporting/transactions?${query}`);
      const transactions = report.transaction_details || report.transactionDetails || [];
      const matched = transactions.find(({ transaction_info: transactionInfo }) => transactionInfo?.transaction_id === transactionId);
      const reportedFee = matched?.transaction_info?.transaction_fee_amount
        || matched?.transaction_info?.fee_amount;
      const value = Number(reportedFee?.value);
      if ((reportedFee?.currency_code || reportedFee?.currency) === 'USD' && Number.isFinite(value)) {
        return Math.abs(value);
      }
    } catch (error) {
      console.warn('PayPal transaction fee report unavailable:', error.message);
    }
    return null;
  }

  static async createPayout({ paymentId, tranche, receiver, amountXof }) {
    const config = await getConfig();
    const { amountUsd, rate } = getUsdAmount(amountXof, config);
    const payout = await paypalRequest('/v1/payments/payouts', {
      method: 'POST',
      headers: { 'PayPal-Request-Id': `translink-${paymentId}-${tranche}` },
      body: JSON.stringify({
        sender_batch_header: {
          sender_batch_id: `tl-${paymentId}-${tranche.toLowerCase()}`,
          email_subject: 'Votre reversement Translink-Africa',
          email_message: 'Un reversement Translink-Africa a été initié sur votre compte PayPal.',
        },
        items: [{
          recipient_type: 'EMAIL',
          amount: { value: amountUsd, currency: 'USD' },
          receiver,
          sender_item_id: `tl-${paymentId}-${tranche.toLowerCase()}`,
          note: `Reversement Translink-Africa, paiement ${paymentId}`,
        }],
      }),
    }, config);

    const batchId = payout.batch_header?.payout_batch_id;
    if (!batchId) throw new Error('PayPal n’a pas renvoyé de référence de reversement.');
    return {
      batchId,
      amountUsd,
      rate,
      status: payout.batch_header.batch_status,
      actualFeeUsd: await PayPalService.getActualPayoutFeeUsd(payout, paymentId, tranche),
    };
  }
}

module.exports = PayPalService;