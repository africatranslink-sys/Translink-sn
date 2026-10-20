import { useCallback, useEffect, useMemo, useState } from 'react';
import { Megaphone, RefreshCw, Search, Trash2, X } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useAutoDismissMessage } from '../utils/useAutoDismissMessage';
import { ADMIN_SIDEBAR_ITEMS } from '../utils/adminNavigation';
import { useDashboardDataRefresh } from '../context/SocketContext';

const formatDate = (value) => value ? new Date(value).toLocaleDateString('fr-FR') : 'Date inconnue';

export default function AdminAnnouncementsPage() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('TOUS');
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useAutoDismissMessage('');
  const [notice, setNotice] = useAutoDismissMessage('');

  const loadAnnouncements = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/annonces/admin/demandes');
      setAnnouncements(Array.isArray(response.data) ? response.data : []);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible de charger les annonces.');
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => { loadAnnouncements(); }, [loadAnnouncements]);
  useDashboardDataRefresh(() => loadAnnouncements());

  const visibleAnnouncements = useMemo(() => announcements.filter((item) => {
    const matchesSearch = JSON.stringify(item).toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (status === 'TOUS' || item.statut === status);
  }), [announcements, search, status]);

  const removeAnnouncement = async (event) => {
    event.preventDefault();
    if (!selected || reason.trim().length < 5) return;
    setDeleting(true);
    setError('');
    try {
      const response = await api.delete(`/api/annonces/admin/demandes/${selected.id}`, { data: { motif: reason.trim() } });
      setAnnouncements((current) => current.filter((item) => item.id !== selected.id));
      setNotice(response.data.emailEnvoye
        ? 'Annonce archivée; motif envoyé au chargeur dans son espace et par e-mail.'
        : 'Annonce archivée; motif envoyé dans l’espace du chargeur. E-mail non envoyé ou SMTP non configuré.');
      setSelected(null);
      setReason('');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'La suppression de cette annonce a échoué.');
    } finally {
      setDeleting(false);
    }
  };

  return <DashboardLayout sidebarItems={ADMIN_SIDEBAR_ITEMS} user={user}>
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-[#FF6A3D]">Administration</p><h1 className="mt-2 text-3xl font-bold text-[#121C2D]">Supervision des annonces</h1><p className="mt-1 text-slate-500">Consultez les annonces et archivez celles qui enfreignent les règles.</p></div><button type="button" onClick={() => loadAnnouncements(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-[#121C2D] hover:border-[#FF6A3D]"><RefreshCw size={16} /> Actualiser</button></header>
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row"><label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3"><Search size={17} className="text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un annonceur, trajet ou quartier" className="w-full py-3 text-sm outline-none" /></label><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrer par statut" className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm"><option value="TOUS">Tous les statuts</option><option value="PUBLIEE">Publiées</option><option value="CAMION_TROUVE">Camion trouvé</option><option value="CHARGEMENT">Chargement</option><option value="LIVRAISON">Livraison</option><option value="LIVREE">Livrées — solde à régler</option><option value="TERMINEE">Terminées — solde à régler</option><option value="SOLDE_REGLE">Terminées et soldées</option></select></div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {loading ? <p className="p-10 text-center text-sm text-slate-500">Chargement des annonces…</p> : visibleAnnouncements.length ? <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Annonce</th><th className="px-5 py-3">Annonceur</th><th className="px-5 py-3">Emplacement</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Statut</th><th className="px-5 py-3">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleAnnouncements.map((item) => <tr key={item.id}><td className="px-5 py-4"><p className="font-bold text-[#121C2D]">{item.ville_depart} → {item.ville_arrivee}</p><p className="mt-1 text-xs text-slate-500">{item.nature_marchandise} · {item.tonnage} t · {item.type_camion_requis}</p></td><td className="px-5 py-4">{item.chargeur_nom}<p className="text-xs text-slate-400">{item.chargeur_email || 'E-mail absent'}</p></td><td className="px-5 py-4">{item.quartier_chargement || 'Quartier non renseigné'}<p className="text-xs text-slate-400">{item.position_lat != null && item.position_lng != null ? `${Number(item.position_lat).toFixed(4)}, ${Number(item.position_lng).toFixed(4)}` : 'Sans coordonnées'}</p></td><td className="px-5 py-4">{formatDate(item.date_creation)}</td><td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{item.statut}</span></td><td className="px-5 py-4">{item.statut === 'PUBLIEE' ? <button type="button" onClick={() => { setSelected(item); setReason(''); setError(''); }} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50"><Trash2 size={14} /> Retirer</button> : <span className="text-xs text-slate-400">Liée à une course</span>}</td></tr>)}</tbody></table></div> : <div className="p-10 text-center"><Megaphone className="mx-auto text-slate-300" size={28} /><p className="mt-3 text-sm text-slate-500">Aucune annonce ne correspond à ces filtres.</p></div>}
        </div>
      </section>
    </div>
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#121C2D]/60 p-4" role="dialog" aria-modal="true" aria-labelledby="remove-announcement-title"><form onSubmit={removeAnnouncement} className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-2xl"><header className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-rose-700">Modération</p><h2 id="remove-announcement-title" className="mt-1 text-xl font-bold text-[#121C2D]">Retirer cette annonce ?</h2><p className="mt-1 text-sm text-slate-500">{selected.ville_depart} → {selected.ville_arrivee} · {selected.chargeur_nom}</p></div><button type="button" onClick={() => setSelected(null)} aria-label="Fermer" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button></header><p className="text-sm text-slate-600">L’annonce sera retirée de la plateforme, mais conservée dans l’archive de modération. Le motif sera ajouté à une notification et envoyé par e-mail si le compte possède une adresse et que SMTP est configuré.</p><label className="block"><span className="mb-1.5 block text-sm font-bold text-[#121C2D]">Motif transmis à l’annonceur</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={5} maxLength={1000} required rows={4} placeholder="Expliquez clairement pourquoi l’annonce est retirée…" className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#FF6A3D]" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600">Annuler</button><button type="submit" disabled={deleting || reason.trim().length < 5} className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Trash2 size={15} />{deleting ? 'Suppression…' : 'Retirer et notifier'}</button></div></form></div>}
  </DashboardLayout>;
}