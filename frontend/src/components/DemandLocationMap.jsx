import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getMapboxToken } from '../utils/mapboxToken';

const DEFAULT_CENTER = [-17.45, 14.69];

export default function DemandLocationMap({ coordinates, onSelect, neighborhood = '', readOnly = false, height = 280 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [token, setToken] = useState('');
  const onSelectRef = useRef(onSelect);
  const readOnlyRef = useRef(readOnly);
  const validCoordinates = Array.isArray(coordinates)
    && coordinates.length === 2
    && coordinates.every((coordinate) => Number.isFinite(Number(coordinate)));
  const coordinatesKey = validCoordinates ? `${Number(coordinates[0])},${Number(coordinates[1])}` : '';
  const coordinatesRef = useRef(coordinates);
  const validCoordinatesRef = useRef(validCoordinates);

  useEffect(() => {
    let active = true;
    getMapboxToken().then((value) => { if (active) setToken(value); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    onSelectRef.current = onSelect;
    readOnlyRef.current = readOnly;
  }, [onSelect, readOnly, neighborhood]);

  useEffect(() => {
    coordinatesRef.current = coordinates;
    validCoordinatesRef.current = validCoordinates;
  }, [coordinates, validCoordinates]);

  useEffect(() => {
    if (!token || !containerRef.current) return undefined;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: validCoordinatesRef.current ? coordinatesRef.current : DEFAULT_CENTER,
      zoom: validCoordinatesRef.current ? 14 : 5.5,
      attributionControl: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => setMapReady(true));
    map.on('click', (event) => {
      if (!readOnlyRef.current) onSelectRef.current?.([event.lngLat.lng, event.lngLat.lat]);
    });
    mapRef.current = map;

    return () => {
      setMapReady(false);
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !map.isStyleLoaded()) return;

    if (!coordinatesKey) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const selectedCoordinates = coordinatesKey.split(',').map(Number);
    const popup = new mapboxgl.Popup({ offset: 18 }).setText(neighborhood || 'Position du chargement');
    if (markerRef.current) {
      markerRef.current.setLngLat(selectedCoordinates);
      markerRef.current.setPopup(popup);
    } else {
      markerRef.current = new mapboxgl.Marker({ color: '#FF6A3D' })
        .setLngLat(selectedCoordinates)
        .setPopup(popup)
        .addTo(map);
    }
    map.easeTo({ center: selectedCoordinates, zoom: 14, duration: 400 });
  }, [coordinatesKey, mapReady, neighborhood]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100" style={{ height }}>
      {token ? (
        <div ref={containerRef} className="h-full w-full" aria-label={readOnly ? 'Carte du point de chargement' : 'Sélectionner le point de chargement sur la carte'} />
      ) : (
        <div className="flex h-full items-center justify-center p-5 text-center text-sm text-slate-600">
          Carte indisponible : configurez VITE_MAPBOX_TOKEN. Vous pouvez saisir les coordonnées manuellement.
        </div>
      )}
      {token && !readOnly && <p className="pointer-events-none absolute bottom-3 left-3 rounded bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow">Cliquez sur la carte pour placer le point</p>}
    </div>
  );
}