import React, { useEffect, useMemo, useState } from 'react';
import { Check, FileText, LockKeyhole, ShieldCheck, Upload } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import { useAutoDismissMessage } from '../utils/useAutoDismissMessage';

const documentsByRole = {
  CHARGEUR: [{ type: 'CARTE_IDENTITE_RECTO', label: 'Carte d’identité - recto' }, { type: 'CARTE_IDENTITE_VERSO', label: 'Carte d’identité - verso' }],
  ENTREPRISE: [{ type: 'CARTE_IDENTITE_RECTO', label: 'Carte d’identité du représentant - recto' }, { type: 'CARTE_IDENTITE_VERSO', label: 'Carte d’identité du représentant - verso' }, { type: 'NINEA', label: 'NINEA ou identifiant fiscal' }, { type: 'REGISTRE_COMMERCE', label: 'Registre de commerce' }],
  TRANSPORTEUR: [{ type: 'CARTE_IDENTITE_RECTO', label: 'Carte d’identité du responsable - recto' }, { type: 'CARTE_IDENTITE_VERSO', label: 'Carte d’identité du responsable - verso' }, { type: 'NINEA', label: 'NINEA ou identifiant fiscal' }, { type: 'REGISTRE_COMMERCE', label: 'Registre de commerce' }, { type: 'LICENCE_TRANSPORT', label: 'Licence de transport' }],
  CHAUFFEUR: [{ type: 'CARTE_IDENTITE_RECTO', label: 'Carte d’identité - recto' }, { type: 'CARTE_IDENTITE_VERSO', label: 'Carte d’identité - verso' }, { type: 'PERMIS', label: 'Permis de conduire' }],
  ADMIN: []
};

