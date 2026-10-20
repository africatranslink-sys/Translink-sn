const PaiementModel = require('../models/paiementModel');
const PaymentService = require('../services/paymentService');
const { getSubscriptionPaymentConfig } = require('../services/subscriptionPaymentConfig');
const PayPalService = require('../services/paypalService');
const KkiapayService = require('../services/kkiapayService');
const db = require('../config/db');

const getKkiapayCheckoutPayload = async (amountXof, partnerId) => {
  const config = await KkiapayService.getConfig();
  return {
    amount: amountXof,
    publicKey: config.publicKey,
    sandbox: config.sandbox,
    countries: config.countries,
    paymentmethod: ['momo', 'card', 'wallet'],
    partnerId,
    data: partnerId,
  };
};

const verifyKkiapayPayment = async (transactionId, partnerId, amount) => {
  if (typeof transactionId !== 'string' || !transactionId.trim()) {
    throw Object.assign(new Error('La référence de transaction KKiaPay est manquante.'), { statusCode: 400 });
  }
  const { transaction } = await KkiapayService.verifyTransaction(transactionId.trim());
  if (
    transaction?.status !== 'SUCCESS'
    || Number(transaction.amount) !== Number(amount)
    || transaction.partnerId !== partnerId
  ) {
    throw Object.assign(new Error('La transaction KKiaPay n’est pas confirmée ou ne correspond pas au paiement.'), { statusCode: 409 });
  }
  return transaction;
};

const refreshPayPalPayoutStatuses = async (payouts) => Promise.all(payouts.map(async (payout) => {
  try {
    const batch = await PayPalService.getPayoutBatch(payout.batchId);
    const providerStatus = batch.batch_header?.batch_status;
    if (providerStatus === 'SUCCESS') {
      const actualFeeUsd = await PayPalService.getActualPayoutFeeUsd(batch, payout.paymentId, payout.tranche);
      if (actualFeeUsd !== null) {
        await PaiementModel.savePayPalPayoutActualFee(payout.paymentId, payout.tranche, payout.batchId, actualFeeUsd);
      }
      if (payout.status !== 'ENVOYE') {
        await PaiementModel.updatePayPalPayoutStatus(payout.paymentId, payout.tranche, 'ENVOYE');
      }
    } else if (['DENIED', 'FAILED', 'CANCELED', 'RETURNED'].includes(providerStatus)) {
      await PaiementModel.updatePayPalPayoutStatus(payout.paymentId, payout.tranche, 'ECHEC');
    }
  } catch (error) {
    console.warn('PayPal payout status unavailable:', error.message);
  }
}));

const getPayoutActualFee = async (payout, paymentId, tranche) => {
  if (Object.hasOwn(payout, 'actualFeeUsd')) return payout.actualFeeUsd;
  if (payout.status !== 'SUCCESS') return null;
  try {
    const batch = await PayPalService.getPayoutBatch(payout.batchId);
    return await PayPalService.getActualPayoutFeeUsd(batch, paymentId, tranche);
  } catch (error) {
    console.warn('PayPal payout fee unavailable:', error.message);
    return null;
  }
};

const initiatePayPalOwnerPayout = async (paymentId, tranche) => {
  const details = await PaiementModel.getOwnerPayoutDetails(paymentId, tranche);
  if (!details || details.compte_paiement_type !== 'PAYPAL') return { status: 'EN_ATTENTE' };
  if (details.statut_reversement !== 'EN_ATTENTE') return { status: details.statut_reversement };

  const receiver = String(details.compte_paiement_identifiant || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receiver)) return { status: 'EN_ATTENTE' };
  const claimed = await PaiementModel.claimOwnerPayPalPayout(paymentId, tranche);
  if (!claimed) return { status: 'EN_ATTENTE' };

  try {
    const payout = await PayPalService.createPayout({
      paymentId,
      tranche,
      receiver,
      amountXof: Number(details.montant_net),
    });
    const resultStatus = payout.status === 'SUCCESS' ? 'ENVOYE' : 'EN_COURS';
    const actualFeeUsd = await getPayoutActualFee(payout, paymentId, tranche);
    const recorded = await PaiementModel.recordOwnerPayout(paymentId, tranche, payout.batchId, payout.amountUsd, payout.rate, 'EN_COURS', resultStatus, actualFeeUsd);
    if (!recorded) throw new Error('Référence PayPal non enregistrée après création du reversement.');
    return { status: resultStatus, reference: payout.batchId };
  } catch (error) {
    await PaiementModel.releaseOwnerPayPalPayout(paymentId, tranche);
    console.error('PayPal payout pending:', error.message);
    return { status: 'EN_ATTENTE' };
  }
};

