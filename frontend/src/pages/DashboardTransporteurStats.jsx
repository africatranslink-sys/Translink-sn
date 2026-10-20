import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileText, Package, RefreshCw, Truck } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import ActorDashboardCharts from '../components/ActorDashboardCharts';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/useLanguage';
import api from '../utils/api';
import { buildMonthlySeries, buildStatusDistribution, formatCount, STATUS_LABELS } from '../utils/dashboardAnalyticsData';
import { useDashboardDataRefresh } from '../context/SocketContext';



export default function DashboardTransporteurStats() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const dashboardLabel = language === 'en'
    ? user?.role === 'ENTREPRISE' ? 'Company dashboard' : 'Carrier dashboard'
    : `Espace ${user?.role === 'ENTREPRISE' ? 'entreprise' : 'transporteur'}`;
  const [camions, setCamions] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  useDashboardDataRefresh(() => setRefreshKey((current) => current + 1));

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get('/api/camions/me'),
      api.get('/api/courses/me'),
    ]).then(([camionsResponse, coursesResponse]) => {
      if (!active) return;
      setCamions(Array.isArray(camionsResponse.data) ? camionsResponse.data : []);
      setCourses(Array.isArray(coursesResponse.data) ? coursesResponse.data : []);
    }).catch((requestError) => {
      if (active) setError(requestError.response?.data?.error || 'Les statistiques de votre flotte ne sont pas disponibles.');
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [refreshKey]);

  const availableTrucks = camions.filter((camion) => camion.statut === 'DISPONIBLE');
  const activeTrucks = camions.filter((camion) => camion.statut === 'EN_MISSION');
  const completedCourses = courses.filter((course) => course.statut === 'SOLDE_REGLE');
  const totalCapacity = camions.reduce((total, camion) => total + Number(camion.capacite_tonnes || 0), 0);
  const metrics = [
    { label: 'Camions enregistrés', value: formatCount(camions.length), detail: `${formatCount(totalCapacity)} t de capacité totale`, icon: Truck },
    { label: 'Camions disponibles', value: formatCount(availableTrucks.length), detail: 'Prêts pour une offre', icon: CheckCircle2 },
    { label: 'En mission', value: formatCount(activeTrucks.length), detail: 'Véhicules actuellement mobilisés', icon: Package, accent: true },
    { label: 'Courses terminées', value: formatCount(completedCourses.length), detail: 'Courses soldées', icon: FileText },
  ];
  const recentCourses = courses.slice(0, 5);
  const recentTrucks = camions.slice(0, 5);

  return (
    <DashboardLayout user={user}>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-brand-orange">{dashboardLabel}</p>
            <h1 className="mt-2 text-3xl font-bold text-brand-dark">Bonjour {user?.nom || ''}</h1>
            <p className="mt-1 text-slate-500">Suivez l’activité réelle de votre flotte et de vos courses.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setError(''); setLoading(true); setRefreshKey((key) => key + 1); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:border-brand-orange" aria-label="Actualiser les statistiques">
              <RefreshCw size={16} />
            </button>
            <Link to="/transporteur/camions/nouveau" className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-sm font-bold text-white hover:bg-[#e85b2d]">Ajouter un camion</Link>
          </div>
        </header>

        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <ActorDashboardCharts
          metrics={metrics}
          activity={buildMonthlySeries(courses, 'date_creation', language)}
          activityTitle="Courses par mois"
          distribution={buildStatusDistribution(camions, language)}
          distributionTitle="État de la flotte"
          loading={loading}
        />

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div><h2 className="font-bold text-brand-dark">Courses récentes</h2><p className="text-sm text-slate-500">Historique de vos opérations</p></div>
              <Link to="/transporteur/historique" className="text-sm font-bold text-[#2F80ED] hover:underline">Tout voir</Link>
            </div>
            {loading ? <p className="p-6 text-sm text-slate-400">Chargement…</p> : recentCourses.length ? (
              <div className="divide-y divide-slate-100">
                {recentCourses.map((course) => (
                  <article key={course.id} className="flex items-center justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-brand-dark">{course.ville_depart || 'Départ'} <span className="text-slate-300">→</span> {course.ville_arrivee || 'Destination'}</p>
                      <p className="mt-1 text-xs text-slate-500">{course.plaque_immatriculation || (language === 'en' ? 'Vehicle' : 'Véhicule')} · {formatDate(course.date_creation, language)}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{STATUS_LABELS[course.statut] || course.statut}</span>
                  </article>
                ))}
              </div>
            ) : <div className="p-8 text-center text-sm text-slate-400">Aucune course enregistrée.</div>}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div><h2 className="font-bold text-brand-dark">Votre flotte</h2><p className="text-sm text-slate-500">Statut des véhicules déclarés</p></div>
              <Link to="/transporteur/camions" className="text-sm font-bold text-[#2F80ED] hover:underline">Tout voir</Link>
            </div>
            {loading ? <p className="p-6 text-sm text-slate-400">Chargement…</p> : recentTrucks.length ? (
              <div className="divide-y divide-slate-100">
                {recentTrucks.map((camion) => (
                  <article key={camion.id} className="flex items-center justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-brand-dark">{camion.plaque_immatriculation}</p>
                      <p className="mt-1 text-xs text-slate-500">{camion.type_vehicule} · {formatCount(camion.capacite_tonnes)} t</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{STATUS_LABELS[camion.statut] || camion.statut}</span>
                  </article>
                ))}
              </div>
            ) : <div className="p-8 text-center text-sm text-slate-400">Aucun camion enregistré.</div>}
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}

function formatDate(value, language) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return language === 'en' ? 'Date not provided' : 'Date non renseignée';
  return new Date(value).toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}