export default function InvitationPage() {
  const [searchParams] = useSearchParams();
  const invitationToken = searchParams.get('token');
  const navigate = useNavigate();
  const [invitedUser, setInvitedUser] = useState(null);
  const [registrationToken, setRegistrationToken] = useState('');
  const [password, setPassword] = useState('');
  const [numeroCniNin, setNumeroCniNin] = useState('');
  const [files, setFiles] = useState({});
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirmationEmailSent, setConfirmationEmailSent] = useState(false);
  const [error, setError] = useAutoDismissMessage('');
  const requiredDocuments = useMemo(() => documentsByRole[invitedUser?.role] || [], [invitedUser]);

  useEffect(() => {
    if (!invitationToken) {
      setError('Lien d’invitation incomplet.');
      setLoading(false);
      return;
    }
    api.get(`/api/auth/invitation/${invitationToken}`)
      .then((response) => setInvitedUser(response.data.user))
      .catch((requestError) => setError(requestError.response?.data?.error || 'Cette invitation est invalide ou expirée.'))
      .finally(() => setLoading(false));
  }, [invitationToken]);

  const completeAccount = async (event) => {
    event.preventDefault();
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    const normalizedCniNin = numeroCniNin.trim().replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z0-9/-]{5,50}$/.test(normalizedCniNin)) {
      setError('Veuillez fournir un numéro CNI/NIN valide.');
      return;
    }
    setStep(2);
  };

  const submitDocuments = async (event) => {
    event.preventDefault();
    if (registrationToken) {
      setSubmitting(true);
      try {
        const response = await api.post('/api/documents/submitted', null, {
          headers: { Authorization: `Bearer ${registrationToken}` }
        });
        setConfirmationEmailSent(response.data.email_envoye === true);
        setSubmitted(true);
      } catch (requestError) {
        setError(requestError.response?.data?.error || 'La confirmation de votre dossier n’a pas pu être envoyée.');
      } finally {
        setSubmitting(false);
      }
      return;
    }
    const missingDocument = requiredDocuments.find((document) => !files[document.type]);
    if (missingDocument) {
      setError(`Veuillez fournir : ${missingDocument.label}.`);
      return;
    }
    setSubmitting(true);
    try {
      const body = new FormData();
      body.append('mot_de_passe', password);
      body.append('numero_cni_nin', numeroCniNin.trim().replace(/\s+/g, '').toUpperCase());
      requiredDocuments.forEach((document) => body.append(document.type, files[document.type]));
      const completion = await api.post(`/api/auth/invitation/${invitationToken}/complete`, body);
      const token = completion.data.registrationToken;
      setRegistrationToken(token);
      const submission = await api.post('/api/documents/submitted', null, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setConfirmationEmailSent(submission.data.email_envoye === true);
      setSubmitted(true);
      return;
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Le téléversement des documents a échoué.');
      return;
    } finally {
      setSubmitting(false);
    }

    if (!registrationToken) {
      setError('Votre session de dépôt a expiré. Recommencez la finalisation de l’invitation.');
      return;
    }
    const missing = requiredDocuments.find((document) => !files[document.type]);
    if (missing) {
      setError(`Veuillez fournir : ${missing.label}.`);
      return;
    }
    setSubmitting(true);
    try {
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
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Le téléversement des documents a échoué.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PageShell><p className="text-center text-slate-500">Vérification de votre invitation...</p></PageShell>;
  if (!invitedUser) return <PageShell><ErrorState message={error || 'Cette invitation est indisponible.'} /></PageShell>;
  if (submitted) return <PageShell><div className="py-10 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check size={32} /></div><h1 className="mt-6 text-3xl font-bold text-[#123b4a]">Dossier envoyé avec succès</h1><p className="mx-auto mt-3 max-w-md text-slate-500">Votre accès restera en attente jusqu’à la vérification de vos documents par l’administration.</p><p className={`mx-auto mt-5 max-w-md rounded-lg p-4 text-sm ${confirmationEmailSent ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{confirmationEmailSent ? 'Un e-mail de confirmation a été envoyé. S’il n’apparaît pas dans votre boîte de réception, vérifiez également votre dossier spam. Vous recevrez un autre e-mail après la décision de l’administration.' : 'Les documents sont bien transmis, mais l’e-mail de confirmation n’a pas pu être envoyé.'}</p><button type="button" onClick={() => navigate('/login')} className="mt-8 rounded-lg bg-[#123b4a] px-5 py-3 font-bold text-white hover:bg-[#0f2f3b]">Retour à la connexion</button></div></PageShell>;

  return <PageShell>
    <div className="mb-8 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#123b4a] text-white"><ShieldCheck size={23} /></div><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0f766e]">Accès sécurisé</p><h1 className="text-xl font-bold text-[#123b4a]">Translink-Africa</h1></div></div>
    <div className="mb-8 flex items-center gap-3 text-xs font-bold uppercase tracking-wide"><span className={step === 1 ? 'text-[#0f766e]' : 'text-emerald-600'}>1. Sécuriser le compte</span><span className="text-slate-300">/</span><span className={step === 2 ? 'text-[#0f766e]' : 'text-slate-400'}>2. Déposer les documents</span></div>
    {error && <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
    {step === 1 && <label className="mb-6 block"><span className="mb-2 block text-sm font-bold text-[#123b4a]">Numéro CNI ou NIN</span><input type="text" value={numeroCniNin} onChange={(event) => setNumeroCniNin(event.target.value)} required minLength={5} maxLength={50} autoComplete="off" placeholder="Numéro inscrit sur votre pièce d’identité" className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-[#0f766e] focus:ring-2 focus:ring-teal-100" /></label>}
    {step === 1 ? (
      <form onSubmit={completeAccount} className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-[#123b4a]">Finalisez votre accès</h2>
          <p className="mt-2 text-slate-500">Votre compte a été préparé par l’administration. Vérifiez vos informations et choisissez votre mot de passe.</p>
        </div>
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-5 sm:grid-cols-2">
          <ReadOnly label="Nom" value={invitedUser.nom} />
          <ReadOnly label="E-mail" value={invitedUser.email} />
          <ReadOnly label="Téléphone" value={invitedUser.telephone_whatsapp} />
          <ReadOnly label="Ville" value={invitedUser.ville} />
          <ReadOnly label="Rôle" value={invitedUser.role} />
        </div>
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-[#123b4a]">Choisissez votre mot de passe</span>
          <span className="relative block">
            <LockKeyhole size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required placeholder="6 caractères minimum" className="w-full rounded-lg border border-slate-300 py-3 pl-10 pr-4 outline-none focus:border-[#0f766e] focus:ring-2 focus:ring-teal-100" />
          </span>
        </label>
        <button type="submit" disabled={submitting} className="w-full rounded-lg bg-[#123b4a] py-3.5 font-bold text-white hover:bg-[#0f2f3b] disabled:opacity-60">{submitting ? 'Activation...' : 'Continuer vers mes documents'}</button>
      </form>
    ) : (
      <form onSubmit={submitDocuments} className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-[#123b4a]">Complétez votre dossier</h2>
          <p className="mt-2 text-slate-500">Ajoutez les justificatifs demandés pour permettre la vérification de votre compte.</p>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-teal-100 bg-teal-50 p-4 text-sm text-teal-900">
          <Check size={19} className="mt-0.5 shrink-0" />
          <span>Les documents seront transmis à l’administration après votre envoi.</span>
        </div>
        {requiredDocuments.map((document) => (
          <label key={document.type} className="block cursor-pointer rounded-xl border border-slate-200 p-4 transition hover:border-[#0f766e]">
            <span className="flex items-center gap-3 font-bold text-[#123b4a]"><FileText size={19} className="text-[#0f766e]" />{document.label}</span>
            <span className="mt-3 flex items-center gap-2 text-sm text-slate-500">
              <Upload size={16} />{files[document.type]?.name || 'Choisir un fichier PDF, JPG ou PNG'}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only" onChange={(event) => setFiles({ ...files, [document.type]: event.target.files?.[0] })} />
            </span>
          </label>
        ))}
        <button type="submit" disabled={submitting} className="w-full rounded-lg bg-[#0f766e] py-3.5 font-bold text-white hover:bg-[#0b625c] disabled:opacity-60">{submitting ? 'Envoi en cours...' : 'Envoyer mon dossier'}</button>
      </form>
    )}
  </PageShell>;
}

function PageShell({ children }) { return <main className="min-h-screen bg-[#f3f6f8] px-5 py-10 text-slate-800"><div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">{children}</div></main>; }
function ReadOnly({ label, value }) { return <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 font-semibold text-[#123b4a]">{value || 'Non renseigné'}</p></div>; }
function ErrorState({ message }) { return <div className="text-center"><h1 className="text-2xl font-bold text-[#123b4a]">Invitation indisponible</h1><p className="mt-3 text-slate-500">{message}</p></div>; }
