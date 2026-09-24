'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import { MapPin } from 'lucide-react';
import { parseDecimal } from '../../lib/number-format';
import { getSitesCopy, type SiteLocale } from '../../lib/sites-locale';
import { MAPBOX_PUBLIC_TOKEN, MAPBOX_TILES_URL } from './mapbox-tiles';

const DEFAULT_CENTER: [number, number] = [7.9, 2.8];
const COUNTRY_CENTERS: Record<string, [number, number]> = {
  ghana: [7.95, -1.02],
  nigeria: [9.08, 8.68],
  cameroon: [5.96, 12.35],
};

export function RegistrationMap({
  latitude,
  longitude,
  country,
  locale,
  onPick,
}: {
  latitude: string;
  longitude: string;
  country: string;
  locale: SiteLocale;
  onPick: (latitude: string, longitude: string) => void;
}) {
  const copy = getSitesCopy(locale);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const onPickRef = useRef(onPick);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const lat = parseDecimal(latitude);
  const lng = parseDecimal(longitude);
  const valid = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (!MAPBOX_PUBLIC_TOKEN) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    void (async () => {
      try {
        const L = await import('leaflet');
        await import('leaflet/dist/leaflet.css');
        if (cancelled || !containerRef.current) return;
        const map = L.map(containerRef.current, { zoomControl: false }).setView(DEFAULT_CENTER, 4);
        mapRef.current = map;
        const tiles = L.tileLayer(MAPBOX_TILES_URL, {
          tileSize: 512,
          zoomOffset: -1,
          maxZoom: 20,
          attribution: '© Mapbox © OpenStreetMap contributors',
        }).addTo(map);
        let loadedTile = false;
        let tileErrors = 0;
        tiles.on('tileload', () => { loadedTile = true; });
        tiles.on('tileerror', () => {
          tileErrors += 1;
          if (!cancelled && !loadedTile && tileErrors >= 3) setFailed(true);
        });
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        map.on('click', (event: { latlng: { lat: number; lng: number } }) => {
          onPickRef.current(event.latlng.lat.toFixed(6), event.latlng.lng.toFixed(6));
        });
        resizeObserver = new ResizeObserver(() => map.invalidateSize());
        resizeObserver.observe(containerRef.current);
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const timeout = window.setTimeout(() => {
      void (async () => {
        const L = await import('leaflet');
        const map = mapRef.current;
        if (!map) return;
        if (valid) {
          const point: [number, number] = [lat, lng];
          if (!markerRef.current) {
            markerRef.current = L.marker(point, {
              icon: L.divIcon({
                html: '<span style="display:block;width:20px;height:20px;border:3px solid white;border-radius:50%;background:#E4002B;box-shadow:0 2px 8px rgba(10,14,39,.5)"></span>',
                className: '', iconSize: [20, 20], iconAnchor: [10, 10],
              }),
            }).addTo(map);
          } else {
            markerRef.current.setLatLng(point);
          }
          map.flyTo(point, Math.max(map.getZoom(), 15), { duration: 0.7 });
        } else {
          markerRef.current?.remove();
          markerRef.current = null;
          const center = COUNTRY_CENTERS[country.trim().toLowerCase()] ?? DEFAULT_CENTER;
          map.flyTo(center, country ? 6 : 4, { duration: 0.7 });
        }
      })();
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [ready, valid, lat, lng, country]);

  return (
    <div className="relative min-h-72 overflow-hidden rounded-xl border border-border bg-surface-2 lg:min-h-[440px]">
      <div ref={containerRef} className="absolute inset-0" role="img" aria-label={copy.register.mapTitle} data-testid="registration-map" />
      {(!ready || failed || !MAPBOX_PUBLIC_TOKEN) && (
        <div className="absolute inset-0 grid place-items-center bg-surface-2 px-6 text-center">
          <div>
            <MapPin className="mx-auto h-7 w-7 text-primary" />
            <p className="mt-2 text-sm font-semibold text-foreground">{copy.register.mapTitle}</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              {failed || !MAPBOX_PUBLIC_TOKEN ? copy.register.mapUnavailable : copy.register.mapLoading}
            </p>
          </div>
        </div>
      )}
      {ready && !failed && (
        <div className="pointer-events-none absolute left-3 top-3 right-3 rounded-lg bg-background/95 px-3 py-2 text-xs font-medium text-foreground shadow-sm">
          {valid ? copy.register.mapPinned : copy.register.mapPickHint}
        </div>
      )}
    </div>
  );
}