const initiatePaiement = async (req, res) => {
  try {
    const { course_id, moyen_paiement } = req.body;

    if (!['WAVE', 'ORANGE_MONEY', 'BANQUE', 'PAYPAL', 'KKIAPAY'].includes(moyen_paiement)) {
      return res.status(400).json({ error: 'Moyen de paiement non supporté.' });
    }
    if (moyen_paiement === 'KKIAPAY') await KkiapayService.getConfig();

    const paiement = await PaiementModel.createForCourse(course_id, req.user.id, moyen_paiement);

    res.status(201).json({
      message: moyen_paiement === 'PAYPAL'
        ? 'Paiement calculé. Continuez vers PayPal pour régler la tranche.'
        : 'Paiement calculé. Réglez l’avance puis transmettez sa référence pour validation.',
      paiement,
      avance: { montant: paiement.montant_avance, commission: paiement.montant_avance_commission, net_proprietaire: paiement.montant_avance_net },
      solde: { montant: paiement.montant_solde, commission: paiement.montant_solde_commission, net_proprietaire: paiement.montant_solde_net }
    });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    if (error.message?.includes('montant')) return res.status(400).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de l\'initialisation du paiement' });
  }
};

const createPayPalOrder = async (req, res) => {
  try {
    const tranche = String(req.params.tranche || '').toUpperCase();
    if (!['AVANCE', 'SOLDE'].includes(tranche)) return res.status(400).json({ error: 'Tranche PayPal invalide.' });

    const paymentId = req.params.id;
    const { payment, amountXof } = await PaiementModel.getPayPalInstallment(paymentId, req.user.id, tranche);
    const payoutAmountXof = Number(tranche === 'AVANCE' ? payment.montant_avance_net : payment.montant_solde_net);
    const order = await PayPalService.createCheckoutOrder({
      paymentId,
      courseId: payment.course_id,
      tranche,
      amountXof,
      payoutAmountXof,
    });
    await PaiementModel.savePayPalOrder(paymentId, req.user.id, tranche, order.orderId, order.amountUsd, order.estimatedFeesUsd, order.rate);
    res.json({
      orderId: order.orderId,
      approvalUrl: order.approvalUrl,
      baseAmountUsd: order.baseAmountUsd,
      amountUsd: order.amountUsd,
      estimatedFeesUsd: order.estimatedFeesUsd,
      rate: order.rate,
    });
  } catch (error) {
    if (error.statusCode === 403 || error.statusCode === 404 || error.statusCode === 409) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('PayPal order error:', {
      message: error.message,
      status: error.statusCode,
      debugId: error.paypal?.debugId,
      issues: error.paypal?.issues,
    });
    res.status(error.message?.includes('PayPal n’est pas configuré') || error.message?.includes('PAYPAL_') || error.message?.includes('Configurez le taux') ? 503 : 502)
      .json({
        error: error.message || 'Impossible de préparer le paiement PayPal.',
        paypalIssues: error.paypal?.issues?.map((detail) => detail.issue).filter(Boolean),
        paypalDebugId: error.paypal?.debugId,
      });
  }
};

const createKkiapayCourseCheckout = async (req, res) => {
  try {
    const tranche = String(req.params.tranche || '').toUpperCase();
    if (!['AVANCE', 'SOLDE'].includes(tranche)) return res.status(400).json({ error: 'Tranche KKiaPay invalide.' });
    const { amountXof, partnerId } = await PaiementModel.getKkiapayInstallment(req.params.id, req.user.id, tranche);
    await PaiementModel.saveKkiapayInstallmentPartner(req.params.id, req.user.id, tranche, partnerId);
    res.set('Cache-Control', 'no-store');
    res.json(await getKkiapayCheckoutPayload(amountXof, partnerId));
  } catch (error) {
    res.status(error.statusCode || 503).json({ error: error.message || 'Impossible de préparer le paiement KKiaPay.' });
  }
};

