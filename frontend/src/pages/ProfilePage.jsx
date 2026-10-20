import React, { useEffect, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { useAuth } from '../context/AuthContext';
import { MapPin, Phone, Check, UserRound, LockKeyhole, History, CreditCard, Mail } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../utils/api';
import CountrySelect from '../components/CountrySelect';
import PaymentAccountCard from '../components/PaymentAccountCard';
import PaymentProviderLogo from '../components/PaymentProviderLogo';
import { useAutoDismissMessage } from '../utils/useAutoDismissMessage';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { getSidebarItems } from '../utils/navigation';
import { africanCountries } from '../utils/africanCountries';
import { useLanguage } from '../context/useLanguage';
import './ProfilePage.css';

const roleAvatar = { ADMIN: '🛡️', TRANSPORTEUR: '🚚', ENTREPRISE: '🏢', CHARGEUR: '📦', CHAUFFEUR: '👨🏾‍✈️' };
const payoutMethods = [
  { value: 'WAVE', label: 'Wave', detail: 'Compte mobile money' },
  { value: 'ORANGE_MONEY', label: 'Orange Money', detail: 'Compte mobile money' },
  { value: 'PAYPAL', label: 'PayPal', detail: 'Adresse e-mail PayPal' },
  { value: 'BANQUE', label: 'Banque', detail: 'IBAN ou compte bancaire' },
];
const westAfricanCountryCodes = ['+229', '+226', '+238', '+225', '+220', '+233', '+224', '+245', '+231', '+223', '+222', '+227', '+234', '+221', '+232', '+228'];
const mobileMoneyCountryCodes = {
  WAVE: westAfricanCountryCodes,
  ORANGE_MONEY: westAfricanCountryCodes,
};
const getMobileMoneyCountries = (method) => africanCountries.filter((country) => mobileMoneyCountryCodes[method]?.includes(country.code));
const getProfilePhoneParts = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  const matchingCountry = [...africanCountries]
    .sort((first, second) => second.code.length - first.code.length)
    .find((country) => digits.startsWith(country.code.replace(/\D/g, '')));
  const fallbackCountry = africanCountries.find((country) => country.code === '+221');
  const country = matchingCountry || fallbackCountry;
  const countryDigits = country?.code.replace(/\D/g, '') || '';

  return {
    countryCode: country?.code || '+221',
    telephone_whatsapp: matchingCountry && countryDigits
      ? digits.slice(countryDigits.length)
      : digits.startsWith('221') ? digits.slice(3) : digits,
  };
};
const getNationalPaymentNumber = (identifier, countryCode) => {
  const normalizedIdentifier = String(identifier || '').replace(/\s/g, '');
  const nationalNumber = countryCode && normalizedIdentifier.startsWith(countryCode)
    ? normalizedIdentifier.slice(countryCode.length)
    : normalizedIdentifier;
  return nationalNumber.replace(/\D/g, '');
};
const getPaymentCountryCode = (user) => {
  const countries = getMobileMoneyCountries(user?.compte_paiement_type);
  const identifier = String(user?.compte_paiement_identifiant || '').replace(/\s/g, '');
  return [...countries].sort((first, second) => second.code.length - first.code.length).find((country) => identifier.startsWith(country.code))?.code
    || countries.find((country) => country.code === '+221')?.code
    || '+221';
};
const createProfileFormState = ({ nom, email, ville, telephone_whatsapp, description } = {}) => {
  const phoneParts = getProfilePhoneParts(telephone_whatsapp);
  return {
    nom: nom || '',
    email: email || '',
    ville: ville || '',
    telephone_whatsapp: phoneParts.telephone_whatsapp,
    description: description || ''
  };
};

const createPaymentAccountDraft = (account) => ({
  holder: account?.holder || '',
  identifier: account?.identifier || '',
  bank: account?.bank || '',
  can_receive: Boolean(account?.can_receive),
  can_send: Boolean(account?.can_send),
  is_default_receive: Boolean(account?.is_default_receive),
  is_default_send: Boolean(account?.is_default_send)
});

