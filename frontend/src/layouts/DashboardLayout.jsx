import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Truck, Bell, LogOut, Menu, X, Megaphone, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/useLanguage';
import api from '../utils/api';
import { resolveMediaUrl } from '../utils/mediaUrl';
import AnnouncementTicker from '../components/AnnouncementTicker';
import { useSocket } from '../context/SocketContext';

import { getSidebarItems, getDashboardUrl } from '../utils/navigation';

const roleAvatar = { ADMIN: '🛡️', TRANSPORTEUR: '🚚', ENTREPRISE: '🏢', CHARGEUR: '📦', CHAUFFEUR: '👨🏾‍✈️' };

export default function DashboardLayout({ children, user = {}, sidebarItems }) {
  const finalSidebarItems = sidebarItems || getSidebarItems(user?.role, user);
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { language } = useLanguage();
  const { socket } = useSocket();
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showFreePlanPromotion, setShowFreePlanPromotion] = useState(false);
  const notificationsRef = useRef(null);
  const unreadCount = notifications.filter((notification) => !notification.lu).length;

  useEffect(() => {
    const eligibleRole = ['CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR'].includes(user?.role)
      && !(user?.role === 'CHAUFFEUR' && user?.employeur_id);
    if (!eligibleRole) {
      setShowFreePlanPromotion(false);
      return undefined;
    }

    let active = true;
    api.get('/api/paiements/abonnements/mien')
      .then(({ data }) => {
        if (active) setShowFreePlanPromotion(data?.entitlements?.planId === 'GRATUIT');
      })
      .catch((error) => {
        console.error('Impossible de vérifier l’éligibilité à la promotion de l’offre gratuite.', error);
        if (active) setShowFreePlanPromotion(false);
      });

    return () => { active = false; };
  }, [user?.employeur_id, user?.role]);

  useEffect(() => {
    let active = true;
    const refreshNotifications = () => {
      api.get('/api/notifications')
        .then((response) => {
          if (active) setNotifications(Array.isArray(response.data) ? response.data : []);
        })
        .catch(() => {});
    };
    refreshNotifications();
    if (!socket) return () => { active = false; };
    socket.on('connect', refreshNotifications);
    socket.on('dashboard:data-changed', refreshNotifications);
    return () => {
      active = false;
      socket.off('connect', refreshNotifications);
      socket.off('dashboard:data-changed', refreshNotifications);
    };
  }, [socket]);

  useEffect(() => {
    if (!showMobileMenu) return undefined;
    const handleEscape = (event) => {
      if (event.key === 'Escape') setShowMobileMenu(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showMobileMenu]);

  useEffect(() => {
    if (!showNotifications) return undefined;

    const handleOutsideClick = (event) => {
      if (!notificationsRef.current?.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setShowNotifications(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showNotifications]);

  return (
    <div className="flex h-screen bg-[#F8FAFC] font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-[#121C2D] text-white flex flex-col hidden md:flex">
        {/* Logo */}
        <div className="h-20 flex items-center px-6 border-b border-white/10">
          <Link to={getDashboardUrl(user?.role)} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="bg-[#FF6A3D] p-1.5 rounded text-white">
              <Truck size={20} />
            </div>
            <span className="text-xl font-bold tracking-tight leading-none text-white">TRANSLINK-AFRICA</span>
          </Link>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-6">
          <nav className="space-y-1 px-4">
            {finalSidebarItems.map((item, index) => {
              const isRootRoute = ['/admin', '/chargeur', '/transporteur', '/chauffeur'].includes(item.href);
              const isActive = isRootRoute ? location.pathname === item.href : location.pathname.startsWith(item.href);
              return (
                <Link
                  key={index}
                  to={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                    isActive 
                      ? 'bg-[#FF6A3D] text-white font-bold shadow-lg' 
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <item.icon size={20} className={isActive ? 'text-white' : 'text-slate-400'} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Logout */}
        <div className="p-4 border-t border-white/10">
          <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-slate-400 transition-colors hover:bg-white/5 hover:text-white">
            <LogOut size={20} />
            <span>Déconnexion</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="z-10 flex h-20 items-center justify-between border-b border-gray-100 bg-white px-4 md:px-8">
          <div className="flex items-center gap-3 md:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FF6A3D]/10 text-[#FF6A3D]">
              <Truck size={20} />
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3 md:gap-6">
            <div ref={notificationsRef} className="relative">
              <button type="button" onClick={() => setShowNotifications(!showNotifications)} className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-[#121C2D] md:h-auto md:w-auto md:rounded-none" aria-label={language === 'en' ? `${unreadCount} unread notification(s)` : `${unreadCount} notification(s) non lue(s)`}>
                <Bell size={22} />
                {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
              </button>

              {showNotifications && (
                <div className="fixed left-3 right-3 top-20 z-[60] max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white p-3 shadow-xl md:absolute md:left-auto md:right-0 md:top-12 md:max-h-[calc(100dvh-7rem)] md:w-80">
                  <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2">
                    <p className="font-bold text-[#121C2D]">Notifications</p>
                    {unreadCount > 0 && <span className="text-[10px] font-semibold text-rose-600 md:text-xs">{language === 'en' ? `${unreadCount} unread` : `${unreadCount} non lue${unreadCount > 1 ? 's' : ''}`}</span>}
                  </div>

                  {notifications.length ? notifications.slice(0, 5).map((notification) => (
                    <button type="button" key={notification.id} onClick={async () => { await api.put(`/api/notifications/${notification.id}/read`); setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, lu: true } : item)); setShowNotifications(false); if (notification.action_url) navigate(notification.action_url); else if (user.role === 'ADMIN') navigate('/admin/signalements'); }} className={`block w-full border-b border-gray-100 px-2 py-3 text-left text-sm ${notification.lu ? 'text-slate-400' : 'text-[#121C2D]'}`}>
                      <span className="block break-words font-semibold">{notification.titre}</span>
                      <span className="mt-1 block break-words text-left text-slate-600">{notification.message}</span>
                      <span className={`mt-2 block text-xs font-bold ${notification.action_label ? 'text-[#0C1B32] underline underline-offset-2' : 'text-slate-400'}`}>{notification.action_label || (language === 'en' ? 'Click to view' : 'Cliquer pour consulter')}</span>
                    </button>
                  )) : <p className="p-3 text-sm text-slate-400">{language === 'en' ? 'No notifications.' : 'Aucune notification.'}</p>}

                  {user.role === 'ADMIN' && <button type="button" onClick={() => { setShowNotifications(false); navigate('/admin/signalements'); }} className="mt-2 w-full rounded-lg bg-slate-50 py-2 text-xs font-bold text-[#123b4a] hover:bg-slate-100">{language === 'en' ? 'View all reports' : 'Voir tous les signalements'}</button>}
                </div>
              )}
            </div>

            <div className="hidden h-8 w-px bg-gray-200 md:block"></div>

            <Link to="/profile" className="flex items-center gap-2 rounded-lg p-1 transition hover:bg-slate-50 md:gap-3" aria-label={language === 'en' ? 'Open my profile' : 'Ouvrir mon profil'}>
              <div className="hidden text-right sm:block">
                <p className="text-sm font-bold text-[#121C2D] leading-none">{user.nom || 'Utilisateur'}</p>
                <div className="mt-1 flex items-center justify-end gap-2">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                    user.role === 'CHARGEUR' ? 'bg-blue-100 text-blue-700' : 
                    user.role === 'TRANSPORTEUR' ? 'bg-orange-100 text-[#FF6A3D]' : 
                    'bg-slate-100 text-slate-700'
                  }`}>
                    {user.role === 'ADMIN' ? 'ADMINISTRATEUR' : user.role}
                  </span>
                </div>
              </div>
              {user.avatar_url ? <img src={resolveMediaUrl(user.avatar_url)} alt="Avatar" className="h-9 w-9 rounded-full border-2 border-white object-cover shadow-sm md:h-10 md:w-10" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-orange-100 text-lg shadow-sm md:h-10 md:w-10" aria-label="Avatar métier">{roleAvatar[user.role] || '👤'}</div>}
            </Link>
            <button
              type="button"
              onClick={() => setShowMobileMenu(true)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-[#121C2D] md:hidden"
              aria-label="Ouvrir le menu"
              aria-expanded={showMobileMenu}
              aria-haspopup="dialog"
            >
              <Menu size={23} />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 pb-4 md:p-8 bg-[#F8FAFC]">
          <div className="max-w-7xl mx-auto">
            <AnnouncementTicker user={user} />
            {showFreePlanPromotion && <>
              <aside aria-label="Forfait gratuit" className="mb-3 flex flex-col gap-4 rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 to-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between md:p-5">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-[#FF6A3D] p-2 text-white"><Megaphone size={20} /></span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#FF6A3D]">Publicité · Offre gratuite</p>
                  <h2 className="mt-1 font-bold text-[#121C2D]">Développez votre activité avec un forfait supérieur</h2>
                  <p className="mt-1 text-sm text-slate-600">Profitez de plus de camions, de chauffeurs et d’une meilleure visibilité à partir de 5 000 FCFA par mois.</p>
                </div>
              </div>
              <Link to="/abonnement" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#FF6A3D] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#e85b2d]">Découvrir les forfaits <ArrowUpRight size={16} /></Link>
              </aside>
            </>}
            {children}
          </div>
        </main>
      </div>

      {showMobileMenu && <div className="fixed inset-0 z-50 md:hidden" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setShowMobileMenu(false);
      }}>
        <div className="absolute inset-0 bg-[#121C2D]/45 backdrop-blur-[2px]" />
        <aside role="dialog" aria-modal="true" aria-label="Menu de navigation" className="absolute inset-y-0 left-0 flex w-[min(84vw,20rem)] flex-col bg-[#121C2D] text-white shadow-2xl">
          <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
            <Link to={getDashboardUrl(user?.role)} onClick={() => setShowMobileMenu(false)} className="flex items-center gap-2">
              <span className="rounded-lg bg-[#FF6A3D] p-1.5"><Truck size={20} /></span>
              <span className="text-lg font-bold tracking-tight">TRANSLINK-AFRICA</span>
            </Link>
            <button type="button" onClick={() => setShowMobileMenu(false)} className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Fermer le menu">
              <X size={22} />
            </button>
          </div>
          <nav aria-label="Navigation principale" className="flex-1 overflow-y-auto px-4 py-5">
            <div className="mb-4 px-3 text-xs font-bold uppercase tracking-wider text-slate-400">Navigation</div>
            <div className="space-y-1">
              {finalSidebarItems.map((item, index) => {
                const isRootRoute = ['/admin', '/chargeur', '/transporteur', '/chauffeur'].includes(item.href);
                const isActive = isRootRoute ? location.pathname === item.href : location.pathname.startsWith(item.href);
                return <Link
                  key={`${item.href}-${index}`}
                  to={item.href}
                  onClick={() => setShowMobileMenu(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors ${
                    isActive ? 'bg-[#FF6A3D] font-bold text-white shadow-lg' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <item.icon size={19} />
                  <span>{item.label}</span>
                </Link>;
              })}
            </div>
          </nav>
          <div className="border-t border-white/10 p-4">
            <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-slate-300 transition-colors hover:bg-red-500/15 hover:text-red-300">
              <LogOut size={19} />
              <span>Déconnexion</span>
            </button>
          </div>
        </aside>
      </div>}
    </div>
  );
}
