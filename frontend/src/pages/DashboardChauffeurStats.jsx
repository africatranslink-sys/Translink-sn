import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, CheckCircle2, FileText, History, MapPin, Package } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import ActorDashboardCharts from '../components/ActorDashboardCharts';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/useLanguage';
import api from '../utils/api';
import { buildMonthlyPayoutSeries, buildMonthlySeries, buildStatusDistribution, formatCount, STATUS_LABELS } from '../utils/dashboardAnalyticsData';
import { useDashboardDataRefresh } from '../context/SocketContext';



export default function DashboardChauffeurStats() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  useDashboardDataRefresh(() => setRefreshKey((current) => current + 1));

  useEffect(() => {
    let active = true;
    api.get('/api/courses/me')
      .then((response) => {
        if (!active) return;
        setCourses(Array.isArray(response.data) ? response.data : []);
      }).catch((requestError) => {
        if (active) setError(requestError.response?.data?.error || 'Les statistiques de vos missions ne sont pas disponibles.');
      }).finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [refreshKey]);

  const activeCourses = courses.filter((course) => ['EN_MISSION', 'AU_CHARGEMENT', 'EN_TRANSIT', 'AU_DECHARGEMENT', 'TERMINEE'].includes(course.statut));
  const completedCourses = courses.filter((course) => course.statut === 'SOLDE_REGLE');
  const monthlyRevenue = buildMonthlyPayoutSeries(courses, user?.id, language);
  const totalRevenue = monthlyRevenue.reduce((total, month) => total + month.value, 0);

  const metrics = [
    { label: 'Missions en cours', value: formatCount(activeCourses.length), detail: 'Transports en cours', icon: Package, accent: true },
    { label: 'Missions terminées', value: formatCount(completedCourses.length), detail: 'Courses clôturées', icon: CheckCircle2 },
    { label: 'Total missions', value: formatCount(courses.length), detail: 'Historique complet', icon: History },
    { label: 'Revenus reversés', value: `${formatCount(totalRevenue)} FCFA`, detail: 'Net effectivement versé', icon: Banknote },
  ];
  const recentCourses = courses.slice(0, 5);

  return (
    <DashboardLayout user={user}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-10 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#121C2D]">Mon Espace Chauffeur</h1>
            <p className="mt-2 text-sm text-slate-500">
              Gérez vos missions de transport et suivez vos activités.
            </p>
          </div>
        </header>

        {error && (
          <div className="mb-8 rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <h3 className="font-semibold text-red-800">Erreur lors de l'accès aux données</h3>
            <p className="mt-2 text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex h-64 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            <div className="flex flex-col items-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#FF6A3D]"></div>
              <p className="mt-4 font-medium text-slate-500">Chargement de votre espace...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {metrics.map((metric) => (
                <div key={metric.label} className="relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 transition-all hover:shadow-md">
                  {metric.accent && <div className="absolute top-0 right-0 h-16 w-16 -mr-8 -mt-8 rounded-full bg-[#FF6A3D] opacity-10 blur-xl"></div>}
                  <div className="flex items-center gap-4">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${metric.accent ? 'bg-orange-50 text-[#FF6A3D]' : 'bg-slate-50 text-slate-500'}`}>
                      <metric.icon size={24} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500">{metric.label}</p>
                      <p className={`text-2xl font-bold ${metric.accent ? 'text-[#FF6A3D]' : 'text-[#121C2D]'}`}>{metric.value}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-xs">
                    <span className="text-slate-500">{metric.detail}</span>
                  </div>
                </div>
              ))}
            </div>

            <ActorDashboardCharts
              metrics={[]}
              activity={buildMonthlySeries(courses, 'date_creation', language)}
              activityTitle="Missions par mois"
              distribution={buildStatusDistribution(courses, language)}
              distributionTitle="Statuts des missions"
              revenue={monthlyRevenue}
              revenueTitle="Mes revenus reversés"
              loading={loading}
            />

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              <div className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-5">
                  <h2 className="font-bold text-[#121C2D] flex items-center gap-2">
                    <Package size={20} className="text-slate-400" />
                    Dernières missions
                  </h2>
                  <Link to="/chauffeur/missions" className="text-sm font-semibold text-[#FF6A3D] hover:text-[#e85b2d]">Voir tout</Link>
                </div>
                <div className="flex-1 divide-y divide-slate-100 overflow-y-auto max-h-[400px]">
                  {recentCourses.length === 0 ? (
                    <div className="flex h-32 flex-col items-center justify-center p-6 text-center text-sm text-slate-500">
                      <FileText size={24} className="mb-2 text-slate-300" />
                      Aucune mission enregistrée pour le moment
                    </div>
                  ) : (
                    recentCourses.map((course) => {
                      const missionId = course?.id != null ? String(course.id).slice(0, 8) : 'Mission';

                      return (
                        <div key={course.id ?? missionId} className="flex items-center justify-between p-6 transition-colors hover:bg-slate-50">
                          <div>
                            <p className="font-semibold text-[#121C2D]">Mission {missionId}</p>
                            <div className="mt-1 flex items-center gap-4 text-xs text-slate-500">
                              <span className="flex items-center gap-1.5"><MapPin size={14} />{course?.demande?.ville_depart || 'N/A'}</span>
                              <span className="font-bold text-slate-300">→</span>
                              <span className="flex items-center gap-1.5"><MapPin size={14} />{course?.demande?.ville_arrivee || 'N/A'}</span>
                            </div>
                          </div>
                          <div className={`rounded-md px-2.5 py-1 text-xs font-semibold ${course.statut === 'SOLDE_REGLE' ? 'bg-green-50 text-green-700 ring-1 ring-green-600/20' : 'bg-orange-50 text-orange-700 ring-1 ring-orange-600/20'}`}>
                            {STATUS_LABELS[course.statut] || course.statut}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="flex flex-col overflow-hidden rounded-2xl bg-[#121C2D] shadow-sm ring-1 ring-black/5 text-white">
                <div className="p-8">
                  <h3 className="text-xl font-bold mb-4">Gérez votre profil</h3>
                  <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                    Maintenez vos documents à jour (permis de conduire) pour garantir votre accès continu à la plateforme et recevoir des missions de la part de votre transporteur.
                  </p>
                  <Link to="/chauffeur/documents" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF6A3D] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#e85b2d]">
                    <FileText size={18} /> Gérer mes documents
                  </Link>
                </div>
                <Link to="/chauffeur/suivi" className="mt-auto bg-white/5 p-6 border-t border-white/10 hover:bg-white/10 transition block">
                   <div className="flex items-start gap-4">
                     <div className="bg-[#FF6A3D]/20 p-2 rounded-lg text-[#FF6A3D]"><MapPin size={24} /></div>
                     <div>
                       <h4 className="font-bold text-white">Partage de position</h4>
                       <p className="text-xs text-slate-400 mt-1">Cliquez ici pour activer le partage de position pendant vos missions pour permettre le suivi en temps réel.</p>
                     </div>
                   </div>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
