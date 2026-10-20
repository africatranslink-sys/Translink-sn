import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import PaymentProviderLogo from './PaymentProviderLogo';
import './PaymentAccountCard.css';

const PAYMENT_METHODS = {
  WAVE: { label: 'Wave', theme: 'payment-card-wave' },
  ORANGE_MONEY: { label: 'Orange Money', theme: 'payment-card-orange' },
  PAYPAL: { label: 'PayPal', theme: 'payment-card-paypal' },
  BANQUE: { label: 'Compte bancaire', theme: 'payment-card-bank' },
};

const detectCardNetwork = (identifier) => {
  const digits = String(identifier || '').replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(digits)) return null;
  if (digits.startsWith('4')) return 'VISA';

  const firstTwoDigits = Number(digits.slice(0, 2));
  const firstFourDigits = Number(digits.slice(0, 4));
  if ((firstTwoDigits >= 51 && firstTwoDigits <= 55) || (firstFourDigits >= 2221 && firstFourDigits <= 2720)) {
    return 'MASTERCARD';
  }

  return null;
};

export default function PaymentAccountCard({ method, holder, identifier, bank }) {
  const [revealed, setRevealed] = useState(false);
  const selectedMethod = PAYMENT_METHODS[method] || { label: 'Compte de réception', theme: 'payment-card-empty' };
  const normalizedIdentifier = String(identifier || '').trim();
  const identifierSuffix = normalizedIdentifier.replace(/\s/g, '').slice(-4);
  const cardNetwork = method === 'BANQUE' ? detectCardNetwork(normalizedIdentifier) : null;
  const emailParts = normalizedIdentifier.split('@');
  const maskedIdentifier = !normalizedIdentifier
    ? 'Coordonnées à renseigner'
    : cardNetwork
      ? `•••• •••• •••• ${identifierSuffix}`
    : method === 'PAYPAL' && emailParts.length === 2
      ? `${emailParts[0].slice(0, 1)}••••@${emailParts[1]}`
      : `•••• •••• ${identifierSuffix}`;
  const Icon = revealed ? EyeOff : Eye;

  return (
    <section className={`payment-account-card ${selectedMethod.theme}`} aria-label="Aperçu du compte de réception">
      <div className="payment-card-pattern" aria-hidden="true" />
      <div className="payment-card-content">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-white/70">Translink-Africa · Reversements</p>
            <h3 className="mt-1 text-xl font-bold text-white">{selectedMethod.label}</h3>
          </div>
          {cardNetwork === 'VISA' ? (
            <span className="rounded-md bg-white px-2 py-1 text-lg font-black italic text-[#1434CB]" role="img" aria-label="Visa">VISA</span>
          ) : cardNetwork === 'MASTERCARD' ? (
            <svg viewBox="0 0 52 34" className="h-9 w-14" role="img" aria-label="Mastercard">
              <circle cx="19" cy="17" r="14" fill="#EB001B" />
              <circle cx="33" cy="17" r="14" fill="#F79E1B" fillOpacity="0.92" />
            </svg>
          ) : (
            <PaymentProviderLogo method={method} size="small" />
          )}
        </div>

        <div className="payment-card-chip" aria-hidden="true"><span /><span /><span /></div>

        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/65">Titulaire</p>
            <p className="mt-1 truncate text-sm font-semibold text-white">{holder || 'Nom non renseigné'}</p>
            {method === 'BANQUE' && bank && <p className="mt-0.5 truncate text-xs text-white/75">{bank}</p>}
            <p className="mt-2 truncate font-mono text-sm tracking-widest text-white/90" aria-live="polite">
              {revealed ? normalizedIdentifier || 'Coordonnées à renseigner' : maskedIdentifier}
            </p>
          </div>
          {normalizedIdentifier && <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            aria-label={revealed ? 'Masquer les coordonnées' : 'Afficher les coordonnées'}
            title={revealed ? 'Masquer les coordonnées' : 'Afficher les coordonnées'}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
          ><Icon size={17} /></button>}
        </div>
      </div>
    </section>
  );
}
