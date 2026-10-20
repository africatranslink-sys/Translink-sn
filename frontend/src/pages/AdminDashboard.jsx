import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, CheckCircle2, FileCheck2, RefreshCw, Settings, ShieldCheck, Trash2, Truck, Users } from 'lucide-react';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip as ChartTooltip,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import DashboardLayout from '../layouts/DashboardLayout';
import ConfirmDialog from '../components/ConfirmDialog';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/useLanguage';
import { useAutoDismissMessage } from '../utils/useAutoDismissMessage';
import { ADMIN_SIDEBAR_ITEMS } from '../utils/adminNavigation';
import PrintButton from '../components/PrintButton';
import { formatDocumentStatus, formatDocumentType } from '../utils/documentLabels';
import { formatActorRole, formatVerificationStatus } from '../utils/adminLabels';
import { useDashboardDataRefresh } from '../context/SocketContext';

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  ChartTooltip,
);

const requiredDocumentTypesByRole = {
  CHARGEUR: ['CARTE_IDENTITE_RECTO', 'CARTE_IDENTITE_VERSO'],
  ENTREPRISE: ['CARTE_IDENTITE_RECTO', 'CARTE_IDENTITE_VERSO', 'NINEA', 'REGISTRE_COMMERCE'],
  TRANSPORTEUR: ['CARTE_IDENTITE_RECTO', 'CARTE_IDENTITE_VERSO', 'NINEA', 'REGISTRE_COMMERCE', 'LICENCE_TRANSPORT'],
  CHAUFFEUR: ['CARTE_IDENTITE_RECTO', 'CARTE_IDENTITE_VERSO', 'PERMIS'],
};

const chartBaseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: {
    duration: 700,
    easing: 'easeOutQuart',
  },
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      backgroundColor: '#121C2D',
      padding: 10,
      cornerRadius: 8,
      titleFont: { size: 12, weight: '600' },
      bodyFont: { size: 12 },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: {
        color: '#64748b',
        font: { size: 10 },
      },
    },
    y: {
      beginAtZero: true,
      ticks: {
        color: '#64748b',
        precision: 0,
        padding: 8,
      },
      grid: { color: 'rgba(148, 163, 184, 0.16)', drawBorder: false },
    },
  },
};

export default function AdminDashboard({ section = 'overview' }) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const selectedUserId = searchParams.get('userId');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useAutoDismissMessage('');

  const loadData = async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const requests = [api.get('/api/admin/dashboard/stats')];
      if (section === 'users' || section === 'documents') requests.push(api.get('/api/admin/users'));
      if (section === 'documents') requests.push(api.get('/api/admin/documents', { params: selectedUserId ? { userId: selectedUserId } : {} }));
      const responses = await Promise.all(requests);
      setStats(responses[0].data);
      if (section === 'users') setUsers(responses[1].data);
      if (section === 'documents') {
        setUsers(responses[1].data);
        setDocuments(selectedUserId ? responses[2].data.filter((item) => String(item.utilisateur_id) === selectedUserId) : responses[2].data);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Les données administrateur ne sont pas disponibles.');
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => { loadData(true); }, [section, selectedUserId]);
  useDashboardDataRefresh(() => loadData());

  return <DashboardLayout sidebarItems={ADMIN_SIDEBAR_ITEMS} user={user}>
    <div className="print-content space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-[#FF6A3D]">Administration Translink-Africa</p><h1 className="mt-2 text-3xl font-bold text-brand-dark">{section === 'users' ? 'Utilisateurs' : section === 'documents' ? 'Documents à vérifier' : 'Centre de pilotage'}</h1><p className="mt-1 text-slate-500">{section === 'users' ? 'Gérez les comptes et leur statut de vérification.' : section === 'documents' ? 'Contrôlez les justificatifs transmis par les acteurs.' : 'Supervisez les utilisateurs, les documents et l’activité de la plateforme.'}</p></div><div className="print:hidden flex flex-wrap gap-2">{section === 'overview' && <PrintButton>Imprimer les rapports</PrintButton>}<button type="button" onClick={() => loadData(true)} className="inline-flex items-center gap-2 self-start rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-[#121C2D] hover:border-[#FF6A3D]"><RefreshCw size={16} /> Actualiser</button></div></div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>}
      {loading ? <div className="rounded-xl bg-white p-12 text-center text-slate-500">Chargement...</div> : section === 'users' ? <UsersPanel users={users} onRefresh={loadData} /> : section === 'documents' ? <DocumentsPanel documents={documents} users={users} selectedUserId={selectedUserId} onRefresh={loadData} /> : <Overview stats={stats} />}
    </div>
  </DashboardLayout>;
}

