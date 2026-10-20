import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Truck, Check, PackageOpen, Building2, UserCircle, FileText, Upload, ArrowLeft, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import api from '../utils/api';
import CountrySelect from '../components/CountrySelect';

const roleOptions = [
  { value: 'CHARGEUR', label: 'Chargeur particulier / expéditeur', icon: PackageOpen },
  { value: 'TRANSPORTEUR', label: 'Transporteur', icon: Truck },
  { value: 'ENTREPRISE', label: 'Entreprise / chargeur professionnel', icon: Building2 },
  { value: 'CHAUFFEUR', label: 'Chauffeur indépendant', icon: UserCircle },
];

const documentsByRole = {
  CHARGEUR: [
    { type: 'CARTE_IDENTITE_RECTO', label: 'Carte d’identité - recto' },
    { type: 'CARTE_IDENTITE_VERSO', label: 'Carte d’identité - verso' },
  ],
  ENTREPRISE: [
    { type: 'CARTE_IDENTITE_RECTO', label: 'Carte d’identité du représentant - recto' },
    { type: 'CARTE_IDENTITE_VERSO', label: 'Carte d’identité du représentant - verso' },
    { type: 'NINEA', label: 'NINEA ou identifiant fiscal' },
    { type: 'REGISTRE_COMMERCE', label: 'Registre de commerce' },
  ],
  TRANSPORTEUR: [
    { type: 'CARTE_IDENTITE_RECTO', label: 'Carte d’identité du responsable - recto' },
    { type: 'CARTE_IDENTITE_VERSO', label: 'Carte d’identité du responsable - verso' },
    { type: 'NINEA', label: 'NINEA ou identifiant fiscal' },
    { type: 'REGISTRE_COMMERCE', label: 'Registre de commerce' },
    { type: 'LICENCE_TRANSPORT', label: 'Licence de transport' },
  ],
  CHAUFFEUR: [
    { type: 'CARTE_IDENTITE_RECTO', label: 'Carte d’identité - recto' },
    { type: 'CARTE_IDENTITE_VERSO', label: 'Carte d’identité - verso' },
    { type: 'PERMIS', label: 'Permis de conduire' },
  ],
};

const initialForm = { nom: '', email: '', telephone_whatsapp: '', ville: '', mot_de_passe: '', numero_cni_nin: '' };

