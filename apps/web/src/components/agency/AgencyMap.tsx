'use client';

import { useEffect, useRef, useState } from 'react';
import type { LayerGroup, Map as LeafletMap, Marker, TileLayer } from 'leaflet';
import { Compass, LocateFixed, MapPin, Minus, Plus, RotateCw } from 'lucide-react';
import { displayNumber } from '../../lib/locale-format';
import { straightLineDistanceKm } from '../../lib/agency-planning';
import {
  LOCAL_REVIEW_OSM_MAP,
  SITE_MAP_ENABLED,
  SITE_MAP_TILES_URL,
  SITE_MAP_TILE_OPTIONS,
} from '../sites/mapbox-tiles';
import './agency-map.css';

export interface AgencyMapSite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface AgencyMapProps {
  sites: AgencyMapSite[];
  selectedId: string | null;
  shortlistIds: string[];
  onSelect: (id: string) => void;
  locale: 'en' | 'fr';
  focusVersion?: number;
}

const DEFAULT_CENTER: [number, number] = [6.46, 3.42];

function validPoint(site: AgencyMapSite): boolean {
  return (
    Number.isFinite(site.latitude) &&
    Number.isFinite(site.longitude) &&
    Math.abs(site.latitude) <= 90 &&
    Math.abs(site.longitude) <= 180
  );
}

