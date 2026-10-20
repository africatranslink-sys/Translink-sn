import { useEffect, useRef, useState } from 'react';
import { EyeOff, LocateFixed, Maximize2, Minimize2, Search } from 'lucide-react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getMapboxToken } from '../utils/mapboxToken';
import { useLanguage } from '../context/useLanguage';

const DEFAULT_ROUTE = [[-17.4677, 14.7167], [-16.0728, 14.1514], [-14.4524, 13.7707], [-12.6392, 12.6392], [-8.0029, 12.6392]];

function getCoordinates(item) {
  const coordinates = Array.isArray(item.coordinates)
    ? item.coordinates
    : [item.lng ?? item.longitude, item.lat ?? item.latitude];
  if (coordinates.length < 2 || coordinates[0] == null || coordinates[1] == null) return null;

  const normalized = coordinates.map(Number);
  return normalized.every(Number.isFinite) ? normalized : null;
}

function focusOnPositions(map, items) {
  const positions = items.map(getCoordinates).filter(Boolean);
  if (!positions.length) return false;

  const distinctPositions = [...new Map(positions.map((position) => [position.join(','), position])).values()];
  if (distinctPositions.length === 1) {
    map.easeTo({ center: distinctPositions[0], zoom: 13, duration: 700 });
    return true;
  }

  const bounds = distinctPositions.slice(1).reduce(
    (result, position) => result.extend(position),
    new mapboxgl.LngLatBounds(distinctPositions[0], distinctPositions[0])
  );
  map.fitBounds(bounds, { padding: 80, maxZoom: 12, duration: 700 });
  return true;
}

function focusOnMyPosition(map, position) {
  const coordinates = getCoordinates({ coordinates: position });
  if (!coordinates) return false;
  map.easeTo({ center: coordinates, zoom: 13, duration: 700 });
  return true;
}

function updateDepartureMarker(map, markerState, position, label, translate, monochrome = false) {
  if (!Array.isArray(position) || position.length !== 2 || !position.every(Number.isFinite)) return;
  const markerColor = monochrome ? '#0C1B32' : '#FF6A3D';
  const markerShadow = monochrome
    ? '0 0 0 7px rgba(15, 23, 42, 0.16), 0 2px 10px rgba(18, 28, 45, 0.3)'
    : '0 0 0 7px rgba(255, 106, 61, 0.2), 0 2px 10px rgba(18, 28, 45, 0.3)';
  if (markerState.departure) {
    markerState.departure.setLngLat(position);
    markerState.departure.setPopup(new mapboxgl.Popup({ offset: 14 }).setText(translate(label || 'Ville de départ')));
    markerState.departure.getElement().style.background = markerColor;
    markerState.departure.getElement().style.boxShadow = markerShadow;
    return;
  }

  const element = document.createElement('div');
  element.style.width = '20px';
  element.style.height = '20px';
  element.style.borderRadius = '50%';
  element.style.background = markerColor;
  element.style.border = '3px solid #ffffff';
  element.style.boxShadow = markerShadow;
  markerState.departure = new mapboxgl.Marker({ element })
    .setLngLat(position)
    .setPopup(new mapboxgl.Popup({ offset: 14 }).setText(translate(label || 'Ville de départ')))
    .addTo(map);
}