function Overview({ stats }) {
  const { language } = useLanguage();
  const numberLocale = language === 'en' ? 'en-US' : 'fr-FR';
  const usersTotal = stats?.users?.reduce((total, item) => total + Number(item.count), 0) || 0;
  const verifiedCourses = stats?.courses?.find((item) => item.statut === 'SOLDE_REGLE')?.count || 0;
  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Utilisateurs inscrits" value={usersTotal} />
        <StatCard icon={Truck} label="Camions enregistrés" value={stats?.camions || 0} />
        <StatCard icon={CheckCircle2} label="Courses terminées" value={verifiedCourses} />
        <StatCard icon={BarChart3} label="Revenus plateforme" value={`${Number(stats?.revenus || 0).toLocaleString(numberLocale)} FCFA`} accent />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RoleChart users={stats?.users || []} />
        <CourseChart courses={stats?.courses || []} />
        <MonthlyActivityChart users={stats?.usersByMonth || []} courses={stats?.coursesByMonth || []} announcements={stats?.annoncesByMonth || []} />
        <RevenueChart revenues={stats?.revenusByMonth || []} />
        <FleetStatusChart trucks={stats?.camionsByStatus || []} />
        <SupervisionStatusChart title="Comptes par statut de vérification" description="Comptes validés, en attente ou suspendus." rows={stats?.usersByStatus || []} labels={{ VALIDE: 'Validé', EN_ATTENTE: 'En attente', REFUSE: 'Refusé', SUSPENDU: 'Suspendu' }} />
        <SupervisionStatusChart title="Annonces par statut" description="Volume d’annonces actives et déjà prises en charge." rows={stats?.annoncesByStatus || []} labels={{ PUBLIEE: 'Publiée', CAMION_TROUVE: 'Camion trouvé', CHARGEMENT: 'Chargement', LIVRAISON: 'Livraison', SOLDE_REGLE: 'Terminée' }} />
        <SupervisionStatusChart title="Documents par statut" description="Suivi de la charge de vérification documentaire." rows={stats?.documentsByStatus || []} labels={{ VALIDE: 'Validé', EN_ATTENTE: 'En attente', REFUSE: 'Refusé', SUSPENDU: 'Suspendu' }} />
        <SupervisionStatusChart title="Paiements par étape et statut" description="Avances et soldes à valider ou déjà réglés." rows={stats?.paiementsByStatus || []} labels={{ EN_ATTENTE: 'En attente', VALIDE: 'Validé', LITIGE: 'En litige' }} paymentBreakdown />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3"><ShieldCheck className="text-[#FF6A3D]" /><div><h2 className="font-bold text-[#121C2D]">Actions rapides</h2><p className="text-sm text-slate-500">Les contrôles prioritaires de la plateforme.</p></div></div>
        <div className="grid gap-3 sm:grid-cols-3"><QuickLink href="/admin/utilisateurs" icon={Users} label="Gérer les utilisateurs" /><QuickLink href="/admin/documents" icon={FileCheck2} label="Vérifier les documents" /><QuickLink href="/profile" icon={Settings} label="Mon profil admin" /></div>
      </div>
    </div>
  );
}