function motionAllowed(): boolean {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function mapPadding(map: LeafletMap, hasSelection: boolean) {
  const width = map.getSize().x;
  if (width < 900) {
    return {
      paddingTopLeft: [36, 48] as [number, number],
      paddingBottomRight: [36, 90] as [number, number],
    };
  }
  return {
    paddingTopLeft: [hasSelection ? Math.min(365, width * 0.27) : 70, 70] as [number, number],
    paddingBottomRight: [Math.min(440, width * 0.33), 135] as [number, number],
  };
}

export function AgencyMap({
  sites,
  selectedId,
  shortlistIds,
  onSelect,
  locale,
  focusVersion = 0,
}: AgencyMapProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const markersRef = useRef(new Map<string, { marker: Marker; state: string }>());
  const distanceLayerRef = useRef<LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  const sitesRef = useRef(sites);
  const selectedRef = useRef(selectedId);
  const [ready, setReady] = useState(false);
  const [mapVersion, setMapVersion] = useState(0);
  const [tilesReady, setTilesReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  onSelectRef.current = onSelect;
  sitesRef.current = sites;
  selectedRef.current = selectedId;
  const fr = locale === 'fr';
  const coordinateKey = sites
    .map((site) => `${site.id}:${site.latitude}:${site.longitude}`)
    .join('|');
  const labels = {
    registered: fr ? 'Répertorié' : 'Registered',
    shortlisted: fr ? 'Présélection' : 'Shortlisted',
    selected: fr ? 'Sélectionné' : 'Selected',
    straightLine: fr ? 'à vol d’oiseau' : 'straight-line',
  };

  const fitInventory = () => {
    const map = mapRef.current;
    const L = leafletRef.current;
    const points = sitesRef.current.filter(validPoint);
    if (!map || !L) return;
    if (!points.length) {
      map.setView(DEFAULT_CENTER, 10, { animate: motionAllowed() });
      return;
    }
    map.fitBounds(L.latLngBounds(points.map((site) => [site.latitude, site.longitude])), {
      ...mapPadding(map, selectedRef.current !== null),
      maxZoom: 15,
      animate: motionAllowed(),
      duration: 0.5,
    });
  };

  useEffect(() => {
    if (!SITE_MAP_ENABLED) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let themeObserver: MutationObserver | null = null;
    let loadTimeout: ReturnType<typeof setTimeout> | null = null;
    let tiles: TileLayer | null = null;
    setReady(false);
    setFailed(false);
    setTilesReady(false);
    void (async () => {
      try {
        const L = await import('leaflet');
        await import('leaflet/dist/leaflet.css');
        if (cancelled || !canvasRef.current) return;
        leafletRef.current = L;
        const map = L.map(canvasRef.current, {
          zoomControl: false,
          attributionControl: false,
          scrollWheelZoom: true,
          zoomAnimation: motionAllowed(),
          fadeAnimation: motionAllowed(),
          markerZoomAnimation: motionAllowed(),
        }).setView(DEFAULT_CENTER, 10);
        mapRef.current = map;
        L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);
        L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 100 }).addTo(map);
        const tileUrl = () =>
          LOCAL_REVIEW_OSM_MAP
            ? SITE_MAP_TILES_URL
            : SITE_MAP_TILES_URL.replace(
                'streets-v12',
                document.documentElement.dataset.theme === 'dark' ? 'dark-v11' : 'streets-v12',
              );
        tiles = L.tileLayer(tileUrl(), SITE_MAP_TILE_OPTIONS).addTo(map);
        let tileErrors = 0;
        let loadedThisRequest = false;
        tiles.on('loading', () => {
          loadedThisRequest = false;
          tileErrors = 0;
        });
        tiles.on('tileload', () => {
          if (cancelled) return;
          loadedThisRequest = true;
          tileErrors = 0;
          if (loadTimeout) clearTimeout(loadTimeout);
          setTilesReady(true);
          setFailed(false);
        });
        tiles.on('tileerror', () => {
          tileErrors += 1;
          if (!cancelled && !loadedThisRequest && tileErrors >= 3) setFailed(true);
        });
        loadTimeout = setTimeout(() => {
          if (!cancelled && !loadedThisRequest) setFailed(true);
        }, 15000);
        themeObserver = new MutationObserver(() => tiles?.setUrl(tileUrl()));
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-theme'],
        });
        resizeObserver = new ResizeObserver(() => map.invalidateSize({ animate: false }));
        resizeObserver.observe(canvasRef.current);
        // Cached module imports can batch ready=false/true during retry. The new
        // instance must still rebuild every marker, path and viewport effect.
        setMapVersion((version) => version + 1);
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (loadTimeout) clearTimeout(loadTimeout);
      resizeObserver?.disconnect();
      themeObserver?.disconnect();
      distanceLayerRef.current = null;
      markersRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
    };
  }, [retryVersion]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!ready || !map || !L) return;
    const visibleSites = sites.filter(validPoint);
    const visibleIds = new Set(visibleSites.map((site) => site.id));
    for (const [id, entry] of markersRef.current) {
      if (!visibleIds.has(id)) {
        entry.marker.remove();
        markersRef.current.delete(id);
      }
    }
    for (const site of visibleSites) {
      const shortlistIndex = shortlistIds.indexOf(site.id);
      const selected = selectedId === site.id;
      const state = `${selected ? 'selected' : shortlistIndex >= 0 ? 'shortlisted' : 'registered'}:${shortlistIndex}`;
      const label = `${site.name} · ${selected ? labels.selected : shortlistIndex >= 0 ? `${labels.shortlisted} ${displayNumber(shortlistIndex + 1, locale, { maximumFractionDigits: 0 })}` : labels.registered}`;
      let entry = markersRef.current.get(site.id);
      if (!entry || entry.state !== state) {
        const pin = document.createElement('span');
        pin.className = `agency-map-pin ${selected ? 'is-selected' : shortlistIndex >= 0 ? 'is-shortlisted' : ''}`;
        pin.setAttribute('aria-hidden', 'true');
        const board = document.createElement('span');
        board.className = 'agency-map-pin-board';
        if (shortlistIndex >= 0)
          board.textContent = displayNumber(shortlistIndex + 1, locale, {
            maximumFractionDigits: 0,
          });
        else {
          const slots = document.createElement('span');
          slots.className = 'agency-map-pin-slots';
          board.appendChild(slots);
        }
        const stem = document.createElement('span');
        stem.className = 'agency-map-pin-stem';
        const foot = document.createElement('span');
        foot.className = 'agency-map-pin-foot';
        pin.append(board, stem, foot);
        const icon = L.divIcon({
          html: pin,
          className: 'agency-map-marker',
          iconSize: [44, 52],
          iconAnchor: [22, 46],
          tooltipAnchor: [0, -42],
        });
        if (entry) {
          entry.marker.setIcon(icon);
          entry.state = state;
        } else {
          const marker = L.marker([site.latitude, site.longitude], {
            icon,
            keyboard: true,
            title: label,
            riseOnHover: true,
          });
          marker.on('click', () => onSelectRef.current(site.id));
          marker.addTo(map);
          entry = { marker, state };
          markersRef.current.set(site.id, entry);
        }
      }
      entry.marker.setLatLng([site.latitude, site.longitude]);
      entry.marker.setZIndexOffset(selected ? 1000 : shortlistIndex >= 0 ? 500 : 0);
      const element = entry.marker.getElement();
      if (element) {
        element.setAttribute('role', 'button');
        element.setAttribute('aria-label', label);
        element.setAttribute('aria-pressed', String(selected));
        element.setAttribute('title', label);
        element.dataset.siteId = site.id;
        element.onkeydown = (event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            onSelectRef.current(site.id);
          }
        };
      }
      const tooltipText = document.createElement('span');
      tooltipText.textContent = site.name;
      if (entry.marker.getTooltip()) entry.marker.setTooltipContent(tooltipText);
      else
        entry.marker.bindTooltip(tooltipText, {
          direction: 'top',
          className: 'agency-map-name-tooltip',
        });
    }
  }, [ready, mapVersion, sites, selectedId, shortlistIds, locale]);

  useEffect(() => {
    if (ready) fitInventory();
    // Selection/style changes should preserve the planner's current map view.
  }, [ready, mapVersion, coordinateKey, focusVersion]);

  useEffect(() => {
    const map = mapRef.current;
    const site = sites.find((point) => point.id === selectedId && validPoint(point));
    if (ready && map && site) {
      map.panInside([site.latitude, site.longitude], {
        ...mapPadding(map, true),
        animate: motionAllowed(),
      });
    }
  }, [ready, mapVersion, selectedId, coordinateKey]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!ready || !map || !L) return;
    distanceLayerRef.current?.remove();
    const group = L.layerGroup().addTo(map);
    distanceLayerRef.current = group;
    const first = sites.find((site) => site.id === shortlistIds[0] && validPoint(site));
    const second = sites.find((site) => site.id === shortlistIds[1] && validPoint(site));
    if (first && second) {
      const label = document.createElement('span');
      label.textContent = `1 → 2 · ${displayNumber(straightLineDistanceKm(first, second)!, locale, { maximumFractionDigits: 2 })} km ${labels.straightLine}`;
      label.title = fr
        ? 'Calcul géodésique à partir des coordonnées enregistrées'
        : 'Geodesic calculation from registered coordinates';
      const line = L.polyline(
        [
          [first.latitude, first.longitude],
          [second.latitude, second.longitude],
        ],
        {
          color: getComputedStyle(canvasRef.current!).getPropertyValue('--color-warning').trim(),
          weight: 2,
          dashArray: '7 7',
          interactive: false,
          className: 'agency-map-distance-line',
        },
      ).addTo(group);
      line.bindTooltip(label, {
        permanent: true,
        direction: 'center',
        className: 'agency-map-distance-label',
        opacity: 1,
      });
    }
    return () => {
      group.remove();
      if (distanceLayerRef.current === group) distanceLayerRef.current = null;
    };
  }, [ready, mapVersion, sites, shortlistIds, locale]);

  const unavailable = !SITE_MAP_ENABLED || failed;
  return (
    <div className={`agency-map${selectedId ? ' has-selection' : ''}`} data-testid="agency-map">
      <div
        ref={canvasRef}
        className="agency-map-canvas"
        role="region"
        aria-label={fr ? 'Carte interactive des panneaux' : 'Interactive billboard map'}
        data-testid="agency-map-canvas"
      />
      {(!tilesReady || unavailable) && (
        <div className="agency-map-status" role="status" aria-live="polite">
          <MapPin size={22} aria-hidden="true" />
          <strong>
            {unavailable
              ? fr
                ? 'Carte indisponible'
                : 'Map unavailable'
              : fr
                ? 'Chargement de la carte'
                : 'Loading the map'}
          </strong>
          <p>
            {unavailable
              ? fr
                ? 'Vous pouvez toujours consulter et sélectionner les panneaux dans la liste.'
                : 'You can still browse and select boards from the inventory list.'
              : fr
                ? 'Vos panneaux apparaîtront ici.'
                : 'Your boards will appear here.'}
          </p>
          {failed && SITE_MAP_ENABLED && (
            <button type="button" onClick={() => setRetryVersion((value) => value + 1)}>
              <RotateCw size={15} aria-hidden="true" />
              {fr ? 'Réessayer' : 'Retry map'}
            </button>
          )}
        </div>
      )}
      {ready && (
        <>
          <div
            className="agency-map-controls"
            role="group"
            aria-label={fr ? 'Commandes de la carte' : 'Map controls'}
          >
            <div className="agency-map-north" title={fr ? 'Le nord est en haut' : 'North is up'}>
              <Compass size={21} aria-hidden="true" />
              <span>N</span>
            </div>
            <div className="agency-map-control-stack">
              <button
                type="button"
                aria-label={fr ? 'Zoom avant' : 'Zoom in'}
                onClick={() => mapRef.current?.zoomIn(1, { animate: motionAllowed() })}
              >
                <Plus size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={fr ? 'Zoom arrière' : 'Zoom out'}
                onClick={() => mapRef.current?.zoomOut(1, { animate: motionAllowed() })}
              >
                <Minus size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={fr ? 'Afficher tous les panneaux' : 'Fit all boards'}
                title={fr ? 'Afficher tous les panneaux' : 'Fit all boards'}
                onClick={fitInventory}
              >
                <LocateFixed size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div
            className="agency-map-legend"
            aria-label={fr ? 'Légende des panneaux' : 'Billboard legend'}
          >
            <span>
              <i className="agency-map-legend-symbol" aria-hidden="true" />
              {labels.registered}
            </span>
            <span>
              <i className="agency-map-legend-symbol is-shortlisted" aria-hidden="true">
                #
              </i>
              {labels.shortlisted}
            </span>
            <span>
              <i className="agency-map-legend-symbol is-selected" aria-hidden="true" />
              {labels.selected}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
