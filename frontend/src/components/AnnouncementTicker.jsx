import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone, Pause, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../utils/api';

const VISIBLE_ROLES = ['TRANSPORTEUR', 'ENTREPRISE', 'CHAUFFEUR'];

export default function AnnouncementTicker({ user }) {
  const role = user?.role;
  const isVisible = VISIBLE_ROLES.includes(role) && !(role === 'CHAUFFEUR' && user?.employeur_id);
  const [announcements, setAnnouncements] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!isVisible) return undefined;
    let active = true;
    const load = async () => {
      try {
        const response = await api.get('/api/annonces/demandes');
        if (active) setAnnouncements(Array.isArray(response.data) ? response.data : []);
      } catch {
        if (active) setAnnouncements([]);
      }
    };
    load();
    const refresh = window.setInterval(load, 60000);
    return () => {
      active = false;
      window.clearInterval(refresh);
    };
  }, [isVisible, role]);

  if (!isVisible || !announcements.length) return null;
  const changeIndex = (step) => setActiveIndex((index) => (index + step + announcements.length) % announcements.length);
  const orderedAnnouncements = [...announcements.slice(activeIndex), ...announcements.slice(0, activeIndex)];
  const tickerDuration = `${Math.max(28, orderedAnnouncements.length * 7)}s`;
  const destination = role === 'CHAUFFEUR' ? '/chauffeur/recherche' : '/transporteur/recherche';
  const renderAnnouncements = (copy) => orderedAnnouncements.map((item, index) => (
    <span key={`${copy}-${item.id}`} className="inline-flex shrink-0 items-center">
      <Link to={destination} tabIndex={copy === 'repeat' ? -1 : 0} className="whitespace-nowrap px-5 text-sm font-medium text-[#121C2D] hover:text-[#0f766e]" title={`${item.ville_depart} → ${item.ville_arrivee} · ${item.nature_marchandise}`}>
        {item.ville_depart} → {item.ville_arrivee} <span className="text-slate-400">·</span> {item.nature_marchandise} <span className="text-slate-400">·</span> {item.tonnage} t
      </Link>
      {index < orderedAnnouncements.length - 1 && <span aria-hidden="true" className="text-[#0f766e]">•</span>}
    </span>
  ));

  return <section aria-label="Annonces récentes" className="mb-6 flex min-w-0 items-stretch overflow-hidden rounded-lg border border-[#FF6A3D]/50 bg-white shadow-sm">
    <div className="flex shrink-0 items-center gap-2 bg-[#0f766e] px-3 py-3 text-xs font-bold text-white sm:px-4"><Megaphone size={16} /> <span className="hidden sm:inline">Offres récentes</span><span className="sm:hidden">Offres</span></div>
    <div className="min-w-0 flex-1 overflow-hidden py-3" aria-live={paused ? 'polite' : 'off'}>
      <div key={activeIndex} className={`announcement-ticker-track${paused ? ' is-paused' : ''}`} style={{ '--announcement-ticker-duration': tickerDuration }}>
        <div className="announcement-ticker-copy">{renderAnnouncements('primary')}</div>
        <div className="announcement-ticker-copy" aria-hidden="true">{renderAnnouncements('repeat')}</div>
      </div>
    </div>
    <div className="flex shrink-0 items-center border-l border-slate-200">
      <button type="button" onClick={() => changeIndex(-1)} aria-label="Annonce précédente" title="Annonce précédente" className="grid h-full w-9 place-items-center text-[#0f766e] hover:bg-slate-50"><ChevronLeft size={17} /></button>
      <button type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? 'Reprendre le défilement' : 'Mettre en pause le défilement'} title={paused ? 'Reprendre' : 'Pause'} className="grid h-full w-9 place-items-center border-x border-slate-200 text-[#0f766e] hover:bg-slate-50">{paused ? <Play size={15} /> : <Pause size={15} />}</button>
      <button type="button" onClick={() => changeIndex(1)} aria-label="Annonce suivante" title="Annonce suivante" className="grid h-full w-9 place-items-center text-[#0f766e] hover:bg-slate-50"><ChevronRight size={17} /></button>
    </div>
  </section>;
}