export default function ProfilePage() {
  const { user, updateProfile, syncUser } = useAuth();
  const { language } = useLanguage();
  const sidebarItems = getSidebarItems(user?.role, user);
  const isPaymentActor = ['TRANSPORTEUR', 'ENTREPRISE', 'CHARGEUR'].includes(user?.role)
    || (user?.role === 'CHAUFFEUR' && user?.employeur_id === null);
  const [avatar, setAvatar] = useState(user?.avatar_url || '');
  const [countryCode, setCountryCode] = useState(() => getProfilePhoneParts(user?.telephone_whatsapp).countryCode);
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('WAVE');
  const [paymentDrafts, setPaymentDrafts] = useState({});
  const [paymentCountryCode, setPaymentCountryCode] = useState(() => getPaymentCountryCode(user));
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useAutoDismissMessage('');
  const [paymentSuccess, setPaymentSuccess] = useAutoDismissMessage('');
  const avatars = ['/avatars/avatar1.jpg', '/avatars/avatar2.jpg', '/avatars/avatar3.jpg'];
  
  const [formData, setFormData] = useState(() => createProfileFormState(user));
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useAutoDismissMessage('');
  const [error, setError] = useAutoDismissMessage('');
  const [loginHistory, setLoginHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(0);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ ancien_mot_de_passe: '', nouveau_mot_de_passe: '' });
  const [passwordMessage, setPasswordMessage] = useAutoDismissMessage('');
  const [adminConfigPasswordForm, setAdminConfigPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmation: '' });
  const [adminConfigPasswordMessage, setAdminConfigPasswordMessage] = useAutoDismissMessage('');
  const [adminConfigPasswordLoading, setAdminConfigPasswordLoading] = useState(false);
  const [adminConfigPasswordResetOpen, setAdminConfigPasswordResetOpen] = useState(false);
  const [adminConfigPasswordConfigured, setAdminConfigPasswordConfigured] = useState(null);
  const [adminConfigPasswordStatusError, setAdminConfigPasswordStatusError] = useState('');
  const [activeTab, setActiveTab] = useState('profil');
  const [newsletterPreference, setNewsletterPreference] = useState(null);
  const newsletterConsent = newsletterPreference?.userId === user?.id
    ? newsletterPreference.consent
    : Boolean(user?.newsletter_consent_at);
  const [newsletterLoading, setNewsletterLoading] = useState(false);
  const [newsletterMessage, setNewsletterMessage] = useAutoDismissMessage('');

  useEffect(() => {
    setAvatar(user?.avatar_url || '');
  }, [user?.avatar_url]);

  useEffect(() => {
    setFormData(createProfileFormState({
      nom: user?.nom,
      email: user?.email,
      ville: user?.ville,
      telephone_whatsapp: user?.telephone_whatsapp,
      description: user?.description,
    }));
    setCountryCode(getProfilePhoneParts(user?.telephone_whatsapp).countryCode);
  }, [user?.id, user?.nom, user?.email, user?.ville, user?.telephone_whatsapp, user?.description]);

  useEffect(() => {
    let active = true;
    setPaymentAccounts([]);
    setPaymentDrafts({});
    setSelectedPaymentMethod('WAVE');
    setPaymentCountryCode('+221');
    setPaymentError('');
    if (!isPaymentActor || !user?.id) return () => { active = false; };

    api.get('/api/auth/profile/payment-accounts')
      .then((response) => {
        if (!active) return;
        const accounts = response.data;
        setPaymentAccounts(accounts);
        const preferredMethod = accounts.find((account) => account.is_default_receive)?.method
          || accounts.find((account) => account.is_default_send)?.method
          || accounts[0]?.method
          || 'WAVE';
        setSelectedPaymentMethod(preferredMethod);
        setPaymentCountryCode(getPaymentCountryCode({
          compte_paiement_type: accounts.find((account) => account.is_default_receive)?.method,
          compte_paiement_identifiant: accounts.find((account) => account.is_default_receive)?.identifier,
        }));
      })
      .catch((requestError) => {
        if (active) setPaymentError(requestError.response?.data?.error || 'Impossible de charger les moyens de paiement.');
      });
    return () => { active = false; };
  }, [isPaymentActor, user?.id, setPaymentError]);

  useEffect(() => { api.get('/api/auth/login-history').then((response) => setLoginHistory(response.data)).catch(() => setLoginHistory([])); }, []);

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    api.get('/api/auth/admin/integrations/password-status')
      .then((response) => setAdminConfigPasswordConfigured(Boolean(response.data.configured)))
      .catch((requestError) => setAdminConfigPasswordStatusError(requestError.response?.data?.error || 'Impossible de vérifier le mot de passe de configuration.'));
  }, [user?.role]);

  const handleChange = (e) => {
    setFormData((current) => ({ ...current, [e.target.name]: e.target.value }));
  };

  const handlePaymentCountryChange = (nextCode) => {
    setPaymentCountryCode(nextCode);
    setPaymentDrafts((current) => {
      const draft = current[selectedPaymentMethod] || createPaymentAccountDraft(paymentAccounts.find((account) => account.method === selectedPaymentMethod));
      const nationalNumber = getNationalPaymentNumber(draft.identifier, paymentCountryCode);
      return {
        ...current,
        [selectedPaymentMethod]: { ...draft, identifier: nationalNumber ? `${nextCode}${nationalNumber}` : '' },
      };
    });
  };

  const handlePaymentPhoneChange = (event) => {
    const nationalNumber = event.target.value.replace(/\D/g, '');
    setPaymentDrafts((current) => {
      const draft = current[selectedPaymentMethod] || createPaymentAccountDraft(paymentAccounts.find((account) => account.method === selectedPaymentMethod));
      return {
        ...current,
        [selectedPaymentMethod]: { ...draft, identifier: nationalNumber ? `${paymentCountryCode}${nationalNumber}` : '' },
      };
    });
  };

  const getPaymentDraft = (drafts, method) => drafts[method] || createPaymentAccountDraft(paymentAccounts.find((account) => account.method === method));
  const updatePaymentDraft = (field, value) => setPaymentDrafts((current) => ({
    ...current,
    [selectedPaymentMethod]: { ...getPaymentDraft(current, selectedPaymentMethod), [field]: value },
  }));

  const savePaymentAccount = async (event) => {
    event.preventDefault();
    const draft = getPaymentDraft(paymentDrafts, selectedPaymentMethod);
    setPaymentLoading(true);
    setPaymentError('');
    setPaymentSuccess('');
    try {
      const response = await api.put(`/api/auth/profile/payment-accounts/${selectedPaymentMethod}`, draft);
      setPaymentAccounts(response.data.accounts);
      setPaymentDrafts((current) => ({ ...current, [selectedPaymentMethod]: createPaymentAccountDraft(response.data.account) }));
      if (response.data.user) syncUser({ ...response.data.user, payment_accounts: response.data.accounts });
      setPaymentSuccess('Moyen de paiement enregistré.');
    } catch (requestError) {
      setPaymentError(requestError.response?.data?.error || 'Impossible d’enregistrer ce moyen de paiement.');
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      await updateProfile({ ...formData, telephone_whatsapp: `${countryCode}${formData.telephone_whatsapp.replace(/\D/g, '')}`, avatar_url: avatar || null });
      setSuccess('Profil mis à jour avec succès !');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Erreur lors de la mise à jour du profil.');
    } finally {
      setLoading(false);
    }
  };

  const saveNewsletterConsent = async (event) => {
    event.preventDefault();
    setNewsletterLoading(true);
    setNewsletterMessage('');
    try {
      const response = await api.put('/api/auth/profile/newsletter-consent', { newsletter_consent: newsletterConsent });
      setNewsletterPreference({ userId: user.id, consent: response.data.newsletter_consent });
      syncUser({ ...user, newsletter_consent_at: response.data.newsletter_consent_at });
      setNewsletterMessage(response.data.newsletter_consent
        ? 'Votre consentement à recevoir la newsletter est enregistré.'
        : 'Votre désabonnement a bien été enregistré.');
    } catch (requestError) {
      setNewsletterMessage(requestError.response?.data?.error || 'Impossible d’enregistrer votre préférence.');
    } finally {
      setNewsletterLoading(false);
    }
  };

  const isFleetActor = ['TRANSPORTEUR', 'ENTREPRISE', 'CHAUFFEUR'].includes(user?.role);
  const actorLabels = language === 'en'
    ? { ADMIN: 'Administrator', TRANSPORTEUR: 'Carrier', ENTREPRISE: 'Transport company', CHAUFFEUR: user?.employeur_id ? 'Driver' : 'Independent driver', CHARGEUR: 'Shipper' }
    : { ADMIN: 'Administrateur', TRANSPORTEUR: 'Transporteur', ENTREPRISE: 'Entreprise de transport', CHAUFFEUR: user?.employeur_id ? 'Chauffeur' : 'Chauffeur indépendant', CHARGEUR: 'Expéditeur' };
  const actorLabel = actorLabels[user?.role] || (language === 'en' ? 'User' : 'Utilisateur');
  const descriptionLabel = language === 'en'
    ? user?.role === 'ENTREPRISE' ? 'Company description' : user?.role === 'CHAUFFEUR' ? 'Driver profile' : 'Carrier profile'
    : user?.role === 'ENTREPRISE' ? 'Description de l’entreprise' : user?.role === 'CHAUFFEUR' ? 'Présentation du chauffeur' : 'Présentation du transporteur';
  const locale = language === 'en' ? 'en-US' : 'fr-FR';

  const handleAvatarUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarLoading(true);
    setError('');
    try {
      const compressedImage = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1200,
        useWebWorker: true,
        fileType: 'image/jpeg',
      });
      const filename = file.name.replace(/\.[^.]+$/, '') || 'avatar';
      const uploadFile = new File([compressedImage], `${filename}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
      const body = new FormData();
      body.append('avatar', uploadFile);
      const response = await api.post('/api/auth/profile/avatar', body);
      setAvatar(response.data.avatar_url);
      if (response.data.user) syncUser(response.data.user);
      setSuccess('Photo téléchargée et enregistrée.');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'La photo n’a pas pu être téléchargée.');
    } finally {
      setAvatarLoading(false);
      event.target.value = '';
    }
  };

  const handlePasswordChange = async (event) => {
    event.preventDefault();
    setPasswordMessage('');
    try {
      await api.put('/api/auth/profile/password', passwordForm);
      setPasswordForm({ ancien_mot_de_passe: '', nouveau_mot_de_passe: '' });
      setPasswordMessage('Mot de passe modifié avec succès.');
    } catch (err) {
      setPasswordMessage(err.response?.data?.error || 'Modification impossible.');
    }
  };

  const handleAdminConfigPasswordChange = async (event) => {
    event.preventDefault();
    setAdminConfigPasswordMessage('');
    if (adminConfigPasswordForm.newPassword !== adminConfigPasswordForm.confirmation) {
      setAdminConfigPasswordMessage('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }

    setAdminConfigPasswordLoading(true);
    try {
      const { currentPassword, newPassword, confirmation } = adminConfigPasswordForm;
      const response = await api.put('/api/auth/admin/integrations/admin-password', { currentPassword, newPassword, confirmation });
      setAdminConfigPasswordForm({ currentPassword: '', newPassword: '', confirmation: '' });
      setAdminConfigPasswordResetOpen(false);
      setAdminConfigPasswordMessage(response.data.message || 'Mot de passe de configuration modifié.');
    } catch (err) {
      setAdminConfigPasswordMessage(err.response?.data?.error || 'Modification du mot de passe de configuration impossible.');
    } finally {
      setAdminConfigPasswordLoading(false);
    }
  };

  const handleAdminConfigPasswordSetup = async (event) => {
    event.preventDefault();
    setAdminConfigPasswordMessage('');
    if (adminConfigPasswordForm.newPassword !== adminConfigPasswordForm.confirmation) {
      setAdminConfigPasswordMessage('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }

    setAdminConfigPasswordLoading(true);
    try {
      const { newPassword, confirmation } = adminConfigPasswordForm;
      await api.post('/api/auth/admin/integrations/admin-password/setup', { password: newPassword, confirmation });
      setAdminConfigPasswordForm({ currentPassword: '', newPassword: '', confirmation: '' });
      setAdminConfigPasswordConfigured(true);
      setAdminConfigPasswordMessage('Mot de passe de configuration créé et enregistré.');
    } catch (requestError) {
      setAdminConfigPasswordMessage(requestError.response?.data?.error || 'Initialisation du mot de passe de configuration impossible.');
    } finally {
      setAdminConfigPasswordLoading(false);
    }
  };

  const totalHistoryPages = Math.max(1, Math.ceil(loginHistory.length / 8));
  const visibleHistory = loginHistory.slice(historyPage * 8, historyPage * 8 + 8);
  const canGoPrevious = historyPage > 0;
  const canGoNext = historyPage < totalHistoryPages - 1;
  const historyRangeStart = loginHistory.length ? historyPage * 8 + 1 : 0;
  const historyRangeEnd = Math.min(historyPage * 8 + visibleHistory.length, loginHistory.length);
  const selectedPaymentDraft = getPaymentDraft(paymentDrafts, selectedPaymentMethod);
  const paymentCountries = getMobileMoneyCountries(selectedPaymentMethod);

  return (
    <DashboardLayout sidebarItems={sidebarItems} user={user}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div role="tablist" aria-label="Sections des paramètres" className="profile-settings-tabs flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {[['profil', 'Profil', UserRound], ...(isPaymentActor ? [['paiement', 'Paiement', CreditCard]] : []), ['newsletter', 'Newsletter', Mail], ['securite', 'Sécurité', LockKeyhole], ['historique', 'Historique', History]].map(([key, label, Icon]) => <button key={key} type="button" role="tab" aria-selected={activeTab === key} onClick={() => setActiveTab(key)} className={`profile-settings-tab inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-bold transition ${activeTab === key ? 'is-active' : ''}`}><Icon size={18} />{label}</button>)}
        </div>

        <div>
          <h1 className="text-3xl font-bold text-[#121C2D]">{activeTab === 'paiement' ? `${language === 'en' ? 'Payments' : 'Paiement'} · ${actorLabel}` : activeTab === 'newsletter' ? 'Préférences newsletter' : language === 'en' ? 'My Profile' : 'Mon Profil'}</h1>
          <p className="text-slate-500 mt-1">{activeTab === 'paiement' ? language === 'en' ? 'These details belong to your account and are not shared with other users.' : 'Ces coordonnées sont propres à votre compte et ne sont pas partagées avec les autres acteurs.' : activeTab === 'newsletter' ? 'Choisissez si vous souhaitez recevoir des actualités et offres de Translink-Africa par e-mail.' : 'Gérez vos informations personnelles et vos préférences.'}</p>

        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="p-4 bg-green-50 border border-green-200 text-green-600 rounded-lg text-sm flex items-center gap-2">
            <Check size={16} /> {success}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-8 border-b border-gray-100 flex items-center gap-6">
            {avatar ? <img src={resolveMediaUrl(avatar)} alt="Avatar sélectionné" className="h-24 w-24 rounded-full object-cover shadow-sm" /> : <div className="flex h-24 w-24 items-center justify-center rounded-full bg-orange-100 text-5xl" aria-label="Avatar métier">{roleAvatar[user?.role] || '👤'}</div>}
            <div>
              <h2 className="text-2xl font-bold text-[#121C2D]">{user?.nom}</h2>
              <p className="text-slate-500 font-medium">{actorLabel}</p>
              <div className="flex gap-4 mt-2 text-sm text-slate-500">
                <span className="flex items-center gap-1"><Phone size={14} /> +{user?.telephone_whatsapp}</span>
                <span className="flex items-center gap-1"><MapPin size={14} /> {user?.ville || 'Non renseigné'}</span>
              </div>
            </div>
          </div>

          {activeTab === 'profil' && <>
          <div className="px-8 pb-2"><h3 className="mb-3 text-lg font-bold text-[#121C2D]">Photo ou avatar</h3><div className="flex flex-wrap items-center gap-3"><button type="button" onClick={() => setAvatar('')} className={`flex h-14 w-14 items-center justify-center rounded-full border-2 ${!avatar ? 'border-[#FF6A3D]' : 'border-gray-200'} bg-orange-100 text-3xl`}>{roleAvatar[user?.role] || '👤'}</button>{avatars.map((source) => <button type="button" key={source} onClick={() => setAvatar(source)} className={`rounded-full border-2 p-0.5 ${avatar === source ? 'border-[#FF6A3D]' : 'border-transparent'}`}><img src={source} alt="Avatar disponible" className="h-12 w-12 rounded-full object-cover" /></button>)}<label className="flex h-14 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 text-sm font-semibold text-slate-600 hover:border-[#FF6A3D] hover:text-[#FF6A3D]"><span>{avatarLoading ? 'Envoi...' : 'Importer une photo'}</span><input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleAvatarUpload} disabled={avatarLoading} /></label></div><p className="mt-2 text-xs text-slate-400">L’emoji métier est utilisé par défaut selon votre rôle.</p></div>

          <div className="p-8">
            <h3 className="text-lg font-bold text-[#121C2D] mb-6">Informations du compte</h3>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-[#121C2D] mb-2">Nom complet / Raison sociale</label>
                  <input 
                    type="text"
                    name="nom"
                    value={formData.nom}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#FF6A3D] focus:ring-1 focus:ring-[#FF6A3D] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#121C2D] mb-2">Numéro WhatsApp</label>
                  <div className="flex"><CountrySelect value={countryCode} onChange={setCountryCode} /><input type="tel" name="telephone_whatsapp" value={formData.telephone_whatsapp} onChange={handleChange} className="w-full rounded-r-lg border border-gray-200 px-4 py-3 focus:border-[#FF6A3D] focus:ring-1 focus:ring-[#FF6A3D] outline-none transition-all" /></div>
                  <p className="text-xs text-gray-400 mt-1">Le numéro sera enregistré avec son indicatif international.</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#121C2D] mb-2">Email</label>
                  <input 
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#FF6A3D] focus:ring-1 focus:ring-[#FF6A3D] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#121C2D] mb-2">Ville</label>
                  <input 
                    type="text"
                    name="ville"
                    value={formData.ville}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#FF6A3D] focus:ring-1 focus:ring-[#FF6A3D] outline-none transition-all"
                  />
                </div>
              </div>

              {isFleetActor && <section className="space-y-5 border-t border-gray-100 pt-6">
                <div><h4 className="text-lg font-bold text-[#121C2D]">{descriptionLabel}</h4><p className="mt-1 text-sm text-slate-500">Présentez votre activité, votre flotte ou vos services de transport.</p></div>
                <label className="block"><span className="mb-2 block text-sm font-semibold text-[#121C2D]">{descriptionLabel}</span><textarea name="description" value={formData.description} onChange={handleChange} maxLength={2000} rows={4} placeholder="Présentez votre activité, vos véhicules et vos spécialités..." className="w-full resize-y rounded-lg border border-gray-200 px-4 py-3 outline-none transition focus:border-[#FF6A3D] focus:ring-1 focus:ring-[#FF6A3D]" /><span className="mt-1 block text-right text-xs text-slate-400">{formData.description.length}/2000</span></label>
              </section>}

              <div className="pt-4 border-t border-gray-100 flex justify-end">
                <button 
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 bg-[#FF6A3D] text-white font-bold rounded-lg hover:bg-[#e85b2d] transition disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? 'Enregistrement...' : 'Enregistrer les modifications'}
                </button>
              </div>
            </form>
          </div>
          </>}

          {activeTab === 'paiement' && isPaymentActor && <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.15fr)]">
            <div className="space-y-3">
              <PaymentAccountCard method={selectedPaymentMethod} holder={selectedPaymentDraft.holder} identifier={selectedPaymentDraft.identifier} bank={selectedPaymentDraft.bank} />
              <p className="text-xs leading-5 text-slate-500">Chaque moyen garde ses propres coordonnées. Choisissez si vous souhaitez l’utiliser pour recevoir ou envoyer des paiements.</p>
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
                <p className="font-bold text-[#121C2D]">Moyens enregistrés</p>
                {paymentAccounts.length ? <ul className="mt-2 space-y-2">{paymentAccounts.map((account) => <li key={account.method} className="flex flex-wrap items-center justify-between gap-2 text-slate-600"><span>{payoutMethods.find((method) => method.value === account.method)?.label}</span><span className="flex gap-2 text-xs">{account.is_default_receive && <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">Réception</span>}{account.is_default_send && <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">Envoi</span>}</span></li>)}</ul> : <p className="mt-2 text-slate-500">Aucun moyen enregistré.</p>}
              </div>
            </div>
            <form onSubmit={savePaymentAccount} className="space-y-5">
              <div>
                <h3 className="font-bold text-[#121C2D]">Coordonnées du moyen de paiement</h3>
                <p className="mt-1 text-sm text-slate-500">Les informations restent enregistrées même lorsque vous passez à un autre moyen.</p>
              </div>
              <fieldset className="space-y-2">
                <legend className="mb-1.5 text-sm font-semibold text-[#121C2D]">Moyen à configurer</legend>
                <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Moyens de paiement">
                  {payoutMethods.map((method) => <button key={method.value} type="button" role="tab" aria-selected={selectedPaymentMethod === method.value} onClick={() => {
                    setSelectedPaymentMethod(method.value);
                    const saved = paymentAccounts.find((account) => account.method === method.value);
                    const draft = paymentDrafts[method.value] || createPaymentAccountDraft(saved);
                    const availableCountries = getMobileMoneyCountries(method.value);
                    setPaymentCountryCode([...availableCountries].sort((first, second) => second.code.length - first.code.length).find((country) => draft.identifier.replace(/\s/g, '').startsWith(country.code))?.code || '+221');
                  }} className={`flex min-h-[66px] items-center gap-2 rounded-xl border p-2 text-left transition sm:gap-3 sm:p-3 ${selectedPaymentMethod === method.value ? 'border-[#ed7848] bg-orange-50 ring-1 ring-[#ed7848]/30' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}>
                    <PaymentProviderLogo method={method.value} />
                    <span className="min-w-0"><span className="block truncate text-xs font-bold text-[#172534] sm:text-sm">{method.label}</span><span className="mt-0.5 block truncate text-[10px] text-slate-500 sm:text-xs">{method.detail}</span></span>
                  </button>)}
                </div>
              </fieldset>
              <label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#121C2D]">Nom du titulaire</span><input value={selectedPaymentDraft.holder} onChange={(event) => updatePaymentDraft('holder', event.target.value)} required className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-[#FF6A3D]" /></label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-[#121C2D]">{selectedPaymentMethod === 'PAYPAL' ? 'Adresse e-mail PayPal' : selectedPaymentMethod === 'BANQUE' ? 'IBAN ou numéro de compte' : 'Téléphone du compte'}</span>
                {['WAVE', 'ORANGE_MONEY'].includes(selectedPaymentMethod) ? (
                  <div className="flex">
                    <CountrySelect value={paymentCountryCode} onChange={handlePaymentCountryChange} countries={paymentCountries} className="w-30 sm:w-36" ariaLabel={`Pays disponibles pour ${selectedPaymentMethod === 'WAVE' ? 'Wave' : 'Orange Money'}`} />
                    <input type="tel" inputMode="numeric" autoComplete="tel-national" value={getNationalPaymentNumber(selectedPaymentDraft.identifier, paymentCountryCode)} onChange={handlePaymentPhoneChange} placeholder="Numéro de téléphone" required className="w-full min-w-0 rounded-r-lg border border-gray-200 px-4 py-3 outline-none focus:border-[#FF6A3D]" />
                  </div>
                ) : (
                  <input type={selectedPaymentMethod === 'PAYPAL' ? 'email' : 'text'} value={selectedPaymentDraft.identifier} onChange={(event) => updatePaymentDraft('identifier', event.target.value)} placeholder={selectedPaymentMethod === 'PAYPAL' ? 'nom@exemple.com' : 'IBAN ou numéro de compte'} required className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-[#FF6A3D]" />
                )}
              </label>
              {selectedPaymentMethod === 'BANQUE' && <label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#121C2D]">Nom de la banque</span><input value={selectedPaymentDraft.bank} onChange={(event) => updatePaymentDraft('bank', event.target.value)} className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-[#FF6A3D]" /></label>}
              <fieldset className="space-y-3 rounded-lg border border-slate-200 p-4">
                <legend className="px-1 text-sm font-semibold text-[#121C2D]">Utiliser ce compte pour</legend>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={selectedPaymentDraft.can_receive} onChange={(event) => { updatePaymentDraft('can_receive', event.target.checked); updatePaymentDraft('is_default_receive', event.target.checked); }} className="h-4 w-4 accent-[#FF6A3D]" />Recevoir des paiements (moyen par défaut)</label>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={selectedPaymentDraft.can_send} onChange={(event) => { updatePaymentDraft('can_send', event.target.checked); updatePaymentDraft('is_default_send', event.target.checked); }} className="h-4 w-4 accent-[#FF6A3D]" />Envoyer des paiements (moyen par défaut)</label>
              </fieldset>
              {paymentError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{paymentError}</p>}
              {paymentSuccess && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{paymentSuccess}</p>}
              <div className="flex justify-end border-t border-gray-100 pt-5">
                <button type="submit" disabled={paymentLoading} className="rounded-lg bg-[#FF6A3D] px-6 py-2.5 font-bold text-white transition hover:bg-[#e85b2d] disabled:cursor-not-allowed disabled:opacity-70">{paymentLoading ? 'Enregistrement...' : 'Enregistrer ce moyen de paiement'}</button>
              </div>
            </form>
          </div>}

          {activeTab === 'historique' && <div className="p-6 sm:p-8"><div className="mb-5"><h3 className="text-lg font-bold text-[#121C2D]">Historique des connexions</h3><p className="mt-1 text-sm text-slate-500">Les connexions enregistrées sont affichées par page de 8 lignes.</p></div>{loginHistory.length ? <div className="space-y-4"><div className="flex items-center justify-between text-xs font-medium text-slate-500"><span>Page {historyPage + 1} sur {totalHistoryPages}</span><span>{historyRangeStart}-{historyRangeEnd} sur {loginHistory.length}</span></div><div className="overflow-hidden rounded-lg border border-slate-200 bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-slate-700"><tr><th className="px-4 py-3 font-semibold">Date</th><th className="px-4 py-3 font-semibold">Adresse IP</th><th className="px-4 py-3 font-semibold">Navigateur</th><th className="px-4 py-3 font-semibold">Appareil</th></tr></thead><tbody>{visibleHistory.map((entry) => <tr key={entry.id} className="border-t border-slate-100"><td className="px-4 py-3 text-slate-700">{new Date(entry.date_connexion).toLocaleString(locale)}</td><td className="px-4 py-3 text-slate-500">{entry.adresse_ip || 'Adresse inconnue'}</td><td className="px-4 py-3 text-slate-500">{entry.navigateur || 'Inconnu'}</td><td className="px-4 py-3 text-slate-500">{entry.appareil || 'Inconnu'}</td></tr>)}</tbody></table></div>{totalHistoryPages > 1 && <div className="flex justify-end gap-2"><button type="button" onClick={() => setHistoryPage((current) => Math.max(current - 1, 0))} disabled={!canGoPrevious} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition disabled:cursor-not-allowed disabled:text-slate-400">Précédent</button><button type="button" onClick={() => setHistoryPage((current) => Math.min(current + 1, totalHistoryPages - 1))} disabled={!canGoNext} className="rounded-lg bg-[#121C2D] px-4 py-2 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:bg-slate-300">Suivant</button></div>}</div> : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Aucune connexion enregistrée.</p>}</div>}

          {activeTab === 'newsletter' && <form onSubmit={saveNewsletterConsent} className="space-y-5 p-6 sm:p-8">
            <div>
              <h3 className="text-lg font-bold text-[#121C2D]">Communications par e-mail</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">Recevez les annonces, actualités, promotions et messages liés à Translink-Africa. Chaque campagne contient un lien de désabonnement; vous pouvez aussi modifier ce choix ici.</p>
            </div>
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 text-sm text-slate-700">
              <input type="checkbox" checked={newsletterConsent} onChange={(event) => setNewsletterPreference({ userId: user.id, consent: event.target.checked })} className="mt-0.5 h-4 w-4 accent-[#FF6A3D]" />
              <span>Recevoir les communications par e-mail à l’adresse <strong>{user?.email || 'associée à mon compte'}</strong>.</span>
            </label>
            {newsletterMessage && <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">{newsletterMessage}</p>}
            <button type="submit" disabled={newsletterLoading} className="rounded-lg bg-[#FF6A3D] px-5 py-3 font-bold text-white transition hover:bg-[#e85b2d] disabled:cursor-not-allowed disabled:opacity-60">{newsletterLoading ? 'Enregistrement...' : 'Enregistrer ma préférence'}</button>
          </form>}

          {activeTab === 'securite' && <div className="space-y-8 p-6 sm:p-8">
            <section className="max-w-xl">
              <div className="mb-5"><h3 className="text-lg font-bold text-[#121C2D]">Changer mon mot de passe</h3><p className="mt-1 text-sm text-slate-500">Choisissez un mot de passe d’au moins 6 caractères.</p></div>{passwordMessage && <p className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">{passwordMessage}</p>}<form onSubmit={handlePasswordChange} className="space-y-4"><label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#121C2D]">Mot de passe actuel</span><input type="password" autoComplete="current-password" value={passwordForm.ancien_mot_de_passe} onChange={(event) => setPasswordForm({ ...passwordForm, ancien_mot_de_passe: event.target.value })} required className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-[#FF6A3D]" /></label><label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#121C2D]">Nouveau mot de passe</span><input type="password" autoComplete="new-password" value={passwordForm.nouveau_mot_de_passe} onChange={(event) => setPasswordForm({ ...passwordForm, nouveau_mot_de_passe: event.target.value })} required minLength="6" className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-[#FF6A3D]" /></label><button className="rounded-lg bg-[#FF6A3D] px-5 py-3 font-bold text-white hover:bg-[#e85b2d]">Modifier le mot de passe</button></form>
            </section>
            {user?.role === 'ADMIN' && <section className="max-w-xl border-t border-gray-100 pt-7">
              <div className="mb-5"><h3 className="text-lg font-bold text-[#121C2D]">Mot de passe de configuration</h3><p className="mt-1 text-sm text-slate-500">{adminConfigPasswordConfigured ? 'Réinitialisez le mot de passe dédié aux services externes après vérification de l’ancien. Le nouveau doit différer du mot de passe de connexion admin.' : 'À la première utilisation, créez un mot de passe dédié en le saisissant deux fois. Il doit différer du mot de passe de connexion admin.'}</p></div>
              {adminConfigPasswordStatusError && <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{adminConfigPasswordStatusError}</p>}
              {adminConfigPasswordMessage && <p role="status" className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">{adminConfigPasswordMessage}</p>}
              {adminConfigPasswordConfigured === null ? !adminConfigPasswordStatusError && <p className="text-sm text-slate-500">Vérification du mot de passe de configuration…</p> : adminConfigPasswordConfigured ? !adminConfigPasswordResetOpen ? <button type="button" onClick={() => { setAdminConfigPasswordMessage(''); setAdminConfigPasswordResetOpen(true); }} className="rounded-lg border border-[#FF6A3D] px-5 py-3 font-bold text-[#d94f27] hover:bg-orange-50">Réinitialiser le mot de passe de configuration</button> : <form onSubmit={handleAdminConfigPasswordChange} className="space-y-4">
                <label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#121C2D]">Ancien mot de passe de configuration</span><input type="password" autoComplete="current-password" value={adminConfigPasswordForm.currentPassword} onChange={(event) => setAdminConfigPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} required className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-[#FF6A3D]" /></label>
                <label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#121C2D]">Nouveau mot de passe de configuration</span><input type="password" autoComplete="new-password" value={adminConfigPasswordForm.newPassword} onChange={(event) => setAdminConfigPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} required minLength="12" className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-[#FF6A3D]" /></label>
                <label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#121C2D]">Confirmer le nouveau mot de passe</span><input type="password" autoComplete="new-password" value={adminConfigPasswordForm.confirmation} onChange={(event) => setAdminConfigPasswordForm((current) => ({ ...current, confirmation: event.target.value }))} required minLength="12" className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-[#FF6A3D]" /></label>
                <div className="flex flex-wrap gap-2"><button type="submit" disabled={adminConfigPasswordLoading} className="rounded-lg bg-[#FF6A3D] px-5 py-3 font-bold text-white hover:bg-[#e85b2d] disabled:cursor-not-allowed disabled:opacity-60">{adminConfigPasswordLoading ? 'Réinitialisation…' : 'Confirmer la réinitialisation'}</button><button type="button" disabled={adminConfigPasswordLoading} onClick={() => { setAdminConfigPasswordResetOpen(false); setAdminConfigPasswordForm({ currentPassword: '', newPassword: '', confirmation: '' }); }} className="rounded-lg border border-gray-200 px-5 py-3 font-bold text-slate-600 hover:bg-slate-50">Annuler</button></div>
              </form> : <form onSubmit={handleAdminConfigPasswordSetup} className="space-y-4">
                <label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#121C2D]">Nouveau mot de passe de configuration</span><input type="password" autoComplete="new-password" value={adminConfigPasswordForm.newPassword} onChange={(event) => setAdminConfigPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} required minLength="12" className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-[#FF6A3D]" /></label>
                <label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#121C2D]">Confirmer le mot de passe</span><input type="password" autoComplete="new-password" value={adminConfigPasswordForm.confirmation} onChange={(event) => setAdminConfigPasswordForm((current) => ({ ...current, confirmation: event.target.value }))} required minLength="12" className="w-full rounded-lg border border-gray-200 px-4 py-3 outline-none focus:border-[#FF6A3D]" /></label>
                <button type="submit" disabled={adminConfigPasswordLoading} className="rounded-lg bg-[#FF6A3D] px-5 py-3 font-bold text-white hover:bg-[#e85b2d] disabled:cursor-not-allowed disabled:opacity-60">{adminConfigPasswordLoading ? 'Création…' : 'Créer le mot de passe de configuration'}</button>
              </form>}
            </section>}
          </div>}
        </div>
      </div>
    </DashboardLayout>
  );
}
