import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileText, History, LayoutDashboard, MapPin, Package, RefreshCw, Search, Settings, Truck } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import ActorDashboardCharts from '../components/ActorDashboardCharts';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/useLanguage';
import api from '../utils/api';
import { ACTIVE_COURSE_STATUSES, buildMonthlySeries, buildStatusDistribution, formatCount, STATUS_LABELS } from '../utils/dashboardAnalyticsData';
import { useDashboardDataRefresh } from '../context/SocketContext';

const sidebarItems = [
  { label: 'Tableau de bord', icon: LayoutDashboard, href: '/chargeur' },
  { label: 'Mes demandes', icon: FileText, href: '/chargeur/demandes' },
  { label: 'Trouver un camion', icon: Search, href: '/chargeur/recherche' },
  { label: 'Historique', icon: History, href: '/chargeur/historique' },
  { label: 'Documents', icon: FileText, href: '/chargeur/documents' },
  { label: 'Suivi en temps réel', icon: MapPin, href: '/chargeur/suivi' },
  { label: 'Paramètres', icon: Settings, href: '/profile' },
];

export default function DashboardChargeurStats() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [demandes, setDemandes] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  useDashboardDataRefresh(() => setRefreshKey((current) => current + 1));

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get('/api/annonces/demandes/miennes'),
      api.get('/api/courses/me'),
    ]).then(([demandesResponse, coursesResponse]) => {
      if (!active) return;
      setDemandes(Array.isArray(demandesResponse.data) ? demandesResponse.data : []);
      setCourses(Array.isArray(coursesResponse.data) ? coursesResponse.data : []);
    }).catch((requestError) => {
      if (active) setError(requestError.response?.data?.error || 'Les statistiques des demandes ne sont pas disponibles.');
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [refreshKey]);

  const activeCourses = courses.filter((course) => ACTIVE_COURSE_STATUSES.has(course.statut));
  const completedCourses = courses.filter((course) => course.statut === 'SOLDE_REGLE');
  const publishedDemands = demandes.filter((demande) => demande.statut === 'PUBLIEE');
  const totalTonnage = demandes.reduce((total, demande) => total + Number(demande.tonnage || 0), 0);
  const metrics = [
    { label: 'Demandes soumises', value: formatCount(demandes.length), detail: `${formatCount(publishedDemands.length)} en attente de camion`, icon: FileText },
    { label: 'Courses en cours', value: formatCount(activeCourses.length), detail: 'Camion trouvé, chargement ou livraison', icon: Truck },
    { label: 'Courses terminées', value: formatCount(completedCourses.length), detail: 'Soldes réglés', icon: CheckCircle2, accent: true },
    { label: 'Tonnage demandé', value: `${formatCount(totalTonnage)} t`, detail: 'Toutes vos demandes', icon: Package },
  ];
  const recentDemands = demandes.slice(0, 5);

  return (
    <DashboardLayout sidebarItems={sidebarItems} user={user}>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-brand-orange">Espace chargeur</p>
            <h1 className="mt-2 text-3xl font-bold text-brand-dark">Bonjour {user?.nom || ''}</h1>
            <p className="mt-1 text-slate-500">Vos demandes, livraisons et tendances d’activité.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setError(''); setLoading(true); setRefreshKey((key) => key + 1); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:border-brand-orange" aria-label="Actualiser les statistiques">
              <RefreshCw size={16} />
            </button>
            <Link to="/chargeur/demande" className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-sm font-bold text-white hover:bg-[#e85b2d]">Nouvelle demande</Link>
          </div>
        </header>

        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <ActorDashboardCharts
          metrics={metrics}
          activity={buildMonthlySeries(demandes, 'date_creation', language)}
          activityTitle="Demandes par mois"
          distribution={buildStatusDistribution(demandes, language)}
          distributionTitle="Demandes par statut"
          loading={loading}
        />

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div><h2 className="font-bold text-brand-dark">Demandes récentes</h2><p className="text-sm text-slate-500">Vos dernières publications</p></div>
            <Link to="/chargeur/demandes" className="text-sm font-bold text-[#2F80ED] hover:underline">Tout voir</Link>
          </div>
          {loading ? <p className="p-6 text-sm text-slate-400">Chargement…</p> : recentDemands.length ? (
            <div className="divide-y divide-slate-100">
              {recentDemands.map((demande) => (
                <article key={demande.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 font-semibold text-brand-dark">
                      <span>{demande.ville_depart}</span><span className="text-slate-300">→</span><span>{demande.ville_arrivee}</span><span className="text-xs font-normal text-slate-400">#{demande.id}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{demande.nature_marchandise} · {demande.tonnage} t · {formatDate(demande.date_creation, language)}</p>
                  </div>
                  <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{STATUS_LABELS[demande.statut] || demande.statut}</span>
                </article>
              ))}
            </div>
          ) : <div className="p-8 text-center text-sm text-slate-400">Aucune demande enregistrée pour le moment.</div>}
        </section>
      </div>
    </DashboardLayout>
  );
}

function formatDate(value, language) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return language === 'en' ? 'Date not provided' : 'Date non renseignée';
  return new Date(value).toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}