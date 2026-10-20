import { useCallback, useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, History, ReceiptText, Wallet } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { useDashboardDataRefresh } from '../context/SocketContext';
import { useAutoDismissMessage } from '../utils/useAutoDismissMessage';
import PrintButton from '../components/PrintButton';
import KkiapayPayButton from '../components/KkiapayPayButton';
import api from '../utils/api';
import { useLanguage } from '../context/useLanguage';

const formatXof = (amount, language) => `${Number(amount || 0).toLocaleString(language === 'en' ? 'en-US' : 'fr-FR')} FCFA`;
const statusLabels = {
  VALIDE: { fr: 'Confirmé', en: 'Confirmed' },
  ACTIF: { fr: 'Actif', en: 'Active' },
  ENVOYE: { fr: 'Versé', en: 'Paid out' },
  EN_COURS: { fr: 'En cours', en: 'In progress' },
  ECHEC: { fr: 'Échec du reversement', en: 'Payout failed' },
  EN_ATTENTE: { fr: 'En attente', en: 'Pending' },
  LITIGE: { fr: 'En litige', en: 'Disputed' },
  ANNULE: { fr: 'Annulé', en: 'Cancelled' },
  EXPIRE: { fr: 'Expiré', en: 'Expired' },
};

const statusStyles = {
  VALIDE: 'bg-emerald-50 text-emerald-700',
  ACTIF: 'bg-emerald-50 text-emerald-700',
  ENVOYE: 'bg-emerald-50 text-emerald-700',
  EN_COURS: 'bg-sky-50 text-sky-700',
  ECHEC: 'bg-rose-50 text-rose-700',
  EN_ATTENTE: 'bg-amber-50 text-amber-800',
  LITIGE: 'bg-rose-50 text-rose-700',
  ANNULE: 'bg-slate-100 text-slate-600',
  EXPIRE: 'bg-slate-100 text-slate-600',
};

