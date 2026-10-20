import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { FileText, Search, History, Upload, MessageCircle, RefreshCw, MapPin, ArrowLeftRight, ArrowDownUp, ArrowLeft, CheckCircle2, X, Truck, CalendarDays, Package, Send } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import ConfirmDialog from '../components/ConfirmDialog';
import DemandLocationMap from '../components/DemandLocationMap';
import KkiapayPayButton from '../components/KkiapayPayButton';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../utils/api';
import { useAutoDismissMessage } from '../utils/useAutoDismissMessage';
import PrintButton from '../components/PrintButton';
import CitySelect, { CitySelectLockContext } from '../components/CitySelect';
import NegotiationChatDialog from '../components/NegotiationChatDialog';
import MapView from '../components/RouteMap';
import { westAfricanCities } from '../utils/westAfricanCities';

function RouteMap(props) {
  return <MapView {...props} showRoute={false} />;
}

const config = {
  demandes: { title: 'Mes demandes', subtitle: 'Suivez les demandes publiées et leur avancement.', endpoint: '/api/annonces/demandes/miennes' },
  recherche: { title: 'Trouver un camion', subtitle: 'Consultez les disponibilités publiées par les transporteurs.', endpoint: '/api/annonces/disponibilites' },
  courses: { title: 'Mes courses', subtitle: 'Suivez vos expéditions en cours et terminées.', endpoint: '/api/courses/me' },
  historique: { title: 'Historique', subtitle: 'Retrouvez les dernières marchandises livrées.', endpoint: '/api/courses/me' },
  documents: { title: 'Mes documents', subtitle: 'Consultez les justificatifs transmis et leur statut de vérification.', endpoint: '/api/documents' },
};