export default function RouteMap({ vehicles = [], route = DEFAULT_ROUTE, routes = [], className = '', myPosition: suppliedPosition = null, overviewRequest = 0, focusPosition = null, focusLabel = '', onFocusPositionChange = null, showControls = true, showRoute = true, focusRoute = true, preserveInstanceOnFocusChange = false }) {
  const { language, translate } = useLanguage();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerStateRef = useRef({ vehicles: new Map(), user: null, departure: null, hasFocusedPositions: false });
  const mapInputsRef = useRef({ routeKey: '[]', focusKey: '[]' });
  const vehiclesRef = useRef(vehicles);
  const myPositionRef = useRef(null);
  const focusRequestRef = useRef(0);
  const [sharedPosition, setSharedPosition] = useState(null);
  const [showMyPosition, setShowMyPosition] = useState(false);
  const [locating, setLocating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
  const [placeSearchError, setPlaceSearchError] = useState('');
  const [focusRequest, setFocusRequest] = useState(0);
  const [mapboxToken, setMapboxToken] = useState('');
  const activeUserPosition = showMyPosition ? (sharedPosition || suppliedPosition) : null;
  const routeLines = routes.length ? routes.filter((line) => line.length > 1) : route.length > 1 ? [route] : [];
  const routeKey = JSON.stringify(routeLines);
  const focusKey = JSON.stringify([focusPosition, focusLabel]);
  const mapRouteKey = preserveInstanceOnFocusChange ? 'preserved-route' : routeKey;
  const mapFocusKey = preserveInstanceOnFocusChange ? 'preserved-focus' : focusKey;

  useEffect(() => {
    mapInputsRef.current = { routeKey, focusKey };
  }, [routeKey, focusKey]);

  useEffect(() => {
    vehiclesRef.current = vehicles;
    myPositionRef.current = activeUserPosition;
    focusRequestRef.current = focusRequest;
  }, [vehicles, activeUserPosition, focusRequest]);

  useEffect(() => {
    let active = true;
    getMapboxToken().then((token) => { if (active) setMapboxToken(token); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (overviewRequest) setIsExpanded(true);
  }, [overviewRequest]);

  useEffect(() => {
    if (!isExpanded) return undefined;
    const resizeFrame = requestAnimationFrame(() => mapRef.current?.resize());
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setIsExpanded(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(resizeFrame);
      window.removeEventListener('keydown', onKeyDown);
      // Recalculer les dimensions de la carte après la réduction
      requestAnimationFrame(() => mapRef.current?.resize());
    };
  }, [isExpanded]);

  const toggleExpanded = () => setIsExpanded((expanded) => !expanded);

  const searchPlace = async (event) => {
    event.preventDefault();
    const query = placeQuery.trim();
    const token = await getMapboxToken();
    if (!query || !token) return;

    setPlaceSearchLoading(true);
    setPlaceSearchError('');
    try {
      const params = new URLSearchParams({ access_token: token, country: 'sn,ml,gm,gn,mr', language: 'fr', limit: '1' });
      const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params}`);
      if (!response.ok) throw new Error('La recherche du lieu a échoué.');
      const result = await response.json();
      const feature = result.features?.[0];
      if (!feature) {
        setPlaceSearchError('Aucun lieu trouvé.');
        return;
      }

      mapRef.current?.easeTo({ center: feature.center, zoom: 13, duration: 700 });
      setPlaceQuery(feature.place_name || query);
    } catch (error) {
      setPlaceSearchError(error.message || 'La recherche du lieu a échoué.');
    } finally {
      setPlaceSearchLoading(false);
    }
  };

  const toggleMyPosition = () => {
    if (showMyPosition) {
      markerStateRef.current.user?.remove();
      markerStateRef.current.user = null;
      setShowMyPosition(false);
      return;
    }

    if (sharedPosition || suppliedPosition) {
      setLocationError('');
      setShowMyPosition(true);
      setFocusRequest((request) => request + 1);
      return;
    }

    if (!navigator.geolocation) {
      setLocationError('La géolocalisation n’est pas disponible sur cet appareil.');
      return;
    }

    setLocationError('');
    setLocating(true);
    navigator.geolocation.getCurrentPosition((position) => {
      setSharedPosition([position.coords.longitude, position.coords.latitude]);
      setShowMyPosition(true);
      setFocusRequest((request) => request + 1);
      setLocating(false);
    }, () => {
      setLocationError('Autorisez l’accès à votre position pour l’afficher sur la carte.');
      setLocating(false);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  };

  const myPositionButton = (
    <button
      type="button"
      onClick={toggleMyPosition}
      disabled={locating}
      aria-pressed={showMyPosition}
      aria-label={locating ? 'Localisation en cours' : showMyPosition ? 'Masquer ma position' : 'Afficher ma position'}
      title={locating ? 'Localisation en cours' : showMyPosition ? 'Masquer ma position' : 'Afficher ma position'}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#123b4a] shadow-sm transition hover:border-blue-500 hover:text-blue-700 disabled:cursor-wait disabled:opacity-70"
    >
      {showMyPosition ? <EyeOff size={16} /> : <LocateFixed size={16} />}
    </button>
  );

  function renderMarkers(map, items, userPosition) {
    const markerState = markerStateRef.current;
    const activeMarkerIds = new Set();

    items.forEach((vehicle) => {
      const coordinates = getCoordinates(vehicle);
      if (!coordinates) return;

      const markerId = String(vehicle.id ?? vehicle.busId ?? vehicle.immatriculation ?? coordinates.join(','));
      const popupText = `${vehicle.name || 'Camion'} · ${vehicle.status || 'Position reçue'}`;
      activeMarkerIds.add(markerId);

      const existing = markerState.vehicles.get(markerId);
      if (existing) {
        existing.marker.setLngLat(coordinates);
        existing.popup.setText(popupText);
        return;
      }

      const element = document.createElement('div');
      element.style.width = '30px';
      element.style.height = '30px';
      element.style.borderRadius = '50%';
      element.style.display = 'grid';
      element.style.placeItems = 'center';
      element.style.background = '#FF6A3D';
      element.style.border = '3px solid #121C2D';
      element.style.boxShadow = '0 4px 14px rgba(18, 28, 45, 0.28)';
      element.style.color = '#121C2D';
      element.style.fontSize = '15px';
      element.textContent = '🚚';

      const popup = new mapboxgl.Popup({ offset: 18 }).setText(popupText);
      const marker = new mapboxgl.Marker({ element }).setLngLat(coordinates).setPopup(popup).addTo(map);
      markerState.vehicles.set(markerId, { marker, popup });
    });

    markerState.vehicles.forEach((entry, markerId) => {
      if (!activeMarkerIds.has(markerId)) {
        entry.marker.remove();
        markerState.vehicles.delete(markerId);
      }
    });

    const userCoordinates = getCoordinates({ coordinates: userPosition });
    if (userCoordinates) {
      if (markerState.user) {
        markerState.user.setLngLat(userCoordinates);
        return;
      }

      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.alignItems = 'center';
      wrapper.style.pointerEvents = 'none';
      wrapper.style.filter = 'drop-shadow(0 10px 18px rgba(15, 23, 42, 0.18))';
      wrapper.setAttribute('role', 'img');
      wrapper.setAttribute('aria-label', 'Moi, position actuelle');

      const label = document.createElement('div');
      label.textContent = 'Moi';
      label.style.background = '#2563eb';
      label.style.color = '#ffffff';
      label.style.padding = '8px 14px';
      label.style.borderRadius = '999px';
      label.style.fontSize = '14px';
      label.style.fontWeight = '700';
      label.style.lineHeight = '1';
      label.style.letterSpacing = '0';
      label.style.boxShadow = '0 2px 8px rgba(15, 23, 42, 0.24)';

      const labelPointer = document.createElement('div');
      labelPointer.style.width = '0';
      labelPointer.style.height = '0';
      labelPointer.style.borderLeft = '7px solid transparent';
      labelPointer.style.borderRight = '7px solid transparent';
      labelPointer.style.borderTop = '8px solid #2563eb';
      labelPointer.style.marginBottom = '-2px';

      const pinElement = document.createElement('div');
      pinElement.className = 'shared-location-pin';
      pinElement.style.position = 'relative';
      pinElement.style.width = '22px';
      pinElement.style.height = '22px';
      pinElement.style.borderRadius = '50%';
      pinElement.style.background = '#38bdf8';
      pinElement.style.border = '3px solid #ffffff';
      pinElement.style.boxShadow = '0 0 0 7px rgba(56, 189, 248, 0.22), 0 6px 14px rgba(15, 23, 42, 0.28)';
      pinElement.style.display = 'block';
      pinElement.innerHTML = '<div style="position:absolute;inset:6px;border-radius:50%;background:#ffffff;"></div>';

      wrapper.appendChild(label);
      wrapper.appendChild(labelPointer);
      wrapper.appendChild(pinElement);

      markerState.user = new mapboxgl.Marker({ element: wrapper, anchor: 'bottom' }).setLngLat(userCoordinates).addTo(map);
    } else if (markerState.user) {
      markerState.user.remove();
      markerState.user = null;
    }
  }

  useEffect(() => {
    const [departurePosition] = JSON.parse(mapInputsRef.current.focusKey);
    const hasDeparturePosition = departurePosition?.length === 2 && departurePosition.every(Number.isFinite);
    const markerState = markerStateRef.current;
    const token = mapboxToken;
    if (!containerRef.current) return undefined;

    if (!token) {
      containerRef.current.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;background:#f8fafc;color:#123b4a;font-weight:600;">Token Mapbox manquant</div>';
      return undefined;
    }

    containerRef.current.replaceChildren();
    mapboxgl.accessToken = token;
    const routeRequestController = new AbortController();
    let resizeFrame = null;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: hasDeparturePosition ? departurePosition : [-13.8, 13.8],
      zoom: hasDeparturePosition ? 5.8 : 5.2,
      attributionControl: false,
      logoPosition: 'top-right',
      preserveDrawingBuffer: true
    });
    const updateFocusPosition = () => {
      const [currentDeparturePosition] = JSON.parse(mapInputsRef.current.focusKey);
      if (!currentDeparturePosition || !onFocusPositionChange) return;
      const projectedPosition = map.project(currentDeparturePosition);
      onFocusPositionChange({ x: projectedPosition.x, y: projectedPosition.y });
    };
    map.on('move', updateFocusPosition);
    map.on('resize', updateFocusPosition);

    if (showControls) map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      const routeLinesToDraw = JSON.parse(mapInputsRef.current.routeKey);
      const [currentDeparturePosition, currentDepartureName] = JSON.parse(mapInputsRef.current.focusKey);
      const hasDeparturePosition = currentDeparturePosition?.length === 2 && currentDeparturePosition.every(Number.isFinite);
      map.getStyle().layers.forEach((layer) => {
        if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
          const nameField = language === 'en' ? 'name_en' : 'name_fr';
          map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', nameField], ['get', 'name']]);
        }
      });

      if (showRoute) {
        const routeColors = ['#FF6A3D', '#0F766E', '#2563EB', '#D97706', '#64748B'];
        routeLinesToDraw.forEach((routePoints, index) => {
        const sourceId = `fleet-route-${index}`;
        const routeColor = routeColors[index % routeColors.length];
        map.addSource(sourceId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: routePoints } } });
        map.addLayer({
          id: `${sourceId}-casing`,
          type: 'line',
          source: sourceId,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.96 }
        });
        map.addLayer({
          id: `${sourceId}-line`,
          type: 'line',
          source: sourceId,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': routeColor, 'line-width': 5, 'line-opacity': 1 }
        });

        const [start, end] = [routePoints[0], routePoints[routePoints.length - 1]];
        const routeUrl = `https://router.project-osrm.org/route/v1/driving/${start.join(',')};${end.join(',')}?overview=full&geometries=geojson&steps=false`;
        fetch(routeUrl, { signal: routeRequestController.signal })
          .then((response) => response.ok ? response.json() : null)
          .then((result) => {
            const roadCoordinates = result?.routes?.[0]?.geometry?.coordinates;
            if (routeRequestController.signal.aborted) return;
            const source = map.getSource(sourceId);
            if (source && roadCoordinates?.length > 1) source.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: roadCoordinates } });
          })
          .catch(() => {});
        });
      }

      const allRoutePoints = routeLinesToDraw.flat();
      renderMarkers(map, vehiclesRef.current, myPositionRef.current);
      if (hasDeparturePosition) {
        updateDepartureMarker(map, markerState, currentDeparturePosition, currentDepartureName, translate, preserveInstanceOnFocusChange);
        if (focusRoute && allRoutePoints.length > 1) {
          const routeBounds = allRoutePoints.slice(1).reduce(
            (bounds, point) => bounds.extend(point),
            new mapboxgl.LngLatBounds(allRoutePoints[0], allRoutePoints[0])
          );
          const leftPadding = Math.min(220, map.getContainer().clientWidth * 0.34);
          map.fitBounds(routeBounds, { padding: { top: 48, right: 48, bottom: 48, left: leftPadding }, maxZoom: 7.2, duration: 0 });
        } else {
          map.easeTo({ center: currentDeparturePosition, zoom: focusRoute ? 7.2 : 6.2, duration: 0 });
        }
        markerState.hasFocusedPositions = true;
      } else if (focusRequestRef.current > 0) {
        markerState.hasFocusedPositions = focusOnMyPosition(map, myPositionRef.current);
      } else if (allRoutePoints.length > 1) {
        const bounds = allRoutePoints.slice(1).reduce((result, point) => result.extend(point), new mapboxgl.LngLatBounds(allRoutePoints[0], allRoutePoints[0]));
        map.fitBounds(bounds, { padding: 70, duration: 0 });
        markerState.hasFocusedPositions = true;
      } else {
        markerState.hasFocusedPositions = focusOnPositions(map, vehiclesRef.current);
      }

      resizeFrame = requestAnimationFrame(() => {
        if (mapRef.current !== map) return;
        map.resize();
        updateFocusPosition();
      });
    });

    mapRef.current = map;
    return () => {
      routeRequestController.abort();
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      markerState.vehicles.forEach(({ marker }) => marker.remove());
      markerState.vehicles.clear();
      markerState.user?.remove();
      markerState.user = null;
      markerState.departure?.remove();
      markerState.departure = null;
      markerState.hasFocusedPositions = false;
      map.remove();
      mapRef.current = null;
    };
  }, [mapRouteKey, mapboxToken, mapFocusKey, onFocusPositionChange, showControls, showRoute, focusRoute, language, translate, preserveInstanceOnFocusChange]);

  useEffect(() => {
    if (!preserveInstanceOnFocusChange) return;
    const map = mapRef.current;
    const [departurePosition, departureName] = JSON.parse(mapInputsRef.current.focusKey);
    if (!map?.isStyleLoaded() || !Array.isArray(departurePosition) || !departurePosition.every(Number.isFinite)) return;

    updateDepartureMarker(map, markerStateRef.current, departurePosition, departureName, translate, preserveInstanceOnFocusChange);
    markerStateRef.current.hasFocusedPositions = true;
    const routePoints = JSON.parse(mapInputsRef.current.routeKey).flat();
    if (focusRoute && routePoints.length > 1) {
      const bounds = routePoints.slice(1).reduce(
        (result, point) => result.extend(point),
        new mapboxgl.LngLatBounds(routePoints[0], routePoints[0])
      );
      const leftPadding = Math.min(220, map.getContainer().clientWidth * 0.34);
      map.fitBounds(bounds, { padding: { top: 48, right: 48, bottom: 48, left: leftPadding }, maxZoom: 7.2, duration: 500 });
    } else {
      map.easeTo({ center: departurePosition, zoom: 6.2, duration: 500 });
    }
    if (onFocusPositionChange) {
      const projectedPosition = map.project(departurePosition);
      onFocusPositionChange({ x: projectedPosition.x, y: projectedPosition.y });
    }
  }, [preserveInstanceOnFocusChange, focusKey, focusRoute, onFocusPositionChange, translate]);

  useEffect(() => {
    if (!mapRef.current?.isStyleLoaded()) return;
    renderMarkers(mapRef.current, vehicles, activeUserPosition);
    const markerState = markerStateRef.current;
    if (!markerState.hasFocusedPositions) {
      markerState.hasFocusedPositions = focusOnPositions(mapRef.current, vehicles);
    }
  }, [vehicles, activeUserPosition]);

  useEffect(() => {
    if (!focusRequest || !activeUserPosition || !mapRef.current?.isStyleLoaded()) return;
    if (focusOnMyPosition(mapRef.current, activeUserPosition)) {
      markerStateRef.current.hasFocusedPositions = true;
    }
  }, [focusRequest, activeUserPosition]);

  return (
    <div
      className={isExpanded ? 'route-map-shell route-map-shell-expanded' : `route-map-shell relative ${className}`}
      role={isExpanded ? 'region' : undefined}
      aria-label={isExpanded ? 'Carte agrandie' : undefined}
    >
      {isExpanded && <form onSubmit={searchPlace} className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-[#2F80ED] sm:max-w-2xl">
          <Search size={17} className="shrink-0 text-slate-400" />
          <input value={placeQuery} onChange={(event) => setPlaceQuery(event.target.value)} placeholder="Rechercher une ville ou un lieu…" aria-label="Rechercher un lieu sur la carte" className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
          <button type="submit" disabled={placeSearchLoading || !placeQuery.trim()} aria-label="Rechercher le lieu" title="Rechercher le lieu" className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#2F80ED] text-white disabled:opacity-50"><Search size={15} /></button>
        </div>
        {placeSearchError && <p role="status" className="hidden text-sm text-rose-600 lg:block">{placeSearchError}</p>}
        <div className="flex shrink-0 items-center gap-2">
          {locationError && <p role="status" className="hidden max-w-56 text-xs text-rose-600 xl:block">{locationError}</p>}
          {myPositionButton}
          <button type="button" onClick={() => setIsExpanded(false)} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-[#123b4a] hover:border-blue-500" aria-label="Quitter la vue agrandie"><Minimize2 size={16} /><span className="hidden sm:inline">Réduire</span></button>
        </div>
      </form>}
      <div
        ref={containerRef}
        className="route-map"
        aria-label="Carte des itinéraires et positions"
        style={{ width: '100%', height: isExpanded ? 'auto' : '100%', minHeight: isExpanded ? 0 : '420px' }}
      />
      {!isExpanded && showControls && <div className="absolute left-4 top-4 z-10 flex flex-col items-start gap-2">
        <button type="button" onClick={toggleExpanded} aria-label="Agrandir la carte" title="Agrandir la carte" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#123b4a] shadow-md transition hover:border-blue-500 hover:text-blue-700"><Maximize2 size={16} /></button>
        {myPositionButton}
        {locationError && <p role="status" className="max-w-64 rounded-md bg-white px-3 py-2 text-xs font-medium text-rose-700 shadow-md">{locationError}</p>}
      </div>}
    </div>
  );
}