export default function TransactionHistoryPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const locale = language === 'en' ? 'en-US' : 'fr-FR';
  const [history, setHistory] = useState({ transactions: [], balance: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useAutoDismissMessage('');
  const isChargeur = user?.role === 'CHARGEUR';

  const loadHistory = useCallback(async () => {
    const response = await api.get('/api/paiements/mien');
    setHistory(response.data);
    setLoading(false);
  }, []);

  useDashboardDataRefresh(loadHistory);

  useEffect(() => {
    let cancelled = false;
    loadHistory()
      .catch((requestError) => { if (!cancelled) setError(requestError.response?.data?.error || 'Impossible de charger les transactions.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadHistory, setError]);

  const balanceItems = isChargeur
    ? [{ label: 'Total payé', value: history.balance?.paidXof, icon: ArrowUpRight }]
    : [
      { label: 'Net déjà versé', value: history.balance?.receivedXof, icon: ArrowDownLeft },
      { label: 'Net en attente', value: history.balance?.pendingPayoutXof, icon: History },
      { label: 'Net cumulé', value: history.balance?.accumulatedNetXof, icon: Wallet },
    ];

  return (
    <DashboardLayout user={user}>
      <div className="print-content mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-brand-orange">Finances</p><h1 className="mt-2 text-3xl font-bold text-brand-dark">Transactions</h1><p className="mt-1 text-slate-500">Historique des paiements de course, reversements et abonnements.</p></div><PrintButton>Imprimer l’historique</PrintButton></header>

        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
        <div className={`grid gap-3 ${balanceItems.length === 1 ? 'sm:grid-cols-1' : 'sm:grid-cols-3'}`}>
          {balanceItems.map(({ label, value, icon: Icon }) => <article key={label} className="rounded-lg border border-slate-200 bg-white p-5"><div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-slate-500">{label}</span><Icon size={18} className="text-brand-orange" /></div><p className="mt-3 text-2xl font-bold text-brand-dark">{formatXof(value, language)}</p></article>)}
        </div>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center gap-3 border-b border-slate-200 p-5"><ReceiptText size={20} className="text-slate-500" /><div><h2 className="font-bold text-brand-dark">Toutes les opérations</h2><p className="mt-0.5 text-xs text-slate-500">Montants et statuts enregistrés dans Translink-Africa.</p></div></div>
          {loading ? <p className="p-10 text-center text-sm text-slate-500">Chargement…</p> : !history.transactions?.length ? <p className="p-10 text-center text-sm text-slate-500">Aucune transaction enregistrée.</p> : <>
            <div className="print-table hidden overflow-x-auto md:block"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3 font-semibold">Date</th><th className="px-5 py-3 font-semibold">Opération</th><th className="px-5 py-3 font-semibold">Moyen</th><th className="px-5 py-3 text-right font-semibold">Montant</th><th className="px-5 py-3 font-semibold">Statut</th><th className="px-5 py-3 font-semibold">Référence</th>{isChargeur && <th className="px-5 py-3 font-semibold">Action</th>}</tr></thead><tbody>{history.transactions.map((transaction) => <tr key={transaction.id} className="border-t border-slate-100"><td className="whitespace-nowrap px-5 py-3 text-slate-600">{transaction.date ? new Date(transaction.date).toLocaleString(locale) : '—'}</td><td className="max-w-xs px-5 py-3"><span className="block truncate font-semibold text-brand-dark">{transaction.label}</span>{transaction.otherParty && <span className="text-xs text-slate-500">{transaction.otherParty}</span>}</td><td className="px-5 py-3 text-slate-600">{transaction.paymentMethod === 'KKIAPAY' ? 'KKiaPay' : transaction.paymentMethod || '—'}</td><td className={`whitespace-nowrap px-5 py-3 text-right font-bold ${transaction.direction === 'CREDIT' ? 'text-emerald-700' : 'text-brand-dark'}`}>{transaction.amountXof == null ? '—' : `${transaction.direction === 'CREDIT' ? '+' : '-'}${formatXof(transaction.amountXof, language)}`}</td><td className="px-5 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[transaction.status] || 'bg-slate-100 text-slate-600'}`}>{statusLabels[transaction.status]?.[language] || transaction.status}</span></td><td className="max-w-40 truncate px-5 py-3 font-mono text-xs text-slate-500">{transaction.reference || '—'}</td>{isChargeur && <td className="px-5 py-3">{transaction.canContinuePayPal && <PayPalContinueButton transaction={transaction} />}{transaction.canContinueKkiapay && <KkiapayContinueButton transaction={transaction} onPaid={loadHistory} />}</td>}</tr>)}</tbody></table></div>
            <div className="print:hidden divide-y divide-slate-100 md:hidden">{history.transactions.map((transaction) => <article key={transaction.id} className="space-y-2 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-brand-dark">{transaction.label}</p><p className="mt-1 text-xs text-slate-500">{transaction.date ? new Date(transaction.date).toLocaleString(locale) : '—'} · {transaction.paymentMethod === 'KKIAPAY' ? 'KKiaPay' : transaction.paymentMethod || '—'}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${statusStyles[transaction.status] || 'bg-slate-100 text-slate-600'}`}>{statusLabels[transaction.status]?.[language] || transaction.status}</span></div><div className="flex items-center justify-between gap-3"><span className={`font-bold ${transaction.direction === 'CREDIT' ? 'text-emerald-700' : 'text-brand-dark'}`}>{transaction.amountXof == null ? '—' : `${transaction.direction === 'CREDIT' ? '+' : '-'}${formatXof(transaction.amountXof, language)}`}</span><span className="max-w-44 truncate font-mono text-xs text-slate-500">{transaction.reference || '—'}</span></div>{isChargeur && transaction.canContinuePayPal && <PayPalContinueButton transaction={transaction} />}{isChargeur && transaction.canContinueKkiapay && <KkiapayContinueButton transaction={transaction} onPaid={loadHistory} />}</article>)}</div>
          </>}
        </section>
      </div>
    </DashboardLayout>
  );
}

function PayPalContinueButton({ transaction }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const continuePayment = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.post(`/api/paiements/${transaction.paymentId}/paypal/${transaction.installment}/order`);
      if (!response.data?.approvalUrl) throw new Error('PayPal n’a pas fourni de lien de paiement.');
      window.location.assign(response.data.approvalUrl);
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || 'Impossible de reprendre le paiement PayPal.');
      setLoading(false);
    }
  };

  return <div className="space-y-1">
    <button type="button" disabled={loading} onClick={continuePayment} className="inline-flex whitespace-nowrap rounded-lg bg-[#003087] px-3 py-2 text-xs font-bold text-white hover:bg-[#00246a] disabled:cursor-wait disabled:opacity-60">
      {loading ? 'Ouverture de PayPal…' : 'Continuer le paiement'}
    </button>
    {error && <p role="alert" className="max-w-60 text-xs text-rose-700">{error}</p>}
  </div>;
}

function KkiapayContinueButton({ transaction, onPaid }) {
  const tranche = transaction.installment;
  return <KkiapayPayButton
    checkoutUrl={`/api/paiements/${transaction.paymentId}/kkiapay/${tranche}/checkout`}
    confirmUrl={`/api/paiements/${transaction.paymentId}/kkiapay/${tranche}/confirm`}
    onPaid={onPaid}
    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#176f69] px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
  />;
}