const confirmKkiapayCoursePayment = async (req, res) => {
  try {
    const tranche = String(req.params.tranche || '').toUpperCase();
    if (!['AVANCE', 'SOLDE'].includes(tranche)) return res.status(400).json({ error: 'Tranche KKiaPay invalide.' });
    const payment = await PaiementModel.getKkiapayInstallment(req.params.id, req.user.id, tranche, true);
    const transaction = await verifyKkiapayPayment(req.body?.transactionId, payment.partnerId, payment.amountXof);
    const updated = await PaiementModel.completeKkiapayInstallment(
      req.params.id,
      req.user.id,
      tranche,
      payment.partnerId,
      transaction.transactionId || req.body.transactionId,
      transaction.amount,
    );
    res.json({ message: 'Paiement KKiaPay vérifié et confirmé.', paiement: updated });
  } catch (error) {
    res.status(error.statusCode || 502).json({ error: error.message || 'Impossible de vérifier le paiement auprès de KKiaPay.' });
  }
};

const createKkiapaySubscriptionCheckout = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id, montant FROM abonnements
      WHERE id = $1 AND utilisateur_id = $2 AND moyen_paiement = 'KKIAPAY' AND statut = 'EN_ATTENTE';
    `, [req.params.id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Demande d’abonnement KKiaPay introuvable ou déjà traitée.' });
    const partnerId = `translink-subscription:${rows[0].id}`;
    await PaiementModel.saveKkiapaySubscriptionPartner(req.params.id, req.user.id, partnerId);
    res.set('Cache-Control', 'no-store');
    res.json(await getKkiapayCheckoutPayload(Number(rows[0].montant), partnerId));
  } catch (error) {
    res.status(error.statusCode || 503).json({ error: error.message || 'Impossible de préparer le paiement KKiaPay.' });
  }
};

const confirmKkiapaySubscriptionPayment = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id, montant, kkiapay_partner_id FROM abonnements
      WHERE id = $1 AND utilisateur_id = $2 AND moyen_paiement = 'KKIAPAY';
    `, [req.params.id, req.user.id]);
    if (!rows[0]?.kkiapay_partner_id) return res.status(404).json({ error: 'Demande de paiement KKiaPay introuvable.' });
    const transaction = await verifyKkiapayPayment(req.body?.transactionId, rows[0].kkiapay_partner_id, Number(rows[0].montant));
    const subscription = await PaiementModel.completeKkiapaySubscription(
      req.params.id,
      req.user.id,
      rows[0].kkiapay_partner_id,
      transaction.transactionId || req.body.transactionId,
      transaction.amount,
    );
    res.json({ message: 'Paiement vérifié ; votre abonnement est activé.', subscription });
  } catch (error) {
    res.status(error.statusCode || 502).json({ error: error.message || 'Impossible de vérifier le paiement auprès de KKiaPay.' });
  }
};

