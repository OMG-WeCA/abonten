'use client';

/**
 * One-click immersive site map (execution plan §1.5.2). Opens full-screen over
 * the detail page, lazy-loads the map bundle only when opened, and shows
 * honest overlays only:
 *   - the stored coordinate, labelled "Registered location";
 *   - the entered orientation arrow, labelled "Facing (as entered)" — we do
 *     not independently verify facing yet;
 *   - an optional 500 m radius labelled as residents/roads context, not viewers;
 *   - the required Mapbox/OpenStreetMap attribution.
 *
 * No traffic, audience, footfall, or catchment overlays exist in this view —
 * those need the Part 2/3 data foundations (execution plan §1.5.2).
 *
 * Token discipline: the web app is a static Next.js export, so the public
 * `pk.` token is injected at build time via NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
 * (inlined and frozen after build; never committed). When no token was baked
 * in, the view degrades to copyable coordinates — a failed map must never
 * block the page. `sk.`-scoped tokens never reach this module.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Copy, Check } from 'lucide-react';
import { getSitesCopy, type SiteLocale } from '../../lib/sites-locale';
import { displayNumber } from '../../lib/locale-format';
import {
  LOCAL_REVIEW_OSM_MAP,
  SITE_MAP_ENABLED,
  SITE_MAP_TILES_URL,
  SITE_MAP_TILE_OPTIONS,
} from './mapbox-tiles';

export { MAPBOX_PUBLIC_TOKEN } from './mapbox-tiles';

const RADIUS_M = 500;

/** Scroll position to restore when the map overlay closes via the browser's
 * back button. Lives at module scope because the App Router may remount the
 * page subtree synchronously inside its own popstate handling — a
 * component-level listener can be detached mid-dispatch and never fire, so
 * the restoration must live outside React. Registered once per page load; a
 * null marker means no map session is pending restoration. */
let mapScrollRestore: number | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    const y = mapScrollRestore;
    if (y == null) return;
    mapScrollRestore = null;
    // The App Router restores its own cached scroll for the entry we pop to,
    // and the page scrolls smoothly, so the position can land after a single
    // correction. Keep correcting for a bounded number of frames regardless
    // of whether the position looks right yet.
    let attempts = 0;
    const correct = () => {
      attempts += 1;
      if (Math.abs(window.scrollY - y) > 1) {
        window.scrollTo(0, y);
      }
      if (attempts < 30) {
        requestAnimationFrame(correct);
      }
    };
    window.scrollTo(0, y);
    requestAnimationFrame(correct);
  });
}