function RoleChart({ users }) {
  const { language, translate } = useLanguage();
  const numberLocale = language === 'en' ? 'en-US' : 'fr-FR';
  const data = users.map((item) => ({ ...item, role: formatActorRole(item.role, language), count: Number(item.count) }));
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const colors = ['#2F80ED', '#22A6A1', '#FF6A3D', '#C2413B', '#D5A02E'];
  const chartData = {
    labels: data.map((item) => item.role),
    datasets: [{
      data: data.map((item) => item.count),
      backgroundColor: data.map((_, index) => colors[index % colors.length]),
      borderWidth: 2,
      borderColor: '#ffffff',
    }],
  };

  return <section className="min-w-0 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-brand-dark">Utilisateurs par rôle</h2><p className="mb-3 text-sm text-slate-500">Répartition des comptes inscrits.</p>{total ? <div className="grid min-h-56 grid-cols-[minmax(120px,0.9fr)_minmax(130px,1.1fr)] items-center gap-3 sm:gap-5"><div className="relative h-52 min-w-0"><Doughnut data={chartData} options={{ responsive: true, maintainAspectRatio: false, cutout: '72%', radius: '94%', animation: { animateRotate: true, duration: 800 }, hoverOffset: 8, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#121C2D', padding: 10, cornerRadius: 8, callbacks: { label(context) { return `${context.label}: ${context.parsed.toLocaleString(numberLocale)}`; } } } } }} /><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-2xl font-bold leading-none text-[#121C2D]">{total.toLocaleString(numberLocale)}</span><span className="mt-1 text-[10px] font-medium uppercase text-slate-400">{translate('comptes')}</span></div></div><div className="space-y-3">{data.map((item, index) => <div key={item.role} className="flex items-center justify-between gap-2 text-xs"><span className="flex min-w-0 items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} /><span className="truncate">{item.role}</span></span><strong className="text-brand-dark">{item.count}</strong></div>)}</div></div> : <div className="grid h-56 place-items-center text-sm text-slate-400">Aucun utilisateur enregistré.</div>}</section>;
}

function CourseChart({ courses }) {
  const { translate } = useLanguage();
  const labels = { PUBLIEE: 'Publiée', CAMION_TROUVE: 'Camion trouvé', CHARGEMENT: 'Chargement', LIVRAISON: 'Livraison', SOLDE_REGLE: 'Terminée' };
  const data = courses.map((item) => ({ statut: translate(labels[item.statut] || item.statut), statusCode: item.statut, count: Number(item.count) }));
  const chartData = {
    labels: data.map((item) => item.statut),
    datasets: [{
      label: translate('Courses'),
      data: data.map((item) => item.count),
      backgroundColor: data.map((item) => (item.statusCode === 'SOLDE_REGLE' ? '#22A6A1' : '#FF6A3D')),
      borderRadius: 8,
      borderSkipped: false,
      maxBarThickness: 42,
    }],
  };

  return <section className="min-w-0 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-brand-dark">Courses par statut</h2><p className="mb-3 text-sm text-slate-500">Suivi global des opérations.</p>{data.length ? <div className="h-56 min-w-0"><Bar data={chartData} options={{ ...chartBaseOptions, plugins: { ...chartBaseOptions.plugins, legend: { display: false } }, scales: { x: { ...chartBaseOptions.scales.x, ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 0 } }, y: { ...chartBaseOptions.scales.y, beginAtZero: true } } }} /></div> : <div className="grid h-56 place-items-center text-sm text-slate-400">Aucune course enregistrée.</div>}</section>;
}

function MonthlyActivityChart({ users, courses, announcements }) {
  const { language, translate } = useLanguage();
  const courseCounts = new Map(courses.map((item) => [item.month, Number(item.count)]));
  const announcementCounts = new Map(announcements.map((item) => [item.month, Number(item.count)]));
  const data = users.map((item) => ({
    month: formatMonth(item.month, language === 'en' ? 'en-US' : 'fr-FR'),
    users: Number(item.count),
    courses: courseCounts.get(item.month) || 0,
    announcements: announcementCounts.get(item.month) || 0,
  }));
  const hasActivity = data.some((item) => item.users || item.courses || item.announcements);
  const chartData = {
    labels: data.map((item) => item.month),
    datasets: [
      { label: translate('Inscriptions'), data: data.map((item) => item.users), borderColor: '#2F80ED', backgroundColor: 'rgba(47,128,237,0.12)', fill: true, tension: 0.4, borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: '#ffffff', pointBorderWidth: 2 },
      { label: translate('Annonces'), data: data.map((item) => item.announcements), borderColor: '#FF6A3D', backgroundColor: 'rgba(255,106,61,0.1)', fill: true, tension: 0.4, borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: '#ffffff', pointBorderWidth: 2 },
      { label: translate('Courses'), data: data.map((item) => item.courses), borderColor: '#22A6A1', backgroundColor: 'rgba(34,166,161,0.1)', fill: true, tension: 0.4, borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: '#ffffff', pointBorderWidth: 2 },
    ],
  };

  return <section className="min-w-0 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-brand-dark">Activité mensuelle</h2><p className="mb-3 text-sm text-slate-500">Inscriptions, annonces et courses créées sur six mois.</p>{hasActivity ? <div className="h-60 min-w-0"><Line data={chartData} options={{ ...chartBaseOptions, plugins: { ...chartBaseOptions.plugins, legend: { display: true, position: 'top', labels: { usePointStyle: true, boxWidth: 7, boxHeight: 7, padding: 16, color: '#475569', font: { size: 11 } } }, tooltip: { ...chartBaseOptions.plugins.tooltip, mode: 'index', intersect: false } }, interaction: { intersect: false, mode: 'index' }, scales: { ...chartBaseOptions.scales, y: { ...chartBaseOptions.scales.y, beginAtZero: true } } }} /></div> : <ChartEmpty message="Aucune activité sur les six derniers mois." />}</section>;
}

function SupervisionStatusChart({ title, description, rows, labels, paymentBreakdown = false }) {
  const { translate } = useLanguage();
  const colors = { VALIDE: '#22A6A1', EN_ATTENTE: '#D5A02E', REFUSE: '#C2413B', SUSPENDU: '#64748B', PUBLIEE: '#2F80ED', CAMION_TROUVE: '#0f766e', CHARGEMENT: '#FF6A3D', LIVRAISON: '#8b5cf6', SOLDE_REGLE: '#15803d', LITIGE: '#C2413B' };
  const data = rows.map((row) => ({
    statut: `${paymentBreakdown ? `${translate(row.type === 'AVANCE' ? 'Avance' : 'Solde')} · ` : ''}${translate(labels[row.statut] || row.statut)}`,
    count: Number(row.count),
    color: colors[row.statut] || '#64748b',
  }));
  const total = data.reduce((sum, row) => sum + row.count, 0);
  const chartData = {
    labels: data.map((item) => item.statut),
    datasets: [{
      label: translate('Volume'),
      data: data.map((item) => item.count),
      backgroundColor: data.map((item) => item.color),
      borderRadius: 7,
      borderSkipped: false,
      maxBarThickness: 22,
    }],
  };

  return <section className="min-w-0 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-brand-dark">{title}</h2><p className="mb-3 text-sm text-slate-500">{description}</p>{total ? <div className="h-60 min-w-0"><Bar data={chartData} options={{ ...chartBaseOptions, indexAxis: 'y', plugins: { ...chartBaseOptions.plugins, legend: { display: false } }, scales: { x: { ...chartBaseOptions.scales.x, beginAtZero: true }, y: { ...chartBaseOptions.scales.y, beginAtZero: false, grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } } } }} /></div> : <ChartEmpty message="Aucune donnée disponible pour cette période." />}</section>;
}

function RevenueChart({ revenues }) {
  const { language, translate } = useLanguage();
  const numberLocale = language === 'en' ? 'en-US' : 'fr-FR';
  const data = revenues.map((item) => ({ month: formatMonth(item.month, numberLocale), value: Number(item.revenus) }));
  const hasRevenue = data.some((item) => item.value > 0);

  const chartData = {
    labels: data.map((item) => item.month),
    datasets: [{
      label: translate('Commission'),
      data: data.map((item) => item.value),
      backgroundColor: '#FF6A3D',
      borderRadius: 8,
      borderSkipped: false,
      maxBarThickness: 42,
    }],
  };

  return <section className="min-w-0 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-brand-dark">Commissions par mois de livraison</h2><p className="mb-3 text-sm text-slate-500">Commissions des courses soldées.</p>{hasRevenue ? <div className="h-60 min-w-0"><Bar data={chartData} options={{ ...chartBaseOptions, plugins: { ...chartBaseOptions.plugins, legend: { display: false }, tooltip: { ...chartBaseOptions.plugins.tooltip, callbacks: { label(context) { return `${Number(context.parsed.y).toLocaleString(numberLocale)} FCFA`; } } } }, scales: { ...chartBaseOptions.scales, y: { ...chartBaseOptions.scales.y, ticks: { callback: (value) => `${Number(value).toLocaleString(numberLocale)}` } } } }} /></div> : <ChartEmpty message="Aucune commission de course soldée sur cette période." />}</section>;
}

function FleetStatusChart({ trucks }) {
  const { language, translate } = useLanguage();
  const numberLocale = language === 'en' ? 'en-US' : 'fr-FR';
  const labels = { DISPONIBLE: 'Disponible', EN_MISSION: 'En mission', INDISPONIBLE: 'Indisponible' };
  const colors = { DISPONIBLE: '#22A6A1', EN_MISSION: '#2F80ED', INDISPONIBLE: '#C2413B' };
  const data = trucks.map((item) => ({ label: translate(labels[item.statut] || item.statut), value: Number(item.count), color: colors[item.statut] || '#64748B' }));
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const chartData = {
    labels: data.map((item) => item.label),
    datasets: [{
      data: data.map((item) => item.value),
      backgroundColor: data.map((item) => item.color),
      borderColor: '#ffffff',
      borderWidth: 2,
    }],
  };

  return <section className="min-w-0 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-brand-dark">État de la flotte</h2><p className="mb-3 text-sm text-slate-500">Répartition des camions enregistrés.</p>{total ? <div className="grid min-h-56 grid-cols-[minmax(120px,0.9fr)_minmax(130px,1.1fr)] items-center gap-3 sm:gap-5"><div className="relative h-52 min-w-0"><Doughnut data={chartData} options={{ responsive: true, maintainAspectRatio: false, cutout: '72%', radius: '94%', animation: { animateRotate: true, duration: 800 }, hoverOffset: 8, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#121C2D', padding: 10, cornerRadius: 8, callbacks: { label(context) { return `${context.label}: ${context.parsed.toLocaleString(numberLocale)}`; } } } } }} /><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-2xl font-bold leading-none text-[#121C2D]">{total.toLocaleString(numberLocale)}</span><span className="mt-1 text-[10px] font-medium uppercase text-slate-400">{translate('camions')}</span></div></div><div className="space-y-3">{data.map((item) => <div key={item.label} className="flex items-center justify-between gap-2 text-xs"><span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span><strong className="text-brand-dark">{item.value}</strong></div>)}</div></div> : <ChartEmpty message="Aucun camion enregistré." />}</section>;
}

function ChartEmpty({ message }) {
  return <div className="grid h-60 place-items-center text-center text-sm text-slate-400">{message}</div>;
}

function formatMonth(value, locale = 'fr-FR') {
  const [year, month] = String(value).split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(locale, { month: 'short' }).replace('.', '');
}

function formatDateTime(value, language) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function UsersPanel({ users, onRefresh }) {
  const { language } = useLanguage();
  const [statusMessage, setStatusMessage] = useState('');
  const [statusError, setStatusError] = useState('');
  const updateStatus = async (id, statut) => {
    setStatusMessage('');
    setStatusError('');
    try {
      const { data } = await api.put(`/api/admin/users/${id}/status`, { statut });
      setStatusMessage(data.notification_envoyee === null
        ? 'Statut mis à jour.'
        : data.notification_envoyee
          ? 'Statut mis à jour et e-mail envoyé à l’utilisateur.'
          : 'Statut mis à jour, mais l’e-mail n’a pas pu être envoyé. Vérifiez la configuration SMTP.');
      await onRefresh();
    } catch (error) {
      setStatusError(error.response?.data?.error || 'Impossible de modifier le statut de ce compte.');
    }
  };
  return <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"><div className="border-b border-gray-100 p-5"><h2 className="font-bold text-[#121C2D]">Comptes utilisateurs</h2><p className="text-sm text-slate-500">Validez ou suspendez un compte.</p></div>{statusMessage && <p role="status" className="mx-5 mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{statusMessage}</p>}{statusError && <p role="alert" className="mx-5 mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{statusError}</p>}<div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Utilisateur</th><th className="px-5 py-3">Rôle</th><th className="px-5 py-3">Ville</th><th className="px-5 py-3">Inscrit le</th><th className="px-5 py-3">Documents reçus le</th><th className="px-5 py-3">Statut</th><th className="px-5 py-3">Action</th></tr></thead><tbody className="divide-y divide-gray-100">{users.map((item) => <tr key={item.id}><td className="px-5 py-4"><p className="font-semibold text-[#121C2D]">{item.nom}</p><p className="text-xs text-slate-400">{item.email || item.telephone_whatsapp}</p></td><td className="px-5 py-4">{formatActorRole(item.role, language)}</td><td className="px-5 py-4">{item.ville}</td><td className="px-5 py-4 whitespace-nowrap">{formatDateTime(item.date_creation, language)}</td><td className="px-5 py-4 whitespace-nowrap">{formatDateTime(item.documents_submitted_at, language)}</td><td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{formatVerificationStatus(item.statut_verification, language)}</span></td><td className="px-5 py-4"><select value={item.statut_verification} onChange={(event) => updateStatus(item.id, event.target.value)} className="rounded border border-gray-200 px-2 py-1 text-xs"><option value="EN_ATTENTE">{formatVerificationStatus('EN_ATTENTE', language)}</option><option value="VALIDE">{formatVerificationStatus('VALIDE', language)}</option><option value="REFUSE">{formatVerificationStatus('REFUSE', language)}</option><option value="SUSPENDU">{formatVerificationStatus('SUSPENDU', language)}</option></select></td></tr>)}</tbody></table></div></div>;
}

function DocumentsPanel({ documents, users, selectedUserId, onRefresh }) {
  const { language, translate } = useLanguage();
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [documentToDelete, setDocumentToDelete] = useState(null);
  const [pendingDocumentStatus, setPendingDocumentStatus] = useState(null);
  const [refusalReason, setRefusalReason] = useState('');
  const [documentActionError, setDocumentActionError] = useState('');
  const [documentActionMessage, setDocumentActionMessage] = useState('');
  const [deletingDocument, setDeletingDocument] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('TOUS');
  const [statusFilter, setStatusFilter] = useState('TOUS');
  const [updatingId, setUpdatingId] = useState(null);
  const documentUrl = (path) => /^https?:\/\//i.test(path)
    ? path
    : new URL(path, `${window.location.origin}/`).toString();
  
  const removeDocument = (document) => {
    setDocumentActionError('');
    setSelectedDocument(null);
    setDocumentToDelete(document);
  };

  const confirmRemoveDocument = async () => {
    if (!documentToDelete) return;
    setDeletingDocument(true);
    try {
      await api.delete(`/api/documents/${documentToDelete.id}`);
      setDocumentToDelete(null);
      setSelectedDocument(null);
      await onRefresh();
    } catch (error) {
      setDocumentActionError(error.response?.data?.error || 'Impossible de supprimer le document.');
    } finally {
      setDeletingDocument(false);
    }
  };
  
  const updateDocumentStatus = (document, statut) => {
    setDocumentActionError('');
    setDocumentActionMessage('');
    setRefusalReason('');
    setPendingDocumentStatus({ document, statut });
  };

  const confirmDocumentStatus = async () => {
    if (!pendingDocumentStatus) return;
    if (pendingDocumentStatus.statut === 'REFUSE' && !refusalReason.trim()) {
      setDocumentActionError('Veuillez indiquer le motif du refus.');
      return;
    }
    const { document, statut } = pendingDocumentStatus;
    setUpdatingId(document.id);
    try {
      const { data } = await api.put(`/api/documents/${document.id}/validate`, { statut, motif: refusalReason.trim() || undefined });
      if (data.compte_statut_mis_a_jour) {
        setDocumentActionMessage(data.statut_compte === 'VALIDE'
          ? data.email_envoye
            ? 'Dossier complet : compte validé et e-mail de confirmation envoyé.'
            : 'Dossier complet : compte validé, mais l’e-mail de confirmation n’a pas pu être envoyé.'
          : 'Document refusé : compte replacé en attente de validation.');
      } else if (statut === 'REFUSE') {
        setDocumentActionMessage(data.email_envoye
          ? 'Document refusé et e-mail envoyé à l’utilisateur.'
          : 'Document refusé, mais l’e-mail n’a pas pu être envoyé.');
      }
      setPendingDocumentStatus(null);
      await onRefresh();
    } catch (error) {
      setDocumentActionError(error.response?.data?.error || 'Impossible de mettre à jour le document.');
    } finally {
      setUpdatingId(null);
    }
  };
  const normalizedSearch = search.trim().toLowerCase();
  const filteredDocuments = documents.filter((item) => {
    const matchesSearch = !normalizedSearch || [item.utilisateur_nom, item.email, item.telephone_whatsapp, item.type_document, item.camion_plaque].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    const matchesRole = roleFilter === 'TOUS' || item.role === roleFilter;
    const matchesStatus = statusFilter === 'TOUS' || item.statut === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });
  const lastDocumentDateByUser = new Map();
  documents.forEach((item) => {
    const currentDate = item.date_ajout ? new Date(item.date_ajout).getTime() : 0;
    const latestDate = lastDocumentDateByUser.has(String(item.utilisateur_id))
      ? new Date(lastDocumentDateByUser.get(String(item.utilisateur_id))).getTime()
      : 0;
    if (currentDate > latestDate) lastDocumentDateByUser.set(String(item.utilisateur_id), item.date_ajout);
  });
  const groupedUsers = Object.values(filteredDocuments.reduce((groups, item) => {
    const key = item.utilisateur_id;
    if (!groups[key]) groups[key] = {
      id: key,
      nom: item.utilisateur_nom,
      email: item.email,
      role: item.role,
      lastDocumentDate: lastDocumentDateByUser.get(String(item.utilisateur_id)) || null,
      documents: [],
    };
    groups[key].documents.push(item);
    return groups;
  }, {}));
  const actorRoles = new Set(['TRANSPORTEUR', 'CHARGEUR', 'ENTREPRISE', 'CHAUFFEUR']);
  const submittedTypesByUser = documents.reduce((typesByUser, item) => {
    const userId = String(item.utilisateur_id);
    if (!typesByUser.has(userId)) typesByUser.set(userId, new Set());
    typesByUser.get(userId).add(item.type_document);
    return typesByUser;
  }, new Map());
  const usersWithMissingDocuments = users.map((item) => {
    const requiredTypes = requiredDocumentTypesByRole[item.role] || [];
    const submittedTypes = submittedTypesByUser.get(String(item.id)) || new Set();
    const missingTypes = requiredTypes.filter((type) => !submittedTypes.has(type));
    const matchesSearch = !normalizedSearch || [item.nom, item.email, item.telephone_whatsapp].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    const matchesRole = roleFilter === 'TOUS' || item.role === roleFilter;
    return {
      ...item,
      missingTypes,
      lastDocumentDate: lastDocumentDateByUser.get(String(item.id)) || null,
      hasDocuments: submittedTypes.size > 0,
      matchesSearch,
      matchesRole,
    };
  }).filter((item) => actorRoles.has(item.role)
    && item.missingTypes.length > 0
    && item.hasDocuments
    && item.matchesRole
    && item.matchesSearch);

  const actorCards = [
    { role: 'TRANSPORTEUR', sourceLabel: 'Transporteurs', icon: Truck },
    { role: 'CHARGEUR', sourceLabel: 'Chargeurs', icon: Users },
    { role: 'ENTREPRISE', sourceLabel: 'Entreprises', icon: ShieldCheck },
    { role: 'CHAUFFEUR', sourceLabel: 'Chauffeurs', icon: FileCheck2 },
  ].map((actor) => ({
    ...actor,
    label: translate(actor.sourceLabel),
    total: documents.filter((item) => item.role === actor.role).length,
    pending: documents.filter((item) => item.role === actor.role && item.statut === 'EN_ATTENTE').length,
    users: new Set(documents.filter((item) => item.role === actor.role).map((item) => item.utilisateur_id)).size,
  }));
  const actorCardStyles = { neutral: 'border-slate-200 bg-white/80 text-[#121C2D] backdrop-blur-sm hover:border-orange-200 hover:bg-white' };

  const userTable = <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[1040px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Acteur</th><th className="px-5 py-3">Rôle</th><th className="px-5 py-3">E-mail</th><th className="px-5 py-3">{language === 'en' ? 'Last document submitted / updated' : 'Dernier document transmis / mis à jour'}</th><th className="px-5 py-3">Documents</th><th className="px-5 py-3">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{groupedUsers.map((group) => <tr key={group.id}><td className="px-5 py-4 font-bold text-[#121C2D]">{group.nom}</td><td className="px-5 py-4">{formatActorRole(group.role, language)}</td><td className="px-5 py-4 text-slate-500">{group.email || (language === 'en' ? 'Email not provided' : 'E-mail non renseigné')}</td><td className="whitespace-nowrap px-5 py-4">{formatDateTime(group.lastDocumentDate, language)}</td><td className="px-5 py-4">{group.documents.length}</td><td className="px-5 py-4"><Link to={`/admin/documents?userId=${group.id}`} className="inline-flex items-center gap-2 rounded-lg border border-[#0f766e] px-3 py-2 text-xs font-bold text-[#0f766e] hover:bg-teal-50"><FileCheck2 size={14} /> Voir les documents</Link></td></tr>)}</tbody></table></div></div>;
  const documentGrid = groupedUsers.flatMap((group) => group.documents).map((item) => <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-200 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="rounded-lg bg-teal-50 p-2 text-[#0f766e]"><FileCheck2 size={19} /></div><div className="min-w-0"><h2 className="truncate font-bold text-[#123b4a]">{formatDocumentType(item.type_document, language)}</h2><p className="truncate text-sm text-slate-500">{item.utilisateur_nom} · {formatActorRole(item.role, language)}</p><p className="text-xs text-slate-500">{language === 'en' ? 'Submitted / updated on' : 'Transmis / mis à jour le'} {formatDateTime(item.date_ajout, language)}</p>{item.camion_plaque && <p className="text-xs font-semibold text-slate-600">{language === 'en' ? 'Truck' : 'Camion'} : {item.camion_plaque}</p>}</div></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${item.statut === 'VALIDE' ? 'bg-emerald-50 text-emerald-700' : item.statut === 'REFUSE' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{formatDocumentStatus(item.statut, language)}</span></div>{item.statut === 'REFUSE' && item.motif_refus && <div className="mt-3 rounded-lg border-l-4 border-rose-500 bg-rose-50 p-3 text-sm text-rose-900"><strong>Motif du refus</strong><p className="mt-1">{item.motif_refus}</p></div>}<div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={() => setSelectedDocument({ ...item, url: documentUrl(item.fichier_url) })} className="rounded-lg bg-[#123b4a] px-3 py-2 text-xs font-bold text-white hover:bg-[#0f2f3b]">Visualiser</button>{item.statut === 'EN_ATTENTE' && <><button type="button" disabled={updatingId === item.id} onClick={() => updateDocumentStatus(item, 'VALIDE')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Approuver</button><button type="button" disabled={updatingId === item.id} onClick={() => updateDocumentStatus(item, 'REFUSE')} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600">Refuser</button></>}<button type="button" onClick={() => removeDocument(item)} className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`${language === 'en' ? 'Delete' : 'Supprimer'} ${formatDocumentType(item.type_document, language)}`}><Trash2 size={16} /></button></div></article>);
  const emptyState = <EmptyPanel icon={FileCheck2} text={documents.length ? 'Aucun résultat pour ces filtres.' : 'Aucun document transmis.'} />;

  return (<>
    {documentActionMessage && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{documentActionMessage}</p>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {actorCards.map(({ role, label, icon: Icon, total, pending, users }) => <button type="button" key={role} onClick={() => setRoleFilter(role)} className={`rounded-xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${actorCardStyles.neutral} ${roleFilter === role ? 'ring-2 ring-[#FF6A3D] ring-offset-2 ring-offset-slate-50' : ''}`}><div className="flex items-start justify-between"><div><p className="text-sm font-bold">{label}</p><p className="mt-2 text-3xl font-black">{users}</p><p className="text-xs text-slate-500">{language === 'en' ? `${users} ${users === 1 ? 'user' : 'users'} with documents` : `${users} acteur${users > 1 ? 's' : ''} avec documents`}</p></div><Icon size={24} className="text-[#FF6A3D]" /></div><div className="mt-4 flex justify-between border-t border-slate-200 pt-3 text-xs font-semibold text-slate-600"><span>{total} {language === 'en' ? `document${total === 1 ? '' : 's'}` : `document${total > 1 ? 's' : ''}`}</span><span>{pending} {language === 'en' ? 'pending' : 'en attente'}</span></div></button>)}
    </div>
    {!selectedUserId && <div className="mb-6 grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_auto_auto]"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={translate('Rechercher un utilisateur, un e-mail ou un document...')} className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#0f766e]" /><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-semibold text-slate-600"><option value="TOUS">{translate('Tous')}</option><option value="TRANSPORTEUR">{formatActorRole('TRANSPORTEUR', language)}</option><option value="CHARGEUR">{formatActorRole('CHARGEUR', language)}</option><option value="ENTREPRISE">{formatActorRole('ENTREPRISE', language)}</option><option value="CHAUFFEUR">{formatActorRole('CHAUFFEUR', language)}</option></select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-semibold text-slate-600"><option value="TOUS">{translate('Tous')}</option><option value="EN_ATTENTE">{formatDocumentStatus('EN_ATTENTE', language)}</option><option value="VALIDE">{formatDocumentStatus('VALIDE', language)}</option><option value="REFUSE">{formatDocumentStatus('REFUSE', language)}</option></select></div>}
    <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold text-[#123b4a]">{roleFilter === 'TOUS' ? 'Tous les acteurs' : actorCards.find((actor) => actor.role === roleFilter)?.label}</h2><p className="text-sm text-slate-500">{selectedUserId ? 'Documents de l’acteur sélectionné.' : 'Sélectionnez un acteur pour consulter son dossier.'}</p></div>{selectedUserId ? <Link to="/admin/documents" className="inline-flex items-center gap-2 rounded-lg border border-[#0f766e] px-3 py-2 text-sm font-bold text-[#0f766e] hover:bg-teal-50"><ArrowLeft size={16} /> Retour à la liste</Link> : roleFilter !== 'TOUS' && <button type="button" onClick={() => setRoleFilter('TOUS')} className="text-sm font-bold text-[#0f766e] hover:underline">Voir tous</button>}</div>
    <div className={selectedUserId ? 'grid gap-4 md:grid-cols-2' : ''}>{groupedUsers.length ? (selectedUserId ? documentGrid : userTable) : emptyState}</div>
    {!selectedUserId && usersWithMissingDocuments.length > 0 && <section className="mt-6 overflow-hidden rounded-xl border border-amber-200 bg-white">
      <div className="border-b border-amber-100 bg-amber-50 p-4">
        <h2 className="font-bold text-amber-900">Dossiers partiels à compléter</h2>
        <p className="mt-1 text-sm text-amber-800">Les acteurs qui ont commencé le dépôt sans le terminer sont listés ici. Ils ne peuvent pas être approuvés avant l’envoi de toutes les pièces obligatoires.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Acteur</th><th className="px-5 py-3">Rôle</th><th className="px-5 py-3">E-mail</th><th className="px-5 py-3">Dernier document transmis / mis à jour</th><th className="px-5 py-3">Documents manquants</th><th className="px-5 py-3">Action</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {usersWithMissingDocuments.map((item) => <tr key={item.id}>
              <td className="px-5 py-3 font-semibold text-[#121C2D]">{item.nom}</td>
              <td className="px-5 py-3">{formatActorRole(item.role, language)}</td>
              <td className="px-5 py-3 text-slate-500">{item.email || '—'}</td>
              <td className="whitespace-nowrap px-5 py-3">{formatDateTime(item.lastDocumentDate, language)}</td>
              <td className="px-5 py-3 text-amber-800">{item.missingTypes.map((type) => formatDocumentType(type, language)).join(', ')}</td>
              <td className="px-5 py-3"><Link to={`/admin/documents?userId=${item.id}`} className="font-bold text-[#0f766e] hover:underline">Ouvrir le dossier</Link></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>}
    {selectedDocument && <DocumentPreview document={selectedDocument} onClose={() => setSelectedDocument(null)} onDelete={() => removeDocument(selectedDocument)} />}
    <ConfirmDialog
      open={Boolean(documentToDelete)}
      title="Supprimer ce document ?"
      message={documentToDelete ? language === 'en' ? `${formatDocumentType(documentToDelete.type_document, language)} belonging to ${documentToDelete.utilisateur_nom} will be permanently deleted.` : `Le document « ${formatDocumentType(documentToDelete.type_document, language)} » de ${documentToDelete.utilisateur_nom} sera supprimé définitivement.` : ''}
      confirmLabel="Supprimer le document"
      busy={deletingDocument}
      errorMessage={documentActionError}
      onCancel={() => { setDocumentToDelete(null); setDocumentActionError(''); }}
      onConfirm={confirmRemoveDocument}
    />
    <ConfirmDialog
      open={Boolean(pendingDocumentStatus)}
      title={pendingDocumentStatus?.statut === 'REFUSE' ? 'Refuser ce document ?' : 'Approuver ce document ?'}
      message={pendingDocumentStatus ? `${formatDocumentType(pendingDocumentStatus.document.type_document, language)} · ${pendingDocumentStatus.document.utilisateur_nom}` : ''}
      confirmLabel={pendingDocumentStatus?.statut === 'REFUSE' ? 'Confirmer le refus' : 'Approuver le document'}
      tone={pendingDocumentStatus?.statut === 'REFUSE' ? 'danger' : 'neutral'}
      inputLabel={pendingDocumentStatus?.statut === 'REFUSE' ? 'Motif du refus' : undefined}
      inputValue={refusalReason}
      inputPlaceholder="Expliquez les corrections attendues..."
      onInputChange={setRefusalReason}
      busy={Boolean(pendingDocumentStatus && updatingId === pendingDocumentStatus.document.id)}
      errorMessage={documentActionError}
      onCancel={() => { setPendingDocumentStatus(null); setDocumentActionError(''); }}
      onConfirm={confirmDocumentStatus}
    />
  </>);
}

function DocumentPreview({ document, onClose, onDelete }) {
  const { language } = useLanguage();
  const documentType = formatDocumentType(document.type_document, language);
  const isImage = /\.(jpg|jpeg|png|webp)$/i.test(document.fichier_url || '');
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#121C2D]/70 p-4" role="dialog" aria-modal="true" aria-label={`${language === 'en' ? 'Preview' : 'Prévisualisation'} ${documentType}`}><div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-gray-100 px-5 py-4"><div><h2 className="font-bold text-[#123b4a]">{documentType}</h2><p className="text-sm text-slate-500">{document.utilisateur_nom}</p></div><div className="flex items-center gap-2"><button type="button" onClick={onDelete} className="rounded-lg px-3 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50">Supprimer</button><button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Fermer">×</button></div></div><div className="flex min-h-[60vh] items-center justify-center bg-slate-100 p-4">{isImage ? <img src={document.url} alt={documentType} className="max-h-[68vh] max-w-full object-contain" /> : <iframe title={documentType} src={document.url} className="h-[68vh] w-full rounded-lg bg-white" />}</div></div></div>;
}

function StatCard({ icon: Icon, label, value, accent }) { return <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm text-slate-500">{label}</p><Icon size={20} className={accent ? 'text-[#FF6A3D]' : 'text-slate-400'} /></div><p className={`mt-3 text-2xl font-bold ${accent ? 'text-[#FF6A3D]' : 'text-[#121C2D]'}`}>{value}</p></div>; }
function QuickLink({ href, icon: Icon, label }) { return <a href={href} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 text-sm font-semibold text-[#121C2D] hover:border-[#FF6A3D] hover:text-[#FF6A3D]"><Icon size={17} />{label}</a>; }
function EmptyPanel({ icon: Icon, text }) { return <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center"><Icon size={32} className="mx-auto text-slate-300" /><p className="mt-3 text-sm text-slate-500">{text}</p></div>; }
