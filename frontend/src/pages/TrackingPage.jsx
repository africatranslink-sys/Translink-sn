import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Clock3, MapPin, Truck, Users } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import RouteMap from '../components/RouteMap';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/useLanguage';
import { API_BASE_URL } from '../utils/apiBaseUrl';

const SOCKET_URL = API_BASE_URL;
const route = [[-17.4677, 14.7167], [-16.0728, 14.1514], [-14.4524, 13.7707], [-12.6392, 12.6392], [-8.0029, 12.6392]];

function sameVehiclePositions(current, next) {
  if (current.length !== next.length) return false;

  const signature = (vehicles) => JSON.stringify(vehicles.map((vehicle) => ({
    id: String(vehicle.id ?? vehicle.busId ?? vehicle.immatriculation ?? vehicle.courseId ?? ''),
    courseId: vehicle.courseId,
    coordinates: vehicle.coordinates ?? [vehicle.lng ?? vehicle.longitude, vehicle.lat ?? vehicle.latitude],
    route: vehicle.route,
    name: vehicle.name,
    status: vehicle.status,
    origin: vehicle.origin,
    destination: vehicle.destination,
  })).sort((left, right) => left.id.localeCompare(right.id)));

  return signature(current) === signature(next);
}

export default function TrackingPage({ actor = 'chargeur' }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [vehicles, setVehicles] = useState([]);
  const myPosition = null;
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const isTransporteur = actor === 'transporteur';
  const isAdmin = actor === 'admin';
  const safeVehicles = Array.isArray(vehicles) ? vehicles : [];
  const fleetRoutes = safeVehicles.map((vehicle) => vehicle.route).filter((vehicleRoute) => Array.isArray(vehicleRoute) && vehicleRoute.length > 1);
  const isChauffeur = actor === 'chauffeur';
  const hasLiveGps = safeVehicles.some((vehicle) => vehicle.courseId != null);


  useEffect(() => {
    if (!isAdmin || !SOCKET_URL) return undefined;
    const token = localStorage.getItem('token');
    if (!token) return undefined;

    const socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket'], reconnection: true });

    socket.on('connect', () => {
      socket.emit('joinTracking');
    });

    socket.on('positionBus', (payload) => {
      if (!payload || typeof payload !== 'object') return;

      const lat = Number(payload.lat ?? payload.latitude);
      const lng = Number(payload.lng ?? payload.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const liveVehicle = {
        id: payload.id ?? payload.busId ?? payload.immatriculation ?? 'truck-gps',
        courseId: payload.courseId,
        name: payload.name ?? payload.immatriculation ?? 'Camion GPS',
        driver: payload.driver ?? 'Chauffeur',
        status: payload.status ?? 'En transit',
        coordinates: [lng, lat],
        progress: payload.progress ?? 55,
        origin: payload.origin ?? 'Dakar',
        destination: payload.destination ?? 'Bamako'
      };

      setVehicles((prev) => {
        const next = [...prev];
        const index = next.findIndex((vehicle) => vehicle.id === liveVehicle.id);
        if (index >= 0) {
          next[index] = { ...next[index], ...liveVehicle };
          return next;
        }
        return [...next, liveVehicle];
      });
    });

    socket.on('positionBusRemoved', ({ courseId } = {}) => {
      if (courseId == null) return;
      setVehicles((prev) => prev.filter((vehicle) => String(vehicle.courseId) !== String(courseId)));
    });

    return () => {
      socket.emit('leaveTracking');
      socket.disconnect();
    };
  }, [isAdmin]);

  useEffect(() => {
    let active = true;
    const loadPositions = async () => {
      try {
        if (isTransporteur) {
          const response = await api.get('/api/annonces/positions/miennes');
          if (active && Array.isArray(response.data)) setVehicles((current) => sameVehiclePositions(current, response.data) ? current : response.data);
        } else if (isChauffeur) {
          const [courseResponse, routeResponse] = await Promise.all([
            api.get('/api/courses/positions'),
            api.get('/api/annonces/positions/miennes')
          ]);
          const liveVehicles = Array.isArray(courseResponse.data) ? courseResponse.data : [];
          const liveTruckIds = new Set(liveVehicles.map((vehicle) => String(vehicle.vehicleId ?? vehicle.busId ?? vehicle.id ?? '')));
          const plannedRoutes = (Array.isArray(routeResponse.data) ? routeResponse.data : []).filter((vehicle) => !liveTruckIds.has(String(vehicle.camion_id)));
          const nextVehicles = [...liveVehicles, ...plannedRoutes];
          if (active) setVehicles((current) => sameVehiclePositions(current, nextVehicles) ? current : nextVehicles);
        } else {
          const response = await api.get('/api/courses/positions');
          if (active && Array.isArray(response.data)) setVehicles((current) => sameVehiclePositions(current, response.data) ? current : response.data);
        }
      } catch {
        // Keep the last known positions if a refresh temporarily fails.
      } finally {
        if (active) setLastUpdate(new Date());
      }
    };
    loadPositions();
    const timer = window.setInterval(loadPositions, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [isAdmin, isTransporteur, isChauffeur]);

  const averageProgress = Math.round(safeVehicles.reduce((sum, vehicle) => sum + (Number(vehicle.progress) || 0), 0) / Math.max(safeVehicles.length, 1));
  const title = isAdmin ? 'Supervision de la flotte' : isTransporteur ? 'Mon suivi flotte' : isChauffeur ? 'Ma position en temps réel' : 'Suivi en temps réel';

  return <DashboardLayout user={user}><div className="space-y-6"><header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0f766e]">Afrique de l’Ouest · {isTransporteur || (isChauffeur && !hasLiveGps) ? 'Trajets déclarés' : 'GPS actif'}</p><h1 className="mt-2 text-3xl font-bold text-[#123b4a]">{title}</h1><p className="mt-1 text-slate-500">{isTransporteur || (isChauffeur && !hasLiveGps) ? 'Les itinéraires actifs sont affichés camion par camion.' : 'Positions actualisées automatiquement toutes les 15 secondes.'}</p></div><div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-500 shadow-sm"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Mis à jour à {lastUpdate.toLocaleTimeString(language === 'en' ? 'en-US' : 'fr-FR')}</div></header><div className={`grid gap-4 ${isTransporteur ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}><Metric label={isTransporteur ? 'Camions avec itinéraire' : isChauffeur ? 'Mon Camion' : 'Livraisons en cours'} value={isTransporteur ? fleetRoutes.length : safeVehicles.length} icon={Truck} /><Metric label={isTransporteur ? 'Disponibilités actives' : 'Actifs maintenant'} value={safeVehicles.length} icon={MapPin} accent />{!isTransporteur && <Metric label="Progression moyenne" value={`${averageProgress}%`} icon={Clock3} />}</div><div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]"><section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-[#123b4a]">{isAdmin ? 'Carte de supervision' : isTransporteur || isChauffeur ? 'Itinéraires par camion' : 'Corridor Dakar - Bamako'}</h2><p className="text-sm text-slate-500">{isTransporteur || (isChauffeur && !hasLiveGps) ? 'Trajets de disponibilité enregistrés pour chaque véhicule.' : 'Positions réelles des véhicules connectés'}</p></div><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-[#c2410c]">{isTransporteur || (isChauffeur && !hasLiveGps) ? `${fleetRoutes.length} trajet${fleetRoutes.length > 1 ? 's' : ''}` : 'GPS actif'}</span></div><RouteMap vehicles={safeVehicles} route={isAdmin || isTransporteur || isChauffeur ? [] : route} routes={isTransporteur || isChauffeur ? fleetRoutes : []} myPosition={myPosition} className="h-[520px]" /></section><section className="space-y-3"><div className="flex items-center justify-between"><div><h2 className="font-bold text-[#123b4a]">{isAdmin ? 'Camions connectés' : isTransporteur ? 'Ma flotte' : isChauffeur ? 'Mon Trajet' : 'Mes livraisons'}</h2><p className="text-sm text-slate-500">Détails opérationnels</p></div><Users size={19} className="text-slate-400" /></div>{safeVehicles.length ? safeVehicles.map((vehicle) => <VehicleCard key={vehicle.id ?? vehicle.courseId} vehicle={vehicle} />) : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">{isTransporteur ? 'Aucune disponibilité publiée pour vos camions.' : 'Aucun véhicule actif pour le moment.'}</div>}</section></div></div></DashboardLayout>;
}

function Metric({ label, value, icon: Icon, accent }) { return <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm text-slate-500">{label}</p><Icon size={19} className={accent ? 'text-[#0f766e]' : 'text-slate-400'} /></div><p className={`mt-2 text-2xl font-bold ${accent ? 'text-[#0f766e]' : 'text-[#123b4a]'}`}>{value}</p></div>; }
function VehicleCard({ vehicle }) {
  const progress = Math.max(0, Math.min(100, Number(vehicle.progress) || 0));
  if (vehicle.route?.length > 1) return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-[#123b4a]">{vehicle.name ?? 'Camion sans nom'}</h3><p className="mt-1 text-xs text-slate-500">{vehicle.origin} → {vehicle.destination}</p><p className="mt-1 text-xs text-slate-400">{vehicle.type_vehicule} · {vehicle.capacite_tonnes} t</p></div><span className="rounded-md bg-orange-50 px-2 py-1 text-[11px] font-bold text-[#c2410c]">{vehicle.status}</span></div></article>;
  return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-[#123b4a]">{vehicle.name ?? 'Camion sans nom'}</h3><p className="mt-1 text-xs text-slate-500">{vehicle.origin ?? 'Origine inconnue'} → {vehicle.destination ?? 'Destination inconnue'} · {vehicle.id ?? 'ID absent'}</p></div><span className={`rounded-md px-2 py-1 text-[11px] font-bold ${vehicle.status === 'Livré' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{vehicle.status ?? 'En attente'}</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0f766e]" style={{ width: `${progress}%` }} /></div><div className="mt-2 flex justify-between text-xs text-slate-500"><span>Conducteur : {vehicle.driver ?? 'Chauffeur non assigné'}</span><strong>{progress}%</strong></div></article>;
}