export function SiteMapView({
  latitude,
  longitude,
  orientationDeg,
  locale,
  onExit,
}: {
  latitude: number;
  longitude: number;
  orientationDeg?: number | null;
  siteName: string;
  locale: SiteLocale;
  onExit: () => void;
}) {
  const copy = getSitesCopy(locale);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<{ remove: () => void } | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRadius, setShowRadius] = useState(false);
  const showRadiusRef = useRef(showRadius);
  const radiusApiRef = useRef<{ show: (v: boolean) => void } | null>(null);

  // Esc + browser back both exit; the overlay is pushed as a history state so
  // the route stays shareable and hardware back returns to the page.
  //
  // Listeners are attached once for the overlay's lifetime and read the latest
  // onExit through a ref: the App Router re-renders the parent during its own
  // popstate handling (giving onExit a new identity), which used to detach this
  // component's popstate listener mid-dispatch and leave the overlay open.
  // Every exit path also pops the pushed entry exactly once, so closing never
  // leaves a stale map entry behind (a dead back press afterwards), and the
  // scroll position captured at open time is restored on every path.
  const exitRef = useRef(onExit);
  useEffect(() => {
    exitRef.current = onExit;
  }, [onExit]);
  const historyCleanedRef = useRef(false);
  const scrollBeforeRef = useRef(0);
  // The App Router restores its own cached scroll position for the entry we
  // pop back to — asynchronously, which can land after a single rAF. Retry
  // for a few frames until our captured position sticks.
  const restoreScroll = () => {
    const y = scrollBeforeRef.current;
    mapScrollRestore = null;
    let attempts = 0;
    const tick = () => {
      attempts += 1;
      if (Math.abs(window.scrollY - y) > 1) {
        window.scrollTo(0, y);
      }
      if (attempts < 25) {
        requestAnimationFrame(tick);
      }
    };
    window.scrollTo(0, y);
    requestAnimationFrame(tick);
  };
  const exitWithCleanup = () => {
    if (historyCleanedRef.current) return;
    historyCleanedRef.current = true;
    exitRef.current();
    restoreScroll();
    if (window.history?.state?.siteMapView === true) window.history.back();
  };
  useEffect(() => {
    // Track the page position continuously while the overlay is open: a
    // smooth scroll started just before opening can still be settling behind
    // the fixed overlay, and the restore target must be where the page
    // actually was when the map closed.
    const capture = () => {
      scrollBeforeRef.current = window.scrollY;
      mapScrollRestore = window.scrollY;
    };
    capture();
    window.addEventListener('scroll', capture, { passive: true });
    // The browser's own scroll restoration would snap the page back to the
    // cached position of the entry we pop to, overriding ours; take manual
    // control for the session and give it back afterwards.
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        exitWithCleanup();
      }
    };
    const onPop = () => {
      if (historyCleanedRef.current) return; // the history.back() from our own exit(); already handled
      historyCleanedRef.current = true;
      exitRef.current();
      restoreScroll();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPop);
    if (window.history?.state?.siteMapView !== true) {
      window.history.pushState({ siteMapView: true }, '');
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('scroll', capture);
      window.history.scrollRestoration = previousScrollRestoration;
      // mapScrollRestore is deliberately NOT cleared here: the App Router can
      // remount this subtree synchronously inside its own popstate handling,
      // which detaches the listeners above mid-dispatch. The module-level
      // popstate handler consumes the marker itself, and exit paths clear it
      // when they restore directly. The overlay covers the page while open,
      // so an unmount without an explicit exit only happens on that same pop.
    };
    // Attached once per overlay; the exit path reads refs so the handler stays
    // stable across parent re-renders.
  }, []);

  useEffect(() => {
    if (!SITE_MAP_ENABLED) return; // fallback view below
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    void (async () => {
      try {
        // Raster tiles remain visible in browsers where WebGL is unavailable.
        const L = await import('leaflet');
        await import('leaflet/dist/leaflet.css');
        if (cancelled || !containerRef.current) return;
        const map = L.map(containerRef.current, { zoomControl: false }).setView(
          [latitude, longitude],
          16,
        );
        mapRef.current = map;
        resizeObserver = new ResizeObserver(() => map.invalidateSize());
        resizeObserver.observe(containerRef.current);

        const tiles = L.tileLayer(SITE_MAP_TILES_URL, SITE_MAP_TILE_OPTIONS).addTo(map);
        let loadedTile = false;
        let tileErrors = 0;
        tiles.on('tileload', () => {
          loadedTile = true;
        });
        tiles.on('tileerror', () => {
          tileErrors += 1;
          if (!loadedTile && tileErrors >= 3) setFailed(true);
        });

        const markerEl = document.createElement('div');
        markerEl.setAttribute('data-testid', 'site-map-marker');
        markerEl.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;';
        const pin = document.createElement('div');
        pin.style.cssText =
          'width:22px;height:22px;border-radius:50%;background:#E4002B;border:3px solid #fff;box-shadow:0 2px 8px rgba(10,14,39,.5);';
        const label = document.createElement('div');
        label.textContent = copy.detail.markerRegistered;
        label.style.cssText =
          'white-space:nowrap;background:#0A0E27;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;';
        markerEl.appendChild(pin);
        markerEl.appendChild(label);
        L.marker([latitude, longitude], {
          icon: L.divIcon({
            html: markerEl,
            className: '',
            iconSize: [22, 44],
            iconAnchor: [11, 22],
          }),
        }).addTo(map);

        if (orientationDeg != null && Number.isFinite(orientationDeg)) {
          const arrowEl = document.createElement('div');
          arrowEl.setAttribute('data-testid', 'site-map-orientation');
          const arrowInner = document.createElement('div');
          arrowInner.style.cssText = `display:flex;flex-direction:column;align-items:center;transform:rotate(${orientationDeg}deg);`;
          const triangle = document.createElement('div');
          triangle.style.cssText =
            'width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:16px solid #FFB020;';
          const arrowLabel = document.createElement('div');
          arrowLabel.textContent = copy.detail.markerFacing;
          arrowLabel.style.cssText =
            'white-space:nowrap;background:rgba(255,255,255,.95);color:#0A0A0A;font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;margin-top:2px;';
          arrowInner.appendChild(triangle);
          arrowInner.appendChild(arrowLabel);
          arrowEl.appendChild(arrowInner);
          L.marker([latitude, longitude], {
            icon: L.divIcon({
              html: arrowEl,
              className: '',
              iconSize: [22, 44],
              iconAnchor: [11, 22],
            }),
          }).addTo(map);
        }

        let radiusLayer: ReturnType<typeof L.circle> | null = null;
        radiusApiRef.current = {
          show: (show: boolean) => {
            if (show && !radiusLayer) {
              radiusLayer = L.circle([latitude, longitude], {
                radius: RADIUS_M,
                color: '#3B82F6',
                weight: 2,
                opacity: 0.6,
                fillColor: '#3B82F6',
                fillOpacity: 0.15,
              }).addTo(map);
            } else if (!show && radiusLayer) {
              radiusLayer.remove();
              radiusLayer = null;
            }
            showRadiusRef.current = show;
          },
        };
        radiusApiRef.current.show(showRadiusRef.current);
        L.control.zoom({ position: 'bottomright' }).addTo(map);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      radiusApiRef.current = null;
    };
  }, [latitude, longitude, orientationDeg, copy.detail.markerRegistered, copy.detail.markerFacing]);

  useEffect(() => {
    radiusApiRef.current?.show(showRadius);
  }, [showRadius]);

  const coordinates = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  const displayedCoordinates = `${displayNumber(latitude, locale, { minimumFractionDigits: 6, maximumFractionDigits: 6 })} ; ${displayNumber(longitude, locale, { minimumFractionDigits: 6, maximumFractionDigits: 6 })}`;
  const copyCoords = () => {
    void navigator.clipboard?.writeText(coordinates).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-[#0A0E27]" data-testid="site-map-overlay">
      <div className="relative flex h-full w-full flex-col">
        <div className="flex items-start justify-between gap-3 bg-[#0A0E27]/90 px-4 py-3">
          <button
            type="button"
            data-testid="site-map-back"
            onClick={exitWithCleanup}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4" />
            {copy.detail.backToSite}
          </button>
          <button
            type="button"
            data-testid="site-map-radius-toggle"
            onClick={() => setShowRadius((previous) => !previous)}
            aria-pressed={showRadius}
            className="inline-flex min-h-11 items-center rounded-lg bg-white/10 px-4 text-xs font-bold text-white transition hover:bg-white/20"
          >
            {copy.detail.mapRadiusToggle}
          </button>
        </div>

        {SITE_MAP_ENABLED ? (
          <div className="relative min-h-0 flex-1">
            <div ref={containerRef} data-testid="site-map-canvas" className="h-full w-full" />
            {showRadius && (
              <p
                data-testid="site-map-radius-note"
                className="absolute bottom-16 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-[#0A0E27]/90 px-3 py-2 text-center text-xs font-semibold text-white shadow-lg"
              >
                {copy.detail.mapRadiusNote}
              </p>
            )}
            {failed && (
              <div className="absolute inset-0 z-20 grid place-items-center bg-[#0A0E27]/95 px-6 text-center">
                <div className="space-y-3">
                  <p className="text-sm text-white/80">{copy.detail.mapFailed}</p>
                  <p className="text-sm font-bold text-white">{displayedCoordinates}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-surface-2 px-6 text-center">
            <p className="max-w-md text-sm text-muted">{copy.detail.mapUnavailable}</p>
            <div className="flex items-center gap-3">
              <code className="rounded-lg bg-surface px-3 py-2 text-sm font-bold">
                {displayedCoordinates}
              </code>
              <button
                type="button"
                data-testid="site-map-copy"
                onClick={copyCoords}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold transition hover:bg-surface"
              >
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                {copied ? copy.detail.mapCopied : copy.detail.mapCopy}
              </button>
            </div>
          </div>
        )}

        <p className="bg-[#0A0E27]/90 px-4 py-2 text-center text-[11px] leading-4 text-white/60">
          {copy.detail.mapOrientationNote}
          {' · '}
          {LOCAL_REVIEW_OSM_MAP ? '© OpenStreetMap contributors' : copy.detail.mapAttribution}
        </p>
      </div>
    </div>
  );
}
