const { v4: uuidv4 } = require('crypto'); // Built-in crypto module from node or uuid package if available. Let's use crypto.randomUUID for simplicity.
const crypto = require('crypto');

/**
 * Service mock pour l'intégration Wave / Orange Money.
 * Dans la vraie vie, ce fichier fera des appels HTTP vers l'API du fournisseur
 * (ex: fetch('https://api.wave.com/v1/checkout/sessions', ...))
 */
class PaymentService {
  
  /**
   * Génère un lien de paiement pour une transaction
   * @param {number} montant 
   * @param {string} course_id 
   * @param {string} type_paiement 'AVANCE' ou 'SOLDE'
   * @param {string} returnUrl URL où l'utilisateur est redirigé après paiement
   * @returns {Object} { paymentUrl, transactionId }
   */
  static async createPaymentSession(montant, course_id, type_paiement, returnUrl) {
    // 1. Génération d'un ID de transaction unique
    const transactionId = crypto.randomUUID();
    
    // 2. Simulation de l'appel API (Wave / OM)
    // const response = await fetch('https://api.om.sn/checkout', { ... })
    // const data = await response.json();
    
    // 3. Fake URL de paiement retournée par le fournisseur
    const paymentUrl = `https://mock-pay.translink.sn/checkout/${transactionId}?amount=${montant}&ref=${course_id}`;
    
    return {
      paymentUrl,
      transactionId
    };
  }

  /**
   * Vérifie la signature du webhook pour s'assurer qu'il provient bien du fournisseur
   * @param {Object} headers 
   * @param {Object} body 
   */
  static verifyWebhookSignature(headers, body) {
    // Dans la vraie vie, on utiliserait le secret webhook fourni par Wave/OM
    // ex: const secret = process.env.WAVE_WEBHOOK_SECRET;
    // const signature = crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
    // return headers['wave-signature'] === signature;
    
    return true; // Toujours valide dans notre mock
  }
}

module.exports = PaymentService;
