'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import { MapPin } from 'lucide-react';
import { findMarket } from '../../lib/markets';
import { parseDecimal } from '../../lib/number-format';
import { getSitesCopy, type SiteLocale } from '../../lib/sites-locale';
import { SITE_MAP_ENABLED, SITE_MAP_TILES_URL, SITE_MAP_TILE_OPTIONS } from './mapbox-tiles';

const DEFAULT_CENTER: [number, number] = [7.9, 2.8];

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
    if (!SITE_MAP_ENABLED) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    void (async () => {
      try {
        const L = await import('leaflet');
        await import('leaflet/dist/leaflet.css');
        if (cancelled || !containerRef.current) return;
        const map = L.map(containerRef.current, { zoomControl: false }).setView(DEFAULT_CENTER, 4);
        mapRef.current = map;
        const tiles = L.tileLayer(SITE_MAP_TILES_URL, SITE_MAP_TILE_OPTIONS).addTo(map);
        let loadedTile = false;
        let tileErrors = 0;
        tiles.on('tileload', () => {
          loadedTile = true;
        });
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
                html: '<span class="block h-5 w-5 rounded-full border-[3px] border-background bg-primary shadow-lg"></span>',
                className: '',
                iconSize: [20, 20],
                iconAnchor: [10, 10],
              }),
            }).addTo(map);
          } else {
            markerRef.current.setLatLng(point);
          }
          map.flyTo(point, Math.max(map.getZoom(), 15), { duration: 0.7 });
        } else {
          markerRef.current?.remove();
          markerRef.current = null;
          const market = findMarket(country);
          const center: [number, number] = market
            ? [market.center[1], market.center[0]]
            : DEFAULT_CENTER;
          map.flyTo(center, country ? 6 : 4, { duration: 0.7 });
        }
      })();
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [ready, valid, lat, lng, country]);

  return (
    <div className="relative min-h-72 overflow-hidden rounded-xl border border-border bg-surface-2 lg:min-h-[440px]">
      <div
        ref={containerRef}
        className="absolute inset-0"
        role="img"
        aria-label={copy.register.mapTitle}
        data-testid="registration-map"
      />
      {(!ready || failed || !SITE_MAP_ENABLED) && (
        <div className="absolute inset-0 grid place-items-center bg-surface-2 px-6 text-center">
          <div>
            <MapPin className="mx-auto h-7 w-7 text-primary" />
            <p className="mt-2 text-sm font-semibold text-foreground">{copy.register.mapTitle}</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              {failed || !SITE_MAP_ENABLED
                ? copy.register.mapUnavailable
                : copy.register.mapLoading}
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
