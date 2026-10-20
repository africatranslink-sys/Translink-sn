let sdkPromise;
let activeCheckout;
let listenersRegistered = false;

const loadKkiapaySdk = () => {
  if (window.openKkiapayWidget) return Promise.resolve();
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.kkiapay.me/k.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        sdkPromise = null;
        reject(new Error('Le module de paiement KKiaPay n’a pas pu être chargé.'));
      };
      document.body.appendChild(script);
    });
  }
  return sdkPromise;
};

const registerListeners = () => {
  if (listenersRegistered) return;
  if (typeof window.addSuccessListener !== 'function' || typeof window.addFailedListener !== 'function') {
    throw new Error('Le module KKiaPay n’a pas démarré correctement.');
  }
  window.addSuccessListener((result) => {
    const checkout = activeCheckout;
    activeCheckout = null;
    checkout?.resolve(result);
  });
  window.addFailedListener((error) => {
    const checkout = activeCheckout;
    activeCheckout = null;
    checkout?.reject(new Error(error?.message || 'Le paiement KKiaPay a échoué ou a été annulé.'));
  });
  listenersRegistered = true;
};

export async function openKkiapayWidget(config) {
  await loadKkiapaySdk();
  registerListeners();
  if (activeCheckout) throw new Error('Un paiement KKiaPay est déjà ouvert.');

  return new Promise((resolve, reject) => {
    activeCheckout = { resolve, reject };
    try {
      window.openKkiapayWidget({
        amount: config.amount,
        key: config.publicKey,
        position: 'center',
        sandbox: config.sandbox,
        countries: config.countries,
        paymentmethod: config.paymentmethod,
        partnerId: config.partnerId,
        data: config.data,
        theme: '#176f69',
      });
    } catch (error) {
      activeCheckout = null;
      reject(error);
    }
  });
}
