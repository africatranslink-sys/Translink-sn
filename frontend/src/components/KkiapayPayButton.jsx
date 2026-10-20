import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import api from '../utils/api';
import { openKkiapayWidget } from '../utils/kkiapayWidget';

export default function KkiapayPayButton({ checkoutUrl, confirmUrl, onPaid, children = 'Payer avec KKiaPay', className = '' }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const startPayment = async () => {
    setLoading(true);
    setError('');
    let paymentConfirmed = false;
    try {
      const { data: checkout } = await api.post(checkoutUrl);
      const result = await openKkiapayWidget(checkout);
      const transactionId = result?.transactionId || result?.transaction_id;
      if (!transactionId) throw new Error('KKiaPay n’a pas retourné de référence de transaction.');
      const response = await api.post(confirmUrl, { transactionId });
      paymentConfirmed = true;
      await onPaid?.(response.data);
    } catch (requestError) {
      setError(paymentConfirmed
        ? 'Paiement confirmé. L’actualisation a échoué; rechargez la page pour voir son statut.'
        : requestError.response?.data?.error || requestError.message || 'Le paiement KKiaPay n’a pas pu être confirmé.');
    } finally {
      setLoading(false);
    }
  };

  return <div className="space-y-2">
    <button type="button" onClick={startPayment} disabled={loading} className={className}>
      <CreditCard size={17} /> {loading ? 'Paiement en cours…' : children}
    </button>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
  </div>;
}
