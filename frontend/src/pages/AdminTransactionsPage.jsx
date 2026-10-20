import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, History, RefreshCw, Search } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { useAutoDismissMessage } from '../utils/useAutoDismissMessage';
import { ADMIN_SIDEBAR_ITEMS } from '../utils/adminNavigation';
import PrintButton from '../components/PrintButton';
import api from '../utils/api';

const formatXof = (amount) => `${Number(amount || 0).toLocaleString('fr-FR')} FCFA`;
const statusLabels = { VALIDE: 'Confirmé', ENVOYE: 'Versé', EN_COURS: 'En cours', EN_ATTENTE: 'En attente', ECHEC: 'Échec', ACTIF: 'Actif', ANNULE: 'Annulé', EXPIRE: 'Expiré', LITIGE: 'Litige' };
const statusStyles = { VALIDE: 'bg-emerald-50 text-emerald-700', ENVOYE: 'bg-emerald-50 text-emerald-700', EN_COURS: 'bg-sky-50 text-sky-700', EN_ATTENTE: 'bg-amber-50 text-amber-800', ECHEC: 'bg-rose-50 text-rose-700', ACTIF: 'bg-emerald-50 text-emerald-700', LITIGE: 'bg-rose-50 text-rose-700' };

export default function AdminTransactionsPage() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useAutoDismissMessage('');
  const [success, setSuccess] = useAutoDismissMessage('');
  const [validatingSubscriptionId, setValidatingSubscriptionId] = useState(null);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/paiements/admin/transactions');
      setTransactions(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible de charger les transactions.');
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    const initialLoad = window.setTimeout(loadTransactions, 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadTransactions]);

  const validateSubscription = async (item) => {
    setValidatingSubscriptionId(item.subscriptionId);
    setError('');
    setSuccess('');
    try {
      await api.put(`/api/paiements/abonnements/${item.subscriptionId}/valider`, {
        reference_transaction: item.reference,
      });
      setSuccess(`Abonnement de ${item.actor || 'l’utilisateur'} activé.`);
      await loadTransactions();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible de valider cet abonnement.');
    } finally {
      setValidatingSubscriptionId(null);
    }
  };

  const collected = transactions.filter((item) => item.category === 'ENCAISSEMENT' && item.status === 'VALIDE');
  const totals = {
    received: collected.reduce((sum, item) => sum + Number(item.amountXof || 0), 0),
    commission: collected.reduce((sum, item) => sum + Number(item.commissionXof || 0), 0),
    pending: transactions.filter((item) => item.category === 'REVERSEMENT' && ['EN_ATTENTE', 'EN_COURS', 'ECHEC'].includes(item.status)).reduce((sum, item) => sum + Number(item.amountXof || 0), 0),
    paid: transactions.filter((item) => item.category === 'REVERSEMENT' && item.status === 'ENVOYE').reduce((sum, item) => sum + Number(item.amountXof || 0), 0),
  };
  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fr');
    if (!query) return transactions;
    return transactions.filter((item) => [item.label, item.actor, item.beneficiary, item.category, item.paymentMethod, item.reference]
      .some((value) => String(value || '').toLocaleLowerCase('fr').includes(query)));
  }, [transactions, search]);

  return (
    <DashboardLayout sidebarItems={ADMIN_SIDEBAR_ITEMS} user={user}>
      <div className="print-content mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-brand-orange">Administration Translink-Africa</p><h1 className="mt-2 text-3xl font-bold text-brand-dark">Transactions de la plateforme</h1><p className="mt-1 text-slate-500">Encaissements, reversements et abonnements enregistrés.</p></div><div className="print:hidden flex flex-wrap gap-2"><PrintButton>Imprimer l’audit</PrintButton><button type="button" onClick={loadTransactions} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"><RefreshCw size={16} /> Actualiser</button></div></header>
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
        {success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</p>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Encaissements confirmés', amount: totals.received, icon: ArrowDownToLine },
            { label: 'Commissions confirmées', amount: totals.commission, icon: History },
            { label: 'Reversements en attente', amount: totals.pending, icon: History },
            { label: 'Reversements versés', amount: totals.paid, icon: ArrowUpFromLine },
          ].map(({ label, amount, icon: Icon }) => <article key={label} className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-500">{label}</span><Icon size={17} className="text-brand-orange" /></div><p className="mt-3 text-xl font-bold text-brand-dark">{formatXof(amount)}</p></article>)}
        </div>
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="print:hidden flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-brand-dark">Toutes les opérations</h2><p className="mt-1 text-xs text-slate-500">{filteredTransactions.length} opération(s)</p></div><label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 focus-within:border-brand-orange"><Search size={16} className="text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Acteur, référence, service…" className="min-w-0 outline-none text-sm" /></label></div>
          {loading ? <p className="p-10 text-center text-sm text-slate-500">Chargement…</p> : !filteredTransactions.length ? <p className="p-10 text-center text-sm text-slate-500">Aucune opération à afficher.</p> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3 font-semibold">Date</th><th className="px-4 py-3 font-semibold">Type</th><th className="px-4 py-3 font-semibold">Acteur</th><th className="px-4 py-3 font-semibold">Opération</th><th className="px-4 py-3 text-right font-semibold">Montant</th><th className="px-4 py-3 text-right font-semibold">Commission</th><th className="px-4 py-3 font-semibold">Service</th><th className="px-4 py-3 font-semibold">Statut</th><th className="px-4 py-3 font-semibold">Action</th></tr></thead><tbody>{filteredTransactions.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{item.date ? new Date(item.date).toLocaleString('fr-FR') : '—'}</td><td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.category}</td><td className="whitespace-nowrap px-4 py-3 font-medium text-brand-dark">{item.actor || '—'}{item.beneficiary && <span className="block text-xs font-normal text-slate-500">Bénéficiaire : {item.beneficiary}</span>}</td><td className="max-w-xs px-4 py-3 text-slate-600">{item.label}{item.category === 'ABONNEMENT' && item.reference && <span className="block text-xs text-slate-500">Réf. : {item.reference}</span>}</td><td className="whitespace-nowrap px-4 py-3 text-right font-bold text-brand-dark">{formatXof(item.amountXof)}</td><td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatXof(item.commissionXof)}</td><td className="px-4 py-3 text-slate-600">{item.paymentMethod || '—'}</td><td className="px-4 py-3"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[item.status] || 'bg-slate-100 text-slate-600'}`}>{statusLabels[item.status] || item.status}</span></td><td className="whitespace-nowrap px-4 py-3">{item.category === 'ABONNEMENT' && item.status === 'EN_ATTENTE' && item.reference && <button type="button" disabled={validatingSubscriptionId === item.subscriptionId} onClick={() => validateSubscription(item)} className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60">{validatingSubscriptionId === item.subscriptionId ? 'Validation…' : 'Confirmer le paiement'}</button>}</td></tr>)}</tbody></table></div>}
        </section>
      </div>
    </DashboardLayout>
  );
}