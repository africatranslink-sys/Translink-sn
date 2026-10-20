import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, CircleAlert, Clock3, Mail, MapPinned, Settings2, ShieldAlert, X } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { useAutoDismissMessage } from '../utils/useAutoDismissMessage';
import { ADMIN_SIDEBAR_ITEMS } from '../utils/adminNavigation';
import ErrorTelevision from '../components/ErrorTelevision';
import PaymentProviderLogo from '../components/PaymentProviderLogo';
import api from '../utils/api';
import './ErrorPage.css';

const serviceIcons = {
  smtp: Mail,
  mapbox: MapPinned,
};

const paymentLogos = { paypal: 'PAYPAL', wave: 'WAVE', orangeMoney: 'ORANGE_MONEY' };

function ServiceLogo({ service }) {
  const paymentMethod = paymentLogos[service.key];
  if (paymentMethod) return <PaymentProviderLogo method={paymentMethod} size="small" />;

  const Icon = serviceIcons[service.key] || Settings2;
  return <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${service.key === 'mapbox' ? 'bg-[#e8f5f2] text-[#0f766e]' : 'bg-slate-50 text-slate-700'}`}>
    {service.key === 'mapbox' ? <span className="flex flex-col items-center gap-0.5"><Icon size={17} /><span className="text-[7px] font-black leading-none">mapbox</span></span> : <Icon size={22} />}
  </span>;
}

const statusLabels = {
  configured: 'Paramètres enregistrés',
  incomplete: 'Configuration à compléter',
  'pending-integration': 'API à connecter',
};

const statusStyles = {
  configured: 'bg-emerald-50 text-emerald-700',
  incomplete: 'bg-amber-50 text-amber-800',
  'pending-integration': 'bg-slate-100 text-slate-600',
};

const providerNames = { paypal: 'PayPal', wave: 'Wave', orangeMoney: 'Orange Money' };
const formatMoney = (amount, currency) => `${Number(amount || 0).toLocaleString('fr-FR', { minimumFractionDigits: currency === 'XOF' ? 0 : 2, maximumFractionDigits: 2 })} ${currency}`;

export default function AdminIntegrationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [pageUnlocked, setPageUnlocked] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [accessDeniedSeconds, setAccessDeniedSeconds] = useState(10);
  const [providerFunds, setProviderFunds] = useState(null);
  const [providerFundsError, setProviderFundsError] = useState('');
  const [paypalSuggestions, setPaypalSuggestions] = useState(null);
  const [loadingPaypalSuggestions, setLoadingPaypalSuggestions] = useState(false);
  const [selected, setSelected] = useState(null);
  const [pendingService, setPendingService] = useState(null);
  const [values, setValues] = useState({});
  const [clearSecrets, setClearSecrets] = useState([]);
  const [revealedSecrets, setRevealedSecrets] = useState({});
  const [visibleSecretFields, setVisibleSecretFields] = useState([]);
  const [maintenanceUpdating, setMaintenanceUpdating] = useState([]);
  const [adminPassword, setAdminPassword] = useState('');
  const [passwordPromptMode, setPasswordPromptMode] = useState('verify');
  const [passwordPromptPurpose, setPasswordPromptPurpose] = useState('access');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupPasswordConfirmation, setSetupPasswordConfirmation] = useState('');
  const [passwordPromptOpen, setPasswordPromptOpen] = useState(false);
  const [checkingPassword, setCheckingPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useAutoDismissMessage('');
  const [success, setSuccess] = useAutoDismissMessage('');
  const accessRedirected = useRef(false);

  const returnToPreviousPage = useCallback(() => {
    if (accessRedirected.current) return;
    accessRedirected.current = true;
    if (window.history.state?.idx > 0) {
      navigate(-1);
    } else {
      navigate('/admin', { replace: true });
    }
  }, [navigate]);

  const loadServices = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/auth/admin/integrations');
      const frontendMapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
      setServices(response.data.map((service) => service.key === 'mapbox' && frontendMapboxToken && !service.secrets?.token
        ? { ...service, configured: true, status: 'configured', secrets: { ...service.secrets, token: true }, legacyEnvToken: true }
        : service));
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible de charger les services externes.');
    } finally {
      setLoading(false);
    }
  };

  const loadProviderFunds = async () => {
    setProviderFundsError('');
    try {
      const response = await api.get('/api/paiements/admin/fonds');
      setProviderFunds(response.data);
    } catch (requestError) {
      setProviderFunds(null);
      setProviderFundsError(requestError.response?.data?.error || 'Les données des fonds sont momentanément indisponibles. Vous pouvez tout de même configurer les moyens de paiement.');
    }
  };

  useEffect(() => {
    let active = true;
    setCheckingPassword(true);
    api.get('/api/auth/admin/integrations/password-status')
      .then((response) => {
        if (!active) return;
        setPasswordPromptPurpose('access');
        setPasswordPromptMode(response.data.configured ? 'verify' : 'setup');
        setPasswordPromptOpen(true);
      })
      .catch((requestError) => {
        if (!active) return;
        setPasswordPromptPurpose('access');
        setError(requestError.response?.data?.error || 'Impossible de vérifier le mot de passe de configuration.');
        setPasswordPromptOpen(true);
      })
      .finally(() => {
        if (active) setCheckingPassword(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!accessDenied) return undefined;
    if (accessDeniedSeconds === 0) {
      returnToPreviousPage();
      return undefined;
    }
    const timer = window.setTimeout(() => setAccessDeniedSeconds((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [accessDenied, accessDeniedSeconds, returnToPreviousPage]);

  const requestConfiguration = async (service) => {
    if (adminPassword) {
      setSelected(service);
      setValues(service.values || {});
      setClearSecrets([]);
      setPaypalSuggestions(null);
      return;
    }
    setPendingService(service);
    setAdminPassword('');
    setPasswordPromptPurpose('configure');
    setRevealedSecrets({});
    setVisibleSecretFields([]);
    setSetupPassword('');
    setSetupPasswordConfirmation('');
    setCheckingPassword(true);
    setError('');
    try {
      const response = await api.get('/api/auth/admin/integrations/password-status');
      setPasswordPromptMode(response.data.configured ? 'verify' : 'setup');
      setPasswordPromptOpen(true);
    } catch (requestError) {
      setPendingService(null);
      setError(requestError.response?.data?.error || 'Impossible de vérifier si le mot de passe de configuration est initialisé.');
    } finally {
      setCheckingPassword(false);
    }
  };

  const closePasswordPrompt = () => {
    if (checkingPassword) return;
    if (passwordPromptPurpose === 'access') {
      navigate('/admin');
      return;
    }
    setPasswordPromptOpen(false);
    setPendingService(null);
    setAdminPassword('');
    setSetupPassword('');
    setSetupPasswordConfirmation('');
    setError('');
  };

  const showAccessDenied = () => {
    setPageUnlocked(false);
    setAccessDenied(true);
    setAccessDeniedSeconds(10);
    accessRedirected.current = false;
    setPasswordPromptOpen(false);
    setPendingService(null);
    setSelected(null);
    setAdminPassword('');
    setRevealedSecrets({});
    setVisibleSecretFields([]);
    setError('');
  };

  const retryPageAccess = () => {
    setAccessDenied(false);
    setPasswordPromptPurpose('access');
    setPasswordPromptMode('verify');
    setAdminPassword('');
    setError('');
    setPasswordPromptOpen(true);
  };

  const verifyConfigurationPassword = async (event) => {
    event.preventDefault();
    setCheckingPassword(true);
    setError('');
    try {
      if (passwordPromptPurpose === 'access') {
        if (passwordPromptMode === 'setup') {
          if (setupPassword !== setupPasswordConfirmation) {
            setError('Les deux saisies du mot de passe ne correspondent pas.');
            return;
          }
          await api.post('/api/auth/admin/integrations/admin-password/setup', {
            password: setupPassword,
            confirmation: setupPasswordConfirmation,
          });
          setAdminPassword(setupPassword);
        } else {
          await api.post('/api/auth/admin/integrations/verify-password', { password: adminPassword });
        }
        setPageUnlocked(true);
        setPasswordPromptOpen(false);
        setSetupPassword('');
        setSetupPasswordConfirmation('');
        await Promise.all([loadServices(), loadProviderFunds()]);
        return;
      }

      if (passwordPromptMode === 'setup') {
        if (setupPassword !== setupPasswordConfirmation) {
          setError('Les deux saisies du mot de passe ne correspondent pas.');
          return;
        }
        await api.post('/api/auth/admin/integrations/admin-password/setup', {
          password: setupPassword,
          confirmation: setupPasswordConfirmation,
        });
        setAdminPassword(setupPassword);
        setSelected(pendingService);
        setValues(pendingService?.values || {});
        setClearSecrets([]);
        setPaypalSuggestions(null);
        setPasswordPromptOpen(false);
        setSetupPassword('');
        setSetupPasswordConfirmation('');
        return;
      }
      await api.post('/api/auth/admin/integrations/verify-password', { password: adminPassword });
      setSelected(pendingService);
      setValues(pendingService?.values || {});
      setClearSecrets([]);
      setPaypalSuggestions(null);
      setPasswordPromptOpen(false);
    } catch (requestError) {
      if (requestError.response?.status === 403) {
        showAccessDenied();
      } else {
        setError(requestError.response?.data?.error || 'Vérification du mot de passe impossible.');
      }
    } finally {
      setCheckingPassword(false);
    }
  };

  const closeConfiguration = () => {
    if (saving) return;
    setSelected(null);
    setPendingService(null);
    setValues({});
    setPaypalSuggestions(null);
    setClearSecrets([]);
    setRevealedSecrets({});
    setVisibleSecretFields([]);
  };

  const loadPaypalSuggestions = async () => {
    setLoadingPaypalSuggestions(true);
    setError('');
    setPaypalSuggestions(null);
    try {
      const response = await api.get('/api/paiements/admin/paypal-fee-recommendations');
      const suggestions = response.data;
      setPaypalSuggestions(suggestions);
      setValues((current) => ({
        ...current,
        xofToUsdRate: String(suggestions.exchangeRate.xofToUsdRate),
        transactionFeeRate: String(suggestions.checkout.transactionFeeRate),
        transactionFeeFixedUsd: String(suggestions.checkout.transactionFeeFixedUsd),
        payoutFeeRate: String(suggestions.payoutFee.rate),
        payoutFeeCapUsd: String(suggestions.payoutFee.capUsd),
      }));
      setSuccess('Les suggestions disponibles ont été ajoutées aux champs. Vérifiez-les avant l’enregistrement.');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible de calculer les suggestions PayPal.');
    } finally {
      setLoadingPaypalSuggestions(false);
    }
  };

  const toggleMaintenance = async (service) => {
    setMaintenanceUpdating((current) => [...current, service.key]);
    setError('');
    setSuccess('');
    try {
      const response = await api.put(`/api/auth/admin/integrations/${service.key}/maintenance`, { maintenance: !service.maintenance });
      setServices((current) => current.map((item) => {
        if (item.key !== service.key) return item;
        return { ...item, maintenance: response.data.maintenance };
      }));
      setSuccess(`${service.name} : statut ${response.data.maintenance ? 'mis en maintenance' : 'rétabli'}.`);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible de modifier le statut de maintenance.');
    } finally {
      setMaintenanceUpdating((current) => current.filter((key) => key !== service.key));
    }
  };

  const toggleSecretVisibility = async (fieldKey) => {
    if (visibleSecretFields.includes(fieldKey)) {
      setVisibleSecretFields((current) => current.filter((key) => key !== fieldKey));
      return;
    }

    let secretValue = revealedSecrets[fieldKey];
    if (!Object.hasOwn(revealedSecrets, fieldKey)) {
      setError('');
      try {
        const response = await api.post('/api/auth/admin/integrations/smtp/secrets/reveal', { adminPassword });
        const secrets = response.data.secrets || {};
        setRevealedSecrets(secrets);
        secretValue = secrets[fieldKey];
        if (!secretValue) {
          setError('Aucune valeur SMTP enregistrée pour ce champ.');
          return;
        }
      } catch (requestError) {
        setError(requestError.response?.data?.error || 'Impossible de récupérer cette valeur SMTP.');
        return;
      }
    }
    if (!secretValue) {
      setError('Aucune valeur SMTP enregistrée pour ce champ.');
      return;
    }
    setVisibleSecretFields((current) => [...current, fieldKey]);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const allowedFieldKeys = new Set(selected.fields.map((field) => field.key));
      const settings = Object.fromEntries(
        Object.entries(values).filter(([key]) => allowedFieldKeys.has(key)),
      );
      if (selected.key === 'mapbox' && selected.legacyEnvToken && !settings.token && import.meta.env.VITE_MAPBOX_TOKEN && !clearSecrets.includes('token')) {
        settings.token = import.meta.env.VITE_MAPBOX_TOKEN;
      }
      const response = await api.put(`/api/auth/admin/integrations/${selected.key}`, { settings, clearSecrets, adminPassword });
      setServices((current) => current.map((service) => service.key === response.data.key ? response.data : service));
      setSelected(null);
      setPendingService(null);
      setRevealedSecrets({});
      setVisibleSecretFields([]);
      setSuccess(`${response.data.name} : configuration enregistrée.`);
    } catch (requestError) {
      if (requestError.response?.status === 403) {
        showAccessDenied();
      } else {
        setError(requestError.response?.data?.error || (requestError.response
          ? 'La configuration n’a pas pu être enregistrée.'
          : 'Impossible de joindre le serveur. La configuration n’a pas été enregistrée ; vérifiez votre connexion puis réessayez.'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout sidebarItems={ADMIN_SIDEBAR_ITEMS} user={user}>
      {!pageUnlocked ? accessDenied ? <section className="mx-auto flex min-h-[65vh] max-w-5xl flex-col items-center justify-center gap-5 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:flex-row sm:gap-10 sm:p-10" aria-labelledby="integration-access-denied-title">
        <ErrorTelevision code="403" label="Accès refusé" Icon={ShieldAlert} className="!my-0 !w-full !max-w-[340px] !shrink-0 !pt-5" />
        <div className="error-copy text-left">
          <p className="error-eyebrow">Translink-Africa · 403</p>
          <h1 id="integration-access-denied-title">Mot de passe incorrect.</h1>
          <p className="error-message">L’accès aux services externes est refusé. Saisissez le mot de passe de configuration pour réessayer.</p>
          <div className="error-countdown" role="status" aria-live="polite">
            <Clock3 size={17} />
            <span>Retour à la page précédente dans</span>
            <strong>{accessDeniedSeconds} s</strong>
          </div>
          <div className="error-progress" aria-hidden="true"><span style={{ width: `${accessDeniedSeconds * 10}%` }} /></div>
          <button type="button" onClick={retryPageAccess} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#176f69] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#115c57]"><ArrowLeft size={17} /> Réessayer</button>
        </div>
      </section> : <div className="mx-auto max-w-5xl rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">Cette page est protégée par le mot de passe de configuration.</div> : <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-orange">Administration Translink-Africa</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div><h1 className="text-3xl font-bold text-brand-dark">Services externes</h1><p className="mt-1 text-slate-500">Paramétrez les connexions utilisées par la plateforme.</p></div>
            <button type="button" onClick={() => { loadServices(); loadProviderFunds(); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"><Settings2 size={16} /> Actualiser</button>
          </div>
        </header>

        <details className="rounded-lg border border-sky-200 bg-sky-50 text-sm text-sky-900">
          <summary className="flex cursor-pointer list-none items-center gap-2 p-3 font-semibold">
            <CircleAlert size={17} className="shrink-0" />
            Informations sur la sécurité et la maintenance
          </summary>
          <p className="px-3 pb-3 pl-9">Les clés sont chiffrées côté serveur. La clé <code>INTEGRATION_CONFIG_ENCRYPTION_KEY</code> doit être définie dans l’environnement des microservices. Le mot de passe dédié se gère dans Paramètres &gt; Sécurité. Le statut « maintenance » est informatif et ne désactive pas le service.</p>
          <p className="px-3 pb-3 pl-9">Pour KKiaPay, commencez en Sandbox. Le webhook à enregistrer dans le tableau KKiaPay est : <code>{window.location.origin}/api/paiements/webhook/kkiapay</code>. Les clés privées et secrètes restent côté serveur.</p>
        </details>
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
        {success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</p>}

        <section className="space-y-3">
          <div><h2 className="font-bold text-brand-dark">Fonds de la plateforme</h2><p className="mt-1 text-sm text-slate-500">Les soldes externes viennent des APIs; les commissions sont les montants validés dans Translink-Africa.</p></div>
          {providerFundsError && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{providerFundsError}</p>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs font-semibold text-slate-500">Commissions confirmées</p><p className="mt-2 text-xl font-bold text-brand-dark">{providerFunds ? formatMoney(providerFunds.accounting.commissionConfirmedXof, 'XOF') : '—'}</p><p className="mt-1 text-xs text-slate-400">Cumul comptable Translink-Africa</p></article>
            <article className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs font-semibold text-slate-500">Abonnements actifs</p><p className="mt-2 text-xl font-bold text-brand-dark">{providerFunds ? formatMoney(providerFunds.accounting.subscriptionRevenueXof, 'XOF') : '—'}</p><p className="mt-1 text-xs text-slate-400">Revenu des abonnements payés</p></article>
            <article className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs font-semibold text-slate-500">Reversements à traiter</p><p className="mt-2 text-xl font-bold text-brand-dark">{providerFunds ? formatMoney(providerFunds.accounting.payoutsPendingXof, 'XOF') : '—'}</p><p className="mt-1 text-xs text-slate-400">Net validé non encore versé</p></article>
            <article className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs font-semibold text-slate-500">Frais PayPal estimés</p><p className="mt-2 text-xl font-bold text-brand-dark">{providerFunds ? formatMoney(providerFunds.accounting.estimatedPayPalFeesUsd, 'USD') : '—'}</p><p className="mt-1 text-xs text-slate-400">Frais enregistrés sur les captures PayPal</p></article>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {(providerFunds?.providers || ['paypal', 'wave', 'orangeMoney'].map((key) => ({ key, status: 'unavailable', balances: [] }))).map((provider) => <article key={provider.key} className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-2"><h3 className="font-semibold text-brand-dark">Solde {providerNames[provider.key]}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${provider.status === 'available' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{provider.status === 'available' ? 'API disponible' : provider.status === 'pending-integration' ? 'API à connecter' : 'Indisponible'}</span></div>{provider.status === 'available' && provider.balances.length ? <div className="mt-3 space-y-2">{provider.balances.map((balance, index) => <div key={`${balance.currency}-${index}`} className="text-sm"><p className="font-bold text-brand-dark">{formatMoney(balance.total, balance.currency || 'USD')}</p>{balance.available != null && <p className="text-xs text-slate-500">Disponible : {formatMoney(balance.available, balance.currency || 'USD')}</p>}</div>)}</div> : <p className="mt-3 text-xs leading-5 text-slate-500">{provider.key === 'paypal' ? 'Vérifiez les clés et les permissions Reporting du compte marchand.' : 'Le connecteur de solde n’est pas encore intégré.'}</p>}</article>)}
          </div>
        </section>

        {loading ? <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-slate-500">Chargement des services…</div> : (
          <div className="grid gap-4 sm:grid-cols-2">
            {services.map((service) => {
              return (
                <article key={service.key} className="flex min-h-48 flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3"><ServiceLogo service={service} /><div className="min-w-0"><h2 className="font-bold text-brand-dark">{service.name}</h2><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${statusStyles[service.status]}`}>{statusLabels[service.status]}</span>{service.maintenance && <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800">Maintenance (indicateur admin)</span>}</div></div>
                    <span className="mt-1 flex shrink-0 items-center gap-1 text-xs text-slate-500">{service.configured && <Check size={14} className="text-emerald-600" />}{Object.values(service.secrets || {}).filter(Boolean).length} clé(s)</span>
                  </div>
                  <p className="mt-4 flex-1 text-sm leading-5 text-slate-500">{service.description}</p>
                  {service.key === 'mapbox' && service.legacyEnvToken && <p className="mt-3 text-xs text-emerald-700">Token public existant détecté dans l’environnement frontend; il sera importé au prochain enregistrement.</p>}
                  {!service.backendConnected && <p className="mt-3 text-xs text-amber-700">Les paramètres seront conservés de façon chiffrée; le connecteur de paiement est encore simulé.</p>}
                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={() => requestConfiguration(service)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-brand-orange hover:text-brand-dark">Configurer <Settings2 size={15} /></button>
                    <button type="button" onClick={() => toggleMaintenance(service)} disabled={maintenanceUpdating.includes(service.key)} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-amber-300 px-3 py-2 text-center text-xs font-bold text-amber-800 transition hover:bg-amber-50 disabled:cursor-wait disabled:opacity-60">{maintenanceUpdating.includes(service.key) ? 'Mise à jour…' : service.maintenance ? 'Retirer le statut maintenance' : 'Signaler en maintenance'}</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>}

      {passwordPromptOpen && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-brand-dark/60 p-4" onMouseDown={(event) => event.target === event.currentTarget && closePasswordPrompt()}>
        <section role="dialog" aria-modal="true" aria-labelledby="integration-unlock-title" className="w-full max-w-md rounded-lg bg-white shadow-2xl">
          <form onSubmit={verifyConfigurationPassword}>
            <div className="border-b border-slate-200 p-5"><h2 id="integration-unlock-title" className="text-xl font-bold text-brand-dark">{passwordPromptMode === 'setup' ? 'Créer le mot de passe de configuration' : passwordPromptPurpose === 'access' ? 'Accéder aux services externes' : 'Déverrouiller la configuration'}</h2><p className="mt-1 text-sm text-slate-500">{passwordPromptMode === 'setup' ? 'Première utilisation : choisissez un mot de passe dédié (12 caractères minimum), différent du mot de passe de connexion admin, puis saisissez-le une seconde fois.' : passwordPromptPurpose === 'access' ? 'Saisissez le mot de passe dédié pour consulter et gérer les services externes.' : `Saisissez le mot de passe dédié pour configurer ${pendingService?.name}.`}</p></div>
            <div className="space-y-3 p-5">
              {passwordPromptMode === 'setup' ? <>
                <label className="block"><span className="mb-1.5 block text-sm font-semibold text-brand-dark">Nouveau mot de passe de configuration</span><input type="password" autoComplete="new-password" autoFocus required minLength="12" value={setupPassword} onChange={(event) => setSetupPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-brand-orange" /></label>
                <label className="block"><span className="mb-1.5 block text-sm font-semibold text-brand-dark">Confirmer le mot de passe</span><input type="password" autoComplete="new-password" required minLength="12" value={setupPasswordConfirmation} onChange={(event) => setSetupPasswordConfirmation(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-brand-orange" /></label>
              </> : <label className="block"><span className="mb-1.5 block text-sm font-semibold text-brand-dark">Mot de passe de configuration</span><input type="password" autoComplete="current-password" autoFocus required value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-brand-orange" /></label>}
              {error && <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 p-5"><button type="button" disabled={checkingPassword} onClick={closePasswordPrompt} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">{passwordPromptPurpose === 'access' ? 'Retour' : 'Annuler'}</button><button type="submit" disabled={checkingPassword || (passwordPromptMode === 'setup' ? !setupPassword || !setupPasswordConfirmation : !adminPassword)} className="rounded-lg bg-brand-orange px-5 py-2 text-sm font-bold text-white disabled:opacity-60">{checkingPassword ? 'Vérification…' : passwordPromptMode === 'setup' ? 'Créer et continuer' : 'Continuer'}</button></div>
          </form>
        </section>
      </div>}

      {selected && <div className="fixed inset-0 z-80 flex items-center justify-center bg-brand-dark/60 p-4" onMouseDown={(event) => event.target === event.currentTarget && closeConfiguration()}>
        <section role="dialog" aria-modal="true" aria-labelledby="integration-dialog-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white shadow-2xl">
          <form onSubmit={handleSubmit}>
            <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-slate-200 bg-white p-5"><div><h2 id="integration-dialog-title" className="text-xl font-bold text-brand-dark">Configurer {selected.name}</h2><p className="mt-1 text-sm text-slate-500">Les champs secrets restent masqués après l’enregistrement.</p></div><button type="button" onClick={closeConfiguration} aria-label="Fermer" className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><X size={18} /></button></div>
            <div className="space-y-4 p-5">
              {selected.key === 'paypal' && <section className="rounded-lg border border-sky-200 bg-sky-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h3 className="text-sm font-bold text-brand-dark">Suggestions basées sur les données</h3><p className="mt-1 text-xs leading-5 text-slate-600">Taux de change depuis une source externe; frais selon les montants réels retournés par PayPal. Les suggestions restent modifiables.</p></div>
                  <button type="button" onClick={loadPaypalSuggestions} disabled={loadingPaypalSuggestions} className="rounded-lg bg-brand-dark px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{loadingPaypalSuggestions ? 'Calcul…' : 'Calculer les suggestions'}</button>
                </div>
                {paypalSuggestions && <div className="mt-3 space-y-2 text-xs text-slate-700">
                  <p><strong>Change :</strong> 1 XOF = {Number(paypalSuggestions.exchangeRate.xofToUsdRate).toFixed(8)} USD — {paypalSuggestions.exchangeRate.source}{paypalSuggestions.exchangeRate.sourceUpdatedAt ? `, mis à jour ${paypalSuggestions.exchangeRate.sourceUpdatedAt}` : ''}.</p>
                  <p><strong>Revenus confirmés de la plateforme :</strong> {formatMoney(paypalSuggestions.platformRevenueXof, 'XOF')} (commissions confirmées et abonnements actifs). Frais réellement enregistrés : réception {formatMoney(paypalSuggestions.actualCheckoutFeesUsd, 'USD')}, reversements {formatMoney(paypalSuggestions.actualPayoutFeesUsd, 'USD')}.</p>
                  <p><strong>Part des revenus consommée par ces frais :</strong> {paypalSuggestions.actualFeeShareOfPlatformRevenuePercent == null ? 'indisponible (aucun revenu confirmé)' : `${paypalSuggestions.actualFeeShareOfPlatformRevenuePercent} %`}.</p>
                  <p>Réception : {paypalSuggestions.checkout.ready ? `estimation statistique calculée sur ${paypalSuggestions.checkout.sampleCount} paiements confirmés.` : `tarif provisoire international ${Number(paypalSuggestions.checkout.transactionFeeRate * 100).toFixed(2)} % + ${formatMoney(paypalSuggestions.checkout.transactionFeeFixedUsd, 'USD')}; le tarif domestique publié pour le Sénégal est 3,40 % + 0,30 USD.`}</p>
                  <p>Reversement : tarif provisoire « autres marchés » {Number(paypalSuggestions.payoutFee.rate * 100).toFixed(0)} % plafonné à {formatMoney(paypalSuggestions.payoutFee.capUsd, 'USD')}; {paypalSuggestions.payoutFee.sampleCount} frais réels observés.</p>
                  <p>Barème PayPal : <a className="font-semibold text-sky-800 underline" href={paypalSuggestions.feeScheduleSource} target="_blank" rel="noreferrer">consulter la source officielle</a>. Confirmez que ces tarifs s’appliquent à votre compte et à vos opérations avant l’enregistrement.</p>
                </div>}
              </section>}
              {selected.fields.map((field) => {
                const isSecret = field.type === 'secret';
                const isCleared = clearSecrets.includes(field.key);
                const isSecretVisible = visibleSecretFields.includes(field.key);
                return <label key={field.key} className="block"><span className="mb-1.5 flex items-center justify-between gap-3 text-sm font-semibold text-brand-dark"><span>{field.label}{field.required && <span className="text-brand-orange"> *</span>}</span><span className="flex items-center gap-3">{isSecret && selected.key === 'smtp' && ['user', 'password'].includes(field.key) && selected.secrets?.[field.key] && <button type="button" disabled={isCleared} onClick={() => toggleSecretVisibility(field.key)} className="text-xs font-semibold text-sky-700 disabled:opacity-50">{isSecretVisible ? 'Masquer' : 'Afficher'}</button>}{isSecret && selected.secrets?.[field.key] && <button type="button" onClick={() => setClearSecrets((current) => isCleared ? current.filter((key) => key !== field.key) : [...current, field.key])} className="text-xs font-semibold text-rose-600">{isCleared ? 'Conserver' : 'Effacer'}</button>}</span></span>
                  {field.type === 'select' ? <select required={field.required} value={values[field.key] || ''} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-brand-orange">{!field.required && <option value="">Choisir…</option>}{field.options.map((option) => <option key={option} value={option}>{option === 'sandbox' ? 'Sandbox (test)' : option === 'live' ? 'Production' : option}</option>)}</select>
                    : field.type === 'checkbox' ? <input type="checkbox" checked={Boolean(values[field.key])} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.checked }))} className="h-4 w-4 accent-brand-orange" />
                    : <input required={field.required && !isSecret} type={isSecret ? isSecretVisible ? 'text' : 'password' : field.type} step={field.step} min={field.type === 'number' ? 0 : undefined} value={values[field.key] ?? (isSecretVisible ? revealedSecrets[field.key] : '') ?? ''} disabled={isSecret && isCleared} placeholder={isSecret ? selected.secrets?.[field.key] && !isCleared ? 'Déjà enregistrée; laisser vide pour conserver' : 'Saisir la valeur secrète' : ''} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-brand-orange disabled:bg-slate-100" />}
                  {isSecret && selected.secrets?.[field.key] && !isCleared && <span className="mt-1 block text-xs text-emerald-700">{selected.key === 'smtp' && ['user', 'password'].includes(field.key) ? 'Utilisez « Afficher » pour consulter la valeur après vérification du mot de passe de configuration.' : 'Une valeur est déjà enregistrée; laissez vide pour la conserver.'}</span>}
                </label>;
              })}
              {!selected.backendConnected && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">Cette API n’est pas encore connectée au flux de paiement. Les clés seront conservées, mais ne déclenchent pas de transaction pour le moment.</p>}
              {error && <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
            </div>
            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white p-5"><button type="button" onClick={closeConfiguration} disabled={saving} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Annuler</button><button type="submit" disabled={saving} className="rounded-lg bg-brand-orange px-5 py-2 text-sm font-bold text-white hover:bg-[#e85b2d] disabled:opacity-60">{saving ? 'Enregistrement…' : 'Enregistrer'}</button></div>
          </form>
        </section>
      </div>}
    </DashboardLayout>
  );
}