export default function ChargeurToolPage({ mode }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDemandId = mode === 'demandes' ? searchParams.get('demande') : null;
  const preferredPaymentMethod = user?.payment_accounts?.find((account) => account.is_default_send)?.method;
  const page = config[mode];
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [villeDepart, setVilleDepartState] = useState('Dakar, Sénégal');
  const [villeDestination, setVilleDestinationState] = useState('Bamako, Mali');
  const [loading, setLoading] = useState(Boolean(page.endpoint));
  const [error, setError] = useAutoDismissMessage('');
  const [paymentMessage, setPaymentMessage] = useAutoDismissMessage('');
  const [selectedDemand, setSelectedDemand] = useState(null);
  const [demandToCancel, setDemandToCancel] = useState(null);
  const [cancellingDemand, setCancellingDemand] = useState(false);
  const [cancelDemandError, setCancelDemandError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchLocked, setSearchLocked] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [mapVisible, setMapVisible] = useState(false);
  const [userPosition, setUserPosition] = useState(null);
  const [searchResultState, setSearchResultState] = useState('idle');
  const [radarTarget, setRadarTarget] = useState(null);
  const [routeFiltersTarget, setRouteFiltersTarget] = useState(null);
  const [searchButtonTarget, setSearchButtonTarget] = useState(null);
  const searchButtonBoundsRef = useRef(null);
  const latestItemsRequestRef = useRef(0);
  const restartSearchForRouteChange = () => {
    if (!isSearching) return;
    setSearchProgress(0);
    setSearchResultState('idle');
    setSearchAttempt((current) => current + 1);
  };
  const setVilleDepart = (nextDeparture) => {
    setVilleDepartState(nextDeparture);
    restartSearchForRouteChange();
  };
  const setVilleDestination = (nextDestination) => {
    setVilleDestinationState(nextDestination);
    restartSearchForRouteChange();
  };
  const swapRoute = () => {
    setVilleDepartState(villeDestination);
    setVilleDestinationState(villeDepart);
    restartSearchForRouteChange();
  };
  const syncRadarCenter = useCallback(({ x, y }) => {
    if (!radarTarget) return;
    radarTarget.style.setProperty('--radar-center-x', `${x}px`);
    radarTarget.style.setProperty('--radar-center-y', `${y}px`);
  }, [radarTarget]);

  const filteredItems = useMemo(() => items
    .filter((item) => JSON.stringify(item).toLowerCase().includes(query.toLowerCase()))
    .filter((item) => mode !== 'recherche' || !villeDepart || item.position_actuelle === villeDepart)
    .filter((item) => mode !== 'recherche' || !villeDestination || item.destinations_possibles === villeDestination), [items, mode, query, villeDepart, villeDestination]);
  const displayedItems = mode === 'historique'
    ? filteredItems.filter((item) => ['LIVREE', 'TERMINEE', 'SOLDE_REGLE'].includes(item.statut))
    : filteredItems;

  const searchSteps = ['Vérification des villes', 'Analyse du trajet', 'Recherche des camions', 'Cartographie radar'];
  const completedSearchSteps = Math.min(searchSteps.length, Math.floor(searchProgress / 25));
  const visibleSearchSteps = Math.min(searchSteps.length, completedSearchSteps + 1);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => setUserPosition([position.coords.longitude, position.coords.latitude]),
      () => setUserPosition(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, []);

  useEffect(() => {
    if (mode !== 'recherche' || (searchLocked && !isSearching)) {
      setRadarTarget(null);
      return;
    }
    setRadarTarget(document.querySelector('.radar-search-panel, .search-preview-map'));
  }, [mode, isSearching, searchLocked]);

  useEffect(() => {
    setRouteFiltersTarget(mode === 'recherche'
      ? document.querySelector('.print-content > .space-y-5 > div:first-child > .grid')
      : null);
  }, [mode]);

  useEffect(() => {
    if (mode === 'recherche' || (!isSearching && !searchLocked && !mapVisible)) return;
    setIsSearching(false);
    setSearchLocked(false);
    setSearchProgress(0);
    setMapVisible(false);
    setSearchResultState('idle');
    searchButtonBoundsRef.current = null;
  }, [mode, isSearching, searchLocked, mapVisible]);

  useEffect(() => {
    if (!searchLocked) {
      setSearchButtonTarget(null);
      return undefined;
    }
    const searchButton = [...document.querySelectorAll('.print-content button')]
      .find((button) => ['Recherche...', 'Rechercher'].includes(button.textContent.trim()));
    const buttonContainer = searchButton?.parentElement;
    if (!searchButton || !buttonContainer) return undefined;

    const originalVisibility = searchButton.style.visibility;
    const originalPosition = buttonContainer.style.position;
    const currentButtonBounds = searchButton.getBoundingClientRect();
    const currentContainerBounds = buttonContainer.getBoundingClientRect();
    const buttonBounds = searchButtonBoundsRef.current || {
      x: currentButtonBounds.left,
      width: currentButtonBounds.width,
      height: currentButtonBounds.height,
      top: currentButtonBounds.top - currentContainerBounds.top,
    };
    const syncCancelButtonBounds = () => {
      const containerBounds = buttonContainer.getBoundingClientRect();
      buttonContainer.style.setProperty('--cancel-button-left', `${buttonBounds.x - containerBounds.left}px`);
      buttonContainer.style.setProperty('--cancel-button-top', `${buttonBounds.top}px`);
      buttonContainer.style.setProperty('--cancel-button-width', `${buttonBounds.width}px`);
      buttonContainer.style.setProperty('--cancel-button-height', `${buttonBounds.height}px`);
    };

    searchButton.style.visibility = 'hidden';
    searchButton.setAttribute('aria-hidden', 'true');
    buttonContainer.style.position = 'relative';
    syncCancelButtonBounds();
    window.addEventListener('resize', syncCancelButtonBounds);
    setSearchButtonTarget(buttonContainer);

    return () => {
      window.removeEventListener('resize', syncCancelButtonBounds);
      searchButton.style.visibility = originalVisibility;
      searchButton.removeAttribute('aria-hidden');
      buttonContainer.style.position = originalPosition;
      buttonContainer.style.removeProperty('--cancel-button-left');
      buttonContainer.style.removeProperty('--cancel-button-top');
      buttonContainer.style.removeProperty('--cancel-button-width');
      buttonContainer.style.removeProperty('--cancel-button-height');
    };
  }, [searchLocked]);

  useEffect(() => {
    if (!isSearching) return undefined;

    const searchDurationMs = 60000;
    const startedAt = Date.now();
    const intervalId = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min((elapsed / searchDurationMs) * 100, 100);
      setSearchProgress(progress);

      if (elapsed >= searchDurationMs) {
        clearInterval(intervalId);
        setSearchProgress(100);
        setMapVisible(false);
        setIsSearching(false);
        setSearchResultState(displayedItems.length ? 'results' : 'empty');
        setSearchLocked(false);
        searchButtonBoundsRef.current = null;
      }
    }, 150);

    return () => clearInterval(intervalId);
  }, [isSearching, displayedItems.length, searchAttempt]);

  const loadItems = useCallback(async () => {
    if (!page.endpoint) return;
    const requestId = ++latestItemsRequestRef.current;
    setLoading(true);
    setError('');
    try {
      const params = mode === 'recherche'
        ? { params: { ville_depart: villeDepart || undefined, ville_destination: villeDestination || undefined } }
        : undefined;
      const response = await api.get(page.endpoint, params);
      if (requestId === latestItemsRequestRef.current) setItems(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      if (requestId === latestItemsRequestRef.current) setError(err.response?.data?.error || 'Impossible de charger les données.');
    } finally {
      if (requestId === latestItemsRequestRef.current) setLoading(false);
    }
  }, [mode, page.endpoint, villeDepart, villeDestination, setError]);

  const cancelDemand = async () => {
    if (!demandToCancel) return;
    setCancellingDemand(true);
    setCancelDemandError('');
    try {
      if (demandToCancel.course_id) {
        await api.delete(`/api/courses/${demandToCancel.course_id}/cancel`);
      } else {
        await api.delete(`/api/annonces/demandes/miennes/${demandToCancel.id}`);
      }
      setItems((current) => current.map((item) => (
        item.id === demandToCancel.id ? { ...item, statut: 'ANNULEE', course_statut: 'ANNULEE' } : item
      )));
      setSelectedDemand((current) => current?.id === demandToCancel.id
        ? { ...current, statut: 'ANNULEE', course_statut: 'ANNULEE' }
        : current);
      setDemandToCancel(null);
    } catch (requestError) {
      setCancelDemandError(requestError.response?.data?.error || 'Impossible d’annuler cette demande.');
    } finally {
      setCancellingDemand(false);
    }
  };

  useEffect(() => { loadItems(); }, [loadItems]);

  useEffect(() => {
    if (mode !== 'demandes') return;
    if (!requestedDemandId) {
      setSelectedDemand(null);
      return;
    }
    const requestedDemand = items.find((item) => String(item.id) === requestedDemandId);
    if (requestedDemand) setSelectedDemand(requestedDemand);
  }, [items, mode, requestedDemandId]);

  useEffect(() => {
    if (!['courses', 'historique'].includes(mode)) return;
    const params = new URLSearchParams(window.location.search);
    const paypalStatus = params.get('paypal');
    if (!paypalStatus) return;

    const orderId = params.get('token');
    const paymentId = params.get('payment_id');
    const tranche = params.get('tranche');
    params.delete('paypal');
    params.delete('token');
    params.delete('payment_id');
    params.delete('tranche');
    const remainingQuery = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ''}${window.location.hash}`);

    if (paypalStatus === 'cancel') {
      setPaymentMessage('Paiement PayPal annulé. Aucun paiement n’a été validé.');
      return;
    }
    if (!orderId || !paymentId || !['AVANCE', 'SOLDE'].includes(tranche)) {
      setError('Le retour PayPal est incomplet. Vérifiez le statut du paiement avant de réessayer.');
      return;
    }

    api.post(`/api/paiements/${encodeURIComponent(paymentId)}/paypal/${tranche}/capture`, { order_id: orderId })
      .then((response) => {
        setPaymentMessage(response.data?.message || 'Paiement PayPal confirmé.');
        loadItems();
      })
      .catch((requestError) => setError(requestError.response?.data?.error || 'La confirmation PayPal a échoué.'));
  }, [mode, loadItems, setError, setPaymentMessage]);

  useEffect(() => {
    if (!socket) return;
    const handleCourseUpdated = () => {
      if (mode === 'courses' || mode === 'historique' || mode === 'demandes') {
        loadItems();
      }
    };
    socket.on('courseUpdated', handleCourseUpdated);
    return () => {
      socket.off('courseUpdated', handleCourseUpdated);
    };
  }, [socket, mode, loadItems]);

  const selectedDeparture = westAfricanCities.find((city) => city.name === villeDepart) ?? westAfricanCities[0];
  const selectedDestination = westAfricanCities.find((city) => city.name === villeDestination) ?? westAfricanCities[0];
  const selectedRoute = [
    [selectedDeparture.lng, selectedDeparture.lat],
    [selectedDestination.lng, selectedDestination.lat],
  ];
  const showSearchPreview = mode === 'recherche' && !searchLocked && !isSearching && searchResultState === 'idle';
  const showDefaultTruckList = !isSearching && !searchLocked && !mapVisible && !showSearchPreview && searchResultState === 'idle';

  const handleSearchSubmit = (event) => {
    if (!villeDepart || !villeDestination) return;
    const buttonBounds = event.currentTarget.getBoundingClientRect();
    const containerBounds = event.currentTarget.parentElement.getBoundingClientRect();
    searchButtonBoundsRef.current = {
      x: buttonBounds.left,
      width: buttonBounds.width,
      height: buttonBounds.height,
      top: buttonBounds.top - containerBounds.top,
    };
    setSearchProgress(0);
    setSearchLocked(true);
    setMapVisible(true);
    setSearchResultState('idle');
    setIsSearching(true);
  };

  const handleSearchCancel = () => {
    setIsSearching(false);
    setSearchLocked(false);
    setMapVisible(false);
    setSearchProgress(0);
    setSearchResultState('idle');
    searchButtonBoundsRef.current = null;
  };

  return <DashboardLayout user={user}>
    <CitySelectLockContext.Provider value={false}>
    <div className={`print-content space-y-6 ${mode === 'recherche' ? 'truck-search-page' : ''}`}>
      {!(mode === 'demandes' && selectedDemand) && <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-[#FF6A3D]">Espace chargeur</p><h1 className="mt-2 text-3xl font-bold text-[#121C2D]">{page.title}</h1><p className="mt-1 text-slate-500">{page.subtitle}</p></div><div className="print:hidden flex flex-wrap gap-2">{mode === 'historique' && <PrintButton>Imprimer l’historique</PrintButton>}{page.endpoint && <button type="button" onClick={loadItems} className="inline-flex items-center gap-2 self-start rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-[#121C2D] hover:border-[#FF6A3D]"><RefreshCw size={16} /> Actualiser</button>}</div></div>}
      {mode === 'demandes' && !selectedDemand && <div className="flex flex-col gap-3 sm:flex-row"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une ville ou une marchandise..." className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 outline-none focus:border-[#FF6A3D]" /><a href="/chargeur/demande" className="shrink-0 whitespace-nowrap rounded-lg bg-[#FF6A3D] px-4 py-2.5 text-center text-sm font-bold text-white hover:bg-[#e85b2d]">Nouvelle demande</a></div>}
      {mode === 'recherche' && <div className="space-y-5"><div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-orange-50 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.05)] sm:p-5"><div className="grid gap-3 sm:grid-cols-2"><div className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Départ</span><CitySelect value={villeDepart} onChange={setVilleDepart} options={westAfricanCities} placeholder="Toutes les villes de départ" className="w-full" /></div><div className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Destination</span><CitySelect value={villeDestination} onChange={setVilleDestination} options={westAfricanCities} placeholder="Toutes les destinations" className="w-full" /></div></div>{villeDepart && villeDestination && <div className="mt-4 flex justify-end"><button type="button" onClick={handleSearchSubmit} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6A3D] to-[#ff8a55] px-5 py-2.5 text-sm font-bold text-white shadow-[0_12px_24px_rgba(255,106,61,0.28)] transition-transform hover:-translate-y-0.5 hover:shadow-[0_16px_28px_rgba(255,106,61,0.34)]" disabled={isSearching}><Search size={16} /> {isSearching ? 'Recherche...' : 'Rechercher'}</button></div>}</div>{isSearching && <div className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-[0_20px_45px_rgba(15,23,42,0.12)] sm:p-5"><div className="mb-4 flex items-center justify-between gap-4"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#fff1e8] text-[#e85b2d]"><Search size={18} /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Recherche active</p><h3 className="text-base font-bold text-[#121C2D]">Scan des camions sur {villeDepart}</h3></div></div><span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700">{Math.min(100, Math.round(searchProgress))}%</span></div><div className="radar-search-panel" data-visible-steps={visibleSearchSteps} data-completed-steps={completedSearchSteps}><div className="radar-canvas"><div className="radar-ring radar-ring-1" /><div className="radar-ring radar-ring-2" /><div className="radar-ring radar-ring-3" /><div className="radar-sweep" /><div className="radar-target radar-target-1" /><div className="radar-target radar-target-2" /></div></div><div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-[#FF6A3D] via-[#f3a65b] to-emerald-500 transition-all duration-150" style={{ width: `${searchProgress}%` }} /></div><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{searchSteps.slice(0, visibleSearchSteps).map((step, index) => { const completed = index < completedSearchSteps; const active = !completed && index === completedSearchSteps; return <div key={step} className={`flex items-center gap-2 rounded-2xl border p-2.5 transition-colors duration-300 ${completed ? 'border-emerald-200 bg-emerald-50' : active ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-white'}`}><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${completed ? 'bg-emerald-500 text-white' : active ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600'}`}>{completed ? '✓' : index + 1}</span><span className={`text-sm ${completed ? 'font-semibold text-emerald-800' : active ? 'font-semibold text-orange-800' : 'text-slate-600'}`}>{step}</span></div>; })}</div></div>}{!isSearching && searchResultState === 'no-result' && <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm"><div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-white text-amber-500 shadow-sm"><Search size={22} /></div><h3 className="text-xl font-bold text-[#123b4a]">Aucun camion trouvé</h3><p className="mt-2 text-sm text-slate-600">Aucune disponibilité compatible n’a été détectée pour le corridor {villeDepart} → {villeDestination} pendant la recherche de 1 minute.</p></div>}{mapVisible && !isSearching && searchResultState !== 'no-result' && <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)]"><div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3"><div className="flex items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-xl bg-[#0f172a] text-white"><MapPin size={14} /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Corridor</p><p className="text-sm font-semibold text-[#123b4a]">{villeDepart} → {villeDestination}</p></div></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">Live</span></div>{userPosition ? <RouteMap route={selectedRoute} vehicles={[]} className="h-[420px]" myPosition={userPosition} /> : <div className="flex min-h-[420px] items-center justify-center bg-slate-50 p-8 text-center text-sm text-slate-500">Localisation non disponible. La carte est affichée autour du corridor sélectionné.</div>}</div>}{!isSearching && searchResultState === 'idle' && !mapVisible && <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">Sélectionnez un départ et une destination puis lancez la recherche.</div>}</div>}
      {showSearchPreview && <SearchPreviewPanel villeDepart={villeDepart} villeDestination={villeDestination} />}
      {routeFiltersTarget && mode === 'recherche' && createPortal(<button type="button" aria-label="Inverser le départ et la destination" title="Inverser le départ et la destination" onClick={swapRoute} className="route-swap-button grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-[#0C1B32] shadow-sm transition hover:border-[#0C1B32] hover:bg-slate-50"><ArrowDownUp size={16} /></button>, routeFiltersTarget)}
      {radarTarget && mode === 'recherche' && (isSearching || showSearchPreview) && createPortal(<div className="radar-map-layer"><RouteMap route={selectedRoute} focusPosition={[selectedDeparture.lng, selectedDeparture.lat]} focusLabel={villeDepart} onFocusPositionChange={syncRadarCenter} focusRoute={!isSearching} preserveInstanceOnFocusChange showControls={false} className="h-full w-full" /></div>, radarTarget)}
      {searchButtonTarget && mode === 'recherche' && searchLocked && createPortal(<button type="button" onClick={handleSearchCancel} aria-label="Annuler la recherche" title="Annuler la recherche" className="search-button-cancel-overlay"><X size={16} /> Annuler</button>, searchButtonTarget)}
      {mode === 'recherche' && !isSearching && ['results', 'empty'].includes(searchResultState) && <section className="search-results-panel overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-orange-50/60 p-4 shadow-[0_20px_45px_rgba(15,23,42,0.08)] sm:p-6">
        <div className="mb-5 flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#fff1e8] text-[#e85b2d]"><Truck size={20} /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Résultat de la recherche</p>
              <h2 className="mt-1 flex flex-wrap items-center gap-2 text-base font-bold text-[#121C2D] sm:text-lg">
                <span>{villeDepart}</span><ArrowLeftRight size={15} className="text-[#FF6A3D]" /><span>{villeDestination}</span>
              </h2>
            </div>
          </div>
          <span className="w-fit rounded-full border border-[#0C1B32] bg-[#0C1B32] px-3 py-1.5 text-xs font-bold text-white">
            {searchResultState === 'results' ? `${displayedItems.length} camion${displayedItems.length > 1 ? 's' : ''} disponible${displayedItems.length > 1 ? 's' : ''}` : 'Recherche terminée'}
          </span>
        </div>
        {searchResultState === 'results'
          ? <TruckList items={displayedItems} />
          : <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white/80 px-5 py-10 text-center">
            <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[#0C1B32] text-white"><Search size={23} /></div>
            <h3 className="text-base font-bold text-[#121C2D]">Aucun camion disponible pour le moment</h3>
            <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">Aucun transporteur n’a publié de disponibilité sur le trajet <strong className="font-semibold text-slate-800">{villeDepart} → {villeDestination}</strong>.</p>
            <p className="mt-1 text-xs text-slate-500">Vous pouvez modifier votre itinéraire ou relancer la recherche plus tard.</p>
          </div>}
      </section>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>}
      {paymentMessage && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{paymentMessage}</div>}
      {mode === 'demandes' && selectedDemand
        ? <DemandDetailsDialog demand={selectedDemand} onBack={() => { setSelectedDemand(null); setSearchParams((current) => { const next = new URLSearchParams(current); next.delete('demande'); return next; }); }} onCancel={(item) => { setCancelDemandError(''); setDemandToCancel(item); }} onCourseAccepted={loadItems} />
        : loading && !(mode === 'recherche' && (searchLocked || showSearchPreview)) ? <div className="rounded-xl bg-white p-10 text-center text-slate-500">Chargement...</div> : mode === 'historique' ? <ShipmentHistoryList items={displayedItems} /> : mode === 'courses' ? <CourseView items={displayedItems} preferredPaymentMethod={preferredPaymentMethod} onRefresh={loadItems} /> : mode === 'documents' ? <DocumentList items={displayedItems} /> : mode === 'demandes' ? <DemandList items={displayedItems} onDetails={(item) => { setSelectedDemand(item); setSearchParams((current) => { const next = new URLSearchParams(current); next.set('demande', String(item.id)); return next; }); }} onCancel={(item) => { setCancelDemandError(''); setDemandToCancel(item); }} /> : (showDefaultTruckList ? <TruckList items={displayedItems} /> : null)}
    </div>
    </CitySelectLockContext.Provider>
    {mode === 'demandes' && <ConfirmDialog
      open={Boolean(demandToCancel)}
      title={demandToCancel?.course_id ? 'Annuler cette course ?' : 'Annuler cette demande ?'}
      message={demandToCancel ? `La demande ${demandToCancel.ville_depart} → ${demandToCancel.ville_arrivee} sera marquée comme annulée. ${demandToCancel.course_id ? 'Cette action est possible uniquement avant le début du chargement et sans avance payée.' : 'Cette action est possible tant qu’aucun camion n’a été affecté.'}` : ''}
      confirmLabel="Confirmer l’annulation"
      cancelLabel="Garder la demande"
      busy={cancellingDemand}
      errorMessage={cancelDemandError}
      onConfirm={cancelDemand}
      onCancel={() => { if (!cancellingDemand) setDemandToCancel(null); }}
    />}
  </DashboardLayout>;
}

function SearchPreviewPanel({ villeDepart, villeDestination }) {
  return <div className="overflow-hidden rounded-3xl border border-slate-200 bg-[#f8fafc] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] search-preview-panel sm:p-5">
    <div className="mb-5 flex items-center gap-3">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#fff1e8] text-[#e85b2d]"><Search size={18} /></div>
      <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Aperçu du trajet</p><h3 className="text-base font-bold text-[#121C2D]">{villeDepart} vers {villeDestination}</h3></div>
    </div>
    <div className="search-preview-map" />
  </div>;
}

function DemandList({ items, onDetails, onCancel }) {
  if (!items.length) return <EmptyState icon={FileText} text="Aucune demande ne correspond à votre recherche." />;
  return <div className="grid gap-4 md:grid-cols-2">{items.map((item) => {
    const isPublished = item.statut === 'PUBLIEE';
    const displayedStatus = item.course_statut || item.statut;
    const canCancel = isPublished || (item.course_id && item.course_statut === 'CAMION_TROUVE');
    return <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] transition hover:border-[#0C1B32] hover:shadow-[0_16px_32px_rgba(15,23,42,0.08)]">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Demande #{item.id}</p>
          <h2 className="mt-1 flex flex-wrap items-center gap-2 text-base font-bold text-[#121C2D]">
            <span>{item.ville_depart}</span><ArrowLeftRight size={14} className="text-[#FF6A3D]" /><span>{item.ville_arrivee}</span>
          </h2>
        </div>
        <span className="shrink-0 rounded-full border border-[#0C1B32] bg-[#0C1B32] px-2.5 py-1 text-[10px] font-bold uppercase text-white">{displayedStatus === 'ANNULEE' ? 'Annulée' : displayedStatus || 'Publiée'}</span>
      </header>
      <div className="mt-4 rounded-xl bg-slate-50 p-3.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Package size={15} className="text-[#FF6A3D]" />{item.nature_marchandise || 'Marchandise non renseignée'}</p>
        <p className="mt-2 text-xs text-slate-500">{item.tonnage || 0} tonnes · {item.type_camion_requis || 'Type de camion non précisé'}</p>
        <p className="mt-2 flex items-center gap-2 text-xs text-slate-500"><CalendarDays size={14} />Chargement prévu le {formatDate(item.date_chargement)}</p>
      </div>
      <footer className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => onDetails(item)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-[#121C2D] transition hover:border-[#0C1B32] hover:bg-slate-50 hover:text-[#0C1B32]">Détails</button>
        {canCancel && <button type="button" onClick={() => onCancel(item)} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50">Annuler</button>}
      </footer>
    </article>;
  })}</div>;
}

function DemandDetailsDialog({ demand, onBack, onCancel, onCourseAccepted }) {
  const { socket } = useSocket();
  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [conversationError, setConversationError] = useState('');
  const [selectedConversation, setSelectedConversation] = useState(null);
  const activeConversation = conversations.find((conversation) => String(conversation.id) === String(selectedConversation?.id))
    || selectedConversation;
  const hasAcceptance = Boolean(demand.course_id) || !['PUBLIEE', 'ANNULEE'].includes(demand.statut);
  const canCancel = (demand.statut === 'PUBLIEE' && !demand.course_id)
    || (demand.course_id && demand.course_statut === 'CAMION_TROUVE');
  const hasCoordinates = demand.position_lng != null && demand.position_lat != null
    && Number.isFinite(Number(demand.position_lng)) && Number.isFinite(Number(demand.position_lat));

  useEffect(() => {
    let active = true;
    const handleNewConversation = (conversation) => {
      if (String(conversation.demande_id) !== String(demand.id)) return;
      setConversations((current) => current.some((item) => String(item.id) === String(conversation.id))
        ? current
        : [conversation, ...current]);
    };
    const handleConversationUpdate = (updatedConversation) => {
      setConversations((current) => current.map((conversation) => (
        String(conversation.id) === String(updatedConversation.conversationId)
          ? { ...conversation, statut: updatedConversation.statut, course_id: updatedConversation.courseId || conversation.course_id }
          : conversation
      )));
    };
    socket?.on('chat:new-conversation', handleNewConversation);
    socket?.on('chat:conversation-updated', handleConversationUpdate);
    api.get('/api/chats', { params: { demande_id: demand.id } })
      .then(({ data }) => {
        if (!active) return;
        const loadedConversations = Array.isArray(data) ? data : [];
        setConversations(loadedConversations);
        setSelectedConversation(loadedConversations[0] || null);
      })
      .catch((error) => {
        if (active) setConversationError(error.response?.data?.error || 'Impossible de charger les négociations.');
      })
      .finally(() => {
        if (active) setLoadingConversations(false);
      });
    return () => {
      active = false;
      socket?.off('chat:new-conversation', handleNewConversation);
      socket?.off('chat:conversation-updated', handleConversationUpdate);
    };
  }, [demand.id, socket]);

  return <section aria-labelledby="demand-details-title" className="space-y-5">
    <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#0C1B32] hover:bg-slate-50 hover:text-[#0C1B32]"><ArrowLeft size={14} />Retour à mes demandes</button>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="demand-details-title" className="text-2xl font-extrabold text-[#0C1B32] sm:text-3xl">Demande de transport #{demand.id}</h2>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">{(demand.course_statut || demand.statut) === 'CAMION_TROUVE' ? 'Camion trouvé' : demand.course_statut || demand.statut}</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">Consultez les détails du transport et échangez pour convenir du prix.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canCancel && <button type="button" onClick={() => onCancel(demand)} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3.5 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-50">Annuler la demande</button>}
        <PrintButton>Exporter le récapitulatif</PrintButton>
      </div>
    </header>
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(320px,0.88fr)_minmax(0,1.12fr)]">
      <div className="space-y-4">
        <section className="rounded-xl bg-[#0C1B32] p-5 text-white shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3 text-xs text-slate-300"><span>Montant actuel de la demande</span><span className="text-slate-400">#{demand.id}</span></div>
          <p className="mt-2 text-3xl font-extrabold tracking-tight">{demand.prix_propose ? Number(demand.prix_propose).toLocaleString('fr-FR') : 'À discuter'} <span className="text-sm font-semibold text-slate-300">FCFA</span></p>
          <p className="mt-2 text-[10px] leading-5 text-slate-400">Ce montant reste inchangé tant qu’une nouvelle proposition n’est pas acceptée.</p>
        </section>
        {hasAcceptance && <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center gap-2"><CheckCircle2 size={18} className="text-emerald-700" /><h3 className="text-sm font-bold text-emerald-900">Détails de l’acceptation</h3></div>
          {demand.course_id ? <>
            <p className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-800"><CalendarDays size={14} />Acceptée le {formatAcceptanceDateTime(demand.course_date_creation)}</p>
            <div className="mt-1 grid gap-x-5 sm:grid-cols-2">
              <DetailField compact label="Transporteur" value={demand.transporteur_nom} />
              <DetailField compact label="Téléphone du transporteur" value={demand.transporteur_telephone} />
              <DetailField compact label="Camion" value={[demand.type_vehicule, demand.plaque_immatriculation].filter(Boolean).join(' · ')} />
              <DetailField compact label="Capacité" value={demand.capacite_tonnes ? `${demand.capacite_tonnes} tonnes` : null} />
              <DetailField compact label="Chauffeur affecté" value={demand.chauffeur_nom} />
              <DetailField compact label="Téléphone du chauffeur" value={demand.chauffeur_telephone} />
              <div className="col-span-full flex items-center justify-between gap-3 border-t border-slate-100 py-3"><span className="text-[10px] text-slate-500">Statut de la course</span><span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold text-emerald-800">{demand.course_statut || 'CAMION_TROUVE'}</span></div>
            </div>
          </> : <p className="mt-3 text-sm text-amber-800">La demande a changé de statut, mais les informations de la course ne sont pas disponibles. Actualisez la page.</p>}
        </section>}
        {!hasAcceptance && <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-bold text-[#121C2D]">Détails du chargement</h3>
          <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
            <DetailField label="Marchandise" value={demand.nature_marchandise} />
            <DetailField label="Tonnage" value={`${demand.tonnage || 0} tonnes`} />
            <DetailField label="Type de camion requis" value={demand.type_camion_requis} />
            <DetailField label="Date de chargement" value={formatDate(demand.date_chargement)} />
            <DetailField label="Quartier ou repère" value={demand.quartier_chargement || 'Non renseigné'} className="sm:col-span-2" />
          </div>
        </section>}
        {hasCoordinates
          ? <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center gap-2 px-4 py-3"><MapPin size={16} className="text-[#FF6A3D]" /><div><p className="text-[10px] text-slate-500">Quartier de départ · Point de chargement</p><h3 className="text-sm font-bold text-[#121C2D]">{demand.quartier_chargement || demand.ville_depart}</h3></div></div><div className="relative"><DemandLocationMap coordinates={[Number(demand.position_lng), Number(demand.position_lat)]} neighborhood={demand.quartier_chargement} readOnly height={244} /><span className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-[9px] text-slate-500">Plan indicatif</span></div></section>
          : <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Aucun point de chargement cartographique n’est renseigné pour cette demande.</p>}
      </div>
      <aside className="flex min-h-[620px] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-4 lg:h-[calc(100vh-200px)] lg:min-h-[540px]">
        {activeConversation
          ? <NegotiationChatDialog embedded conversation={activeConversation} onClose={() => setSelectedConversation(null)} onCourseAccepted={onCourseAccepted} />
          : <>
            <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#0C1B32] text-xs font-bold text-white">TN</span>
                <div className="min-w-0"><p className="truncate text-sm font-bold text-[#0C1B32]">Négociation du prix</p><p className="truncate text-[10px] text-slate-500">{conversations.length ? 'Choisissez un transporteur pour ouvrir la conversation' : 'Aucun transporteur n’a encore répondu'}</p></div>
              </div>
              <span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-orange-700">En attente</span>
            </header>
            {conversations.length > 0 && <div className="border-b border-slate-100 bg-white px-5 py-3 sm:px-6">
              <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400" htmlFor="negotiation-conversation-select">Conversation</label>
              <select id="negotiation-conversation-select" value="" onChange={(event) => setSelectedConversation(conversations.find((item) => String(item.id) === event.target.value) || null)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#0C1B32]">
                <option value="">Sélectionner un transporteur</option>
                {conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.transporteur_nom} · {conversation.plaque_immatriculation}</option>)}
              </select>
            </div>}
            <div className="grid grid-cols-2 gap-3 border-b border-slate-200 bg-white px-5 py-4">
              <div><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Montant actuel</p><p className="mt-1 text-sm font-extrabold text-[#0C1B32]">{demand.prix_propose ? `${Number(demand.prix_propose).toLocaleString('fr-FR')} FCFA` : 'À discuter'}</p></div>
              <div className="border-l border-slate-100 pl-4"><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Dernière proposition</p><p className="mt-1 text-sm font-extrabold text-[#e85b2d]">Aucune</p></div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col justify-center bg-slate-50/60 p-4 sm:p-5">
              {loadingConversations ? <div className="flex min-h-48 items-center justify-center text-sm text-slate-500">Chargement des conversations…</div>
                : conversationError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{conversationError}</p>
                  : conversations.length ? <div className="max-h-64 space-y-3 overflow-y-auto">{conversations.map((conversation) => <button type="button" key={conversation.id} onClick={() => setSelectedConversation(conversation)} className="group flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-orange-300 hover:shadow-md">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-brand-dark"><MessageCircle size={18} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[#121C2D]">{conversation.transporteur_nom} · {conversation.plaque_immatriculation}</span>
                      <span className="mt-1 block truncate text-xs text-slate-500">{conversation.type_vehicule} · {conversation.capacite_tonnes} t</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${conversation.statut === 'OUVERTE' ? 'bg-emerald-50 text-emerald-700' : conversation.statut === 'ACCEPTEE' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{conversation.statut === 'OUVERTE' ? 'En cours' : conversation.statut === 'ACCEPTEE' ? 'Prix accepté' : 'Terminée'}</span>
                  </button>)}</div>
                    : <div className="flex min-h-48 flex-1 flex-col items-center justify-center px-6 text-center">
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-orange-50 text-[#e85b2d]"><MessageCircle size={20} /></span>
                      <p className="mt-3 text-sm font-bold text-[#0C1B32]">Aucune négociation pour le moment</p>
                      <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">Les messages et les propositions apparaîtront ici dès qu’un transporteur ouvrira une conversation.</p>
                    </div>}
            </div>
            <div className="space-y-2 border-t border-slate-200 bg-white p-4">
              <div className="flex gap-2">
                <input disabled placeholder="Écrivez votre message au transporteur…" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500 placeholder:text-slate-400" />
                <button type="button" disabled aria-label="Envoyer le message" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#FF6A3D] text-white opacity-50"><Send size={15} /></button>
              </div>
              <button type="button" disabled className="text-[10px] font-bold text-[#e85b2d] opacity-60">Proposer un prix</button>
            </div>
          </>}
      </aside>
    </div>
  </section>;
}

function DetailField({ label, value, className = '', compact = false }) {
  return <div className={`${compact ? 'border-b border-slate-100 py-2.5' : 'rounded-xl bg-slate-50 p-3.5'} ${className}`}><p className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-semibold uppercase text-slate-500`}>{label}</p><p className={`${compact ? 'mt-0.5 text-xs' : 'mt-1 text-sm'} font-semibold text-[#121C2D]`}>{value || 'Non renseigné'}</p></div>;
}

