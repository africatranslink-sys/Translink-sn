const PaiementModel = require('../models/paiementModel');
const PaymentService = require('../services/paymentService');

const initiatePaiement = async (req, res) => {
  try {
    const { course_id, montant_total, moyen_paiement } = req.body;

    if (!['WAVE', 'ORANGE_MONEY'].includes(moyen_paiement)) {
      return res.status(400).json({ error: 'Moyen de paiement non supporté.' });
    }

    const newPaiement = await PaiementModel.create({
      course_id,
      montant_total,
      moyen_paiement
    });
    
    // Génération du lien de paiement (50% avance)
    const avanceMontant = montant_total / 2;
    const paymentData = await PaymentService.createPaymentSession(
      avanceMontant, 
      course_id, 
      'AVANCE', 
      'https://translink.sn/payment/success'
    );

    res.status(201).json({
      message: 'Paiement initié. Veuillez procéder au paiement de l\'avance.',
      paiement: newPaiement,
      paymentUrl: paymentData.paymentUrl,
      transactionId: paymentData.transactionId
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de l\'initialisation du paiement' });
  }
};

const validerAvance = async (req, res) => {
  // Gardé pour validation manuelle si besoin
  try {
    const { id } = req.params;
    const { reference_transaction } = req.body;

    const updatedPaiement = await PaiementModel.updateAvance(id, reference_transaction);
    if (!updatedPaiement) {
      return res.status(404).json({ error: 'Paiement non trouvé.' });
    }

    res.json({
      message: 'Avance de 50% validée',
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
    const { reference_transaction } = req.body;

    const updatedPaiement = await PaiementModel.updateSolde(id, reference_transaction);
    if (!updatedPaiement) {
      return res.status(404).json({ error: 'Paiement non trouvé.' });
    }

    res.json({
      message: 'Solde de 50% validé',
      paiement: updatedPaiement
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la validation du solde' });
  }
};

const webhook = async (req, res) => {
  try {
    const signatureValid = PaymentService.verifyWebhookSignature(req.headers, req.body);
    if (!signatureValid) {
      return res.status(401).json({ error: 'Signature webhook invalide' });
    }

    const { transactionId, status, course_id, type } = req.body;

    if (status === 'SUCCESS') {
      // Dans une vraie application, on chercherait le paiement par course_id
      // et on le mettrait à jour automatiquement.
      console.log(`[WEBHOOK] Paiement ${type} reçu pour la course ${course_id} avec la réf ${transactionId}`);
      // await PaiementModel.updateAvance(id, transactionId);
    }

    res.status(200).send('Webhook OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Erreur interne Webhook' });
  }
};

module.exports = {
  initiatePaiement,
  validerAvance,
  validerSolde,
  webhook
};
