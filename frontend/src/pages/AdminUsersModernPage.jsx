import React, { useEffect, useRef, useState } from 'react';
import { Check, FileText, MessageCircle, Plus, Trash2, UserPlus, X, Truck, Users, Building2 } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import ConfirmDialog from '../components/ConfirmDialog';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/useLanguage';
import { useAutoDismissMessage } from '../utils/useAutoDismissMessage';
import { ADMIN_SIDEBAR_ITEMS } from '../utils/adminNavigation';
import { formatActorRole, formatVerificationStatus } from '../utils/adminLabels';
import { useDashboardDataRefresh } from '../context/SocketContext';

const initialForm = { nom: '', email: '', telephone_whatsapp: '', ville: '', role: 'CHARGEUR' };
const formatDateTime = (value, language) => value
  ? new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : language === 'en' ? 'Not recorded' : 'Non renseignée';

export default function AdminUsersModernPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('TOUS');
  const [actorFilter, setActorFilter] = useState('TOUS');
  const [message, setMessage] = useAutoDismissMessage('');
  const [invitation, setInvitation] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [deleteUserId, setDeleteUserId] = useState(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [pendingUserStatus, setPendingUserStatus] = useState(null);
  const [statusActionError, setStatusActionError] = useState('');
  const [updatingUserStatus, setUpdatingUserStatus] = useState(false);

  const load = async () => {
    try {
      const response = await api.get('/api/admin/users');
      setUsers(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Impossible de charger les utilisateurs.');
    }
  };

  useEffect(() => { load(); }, []);
  useDashboardDataRefresh(load);

  const updateStatus = (id, statut) => {
    const targetUser = users.find((item) => item.id === id);
    if (!targetUser) return;
    setStatusActionError('');
    setPendingUserStatus({ user: targetUser, statut });
  };

  const confirmUserStatus = async () => {
    if (!pendingUserStatus) return;
    const { user: targetUser, statut } = pendingUserStatus;
    setUpdatingUserStatus(true);
    try {
      const response = await api.put(`/api/admin/users/${targetUser.id}/status`, { statut });
      setUsers((current) => current.map((item) => item.id === targetUser.id ? { ...item, statut_verification: statut } : item));
      const decision = language === 'en'
        ? statut === 'VALIDE' ? 'Account approved.' : statut === 'REFUSE' ? 'Account rejected.' : statut === 'SUSPENDU' ? 'Account suspended.' : 'Status updated.'
        : statut === 'VALIDE' ? 'Compte approuvé.' : statut === 'REFUSE' ? 'Compte refusé.' : statut === 'SUSPENDU' ? 'Compte suspendu.' : 'Statut mis à jour.';
      setMessage(response.data.notification_envoyee === null
        ? decision
        : response.data.notification_envoyee
          ? language === 'en' ? `${decision} Email sent to the account owner.` : `${decision} E-mail envoyé au propriétaire.`
          : language === 'en' ? `${decision} Email could not be sent. Check the account email and SMTP settings.` : `${decision} mais l’e-mail n’a pas été envoyé. Vérifiez l’adresse du compte et la configuration SMTP.`);
      setPendingUserStatus(null);
    } catch (error) {
      setStatusActionError(error.response?.data?.error || 'Mise à jour impossible.');
    } finally {
      setUpdatingUserStatus(false);
    }
  };

  const create = async (event) => {
    event.preventDefault();
    try {
      const response = await api.post('/api/admin/users', form);
      setForm(initialForm);
      setOpen(false);
      if (response.data.invitationSent) {
        setInvitation(null);
        setMessage(language === 'en' ? 'Account created and invitation sent.' : 'Compte créé et invitation envoyée.');
      } else {
        setInvitation({ url: response.data.invitationUrl, password: response.data.temporaryPassword });
        setMessage(language === 'en' ? 'Account created, but no email could be sent. Use the information below.' : 'Compte créé, mais aucun e-mail n’a pu être envoyé. Utilisez les informations ci-dessous.');
      }
      await load();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Création impossible.');
    }
  };

  const remove = (id) => setDeleteUserId(id);

  const confirmRemove = async () => {
    if (deleteUserId == null) return;
    setDeletingUser(true);
    try {
      const response = await api.delete(`/api/admin/users/${deleteUserId}`);
      setUsers((current) => current.filter((item) => item.id !== deleteUserId));
      setDeleteUserId(null);
      const decision = language === 'en' ? 'Account deleted.' : 'Compte supprimé.';
      setMessage(response.data.notification_envoyee
        ? language === 'en' ? `${decision} Email sent to the account owner.` : `${decision} E-mail envoyé au propriétaire.`
        : language === 'en' ? `${decision} The notification email could not be sent; check the account email and SMTP settings.` : `${decision} mais l’e-mail de notification n’a pas pu être envoyé. Vérifiez l’adresse du compte et la configuration SMTP.`);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Suppression impossible.');
    } finally {
      setDeletingUser(false);
    }
  };

  const pendingCount = users.filter((item) => item.statut_verification === 'EN_ATTENTE').length;
  const validCount = users.filter((item) => item.statut_verification === 'VALIDE').length;
  const visibleUsers = users.filter((item) => (filter === 'TOUS' || item.statut_verification === filter) && (actorFilter === 'TOUS' || item.role === actorFilter));
  const actors = [
    { role: 'TRANSPORTEUR', label: language === 'en' ? 'Carriers' : 'Transporteurs', icon: Truck },
    { role: 'CHARGEUR', label: language === 'en' ? 'Shippers' : 'Chargeurs', icon: Users },
    { role: 'ENTREPRISE', label: language === 'en' ? 'Companies' : 'Entreprises', icon: Building2 },
    { role: 'CHAUFFEUR', label: language === 'en' ? 'Drivers' : 'Chauffeurs', icon: UserPlus },
  ];
  const usersByActor = (role) => visibleUsers.filter((item) => item.role === role);

  return <DashboardLayout sidebarItems={ADMIN_SIDEBAR_ITEMS} user={user}>
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0f766e]">Administration</p><h1 className="text-3xl font-bold text-[#121C2D]">Utilisateurs</h1><p className="mt-1 text-slate-500">Gérez les comptes et approuvez les accès.</p></div><button type="button" onClick={() => setOpen(!open)} className="flex items-center justify-center gap-2 rounded-lg bg-[#123b4a] px-4 py-3 font-bold text-white hover:bg-[#0f2f3b]"><Plus size={18} /> Nouveau compte</button></header>
      <section aria-labelledby="user-overview-title" className="space-y-3"><h2 id="user-overview-title" className="text-sm font-bold text-slate-600">Vue d’ensemble</h2><div className="grid gap-4 sm:grid-cols-3"><Summary label="Total des comptes" value={users.length} /><Summary label="À approuver" value={pendingCount} accent /><Summary label="Comptes validés" value={validCount} /></div></section>
      {message && <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">{message}</div>}
      {invitation && <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><p className="font-bold">Invitation à transmettre manuellement</p><p className="mt-1">Le SMTP n’est pas configuré. Copiez ces informations et envoyez-les au nouvel utilisateur.</p><div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]"><div><p className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-800">Lien d’invitation</p><p className="break-all rounded-lg bg-white px-3 py-2 font-mono text-xs">{invitation.url}</p></div><button type="button" onClick={() => navigator.clipboard.writeText(invitation.url)} className="self-end rounded-lg border border-amber-300 px-3 py-2 font-semibold hover:bg-amber-100">Copier le lien</button></div><div className="mt-3 flex flex-wrap items-center gap-3"><div><p className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-800">Mot de passe temporaire</p><p className="rounded-lg bg-white px-3 py-2 font-mono font-bold">{invitation.password}</p></div><button type="button" onClick={() => navigator.clipboard.writeText(invitation.password)} className="self-end rounded-lg border border-amber-300 px-3 py-2 font-semibold hover:bg-amber-100">Copier le mot de passe</button></div></div>}
      {open && <form onSubmit={create} className="grid gap-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm md:grid-cols-3"><Field name="nom" label="Nom complet" value={form.nom} onChange={(event) => setForm({ ...form, nom: event.target.value })} required /><Field name="email" label="E-mail" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /><Field name="telephone_whatsapp" label="Téléphone WhatsApp" value={form.telephone_whatsapp} onChange={(event) => setForm({ ...form, telephone_whatsapp: event.target.value })} required /><Field name="ville" label="Ville" value={form.ville} onChange={(event) => setForm({ ...form, ville: event.target.value })} required /><div><label className="mb-1 block text-sm font-semibold">Rôle</label><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-3"><option value="CHARGEUR">{formatActorRole('CHARGEUR', language)}</option><option value="TRANSPORTEUR">{formatActorRole('TRANSPORTEUR', language)}</option><option value="CHAUFFEUR">{formatActorRole('CHAUFFEUR', language)}</option><option value="ENTREPRISE">{formatActorRole('ENTREPRISE', language)}</option><option value="ADMIN">{formatActorRole('ADMIN', language)}</option></select></div><div className="rounded-lg bg-slate-100 p-4 text-sm text-slate-700"><strong>Invitation automatique</strong><p className="mt-1">Un lien sera envoyé au nouvel utilisateur.</p></div><div className="flex justify-end gap-3 md:col-span-3"><button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 font-semibold text-slate-600">Annuler</button><button type="submit" className="rounded-lg bg-[#123b4a] px-4 py-2 font-semibold text-white">Créer le compte</button></div></form>}
      <section aria-labelledby="user-roles-title" className="space-y-3"><h2 id="user-roles-title" className="text-sm font-bold text-slate-600">Répartition par type d’acteur</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{actors.map(({ role, label, icon: Icon }) => { const actorUsers = users.filter((item) => item.role === role); const approvedCount = actorUsers.filter((item) => item.statut_verification === 'VALIDE').length; return <button type="button" key={role} onClick={() => setActorFilter(actorFilter === role ? 'TOUS' : role)} className={`rounded-xl border border-slate-200 bg-white/80 p-5 text-left text-[#121C2D] shadow-sm backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:bg-white hover:shadow-md ${actorFilter === role ? 'ring-2 ring-[#FF6A3D] ring-offset-2 ring-offset-slate-50' : ''}`}><div className="flex items-start justify-between"><div><p className="text-sm font-bold">{label}</p><p className="mt-2 text-3xl font-black">{actorUsers.length}</p><p className="text-xs text-slate-500">{language === 'en' ? `${actorUsers.length} ${actorUsers.length === 1 ? 'account' : 'accounts'}` : `${actorUsers.length} compte${actorUsers.length > 1 ? 's' : ''}`}</p></div><Icon size={24} className="text-[#FF6A3D]" /></div><div className="mt-4 border-t border-slate-200 pt-3 text-xs font-semibold text-slate-600">{language === 'en' ? `${approvedCount} approved` : `${approvedCount} validé${approvedCount > 1 ? 's' : ''}`}</div></button>; })}</div></section>
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-gray-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-[#121C2D]">Liste des comptes</h2><p className="text-sm text-slate-500">Les comptes sont regroupés par acteur ci-dessus.</p></div><select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-slate-600"><option value="TOUS">{language === 'en' ? 'All' : 'Tous'}</option><option value="EN_ATTENTE">{formatVerificationStatus('EN_ATTENTE', language)}</option><option value="VALIDE">{formatVerificationStatus('VALIDE', language)}</option><option value="REFUSE">{formatVerificationStatus('REFUSE', language)}</option><option value="SUSPENDU">{formatVerificationStatus('SUSPENDU', language)}</option></select></div>{visibleUsers.length ? <div className="divide-y divide-gray-100">{visibleUsers.map((item) => <UserRow key={item.id} item={item} onSelect={setSelectedUser} onStatusChange={updateStatus} onRemove={remove} />)}</div> : <p className="p-12 text-center text-sm text-slate-500">Aucun compte dans cette catégorie.</p>}</section>
      {selectedUser && <UserDetails user={selectedUser} onClose={() => setSelectedUser(null)} />}
      <ConfirmDialog
        open={deleteUserId != null}
        title="Supprimer ce compte ?"
        message={language === 'en'
          ? `The account for ${users.find((item) => item.id === deleteUserId)?.nom || 'this user'} will be permanently deleted. This action cannot be undone.`
          : `Le compte de ${users.find((item) => item.id === deleteUserId)?.nom || 'cet utilisateur'} sera supprimé définitivement. Cette action est irréversible.`}
        confirmLabel="Supprimer le compte"
        busy={deletingUser}
        onCancel={() => setDeleteUserId(null)}
        onConfirm={confirmRemove}
      />
      <ConfirmDialog
        open={Boolean(pendingUserStatus)}
        title={language === 'en'
          ? pendingUserStatus?.statut === 'REFUSE' ? 'Reject this account?' : pendingUserStatus?.statut === 'SUSPENDU' ? 'Suspend this account?' : 'Approve this account?'
          : pendingUserStatus?.statut === 'REFUSE' ? 'Refuser ce compte ?' : pendingUserStatus?.statut === 'SUSPENDU' ? 'Suspendre ce compte ?' : 'Approuver ce compte ?'}
        message={pendingUserStatus ? `${pendingUserStatus.user.nom} · ${formatActorRole(pendingUserStatus.user.role, language)}` : ''}
        confirmLabel={language === 'en'
          ? pendingUserStatus?.statut === 'REFUSE' ? 'Reject account' : pendingUserStatus?.statut === 'SUSPENDU' ? 'Suspend account' : pendingUserStatus?.statut === 'EN_ATTENTE' ? 'Set back to pending' : 'Approve account'
          : pendingUserStatus?.statut === 'REFUSE' ? 'Refuser le compte' : pendingUserStatus?.statut === 'SUSPENDU' ? 'Suspendre le compte' : pendingUserStatus?.statut === 'EN_ATTENTE' ? 'Remettre en attente' : 'Approuver le compte'}
        tone={pendingUserStatus?.statut === 'REFUSE' || pendingUserStatus?.statut === 'SUSPENDU' ? 'danger' : 'neutral'}
        busy={updatingUserStatus}
        errorMessage={statusActionError}
        onCancel={() => { setPendingUserStatus(null); setStatusActionError(''); }}
        onConfirm={confirmUserStatus}
      />
    </div>
  </DashboardLayout>;
}

function UserRow({ item, onSelect, onStatusChange, onRemove }) {
  const { language } = useLanguage();
  const status = item.statut_verification || 'EN_ATTENTE';
  return <article className="flex flex-col gap-4 p-5 hover:bg-slate-50 lg:flex-row lg:items-center lg:justify-between"><button type="button" onClick={() => onSelect(item)} className="flex min-w-0 items-center gap-4 text-left"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#123b4a] font-bold text-white">{item.nom?.charAt(0)?.toUpperCase() || '?'}</div><div className="min-w-0"><p className="truncate font-bold text-[#121C2D]">{item.nom}</p><p className="truncate text-sm text-slate-500">{item.email || (language === 'en' ? 'Email not provided' : 'E-mail non renseigné')}</p><p className="text-xs text-slate-400">{item.telephone_whatsapp} · {item.ville}</p><p className="mt-1 text-xs text-slate-500">{language === 'en' ? 'Registered' : 'Inscrit le'} : {formatDateTime(item.date_creation, language)}</p></div></button><div className="flex flex-wrap items-center gap-2 lg:justify-end"><span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{formatActorRole(item.role, language)}</span><span className={`rounded-md px-2.5 py-1 text-xs font-bold ${status === 'VALIDE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{formatVerificationStatus(status, language)}</span><a href={`/admin/documents?userId=${item.id}`} className="flex items-center gap-1.5 rounded-lg border border-[#0f766e] px-3 py-2 text-xs font-bold text-[#0f766e] hover:bg-teal-50"><FileText size={14} /> Documents</a>{status === 'EN_ATTENTE' && <><Action label="Approuver" icon={Check} onClick={() => onStatusChange(item.id, 'VALIDE')} color="bg-emerald-600 hover:bg-emerald-700" /><Action label="Refuser" icon={X} onClick={() => onStatusChange(item.id, 'REFUSE')} color="bg-rose-600 hover:bg-rose-700" /></>}{status === 'VALIDE' && <Action label="Suspendre" icon={X} onClick={() => onStatusChange(item.id, 'SUSPENDU')} color="bg-slate-600 hover:bg-slate-700" />}{status === 'SUSPENDU' && <Action label={language === 'en' ? 'Unsuspend' : 'Lever suspension'} icon={Check} onClick={() => onStatusChange(item.id, 'VALIDE')} color="bg-emerald-600 hover:bg-emerald-700" />}{status === 'REFUSE' && <Action label="Approuver" icon={Check} onClick={() => onStatusChange(item.id, 'VALIDE')} color="bg-emerald-600 hover:bg-emerald-700" />}<button type="button" onClick={() => onRemove(item.id)} className="rounded-lg border border-gray-200 p-2 text-slate-400 hover:text-rose-600" aria-label={`${language === 'en' ? 'Delete' : 'Supprimer'} ${item.nom}`}><Trash2 size={16} /></button></div></article>;
}

function UserDetails({ user, onClose }) {
  const { language } = useLanguage();
  const dialogRef = useRef(null);
  const phone = String(user.telephone_whatsapp || '').replace(/\D/g, '');
  const whatsappMessage = language === 'en'
    ? `Hello ${user.nom}, I am contacting you about your Translink-Africa account.`
    : `Bonjour ${user.nom}, je vous contacte au sujet de votre compte Translink-Africa.`;
  const whatsappUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(whatsappMessage)}` : null;
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#123b4a]/60 p-3 sm:p-4" role="dialog" aria-modal="true" aria-label={`${language === 'en' ? 'Profile of' : 'Profil de'} ${user.nom}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div ref={dialogRef} className="max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-8"><div className="flex items-start justify-between"><div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#123b4a] text-xl font-bold text-white">{user.nom?.charAt(0)?.toUpperCase() || '?'}</div><div><h2 className="text-xl font-bold text-[#123b4a]">{user.nom}</h2><p className="text-sm text-slate-500">{formatActorRole(user.role, language)}</p></div></div><button type="button" onClick={onClose} className="rounded-lg px-3 py-1 text-xl text-slate-400 hover:bg-slate-100" aria-label="Fermer">×</button></div><div className="mt-6 grid gap-4 rounded-xl bg-slate-50 p-5 sm:grid-cols-2"><Info label="E-mail" value={user.email || (language === 'en' ? 'Not provided' : 'Non renseigné')} /><Info label="Téléphone" value={phone ? `+${phone}` : language === 'en' ? 'Not provided' : 'Non renseigné'} /><Info label="Ville" value={user.ville || (language === 'en' ? 'Not provided' : 'Non renseignée')} /><Info label="Statut" value={formatVerificationStatus(user.statut_verification || 'EN_ATTENTE', language)} /><Info label={language === 'en' ? 'Registration date' : 'Date d’inscription'} value={formatDateTime(user.date_creation, language)} /><Info label={language === 'en' ? 'Documents submitted' : 'Dossier envoyé'} value={formatDateTime(user.documents_submitted_at, language)} /><Info label={language === 'en' ? 'Last document upload' : 'Dernier dépôt de document'} value={formatDateTime(user.last_document_upload_at, language)} /><Info label={language === 'en' ? 'Last login' : 'Dernière connexion'} value={formatDateTime(user.last_login_at, language)} /><Info label={language === 'en' ? 'Last login IP' : 'Adresse IP de connexion'} value={user.last_login_ip || (language === 'en' ? 'Not recorded' : 'Non enregistrée')} /><Info label={language === 'en' ? 'Browser / device' : 'Navigateur / appareil'} value={[user.last_login_browser, user.last_login_device, user.last_login_machine].filter(Boolean).join(' · ') || (language === 'en' ? 'Not recorded' : 'Non renseigné')} /></div><div className="mt-6 flex flex-wrap gap-3"><a href={`/admin/documents?userId=${user.id}`} className="flex items-center gap-2 rounded-lg border border-[#0f766e] px-4 py-2.5 font-bold text-[#0f766e]"><FileText size={17} /> Documents</a>{whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg bg-[#128c7e] px-4 py-2.5 font-bold text-white hover:bg-[#0b6f64]"><MessageCircle size={17} /> Contacter sur WhatsApp</a>}</div></div></div>;
}

function Info({ label, value }) { return <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 break-all font-semibold text-[#123b4a]">{value}</p></div>; }

function Action({ label, icon: Icon, color, onClick }) { return <button type="button" onClick={onClick} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white ${color}`}><Icon size={14} />{label}</button>; }
function Summary({ label, value, accent }) { return <div className="rounded-xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-sm"><p className="text-sm text-slate-500">{label}</p><p className={`mt-2 text-2xl font-bold ${accent ? 'text-[#FF6A3D]' : 'text-[#121C2D]'}`}>{value}</p></div>; }
function Field({ name, label, type = 'text', value, onChange, required }) { return <div><label className="mb-1 block text-sm font-semibold text-[#121C2D]">{label}</label><input name={name} type={type} value={value} onChange={onChange} required={required} className="w-full rounded-lg border border-gray-200 px-3 py-3 outline-none focus:border-[#0f766e]" /></div>; }