const handleKkiapayWebhook = async (req, res) => {
  try {
    const config = await KkiapayService.getConfig();
    if (!KkiapayService.verifyWebhookSecret(req.get('x-kkiapay-secret'), config.webhookSecretHash)) {
      return res.status(401).json({ error: 'Signature du webhook KKiaPay invalide.' });
    }
    const transactionId = String(req.body?.transactionId || '').trim();
    const partnerId = String(req.body?.partnerId || '').trim();
    if (req.body?.isPaymentSucces === false) return res.status(200).json({ received: true, ignored: true });
    if (!transactionId || req.body?.isPaymentSucces !== true || !partnerId) {
      return res.status(400).json({ error: 'Événement KKiaPay incomplet.' });
    }
    const transaction = await verifyKkiapayPayment(transactionId, partnerId, Number(req.body.amount));
    const courseMatch = /^translink-course:(\d+):(AVANCE|SOLDE)$/.exec(partnerId);
    const subscriptionMatch = /^translink-subscription:(\d+)$/.exec(partnerId);
    if (courseMatch) {
      await PaiementModel.completeKkiapayInstallment(
        courseMatch[1], null, courseMatch[2], partnerId,
        transaction.transactionId || transactionId, transaction.amount,
      );
    } else if (subscriptionMatch) {
      await PaiementModel.completeKkiapaySubscription(
        subscriptionMatch[1], null, partnerId,
        transaction.transactionId || transactionId, transaction.amount,
      );
    } else {
      return res.status(400).json({ error: 'Référence partenaire KKiaPay inconnue.' });
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('KKiaPay webhook processing failed:', error.message);
    return res.status(error.statusCode || 502).json({ error: error.message || 'Échec du traitement du webhook KKiaPay.' });
  }
};

const getMyTransactions = async (req, res) => {
  try {
    const pendingPayouts = await PaiementModel.getMyPendingPayPalPayouts(req.user.id);
    await refreshPayPalPayoutStatuses(pendingPayouts);
    res.json(await PaiementModel.findMyTransactions(req.user.id));
  } catch (error) {
    console.error('Transaction history error:', error.message);
    res.status(500).json({ error: 'Impossible de charger votre historique de transactions.' });
  }
};

const getAdminFunds = async (req, res) => {
  try {
    await refreshPayPalPayoutStatuses(await PaiementModel.getMyPendingPayPalPayouts(null, 100));
    const [summary, paypalBalances] = await Promise.all([
      PaiementModel.getPlatformFundsSummary(),
      PayPalService.getAccountBalances().catch((error) => {
        console.warn('PayPal balance unavailable:', error.message);
        return null;
      }),
    ]);

    res.json({
      accounting: {
        commissionConfirmedXof: Number(summary.commission_confirmee_xof || 0),
        payoutsPendingXof: Number(summary.reversements_a_traiter_xof || 0),
        estimatedPayPalFeesUsd: Number(summary.frais_paypal_estimes_usd || 0),
        actualPayPalFeesUsd: Number(summary.frais_paypal_reels_usd || 0),
        actualPayPalPayoutFeesUsd: Number(summary.frais_reversement_paypal_reels_usd || 0),
        actualPayPalFeeCaptureCount: Number(summary.captures_paypal_avec_frais_reels || 0),
        actualPayPalPayoutFeeCount: Number(summary.reversements_paypal_avec_frais_reels || 0),
        subscriptionRevenueXof: Number(summary.abonnements_actifs_xof || 0),
      },
      providers: [
        { key: 'paypal', status: paypalBalances?.length ? 'available' : 'unavailable', balances: paypalBalances || [] },
        { key: 'wave', status: 'pending-integration', balances: [] },
        { key: 'orangeMoney', status: 'pending-integration', balances: [] },
      ],
    });
  } catch (error) {
    console.error('Admin funds summary error:', error.message);
    res.status(500).json({ error: 'Impossible de charger les fonds de la plateforme.' });
  }
};

const getPayPalFeeRecommendations = async (req, res) => {
  try {
    await refreshPayPalPayoutStatuses(await PaiementModel.getMyPendingPayPalPayouts(null, 50));
    await refreshPayPalPayoutStatuses(await PaiementModel.getPayPalPayoutsMissingActualFees(5));
    const [checkoutSamples, payoutSamples, summary, exchangeResponse] = await Promise.all([
      PaiementModel.getPayPalFeeSamples(),
      PaiementModel.getPayPalPayoutFeeSamples(),
      PaiementModel.getPlatformFundsSummary(),
      fetch('https://open.er-api.com/v6/latest/XOF'),
    ]);
    if (!exchangeResponse.ok) throw new Error(`Exchange-rate provider returned ${exchangeResponse.status}.`);
    const exchangeData = await exchangeResponse.json();
    const xofToUsdRate = Number(exchangeData?.rates?.USD);
    if (exchangeData?.result !== 'success' || !Number.isFinite(xofToUsdRate) || xofToUsdRate <= 0) {
      throw new Error('Exchange-rate provider returned an invalid XOF/USD rate.');
    }

    let checkout = {
      ready: false,
      provisional: true,
      sampleCount: checkoutSamples.length,
      requiredSamples: 5,
      transactionFeeRate: 0.0539,
      transactionFeeFixedUsd: 0.30,
      source: 'Tarif PayPal publié pour les transactions internationales des autres marchés.',
      reason: checkoutSamples.length < 5 ? 'Tarif provisoire; les frais réellement facturés seront appris depuis les paiements.' : null,
    };
    if (checkoutSamples.length >= 5) {
      const meanAmount = checkoutSamples.reduce((sum, sample) => sum + sample.amountUsd, 0) / checkoutSamples.length;
      const meanFee = checkoutSamples.reduce((sum, sample) => sum + sample.feeUsd, 0) / checkoutSamples.length;
      const variance = checkoutSamples.reduce((sum, sample) => sum + (sample.amountUsd - meanAmount) ** 2, 0);
      if (variance > 0) {
        const covariance = checkoutSamples.reduce(
          (sum, sample) => sum + (sample.amountUsd - meanAmount) * (sample.feeUsd - meanFee),
          0,
        );
        const rate = covariance / variance;
        const fixedUsd = meanFee - rate * meanAmount;
        if (Number.isFinite(rate) && rate >= 0 && rate < 1 && Number.isFinite(fixedUsd) && fixedUsd >= 0) {
          checkout = {
            ready: true,
            provisional: false,
            sampleCount: checkoutSamples.length,
            transactionFeeRate: Number(rate.toFixed(4)),
            transactionFeeFixedUsd: Number(fixedUsd.toFixed(2)),
            method: 'Régression sur les frais effectivement déclarés par PayPal.',
          };
        } else {
          checkout.reason = 'Les frais observés ne permettent pas une estimation statistique fiable; tarif PayPal provisoire affiché.';
        }
      } else {
        checkout.reason = 'Les montants observés doivent varier pour estimer séparément le taux et le frais fixe; tarif PayPal provisoire affiché.';
      }
    }

    const payoutFee = {
      ready: false,
      provisional: true,
      sampleCount: payoutSamples.length,
      rate: 0.02,
      capUsd: 50,
      source: 'Tarif PayPal publié « All other markets ».',
    };
    const platformRevenueXof = Number(summary.commission_confirmee_xof || 0)
      + Number(summary.abonnements_actifs_xof || 0);
    const platformRevenueUsd = Number((platformRevenueXof * xofToUsdRate).toFixed(2));
    const totalActualPayPalFeesUsd = Number(summary.frais_paypal_reels_usd || 0)
      + Number(summary.frais_reversement_paypal_reels_usd || 0);

    res.json({
      exchangeRate: {
        xofToUsdRate,
        source: 'Open ER API',
        sourceUpdatedAt: exchangeData.time_last_update_utc || null,
      },
      feeScheduleSource: 'https://www.paypal.com/sn/business/paypal-business-fees',
      checkout,
      payoutFee,
      platformRevenueXof,
      platformRevenueUsdAtReferenceRate: platformRevenueUsd,
      actualCheckoutFeesUsd: Number(summary.frais_paypal_reels_usd || 0),
      actualPayoutFeesUsd: Number(summary.frais_reversement_paypal_reels_usd || 0),
      actualFeeShareOfPlatformRevenuePercent: platformRevenueUsd > 0
        ? Number((totalActualPayPalFeesUsd / platformRevenueUsd * 100).toFixed(2))
        : null,
    });
  } catch (error) {
    console.error('PayPal fee recommendation failed:', error.message);
    res.status(503).json({ error: 'Impossible de calculer les suggestions PayPal avec les données de frais réels et le taux de change.' });
  }
};

const getAdminTransactionHistory = async (req, res) => {
  try {
    res.json(await PaiementModel.findAllTransactionsForAdmin());
  } catch (error) {
    console.error('Admin transaction history error:', error.message);
    res.status(500).json({ error: 'Impossible de charger l’historique de la plateforme.' });
  }
};

const capturePayPalOrder = async (req, res) => {
  try {
    const tranche = String(req.params.tranche || '').toUpperCase();
    if (!['AVANCE', 'SOLDE'].includes(tranche)) return res.status(400).json({ error: 'Tranche PayPal invalide.' });

    const paymentId = req.params.id;
    const orderId = String(req.body.order_id || '').trim();
    if (!orderId) return res.status(400).json({ error: 'Référence de commande PayPal manquante.' });

    const installment = await PaiementModel.getPayPalInstallment(paymentId, req.user.id, tranche, true);
    if (installment.orderId !== orderId || !installment.amountUsd) {
      return res.status(409).json({ error: 'Cette commande PayPal ne correspond pas au paiement.' });
    }

    const order = await PayPalService.getOrder(orderId);
    const expectedCustomId = `${paymentId}:${tranche}`;
    const purchaseUnit = order.purchase_units?.[0];
    if (
      purchaseUnit?.custom_id !== expectedCustomId
      || purchaseUnit?.amount?.currency_code !== 'USD'
      || Number(purchaseUnit?.amount?.value) !== Number(installment.amountUsd)
    ) {
      return res.status(409).json({ error: 'Les détails de la commande PayPal ne correspondent pas au paiement.' });
    }

    const captureResult = order.status === 'COMPLETED' ? order : await PayPalService.captureOrder(orderId);
    const capture = captureResult.purchase_units?.[0]?.payments?.captures?.[0];
    if (captureResult.status !== 'COMPLETED' || capture?.status !== 'COMPLETED') {
      return res.status(409).json({ error: 'Le paiement PayPal n’est pas encore confirmé.' });
    }
    if (capture.amount?.currency_code !== 'USD' || Number(capture.amount?.value) !== Number(installment.amountUsd)) {
      return res.status(409).json({ error: 'Le montant confirmé par PayPal ne correspond pas.' });
    }
    const providerFee = capture.seller_receivable_breakdown?.paypal_fee;
    const actualFeeUsd = providerFee?.currency_code === 'USD'
      && Number.isFinite(Number(providerFee.value))
      && Number(providerFee.value) >= 0
      ? Number(providerFee.value)
      : null;

    const payment = await PaiementModel.completePayPalInstallment(
      paymentId,
      req.user.id,
      tranche,
      orderId,
      capture.id,
      capture.amount.value,
      installment.estimatedFeesUsd,
      installment.rate,
      actualFeeUsd,
    );
    const reversement = await initiatePayPalOwnerPayout(paymentId, tranche);
    res.json({
      message: reversement.status === 'ENVOYE'
        ? 'Paiement confirmé et reversement PayPal versé.'
        : reversement.status === 'EN_COURS'
          ? 'Paiement confirmé. Le reversement PayPal est en cours.'
          : 'Paiement confirmé. Le reversement PayPal est en attente de configuration ou de disponibilité.',
      paiement: payment,
      reversement,
    });
  } catch (error) {
    if (error.statusCode === 403 || error.statusCode === 404 || error.statusCode === 409) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('PayPal capture error:', {
      message: error.message,
      status: error.statusCode,
      debugId: error.paypal?.debugId,
      issues: error.paypal?.issues,
    });
    res.status(502).json({
      error: error.paypal?.issues?.length
        ? `PayPal a refusé la capture (${error.paypal.issues.map((detail) => detail.issue).filter(Boolean).join(', ') || 'erreur de validation'}). Le paiement n’a pas été confirmé.`
        : 'Impossible de confirmer le paiement auprès de PayPal.',
      paypalIssues: error.paypal?.issues?.map((detail) => detail.issue).filter(Boolean),
      paypalDebugId: error.paypal?.debugId,
    });
  }
};

const validerAvance = async (req, res) => {
  try {
    const { id } = req.params;
    const reference_transaction = req.body.reference_transaction ? String(req.body.reference_transaction).trim() : null;
    if (req.user.role !== 'ADMIN' && (!reference_transaction || reference_transaction.length < 4)) {
      return res.status(400).json({ error: 'La référence de paiement est obligatoire.' });
    }

    const updatedPaiement = req.user.role === 'ADMIN'
      ? await PaiementModel.validateAdvance(id, reference_transaction)
      : await PaiementModel.submitAdvanceReference(id, req.user.id, reference_transaction);
    if (!updatedPaiement) {
      return res.status(409).json({ error: 'Paiement introuvable, référence déjà reçue ou avance non vérifiable.' });
    }

    res.json({
      message: req.user.role === 'ADMIN' ? 'Avance validée.' : 'Référence d’avance transmise pour validation.',
      paiement: updatedPaiement
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la validation de l\'avance' });
  }
};

const validerSolde = async (req, res) => {
  try {
    const { id } = req.params;
    const reference_transaction = req.body.reference_transaction ? String(req.body.reference_transaction).trim() : null;
    if (req.user.role !== 'ADMIN' && (!reference_transaction || reference_transaction.length < 4)) {
      return res.status(400).json({ error: 'La référence de paiement est obligatoire.' });
    }

    const updatedPaiement = req.user.role === 'ADMIN'
      ? await PaiementModel.validateBalance(id, reference_transaction)
      : await PaiementModel.submitBalanceReference(id, req.user.id, reference_transaction);
    if (!updatedPaiement) {
      return res.status(409).json({ error: 'Le solde ne peut pas être transmis avant la livraison ou une autre référence est déjà présente.' });
    }

    res.json({
      message: req.user.role === 'ADMIN' ? 'Solde validé; le règlement est complet.' : 'Référence de solde transmise pour validation.',
      paiement: updatedPaiement
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la validation du solde' });
  }
};

const webhook = async (req, res) => {
  try {
    const provider = req.body?.provider;
    const signatureValid = PaymentService.verifyWebhookSignature(provider, req.headers, req.body);
    if (!signatureValid) {
      return res.status(401).json({ error: 'Signature webhook invalide' });
    }

    return res.status(501).json({ error: 'Le traitement automatique des webhooks sera activé après configuration du fournisseur.' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Erreur interne Webhook' });
  }
};

const createSubscription = async (req, res) => {
  try {
    if (!['CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR', 'CHARGEUR'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Cette formule n’est pas disponible pour ce type de compte.' });
    }
    if (req.body.periode && req.body.periode !== 'MONTHLY') {
      return res.status(400).json({ error: 'Seul le renouvellement mensuel est disponible.' });
    }
    const paymentConfig = await getSubscriptionPaymentConfig();
    const moyen_paiement = String(req.body.moyen_paiement || '').toUpperCase();
    if (!paymentConfig.methods.some((method) => method.key === moyen_paiement)) {
      return res.status(400).json({ error: 'Choisissez un moyen de paiement actuellement disponible.' });
    }
    const current = await PaiementModel.findCurrentSubscription(req.user.id);
    if (current?.subscription?.statut === 'EN_ATTENTE'
      || (current?.subscriptionValid && !current?.renewalOpen)) {
      return res.status(409).json({ error: 'Un abonnement actif ou un paiement en attente existe déjà pour ce compte.' });
    }
    const defaultPlan = req.user.role === 'CHARGEUR'
      ? 'CHARGEUR'
      : req.user.role === 'CHAUFFEUR'
        ? 'INDIVIDUEL'
        : 'PETITE_ENTREPRISE';
    const plan = String(req.body.plan || defaultPlan).toUpperCase();
    const { subscription, quote } = await PaiementModel.createSubscription(req.user.id, 'MONTHLY', moyen_paiement, plan);
    res.status(201).json({
      message: moyen_paiement === 'KKIAPAY'
        ? 'Demande créée. Effectuez le paiement sécurisé avec KKiaPay.'
        : 'Demande d’abonnement créée. Effectuez le paiement puis transmettez sa référence.',
      subscription,
      quote,
      paymentMethod: paymentConfig.methods.find((method) => method.key === moyen_paiement),
    });
  } catch (error) {
    console.error('Subscription creation failed:', error.message);
    res.status(error.statusCode || 400).json({ error: error.message || 'Impossible de créer cet abonnement.' });
  }
};

const getSubscriptionPaymentOptions = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await getSubscriptionPaymentConfig());
  } catch (error) {
    console.error('Subscription payment options read failed:', error.message);
    res.status(error.statusCode || 503).json({ error: error.message || 'Les moyens de paiement ne sont pas disponibles.' });
  }
};

const submitSubscriptionReference = async (req, res) => {
  try {
    const reference = String(req.body.reference_transaction || '').trim();
    if (reference.length < 4 || reference.length > 255) return res.status(400).json({ error: 'La référence de paiement est invalide.' });
    const subscription = await PaiementModel.submitSubscriptionReference(req.params.id, req.user.id, reference);
    if (!subscription) return res.status(404).json({ error: 'Demande d’abonnement introuvable ou déjà traitée.' });
    res.json({ message: 'Référence transmise pour validation.', subscription });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de transmettre la référence.' });
  }
};

const getMySubscription = async (req, res) => {
  try {
    res.json(await PaiementModel.findCurrentSubscription(req.user.id));
  } catch (error) {
    res.status(500).json({ error: 'Impossible de récupérer l’abonnement.' });
  }
};

const validateSubscription = async (req, res) => {
  try {
    const subscription = await PaiementModel.validateSubscription(req.params.id, req.body.reference_transaction);
    if (!subscription) return res.status(409).json({ error: 'L’abonnement doit avoir une référence avant validation.' });
    res.json({ message: 'Abonnement activé.', subscription });
  } catch (error) {
    res.status(500).json({ error: 'Impossible d’activer cet abonnement.' });
  }
};

const getAdminQueue = async (req, res) => {
  try {
    res.json(await PaiementModel.findAdminQueue());
  } catch (error) {
    res.status(500).json({ error: 'Impossible de charger la file comptable.' });
  }
};

const recordOwnerPayout = async (req, res) => {
  try {
    const tranche = String(req.params.tranche || '').toUpperCase();
    const reference = String(req.body.reference_transaction || '').trim();
    if (!['AVANCE', 'SOLDE'].includes(tranche)) {
      return res.status(400).json({ error: 'Tranche ou référence de reversement invalide.' });
    }
    const payoutDetails = await PaiementModel.getOwnerPayoutDetails(req.params.id, tranche);
    if (!payoutDetails || payoutDetails.statut_reversement !== 'EN_ATTENTE') {
      return res.status(409).json({ error: 'Paiement introuvable, non validé ou reversement déjà enregistré.' });
    }

    let paiement;
    if (payoutDetails.compte_paiement_type === 'PAYPAL') {
      const receiver = String(payoutDetails.compte_paiement_identifiant || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receiver)) {
        return res.status(400).json({ error: 'Le compte PayPal du transporteur doit être une adresse e-mail valide.' });
      }
      const claimed = await PaiementModel.claimOwnerPayPalPayout(req.params.id, tranche);
      if (!claimed) return res.status(409).json({ error: 'Ce reversement est déjà en cours ou a déjà été envoyé.' });
      try {
        const payout = await PayPalService.createPayout({
          paymentId: req.params.id,
          tranche,
          receiver,
          amountXof: Number(payoutDetails.montant_net),
        });
        const resultStatus = payout.status === 'SUCCESS' ? 'ENVOYE' : 'EN_COURS';
        const actualFeeUsd = await getPayoutActualFee(payout, req.params.id, tranche);
        paiement = await PaiementModel.recordOwnerPayout(req.params.id, tranche, payout.batchId, payout.amountUsd, payout.rate, 'EN_COURS', resultStatus, actualFeeUsd);
      } catch (error) {
        await PaiementModel.releaseOwnerPayPalPayout(req.params.id, tranche);
        throw error;
      }
    } else {
      if (reference.length < 4 || reference.length > 255) {
        return res.status(400).json({ error: 'La référence de reversement est obligatoire.' });
      }
      paiement = await PaiementModel.recordOwnerPayout(req.params.id, tranche, reference);
    }

    if (!paiement) return res.status(409).json({ error: 'Paiement chargeur non validé ou reversement déjà enregistré.' });
    res.json({ message: 'Référence de reversement enregistrée.', paiement });
  } catch (error) {
    console.error('Owner payout error:', error.message);
    res.status(500).json({ error: 'Impossible d’enregistrer ce reversement.' });
  }
};

module.exports = {
  initiatePaiement,
  getMyTransactions,
  getAdminFunds,
  getPayPalFeeRecommendations,
  getAdminTransactionHistory,
  createPayPalOrder,
  capturePayPalOrder,
  createKkiapayCourseCheckout,
  confirmKkiapayCoursePayment,
  createKkiapaySubscriptionCheckout,
  confirmKkiapaySubscriptionPayment,
  handleKkiapayWebhook,
  validerAvance,
  validerSolde,
  webhook,
  createSubscription,
  getSubscriptionPaymentOptions,
  submitSubscriptionReference,
  getMySubscription,
  validateSubscription,
  getAdminQueue,
  recordOwnerPayout
};
