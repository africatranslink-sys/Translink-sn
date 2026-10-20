import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, RefreshCw } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { useDashboardDataRefresh } from '../context/SocketContext';
import { useAutoDismissMessage } from '../utils/useAutoDismissMessage';
import api from '../utils/api';
import KkiapayPayButton from '../components/KkiapayPayButton';

const formatDate = (value) => value
  ? new Date(value).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
  : '—';

const formatXof = (value) => `${Number(value).toLocaleString('fr-FR')} FCFA`;

export default function SubscriptionPage() {
  const { user } = useAuth();
  const [paymentConfig, setPaymentConfig] = useState(null);
  const [accountStatus, setAccountStatus] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState('');
  const [selectedPlan, setSelectedPlan] = useState(user?.role === 'CHARGEUR' ? 'CHARGEUR' : user?.role === 'CHAUFFEUR' ? 'INDIVIDUEL' : 'PETITE_ENTREPRISE');
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useAutoDismissMessage('');
  const [message, setMessage] = useAutoDismissMessage('');

  const loadSubscription = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const [configResponse, statusResponse] = await Promise.all([
        api.get('/api/paiements/abonnements/config'),
        api.get('/api/paiements/abonnements/mien'),
      ]);
      setError('');
      setPaymentConfig(configResponse.data);
      setAccountStatus(statusResponse.data);
      setSelectedPlan((current) => configResponse.data.plans?.some((plan) => plan.id === current && plan.roles.includes(user?.role))
        ? current
        : configResponse.data.plans?.find((plan) => plan.roles.includes(user?.role))?.id || '');
      setSelectedMethod((current) => configResponse.data.methods.some((method) => method.key === current)
        ? current
        : configResponse.data.methods[0]?.key || '');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible de charger les informations d’abonnement.');
    } finally {
      setLoading(false);
    }
  }, [setError, user?.role]);

  useEffect(() => {
    const initialLoad = window.setTimeout(loadSubscription, 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadSubscription]);

  const refreshSubscription = useCallback(() => loadSubscription({ silent: true }), [loadSubscription]);
  useDashboardDataRefresh(refreshSubscription);

  const subscription = accountStatus?.subscription;
  const activeSubscription = accountStatus?.subscriptionActive;
  const scheduledSubscription = subscription?.statut === 'ACTIF'
    && accountStatus?.subscriptionValid
    && !accountStatus?.subscriptionActive;
  const pendingSubscription = subscription?.statut === 'EN_ATTENTE';
  const availablePlans = paymentConfig?.plans?.filter((plan) => plan.roles.includes(user?.role)) || [];
  const selectedPlanDetails = availablePlans.find((plan) => plan.id === selectedPlan) || availablePlans[0];
  const isChargeur = user?.role === 'CHARGEUR';
  const selectedDestination = useMemo(
    () => paymentMethod
      || paymentConfig?.methods.find((method) => method.key === subscription?.moyen_paiement)
      || paymentConfig?.methods.find((method) => method.key === selectedMethod),
    [paymentConfig, paymentMethod, selectedMethod, subscription?.moyen_paiement],
  );

  const createRequest = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/api/paiements/abonnements', {
        periode: 'MONTHLY',
        moyen_paiement: selectedMethod,
        plan: selectedPlanDetails?.id,
      });
      setAccountStatus((current) => ({ ...current, subscription: data.subscription }));
      setPaymentMethod(data.paymentMethod);
      setReference('');
      setMessage(data.message);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible de créer la demande de paiement.');
    } finally {
      setSaving(false);
    }
  };

  const submitReference = async (event) => {
    event.preventDefault();
    if (!subscription) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.put(`/api/paiements/abonnements/${subscription.id}/reference`, {
        reference_transaction: reference,
      });
      setAccountStatus((current) => ({ ...current, subscription: data.subscription }));
      setMessage(data.message);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible de transmettre la référence du paiement.');
    } finally {
      setSaving(false);
    }
  };

  const trialActive = accountStatus?.trial?.active;
  const trialEnded = accountStatus?.trial?.expired && !activeSubscription;

  return <DashboardLayout user={user}>
    <main className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-widest text-[#FF6A3D]">{isChargeur ? 'Compte chargeur' : 'Compte professionnel'}</p><h1 className="mt-2 text-3xl font-bold text-[#121C2D]">Mon abonnement</h1><p className="mt-1 text-slate-500">{isChargeur ? 'Publiez vos demandes avec un abonnement chargeur de 2 500 FCFA par mois.' : 'Choisissez la formule adaptée à votre flotte et à votre équipe.'}</p></div>
        <button type="button" onClick={loadSubscription} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60"><RefreshCw size={16} /> Actualiser</button>
      </header>

      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
      {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p>}

      {loading ? <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">Chargement de l’abonnement…</div> : paymentConfig && accountStatus && <>
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><h2 className="text-lg font-bold text-[#121C2D]">Votre accès</h2>
              {activeSubscription ? <p className="mt-2 text-sm text-emerald-700">{isChargeur ? 'Votre abonnement chargeur est actif' : `Votre formule ${accountStatus.entitlements?.planName || subscription?.plan} est active`} jusqu’au {formatDate(accountStatus.activeSubscriptionEndsAt || subscription?.date_fin)}.</p>
                : scheduledSubscription ? <p className="mt-2 text-sm text-emerald-700">Votre abonnement commencera le {formatDate(subscription.date_debut)}.</p>
                : isChargeur ? <p className="mt-2 text-sm text-amber-800">Un abonnement chargeur à 2 500 FCFA par mois est requis avant de publier une demande. Il n’y a pas de prélèvement automatique.</p>
                : trialActive ? <p className="mt-2 text-sm text-emerald-700">Votre essai gratuit se termine le {formatDate(accountStatus.trial.endsAt)}.</p>
                  : trialEnded ? <p className="mt-2 text-sm text-amber-800">Votre essai est terminé : votre compte utilise l’offre gratuite, limitée à un camion opérationnel. Abonnez-vous pour publier ou accepter des offres avec plusieurs camions.</p>
                    : accountStatus.trial?.endsAt ? <p className="mt-2 text-sm text-slate-600">Essai terminé le {formatDate(accountStatus.trial.endsAt)}.</p>
                      : <p className="mt-2 text-sm text-slate-600">L’essai de 14 jours commence à la validation du compte par l’administration.</p>}
              {accountStatus.trial?.startsAt && <p className="mt-1 text-xs text-slate-500">Début de l’essai : {formatDate(accountStatus.trial.startsAt)}</p>}
            </div>
            <div className="rounded-lg bg-orange-50 px-4 py-3 text-right"><p className="text-xs font-semibold text-slate-500">Tarif mensuel</p><p className="mt-1 text-xl font-black text-[#121C2D]">{formatXof(subscription?.montant || selectedPlanDetails?.monthlyAmountXof || 0)}</p></div>
          </div>
          {accountStatus.entitlements && !isChargeur && <p className="mt-4 text-sm text-slate-600">Formule : <strong>{accountStatus.entitlements.planName}</strong> · Flotte : {accountStatus.entitlements.truckCount}/{accountStatus.entitlements.maxTrucks == null ? 'illimitée' : accountStatus.entitlements.maxTrucks} camion(s) · Chauffeurs : {accountStatus.entitlements.driverCount}/{accountStatus.entitlements.maxDrivers == null ? 'illimités' : accountStatus.entitlements.maxDrivers}</p>}
          {accountStatus.entitlements?.features?.length > 0 && <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-slate-600">{accountStatus.entitlements.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>}
          {isChargeur && activeSubscription && <Link to="/chargeur/demande" className="mt-4 inline-flex rounded-lg bg-[#FF6A3D] px-4 py-2.5 text-sm font-bold text-white">Publier une demande</Link>}
          {pendingSubscription && <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-bold">{subscription.moyen_paiement === 'KKIAPAY' ? 'Demande d’abonnement en attente de paiement' : 'Paiement en attente de validation'}</p><p className="mt-1">{subscription.moyen_paiement === 'KKIAPAY' ? 'Terminez le paiement sécurisé ci-dessous pour activer votre abonnement.' : `Référence : ${subscription.reference_transaction || 'à transmettre'} · moyen : ${subscription.moyen_paiement}`}</p></div>}
        </section>

        {(!activeSubscription || accountStatus.renewalOpen) && !scheduledSubscription && <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3"><CreditCard size={21} className="text-[#FF6A3D]" /><div><h2 className="font-bold text-[#121C2D]">Payer ou renouveler</h2><p className="text-sm text-slate-500">{subscription?.moyen_paiement === 'KKIAPAY' ? 'Le paiement KKiaPay est vérifié automatiquement avant l’activation.' : 'Les paiements manuels sont activés après vérification de leur référence par l’administration.'}</p></div></div>
          {pendingSubscription ? subscription.reference_transaction ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Votre référence a été transmise. Vous recevrez la confirmation dès que l’administrateur aura vérifié le paiement.</p> : subscription.moyen_paiement === 'KKIAPAY' ? <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">Réglez les {formatXof(subscription.montant)} via KKiaPay. Les moyens disponibles (mobile money, carte ou wallet) dépendent des options activées pour votre compte et votre pays.</p>
            <KkiapayPayButton
              checkoutUrl={`/api/paiements/abonnements/${subscription.id}/kkiapay/checkout`}
              confirmUrl={`/api/paiements/abonnements/${subscription.id}/kkiapay/confirm`}
              onPaid={async (response) => {
                setMessage(response.message);
                await loadSubscription();
              }}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#176f69] px-5 py-3 font-bold text-white disabled:opacity-60"
            />
          </div> : <form onSubmit={submitReference} className="space-y-4">
            {selectedDestination && <PaymentDestination method={selectedDestination} />}
            <label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#121C2D]">Référence de la transaction</span><input required minLength={4} maxLength={255} value={reference} onChange={(event) => setReference(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="Référence reçue après le paiement" /></label>
            <button disabled={saving} className="rounded-lg bg-[#FF6A3D] px-5 py-3 font-bold text-white disabled:opacity-60">{saving ? 'Envoi…' : 'Transmettre la référence'}</button>
          </form> : <form onSubmit={createRequest} className="space-y-4">
            {!isChargeur && <label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#121C2D]">Formule</span><select required value={selectedPlanDetails?.id || ''} onChange={(event) => setSelectedPlan(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">{availablePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} — {formatXof(plan.monthlyAmountXof)}/mois · {plan.maxTrucks == null ? 'camions illimités' : `${plan.maxTrucks} camion(s)`}, {plan.maxDrivers == null ? 'chauffeurs illimités' : `${plan.maxDrivers} chauffeur(s)`}</option>)}</select></label>}
            <label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#121C2D]">Moyen de paiement</span><select required value={selectedMethod} onChange={(event) => setSelectedMethod(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">{paymentConfig.methods.map((method) => <option key={method.key} value={method.key}>{method.label}</option>)}</select></label>
            {selectedDestination && <PaymentDestination method={selectedDestination} />}
            <p className="text-xs leading-5 text-slate-500">Effectuez le paiement du montant exact indiqué, puis vous pourrez transmettre sa référence pour validation.</p>
            <button disabled={saving || !selectedMethod} className="rounded-lg bg-[#FF6A3D] px-5 py-3 font-bold text-white disabled:opacity-60">{saving ? 'Création…' : 'Créer ma demande de paiement'}</button>
          </form>}
        </section>}
      </>}
    </main>
  </DashboardLayout>;
}

function PaymentDestination({ method }) {
  return <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
    <p className="font-bold">Coordonnées de paiement — {method.label}</p>
    {method.bankName && <p className="mt-2">Banque : <strong>{method.bankName}</strong></p>}
    <p className="mt-2">Titulaire : <strong>{method.accountName}</strong></p>
    <p className="mt-1">Compte / numéro : <strong className="break-all">{method.accountNumber}</strong></p>
    {method.instructions && <p className="mt-2">{method.instructions}</p>}
  </div>;
}