export default function RegisterPage() {
  const [role, setRole] = useState(() => {
    const requestedRole = new URLSearchParams(window.location.search).get('role');
    return roleOptions.some((option) => option.value === requestedRole) ? requestedRole : 'CHARGEUR';
  });
  const [countryCode, setCountryCode] = useState('+221');
  const [step, setStep] = useState(1);
  const [accountCreated, setAccountCreated] = useState(false);
  const [registrationToken, setRegistrationToken] = useState('');
  const [confirmationEmailSent, setConfirmationEmailSent] = useState(false);
  const [invitationToken, setInvitationToken] = useState('');
  const [invitationLoading, setInvitationLoading] = useState(false);
  const [formData, setFormData] = useState(initialForm);
  const [files, setFiles] = useState({});
  const [legalDocument, setLegalDocument] = useState(() => {
    const legal = new URLSearchParams(window.location.search).get('legal');
    return legal === 'cgu' || legal === 'confidentialite' ? legal : null;
  });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const requiredDocuments = useMemo(() => documentsByRole[role], [role]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invitation');
    if (!token) return;
    navigate(`/invitation?token=${encodeURIComponent(token)}`, { replace: true });
  }, [navigate]);

  const handleChange = (event) => setFormData({ ...formData, [event.target.name]: event.target.value });
  const handleRoleChange = (newRole) => { setRole(newRole); setFiles({}); setError(''); };

  const handleCreateAccount = async (event) => {
    event.preventDefault();
    setError('');
    if (accountCreated) {
      setStep(2);
      return;
    }
    setStep(2);
  };

  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  const handleDocuments = async (event) => {
    event.preventDefault();
    if (registrationToken) {
      setError('');
      setLoading(true);
      try {
        const response = await api.post('/api/documents/submitted', null, {
          headers: { Authorization: `Bearer ${registrationToken}` }
        });
        setConfirmationEmailSent(response.data.email_envoye === true);
        setRegistrationSuccess(true);
      } catch (err) {
        setError(err.response?.data?.error || 'La confirmation de votre dossier n’a pas pu être envoyée.');
      } finally {
        setLoading(false);
      }
      return;
    }
    const missing = requiredDocuments.find((document) => !files[document.type]);
    if (missing) { setError(`Veuillez fournir : ${missing.label}.`); return; }
    setError('');
    setLoading(true);
    try {
      const body = new FormData();
      body.append('nom', formData.nom);
      body.append('email', formData.email);
      body.append('telephone_whatsapp', `${countryCode}${formData.telephone_whatsapp.replace(/\D/g, '')}`);
      body.append('ville', formData.ville);
      body.append('mot_de_passe', formData.mot_de_passe);
      body.append('numero_cni_nin', formData.numero_cni_nin);
      body.append('role', role);
      requiredDocuments.forEach((document) => body.append(document.type, files[document.type]));
      const registrationResponse = await api.post('/api/auth/register', body);
      const token = registrationResponse.data.registrationToken;
      setRegistrationToken(token);
      setAccountCreated(true);
      const submissionResponse = await api.post('/api/documents/submitted', null, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setConfirmationEmailSent(submissionResponse.data.email_envoye === true);
      setRegistrationSuccess(true);
      if (registrationResponse.status === 0) {
        await Promise.all(requiredDocuments.map(async (document) => {
        const body = new FormData();
        body.append('document', files[document.type]);
        body.append('type_document', document.type);
        await api.post('/api/documents/upload', body, {
          headers: {
            Authorization: `Bearer ${registrationToken}`
          }
        });
      }));
      const response = await api.post('/api/documents/submitted', null, {
        headers: { Authorization: `Bearer ${registrationToken}` }
      });
      setConfirmationEmailSent(response.data.email_envoye === true);
      setRegistrationSuccess(true);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Le téléversement des documents a échoué.');
    } finally {
      setLoading(false);
    }
  };

  if (registrationSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Check size={32} />
          </div>
          <h2 className="mb-4 text-2xl font-bold text-[#121C2D]">Inscription réussie !</h2>
          <p className="mb-8 text-slate-500">
            Votre compte et vos documents ont été transmis. Votre accès restera en attente jusqu’à la vérification de votre dossier.
          </p>
          <p className={`mb-6 rounded-lg p-4 text-sm ${confirmationEmailSent ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
            {confirmationEmailSent
              ? 'Un e-mail de confirmation a été envoyé. S’il n’apparaît pas dans votre boîte de réception, vérifiez également votre dossier spam. Vous recevrez un autre e-mail après la décision de l’administration.'
              : 'Les documents sont bien transmis, mais l’e-mail de confirmation n’a pas pu être envoyé. L’administration pourra tout de même traiter votre dossier.'}
          </p>
          <Link to="/login" className="inline-block w-full rounded-lg bg-[#FF6A3D] py-3 font-bold text-white transition-colors hover:bg-[#e85b2d]">
            Retour à la connexion
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-white font-sans text-slate-800">
      <div className="hidden lg:flex flex-col w-5/12 bg-[#121C2D] text-white p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#FF6A3D] rounded-full blur-[100px] opacity-20 -mr-20 -mt-20" />
        <Link to="/" className="flex items-center gap-2 mb-16 relative z-10"><div className="bg-[#FF6A3D] p-1.5 rounded"><Truck size={24} /></div><span className="text-xl font-bold tracking-tight">TRANSLINK-AFRICA</span></Link>
        <div className="relative z-10 flex-1 flex flex-col justify-center">
          <h1 className="text-4xl font-bold mb-6 leading-tight">Rejoignez le réseau logistique d&apos;Afrique de l&apos;Ouest</h1>
          <p className="text-slate-400 text-lg mb-10">Créez votre espace professionnel et faites vérifier vos documents en toute sécurité.</p>
          <div className="space-y-6">{['Inscription adaptée à votre activité', 'Documents vérifiés par nos équipes', 'Accès sécurisé à votre espace'].map((item) => <div className="flex items-center gap-4" key={item}><div className="bg-white/10 p-1.5 rounded-full"><Check size={16} className="text-[#FF6A3D]" /></div><span className="font-semibold">{item}</span></div>)}</div>
        </div>
      </div>

      <main className="w-full lg:w-7/12 flex flex-col justify-center px-6 sm:px-12 md:px-20 py-10 relative min-h-screen overflow-y-auto">
        <div className="max-w-md w-full mx-auto">
          <div className="lg:hidden flex items-center gap-2 mb-8"><div className="bg-[#FF6A3D] p-1.5 rounded text-white"><Truck size={24} /></div><span className="text-xl font-bold text-[#121C2D]">TRANSLINK-AFRICA</span></div>
          <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-slate-400 mb-4"><span className={step === 1 ? 'text-[#FF6A3D]' : 'text-green-600'}>1. Compte</span><span>→</span><span className={step === 2 ? 'text-[#FF6A3D]' : ''}>2. Vérification</span></div>
          <h2 className="text-3xl font-bold text-[#121C2D] mb-2">{step === 1 ? (invitationToken ? `Bienvenue ${formData.nom}` : 'Créer un compte') : 'Complétez votre inscription'}</h2>
          <p className="text-slate-500 mb-8">{step === 1 ? (invitationToken ? `Cette invitation concerne le compte ${formData.email}. Définissez votre mot de passe pour continuer.` : 'Rejoignez la plateforme et optimisez votre logistique.') : `Ajoutez les documents nécessaires au profil de ${formData.nom}.`}</p>
          {invitationToken && <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">Vous êtes attendu comme <strong>{role}</strong>. Vos informations ont été préparées par l’administration.</div>}
          {invitationLoading && <div className="mb-6 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Vérification de votre invitation...</div>}
          {error && <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">{error}</div>}

          {step === 1 ? <form onSubmit={handleCreateAccount} className="space-y-6">
            {!invitationToken && <div className="space-y-3"><label className="block text-sm font-semibold text-[#121C2D]">Je suis un...</label><div className="grid grid-cols-2 gap-3">{roleOptions.map(({ value, label, icon: Icon }) => <button type="button" key={value} onClick={() => handleRoleChange(value)} className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${role === value ? 'border-[#FF6A3D] bg-orange-50' : 'border-gray-200 hover:border-gray-300'}`}><Icon size={24} className={role === value ? 'text-[#FF6A3D]' : 'text-slate-400'} /><span className={`text-xs font-bold mt-2 text-center ${role === value ? 'text-[#FF6A3D]' : 'text-slate-500'}`}>{label}</span></button>)}</div></div>}
            <div className="space-y-4"><Field label="Nom complet ou Raison Sociale" name="nom" value={formData.nom} onChange={handleChange} placeholder="Ex : Entreprise Diallo" readOnly={Boolean(invitationToken)} /><div className="grid grid-cols-2 gap-4"><Field label="Email" name="email" type="email" value={formData.email} onChange={handleChange} placeholder="contact@email.com" readOnly={Boolean(invitationToken)} /><PhoneField countryCode={countryCode} setCountryCode={setCountryCode} value={formData.telephone_whatsapp} onChange={handleChange} readOnly={Boolean(invitationToken)} /></div><div className="grid grid-cols-2 gap-4"><Field label="Ville de résidence" name="ville" value={formData.ville} onChange={handleChange} placeholder="Dakar" readOnly={Boolean(invitationToken)} />{!invitationToken && <Field label="Mot de passe" name="mot_de_passe" type="password" value={formData.mot_de_passe} onChange={handleChange} placeholder="6 caractères minimum" />}</div>
              {!invitationToken && <Field label="Numéro CNI ou NIN" name="numero_cni_nin" value={formData.numero_cni_nin} onChange={handleChange} placeholder="Numéro inscrit sur votre pièce d’identité" />}
            </div>
            {!invitationToken && <Terms accepted={termsAccepted} onAcceptedChange={setTermsAccepted} onOpen={setLegalDocument} />}
            <SubmitButton loading={loading} disabled={!invitationToken && !termsAccepted} label={invitationToken ? 'Accéder à mes documents' : accountCreated ? 'Continuer vers la vérification' : 'Créer mon compte'} />
          </form> : <form onSubmit={handleDocuments} className="space-y-5">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 text-blue-800 text-sm"><ShieldCheck size={22} /><span>Vos documents sont transmis de façon sécurisée et restent en attente de validation.</span></div>
            {requiredDocuments.map((document) => <label key={document.type} className="block p-4 border border-gray-200 rounded-xl hover:border-[#FF6A3D] transition cursor-pointer"><span className="flex items-center gap-3 font-semibold text-[#121C2D]"><FileText size={19} className="text-[#FF6A3D]" />{document.label}</span><span className="flex items-center gap-2 mt-3 text-sm text-slate-500"><Upload size={16} />{files[document.type]?.name || 'Choisir un fichier PDF, JPG ou PNG'}<input type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only" onChange={(event) => setFiles({ ...files, [document.type]: event.target.files?.[0] })} /></span></label>)}
            <SubmitButton loading={loading} label={registrationToken ? 'Réessayer la confirmation du dossier' : 'Créer le compte et envoyer les documents'} /><button type="button" onClick={() => { setError(''); setStep(1); }} className="w-full flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-[#FF6A3D]"><ArrowLeft size={16} /> Modifier mes informations</button>
          </form>}
          <p className="text-center mt-8 text-sm text-slate-600">Vous avez déjà un compte ? <Link to="/login" className="text-[#FF6A3D] font-bold hover:underline">Se connecter</Link></p>
        </div>
        {legalDocument && <LegalModal document={legalDocument} onClose={() => setLegalDocument(null)} />}
      </main>
    </div>
  );
}

