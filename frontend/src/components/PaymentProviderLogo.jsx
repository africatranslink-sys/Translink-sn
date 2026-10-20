import { Landmark } from 'lucide-react';

export default function PaymentProviderLogo({ method, size = 'small' }) {
  const dimensions = size === 'large' ? 'h-12 w-12' : 'h-10 w-10';

  if (method === 'WAVE') {
    return (
      <span className={`payment-provider-logo ${dimensions} flex items-center justify-center overflow-hidden rounded-full bg-[#19b8e6]`} role="img" aria-label="Wave">
        <img src="/images/payments/wave.png" alt="Wave" className="h-full w-full object-cover object-center" style={{ transform: 'scale(1.15)' }} />
      </span>
    );
  }

  if (method === 'ORANGE_MONEY') {
    return (
      <span className={`payment-provider-logo ${dimensions} flex items-center justify-center overflow-hidden rounded-xl bg-[#ff7900]`} role="img" aria-label="Orange Money">
        <img src="/images/payments/orange-money.png" alt="Orange Money" className="h-full w-full object-cover object-center" style={{ transform: 'scale(1.12)' }} />
      </span>
    );
  }

  if (method === 'PAYPAL') {
    return <span className={`payment-provider-logo ${dimensions} rounded-xl bg-white`} role="img" aria-label="PayPal">
      <svg viewBox="0 0 40 40" aria-hidden="true"><path d="M12 7h12c6 0 9 3.2 8 8.2-1 5.1-4.3 7.8-10 7.8h-4l-1.6 10H8L12 7Z" fill="#009cde" /><path d="M9 7h12c5.8 0 8.8 3 7.9 7.7-.9 4.8-4.1 7.3-9.7 7.3h-4.1l-1.8 9H7L9 7Z" fill="#003087" /></svg>
    </span>;
  }

  return (
    <span className={`payment-provider-logo ${dimensions} flex items-center justify-center rounded-xl bg-[#eaf4f6] text-[#123d4a]`} role="img" aria-label="Compte bancaire">
      <Landmark size={size === 'large' ? 29 : 26} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}