function formatDate(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'Non renseignée';
  return new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateTime(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'Non renseignée';
  return new Date(value).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatAcceptanceDateTime(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'Non renseignée';
  const date = new Date(value);
  const formattedDate = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const formattedTime = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${formattedDate} à ${formattedTime}`;
}
async function contactTransporteur(disponibiliteId) {
  const whatsappWindow = window.open('about:blank', '_blank');
  if (!whatsappWindow) {
    window.alert('Autorisez les fenêtres contextuelles pour ouvrir WhatsApp.');
    return;
  }
  whatsappWindow.opener = null;
  try {
    const response = await api.get(`/api/annonces/whatsapp-link/disponibilite/${disponibiliteId}`);
    if (response.data?.link) {
      whatsappWindow.location.href = response.data.link;
    } else {
      whatsappWindow.close();
      window.alert('Le contact WhatsApp est indisponible pour cette disponibilité.');
    }
  } catch {
    whatsappWindow.close();
    window.alert('Le contact WhatsApp est indisponible pour cette disponibilité.');
  }
}

function TruckList({ items }) {
  if (!items.length) return <EmptyState icon={Search} text="Aucun camion disponible pour le moment." />;
  return <div className="grid gap-4 md:grid-cols-2">{items.map((item) => <article key={item.id} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-[0_16px_32px_rgba(15,23,42,0.1)]">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-[#121C2D] transition-colors group-hover:bg-[#fff1e8] group-hover:text-[#e85b2d]"><Truck size={20} /></div>
        <div className="min-w-0"><h3 className="truncate font-bold text-[#121C2D]">{item.transporteur_nom || 'Transporteur'}</h3><p className="mt-0.5 text-sm text-slate-500">{item.type_vehicule || 'Camion'}</p></div>
      </div>
      <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Disponible</span>
    </div>
    <div className="mt-4 rounded-xl bg-slate-50 p-3.5">
      <p className="flex items-center gap-2 text-sm font-semibold leading-5 text-slate-700"><MapPin size={16} className="shrink-0 text-[#FF6A3D]" /><span>{item.position_actuelle || 'Position non renseignée'}</span></p>
      <div className="ml-[7px] h-4 border-l border-dashed border-slate-300" />
      <p className="flex items-center gap-2 text-sm font-semibold leading-5 text-slate-700"><MapPin size={16} className="shrink-0 text-emerald-600" /><span>{item.destinations_possibles || 'Destination non renseignée'}</span></p>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <span className="rounded-lg bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-800">{item.capacite_tonnes || '-'} tonnes</span>
      <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600">{item.plaque_immatriculation || 'Immatriculation inconnue'}</span>
    </div>
    {item.transporteur_description && <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-500">{item.transporteur_description}</p>}
    <button type="button" onClick={() => contactTransporteur(item.id)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6A3D] to-[#ff8a55] px-4 py-2.5 text-sm font-bold text-white shadow-[0_10px_20px_rgba(255,106,61,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_24px_rgba(255,106,61,0.28)]"><MessageCircle size={16} /> Contacter sur WhatsApp</button>
  </article>)}</div>;
}

function DocumentList({ items }) {
  if (!items.length) return <EmptyState icon={Upload} text="Aucun document transmis." />;
  return <div className="grid gap-4 md:grid-cols-2">{items.map((item) => { const status = item.statut || 'EN_ATTENTE'; const statusClass = status === 'VALIDE' ? 'text-emerald-600' : status === 'REFUSE' ? 'text-rose-600' : 'text-slate-600'; return <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-5"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><FileText className="text-[#FF6A3D]" /><div><p className="font-bold text-[#121C2D]">{item.type_document}</p><p className="text-xs text-slate-500">{item.camion_plaque ? `Camion : ${item.camion_plaque}` : 'Document du profil'}</p><p className="text-xs text-slate-400">Ajouté le {item.date_ajout ? new Date(item.date_ajout).toLocaleDateString('fr-FR') : '-'}</p></div></div><span className={`flex items-center gap-1 text-xs font-bold ${statusClass}`}><CheckCircle2 size={15} /> {status}</span></div>{status === 'REFUSE' && item.motif_refus && <div className="mt-4 rounded-lg border-l-4 border-rose-500 bg-rose-50 p-3 text-sm text-rose-900"><strong>Motif du refus</strong><p className="mt-1">{item.motif_refus}</p></div>}</div>; })}</div>;
}

function ShipmentHistoryList({ items }) {
  if (!items.length) return <EmptyState icon={History} text="Aucune marchandise livrée pour le moment." />;
  return <div className="grid gap-4">
    {items.map((item) => (
      <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 font-bold text-[#121C2D]">
              <span>{item.ville_depart || 'Départ non renseigné'}</span>
              <ArrowLeftRight size={15} className="text-slate-400" />
              <span>{item.ville_arrivee || 'Arrivée non renseignée'}</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-700">{item.nature_marchandise || 'Marchandise non renseignée'}</p>
            <p className="mt-1 text-sm text-slate-500">{item.tonnage ? `${item.tonnage} tonnes` : 'Tonnage non renseigné'} · Camion {item.plaque_immatriculation || 'non renseigné'}</p>
            <p className="mt-2 text-xs text-slate-400">Livrée le {item.date_livraison_reelle ? new Date(item.date_livraison_reelle).toLocaleDateString('fr-FR') : item.date_creation ? new Date(item.date_creation).toLocaleDateString('fr-FR') : '—'}</p>
          </div>
          <div className="flex items-center gap-2 sm:flex-col sm:items-end">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Livrée</span>
            <strong className="text-sm text-[#121C2D]">{item.prix_propose ? `${Number(item.prix_propose).toLocaleString('fr-FR')} FCFA` : 'Prix non renseigné'}</strong>
          </div>
        </div>
      </article>
    ))}
  </div>;
}

function CourseView({ items, preferredPaymentMethod, onRefresh }) {
  const [paymentCourse, setPaymentCourse] = useState(null);

  if (!items || !items.length) {
    return <div className="rounded-xl border border-gray-200 bg-white p-8"><div className="mb-6 flex items-center gap-3"><History className="text-[#FF6A3D]" /><div><h2 className="font-bold text-[#121C2D]">Vos courses</h2><p className="text-sm text-slate-500">Les courses en cours et terminées apparaîtront ici.</p></div></div><EmptyState icon={History} text="Aucune course pour le moment." /></div>;
  }
  return (
    <>
      <div className="grid gap-4">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 font-bold text-[#121C2D]">
                  <span>{item.ville_depart || 'N/A'}</span>
                  <ArrowLeftRight size={15} className="text-slate-400" />
                  <span>{item.ville_arrivee || 'N/A'}</span>
                  <span className="text-xs font-normal text-slate-400">#{String(item.id).slice(0, 8)}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">Marchandise: {item.nature_marchandise || '-'} · Plaque: {item.plaque_immatriculation || '-'}</p>
                <p className="mt-1 text-sm font-bold text-[#121C2D]">Prix: {item.prix_propose ? `${Number(item.prix_propose).toLocaleString('fr-FR')} FCFA` : '-'}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${item.statut === 'SOLDE_REGLE' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{item.statut}</span>
                {item.statut === 'CAMION_TROUVE' && item.paiement_statut_avance !== 'VALIDE' && (
                  <div className="flex gap-2">
                    <button onClick={() => setPaymentCourse({ item, type: 'avance', provider: preferredPaymentMethod === 'PAYPAL' ? 'PAYPAL' : undefined })} className="text-xs font-bold text-white bg-[#FF6A3D] px-3 py-1.5 rounded-md hover:bg-[#e85b2d]">{item.reference_transaction_avance_chargeur ? 'Référence transmise' : 'Régler l’avance (50%)'}</button>
                    {!item.reference_transaction_avance_chargeur && <button onClick={() => setPaymentCourse({ item, type: 'avance', provider: 'PAYPAL' })} className="rounded-md border border-[#003087] px-3 py-1.5 text-xs font-bold text-[#003087] hover:bg-blue-50">PayPal</button>}
                    {!item.reference_transaction_avance_chargeur && <button onClick={() => setPaymentCourse({ item, type: 'avance', provider: 'KKIAPAY' })} className="rounded-md border border-[#176f69] px-3 py-1.5 text-xs font-bold text-[#176f69] hover:bg-emerald-50">KKiaPay</button>}
                  </div>
                )}
                {(item.statut === 'LIVREE' || item.statut === 'TERMINEE') && item.paiement_statut_solde !== 'VALIDE' && (
                  <div className="flex gap-2">
                    <button onClick={() => setPaymentCourse({ item, type: 'solde', provider: preferredPaymentMethod === 'PAYPAL' ? 'PAYPAL' : undefined })} className="text-xs font-bold text-white bg-[#FF6A3D] px-3 py-1.5 rounded-md hover:bg-[#e85b2d]">{item.reference_transaction_solde_chargeur ? 'Référence transmise' : 'Régler le solde'}</button>
                    {!item.reference_transaction_solde_chargeur && <button onClick={() => setPaymentCourse({ item, type: 'solde', provider: 'PAYPAL' })} className="rounded-md border border-[#003087] px-3 py-1.5 text-xs font-bold text-[#003087] hover:bg-blue-50">PayPal</button>}
                    {!item.reference_transaction_solde_chargeur && <button onClick={() => setPaymentCourse({ item, type: 'solde', provider: 'KKIAPAY' })} className="rounded-md border border-[#176f69] px-3 py-1.5 text-xs font-bold text-[#176f69] hover:bg-emerald-50">KKiaPay</button>}
                  </div>
                )}
                {item.paiement_statut_avance === 'EN_ATTENTE' && item.reference_transaction_avance_chargeur && <span className="text-xs text-amber-700">Avance en vérification</span>}
                {item.paiement_statut_solde === 'EN_ATTENTE' && item.reference_transaction_solde_chargeur && <span className="text-xs text-amber-700">Solde en vérification</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
      {paymentCourse?.provider === 'PAYPAL' ? (
        <PayPalPaymentModal course={paymentCourse.item} type={paymentCourse.type} onClose={() => setPaymentCourse(null)} />
      ) : paymentCourse?.provider === 'KKIAPAY' ? (
        <PaymentModal course={paymentCourse.item} type={paymentCourse.type} preferredProvider="KKIAPAY" onClose={() => setPaymentCourse(null)} onComplete={onRefresh} />
      ) : paymentCourse && (
        <PaymentModal course={paymentCourse.item} type={paymentCourse.type} preferredProvider={preferredPaymentMethod} onClose={() => setPaymentCourse(null)} onComplete={onRefresh} />
      )}
    </>
  );
}

function PayPalPaymentModal({ course, type, onClose }) {
  const [payment, setPayment] = useState(null);
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState('');
  const isAdvance = type === 'avance';

  useEffect(() => {
    let cancelled = false;
    api.post('/api/paiements', { course_id: course.id, moyen_paiement: 'PAYPAL' })
      .then((response) => { if (!cancelled) setPayment(response.data.paiement); })
      .catch((requestError) => { if (!cancelled) setError(requestError.response?.data?.error || 'Impossible de calculer le paiement.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [course.id]);

  const calculateQuote = async () => {
    if (!payment?.id) return;
    setQuoting(true);
    setError('');
    try {
      const tranche = isAdvance ? 'AVANCE' : 'SOLDE';
      const response = await api.post(`/api/paiements/${payment.id}/paypal/${tranche}/order`);
      setQuote(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible de préparer le paiement PayPal.');
    } finally {
      setQuoting(false);
    }
  };

  const amountXof = isAdvance ? payment?.montant_avance : payment?.montant_solde;
  const commissionXof = isAdvance ? payment?.montant_avance_commission : payment?.montant_solde_commission;
  const ownerNetXof = isAdvance ? payment?.montant_avance_net : payment?.montant_solde_net;

  return (
    <div className="print:hidden fixed inset-0 z-50 flex items-center justify-center bg-[#121C2D]/60 p-4" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between"><h2 className="text-xl font-bold text-[#121C2D]">{isAdvance ? 'Acompte' : 'Solde'} avec PayPal</h2><span className="rounded-md bg-[#003087] px-2 py-1 text-sm font-black italic text-white">PayPal</span></div>
        <p className="mt-2 text-sm text-slate-500">Course #{course.id} · {course.ville_depart} → {course.ville_arrivee}</p>
        {loading ? <p className="mt-5 text-sm text-slate-500">Calcul du montant…</p> : payment && <div className="mt-5 space-y-2 rounded-lg bg-slate-50 p-4 text-sm"><div className="flex justify-between gap-3"><span className="text-slate-500">Montant de la tranche</span><strong>{Number(amountXof || 0).toLocaleString('fr-FR')} FCFA</strong></div><div className="flex justify-between gap-3"><span className="text-slate-500">Commission Translink-Africa</span><strong>{Number(commissionXof || 0).toLocaleString('fr-FR')} FCFA</strong></div><div className="flex justify-between gap-3"><span className="text-slate-500">Net transporteur</span><strong>{Number(ownerNetXof || 0).toLocaleString('fr-FR')} FCFA</strong></div>{quote && <><div className="border-t border-slate-200 pt-2 flex justify-between gap-3"><span className="text-slate-500">Frais PayPal estimés</span><strong>{quote.estimatedFeesUsd} USD</strong></div><div className="flex justify-between gap-3 text-base"><span className="font-bold text-[#121C2D]">Total à payer</span><strong>{quote.amountUsd} USD</strong></div></>}</div>}
        <p className="mt-4 text-xs leading-5 text-slate-500">Après confirmation PayPal, le système verse le net au compte PayPal configuré par le transporteur. Les autres moyens de reversement nécessiteront leur API dédiée.</p>
        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Annuler</button>{!quote ? <button type="button" onClick={calculateQuote} disabled={loading || !payment || quoting} className="rounded-lg bg-[#003087] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{quoting ? 'Calcul…' : 'Calculer les frais'}</button> : <a href={quote.approvalUrl} className="rounded-lg bg-[#003087] px-4 py-2 text-sm font-bold text-white">Continuer vers PayPal</a>}</div>
      </div>
    </div>
  );
}

function PaymentModal({ course, type, preferredProvider, onClose, onComplete }) {
  const [payment, setPayment] = useState(preferredProvider === 'KKIAPAY' ? null : course.paiement_id ? course : null);
  const [provider, setProvider] = useState(['WAVE', 'ORANGE_MONEY', 'BANQUE', 'KKIAPAY'].includes(preferredProvider) ? preferredProvider : 'WAVE');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isAdvance = type === 'avance';
  const gross = isAdvance ? payment?.montant_avance : payment?.montant_solde;
  const fee = isAdvance ? payment?.montant_avance_commission : payment?.montant_solde_commission;
  const ownerNet = isAdvance ? payment?.montant_avance_net : payment?.montant_solde_net;

  const preparePayment = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/api/paiements', { course_id: course.id, moyen_paiement: provider });
      setPayment(response.data.paiement);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible de calculer le paiement.');
    } finally {
      setLoading(false);
    }
  };

  const submitReference = async (event) => {
    event.preventDefault();
    if (!payment?.id || !reference.trim()) return;
    setLoading(true);
    setError('');
    try {
      await api.put(`/api/paiements/${payment.id}/${type}`, { reference_transaction: reference.trim() });
      onClose();
      await onComplete();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'La référence n’a pas pu être transmise.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="print:hidden fixed inset-0 z-50 flex items-center justify-center bg-[#121C2D]/60 p-4" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-[#121C2D]">{isAdvance ? 'Acompte de 50 %' : 'Solde après livraison'}</h2>
        <p className="mt-1 text-sm text-slate-500">Course #{course.id} · {course.ville_depart} → {course.ville_arrivee}</p>
        {!payment ? <div className="mt-5 space-y-4"><label className="block"><span className="mb-1 block text-sm font-bold text-[#121C2D]">Moyen de paiement</span><select value={provider} onChange={(event) => { setProvider(event.target.value); setPayment(null); }} className="w-full rounded-lg border border-slate-300 px-3 py-3"><option value="WAVE">Wave (manuel)</option><option value="ORANGE_MONEY">Orange Money (manuel)</option><option value="BANQUE">Virement bancaire</option><option value="KKIAPAY">KKiaPay — Mobile Money, carte ou wallet</option></select></label><div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{provider === 'KKIAPAY' ? 'Le paiement sera vérifié côté serveur auprès de KKiaPay avant la validation de cette tranche.' : 'Le paiement automatique n’est pas connecté pour ce moyen. Transmettez la référence; l’administration la vérifiera.'}</div>{error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<button type="button" disabled={loading} onClick={preparePayment} className="w-full rounded-lg bg-[#FF6A3D] px-4 py-3 font-bold text-white disabled:opacity-50">{loading ? 'Calcul…' : 'Calculer le montant à payer'}</button></div> : <div className="mt-5 space-y-4"><div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-4 text-center"><div><span className="block text-xs text-slate-500">À payer</span><strong>{Number(gross || 0).toLocaleString('fr-FR')} FCFA</strong></div><div><span className="block text-xs text-slate-500">Commission</span><strong>{Number(fee || 0).toLocaleString('fr-FR')} FCFA</strong></div><div><span className="block text-xs text-slate-500">Net propriétaire</span><strong>{Number(ownerNet || 0).toLocaleString('fr-FR')} FCFA</strong></div></div>{provider === 'KKIAPAY' ? <KkiapayPayButton checkoutUrl={`/api/paiements/${payment.id}/kkiapay/${isAdvance ? 'AVANCE' : 'SOLDE'}/checkout`} confirmUrl={`/api/paiements/${payment.id}/kkiapay/${isAdvance ? 'AVANCE' : 'SOLDE'}/confirm`} onPaid={async () => { onClose(); await onComplete(); }} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#176f69] px-4 py-3 font-bold text-white disabled:opacity-50" /> : <form onSubmit={submitReference} className="space-y-4"><label className="block"><span className="mb-1.5 block text-sm font-bold text-[#121C2D]">Référence de transaction</span><input required minLength="4" maxLength="255" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Référence Wave, Orange Money ou banque" className="w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-[#FF6A3D]" /></label>{error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<button disabled={loading} className="w-full rounded-lg bg-[#FF6A3D] px-4 py-3 font-bold text-white disabled:opacity-50">{loading ? 'Transmission…' : 'Transmettre la référence'}</button></form>}</div>}
        <div className="mt-4 flex justify-end"><button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Fermer</button></div>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, text }) {
  return <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center"><Icon size={32} className="mx-auto text-slate-300" /><p className="mt-3 text-sm text-slate-500">{text}</p></div>;
}
