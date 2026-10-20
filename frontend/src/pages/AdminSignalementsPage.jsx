import React, { useEffect, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { ADMIN_SIDEBAR_ITEMS } from '../utils/adminNavigation';

export default function AdminSignalementsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const response = await api.get('/api/notifications');
      setNotifications(response.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const markAsRead = async (id) => {
    await api.put(`/api/notifications/${id}/read`);
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, lu: true } : item));
  };

  return <DashboardLayout sidebarItems={ADMIN_SIDEBAR_ITEMS} user={user}>
    <div className="space-y-6">
      <header><p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0f766e]">Centre système</p><h1 className="text-3xl font-bold text-[#123b4a]">Signalements</h1><p className="mt-1 text-slate-500">Suivez les événements nécessitant l’attention de l’administration.</p></header>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="font-bold text-[#123b4a]">Notifications système</h2><p className="text-sm text-slate-500">Dossiers complétés, documents reçus et autres événements opérationnels.</p></div>{loading ? <p className="p-10 text-center text-sm text-slate-500">Chargement...</p> : notifications.length ? <div className="divide-y divide-slate-100">{notifications.map((notification) => <article key={notification.id} className={`flex items-start gap-4 p-5 ${notification.lu ? '' : 'bg-teal-50/40'}`}><div className="mt-1 rounded-lg bg-teal-100 p-2 text-teal-700"><Bell size={18} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-[#123b4a]">{notification.titre}</h3><time className="text-xs text-slate-400">{new Date(notification.date_creation).toLocaleString('fr-FR')}</time></div><p className="mt-1 text-sm text-slate-600">{notification.message}</p>{!notification.lu && <button type="button" onClick={() => markAsRead(notification.id)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 hover:text-teal-900"><Check size={14} /> Marquer comme lu</button>}</div></article>)}</div> : <div className="p-12 text-center"><Bell size={34} className="mx-auto text-slate-300" /><p className="mt-3 font-semibold text-slate-600">Aucun signalement pour le moment.</p></div>}</section>
    </div>
  </DashboardLayout>;
}