function Field({ label, name, type = 'text', value, onChange, placeholder, readOnly = false }) {
  const [visible, setVisible] = React.useState(false);
  const isPassword = type === 'password';
  return <div><label className="block text-sm font-semibold text-[#121C2D] mb-1.5" htmlFor={name}>{label}</label><div className="relative"><input id={name} type={isPassword && !visible ? 'password' : 'text'} name={name} value={value} onChange={onChange} placeholder={placeholder} readOnly={readOnly} required className={`w-full px-4 py-3 ${isPassword ? 'pr-12' : ''} ${readOnly ? 'bg-slate-50' : ''} rounded-lg border border-gray-300 focus:border-[#FF6A3D] focus:ring-1 focus:ring-[#FF6A3D] outline-none transition-all placeholder:text-slate-400`} />{isPassword && <button type="button" onClick={() => setVisible(!visible)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#FF6A3D]" aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button>}</div></div>;
}

function PhoneField({ countryCode, setCountryCode, value, onChange, readOnly = false }) {
  return <div><label className="block text-sm font-semibold text-[#121C2D] mb-1.5" htmlFor="telephone_whatsapp">Téléphone WhatsApp</label><div className="flex">{!readOnly && <CountrySelect value={countryCode} onChange={setCountryCode} />}<input id="telephone_whatsapp" type="tel" name="telephone_whatsapp" value={value} onChange={onChange} placeholder="77 000 00 00" inputMode="tel" readOnly={readOnly} required className={`${readOnly ? 'w-full rounded-lg bg-slate-50' : 'w-[57%] rounded-r-lg'} border border-gray-300 px-3 py-3 outline-none transition-all placeholder:text-slate-400 focus:border-[#FF6A3D] focus:ring-1 focus:ring-[#FF6A3D]`} /></div></div>;
}

function Terms({ accepted, onAcceptedChange, onOpen }) {
  return <div className="flex items-start"><input id="terms" type="checkbox" checked={accepted} onChange={(event) => onAcceptedChange(event.target.checked)} className="mt-1 h-4 w-4 cursor-pointer" required /><label htmlFor="terms" className="ml-2 text-sm text-slate-600">J&apos;accepte les <button type="button" onClick={() => onOpen('cgu')} className="text-[#FF6A3D] hover:underline">Conditions Générales d&apos;Utilisation</button> et la <button type="button" onClick={() => onOpen('confidentialite')} className="text-[#FF6A3D] hover:underline">Politique de confidentialité</button>.</label></div>;
}

function SubmitButton({ loading, disabled = false, label }) {
  return <button type="submit" disabled={loading || disabled} className="w-full bg-[#FF6A3D] text-white font-bold py-3.5 rounded-lg hover:bg-[#e85b2d] transition shadow-[0_4px_14px_0_rgba(255,106,61,0.39)] disabled:cursor-not-allowed disabled:opacity-45">{loading ? 'Traitement...' : label}</button>;
}

function LegalModal({ document, onClose }) {
  const isTerms = document === 'cgu';
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#121C2D]/70 p-4" role="dialog" aria-modal="true" aria-labelledby="legal-title">
    <div className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 sm:p-8 shadow-2xl">
      <div className="flex items-start justify-between gap-6"><div><p className="text-xs font-bold uppercase tracking-widest text-[#FF6A3D]">Translink-Africa Logistics</p><h3 id="legal-title" className="mt-2 text-2xl font-bold text-[#121C2D]">{isTerms ? 'Conditions Générales d’Utilisation' : 'Politique de confidentialité'}</h3></div><button type="button" onClick={onClose} className="text-2xl text-slate-400 hover:text-[#121C2D]" aria-label="Fermer">×</button></div>
      {isTerms ? <div className="mt-6 space-y-4 text-sm leading-7 text-slate-600"><p><strong>1. Objet.</strong> Translink-Africa met en relation les chargeurs, entreprises, transporteurs et chauffeurs afin de faciliter la recherche, la réservation et le suivi de prestations de transport.</p><p><strong>2. Compte.</strong> L’utilisateur fournit des informations exactes, conserve ses identifiants confidentiels et signale toute utilisation non autorisée de son compte.</p><p><strong>3. Documents.</strong> Les justificatifs transmis servent à vérifier l’activité et peuvent être contrôlés par Translink-Africa. Toute pièce falsifiée peut entraîner le refus ou la suspension du compte.</p><p><strong>4. Transactions.</strong> Les parties restent responsables de l’exactitude des informations de transport, du respect des règles applicables et de la bonne exécution de leurs engagements.</p><p><strong>5. Contact.</strong> Pour toute question relative à ces conditions : contact@translink-logistics.sn.</p></div> : <div className="mt-6 space-y-4 text-sm leading-7 text-slate-600"><p><strong>Données collectées.</strong> Nous collectons les informations du compte, les coordonnées, les données de profil et les documents nécessaires à la vérification de l’activité.</p><p><strong>Utilisation.</strong> Ces données servent à créer votre compte, sécuriser les transactions, vérifier les acteurs et vous proposer des services logistiques adaptés.</p><p><strong>Conservation et sécurité.</strong> Les données sont conservées pendant la durée nécessaire au fonctionnement du service et protégées par des mesures d’accès et de stockage adaptées.</p><p><strong>Vos droits.</strong> Vous pouvez demander l’accès, la rectification ou la suppression de vos données en écrivant à contact@translink-logistics.sn.</p></div>}
      <button type="button" onClick={onClose} className="mt-8 w-full rounded-lg bg-[#121C2D] py-3 font-bold text-white hover:bg-slate-800">J’ai compris</button>
    </div>
  </div>;
}
