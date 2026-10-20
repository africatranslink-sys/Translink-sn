import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, Cpu, Database, HardDrive, RefreshCw, Server } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { ADMIN_SIDEBAR_ITEMS } from '../utils/adminNavigation';
import api from '../utils/api';

const formatBytes = (bytes) => {
  if (!Number.isFinite(Number(bytes))) return '—';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let value = Number(bytes);
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${units[unitIndex]}`;
};

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds)) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [days ? `${days} j` : '', `${hours} h`, `${minutes} min`].filter(Boolean).join(' ');
};

function StatusBadge({ status }) {
  const available = ['healthy', 'available', 'running'].includes(status);
  const label = status === 'healthy' || status === 'running'
    ? 'Opérationnel'
    : status === 'available'
      ? 'Connectée'
      : status === 'unhealthy'
        ? 'Réponse anormale'
        : status === 'degraded'
          ? 'Dégradé'
          : 'Indisponible';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${available ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{label}</span>;
}

function MetricCard({ icon: Icon, label, value, detail, status }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-sm font-semibold text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-[#121C2D]">{value}</p>{detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}</div>
      {status ? <StatusBadge status={status} /> : <span className="rounded-lg bg-orange-50 p-2 text-[#FF6A3D]"><Icon size={20} /></span>}
    </div>
  </article>;
}

export default function AdminSystemPage() {
  const { user } = useAuth();
  const [overview, setOverview] = useState(null);
  const [overviewError, setOverviewError] = useState('');
  const [selectedService, setSelectedService] = useState('auth');
  const [logsServiceKeyLoaded, setLogsServiceKeyLoaded] = useState(null);
  const [logs, setLogs] = useState('');
  const [logsError, setLogsError] = useState('');

  const loadOverview = useCallback(async () => {
    try {
      const { data } = await api.get('/api/admin/system/overview');
      setOverview(data);
      setOverviewError('');
    } catch (error) {
      setOverviewError(error.response?.data?.error || 'Impossible de récupérer les métriques du serveur.');
    }
  }, []);

  const loadLogs = useCallback(async (serviceKey) => {
    try {
      const { data } = await api.get('/api/admin/system/logs', { params: { service: serviceKey } });
      setLogs(data.logs);
    } catch (error) {
      setLogs('');
      setLogsError(error.response?.data?.error || 'Impossible de charger les journaux du service.');
    } finally {
      setLogsServiceKeyLoaded(serviceKey);
    }
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(loadOverview, 0);
    const refresh = window.setInterval(loadOverview, 15_000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(refresh);
    };
  }, [loadOverview]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => loadLogs(selectedService), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadLogs, selectedService]);

  const memory = overview?.host?.memory;
  const cpu = overview?.host?.cpu;
  const database = overview?.database;
  const disk = overview?.host?.disk;
  const isLoading = !overview && !overviewError;
  const logsLoading = logsServiceKeyLoaded !== selectedService;

  return <DashboardLayout sidebarItems={ADMIN_SIDEBAR_ITEMS} user={user}>
    <main className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-widest text-[#FF6A3D]">Administration Translink-Africa</p><h1 className="mt-2 text-3xl font-bold text-[#121C2D]">État du serveur</h1><p className="mt-1 text-slate-500">Services applicatifs, ressources de l’hôte, base de données et journaux récents.</p></div>
        <button type="button" onClick={() => { setLogsError(''); loadOverview(); loadLogs(selectedService); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-[#121C2D] hover:border-[#FF6A3D]"><RefreshCw size={16} /> Actualiser</button>
      </header>

      {overviewError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{overviewError}</div>}
      {isLoading ? <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">Chargement des métriques...</div> : overview && <>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Server} label="État global" value={<StatusBadge status={overview.status} />} detail={`Dernière mesure : ${new Date(overview.captured_at).toLocaleTimeString('fr-FR')}`} />
          <MetricCard icon={Cpu} label="Utilisation CPU" value={cpu?.usage_percent == null ? 'Mesure en cours' : `${cpu.usage_percent} %`} detail={`${cpu?.cores ?? '—'} cœurs · ${cpu?.model || 'Modèle non renseigné'}`} />
          <MetricCard icon={Activity} label="Mémoire utilisée" value={memory ? `${memory.usage_percent} %` : '—'} detail={memory ? `${formatBytes(memory.used_bytes)} utilisés sur ${formatBytes(memory.total_bytes)}` : 'Données mémoire indisponibles'} />
          <MetricCard icon={HardDrive} label="Disque système" value={disk?.status === 'available' ? `${Math.round((1 - disk.free_bytes / disk.total_bytes) * 100)} % utilisé` : 'Indisponible'} detail={disk?.status === 'available' ? `${formatBytes(disk.free_bytes)} libres sur ${formatBytes(disk.total_bytes)}` : disk?.error} />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><Server size={19} className="text-[#FF6A3D]" /><h2 className="font-bold text-[#121C2D]">Services Translink</h2></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{overview.services.map((service) => <article key={service.key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 p-4"><div><p className="font-semibold text-slate-800">{service.label}</p><p className="mt-1 text-xs text-slate-500">{service.http_status ? `HTTP ${service.http_status}` : 'Vérification locale'}</p></div><StatusBadge status={service.status} /></article>)}</div>
          <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-sm text-slate-600 sm:grid-cols-2"><p>Hôte : <strong className="text-slate-800">{overview.host.hostname}</strong> · {overview.host.platform} {overview.host.release}</p><p>Disponibilité : <strong className="text-slate-800">{formatDuration(overview.host.uptime_seconds)}</strong></p><p>Charge moyenne (1/5/15 min) : <strong className="text-slate-800">{overview.host.load_average.map((value) => Number(value).toFixed(2)).join(' / ')}</strong></p><p>Processus Node : <strong className="text-slate-800">{formatDuration(overview.host.process.uptime_seconds)}</strong> · RAM {formatBytes(overview.host.process.memory_rss_bytes)}</p></div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><Database size={19} className="text-[#FF6A3D]" /><h2 className="font-bold text-[#121C2D]">Base de données PostgreSQL</h2><div className="ml-auto"><StatusBadge status={database?.status} /></div></div>
          {database?.status === 'available' ? <div className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4"><p>Base : <strong>{database.name}</strong></p><p>Version : <strong>{database.version}</strong></p><p>Taille : <strong>{formatBytes(database.size_bytes)}</strong></p><p>Connexions actives : <strong>{database.active_connections}</strong></p><p>Latence : <strong>{database.latency_ms} ms</strong></p><p>Pool service : <strong>{database.pool.total} total · {database.pool.idle} libres · {database.pool.waiting} en attente</strong></p></div> : <p className="text-sm text-rose-700">{database?.error || 'État PostgreSQL indisponible.'}</p>}
        </section>
      </>}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div><h2 className="font-bold text-[#121C2D]">Journaux des services</h2><p className="mt-1 text-sm text-slate-500">100 dernières lignes de journaux systemd du service sélectionné.</p></div>
          <select aria-label="Service à consulter" value={selectedService} onChange={(event) => { setLogsError(''); setSelectedService(event.target.value); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <option value="gateway">Passerelle API</option><option value="auth">Authentification</option><option value="annonce">Annonces et camions</option><option value="course">Courses et paiements</option>
          </select>
        </div>
        {logsError && <div role="alert" className="m-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle size={16} className="mr-2 inline" />{logsError}</div>}
        <div className="max-h-[34rem] min-h-48 overflow-auto bg-[#101827] p-4">
          {logsLoading ? <p className="text-sm text-slate-300">Chargement des journaux...</p> : logs ? <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-100">{logs}</pre> : !logsError && <p className="text-sm text-slate-400">Aucune ligne de journal récente.</p>}
        </div>
      </section>
    </main>
  </DashboardLayout>;
}
