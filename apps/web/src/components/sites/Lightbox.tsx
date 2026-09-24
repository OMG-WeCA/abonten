'use client';

/**
 * Photo lightbox for the partner inventory gallery (execution plan §1.5.1):
 * click a thumbnail → full-image overlay with previous/next (disabled at the
 * ends), ←/→/Esc keys, focus trap + return, neighbour preloading with a
 * spinner, and touch swipe. Works for every asset kind, including
 * authenticated object-URL thumbnails served through the bearer endpoint.
 *
 * All user-facing strings come from sites-locale (en/fr).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { fetchAssetHeaders } from '../../lib/api';
import { galleryCaption, lightboxAlt } from '../../lib/gallery';

export { galleryCaption, lightboxAlt };
import type { AssetDisplay } from '../../lib/sites-api';
import { getSitesCopy } from '../../lib/sites-locale';

export interface LightboxAsset {
  id: string;
  display: AssetDisplay;
  kind: string;
  capturedAt?: string | null;
  /** Localized kind label, e.g. "Front-on". */
  kindLabel: string;
}


const SWIPE_THRESHOLD_PX = 48;

export function Lightbox({
  assets,
  initialIndex,
  siteName,
  locale,
  onClose,
}: {
  assets: LightboxAsset[];
  initialIndex: number;
  siteName: string;
  locale: 'en' | 'fr';
  onClose: () => void;
}) {
  const copy = getSitesCopy(locale);
  const [index, setIndex] = useState(() => Math.min(Math.max(initialIndex, 0), Math.max(assets.length - 1, 0)));
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const asset = assets[index];
  const prev = index > 0 ? assets[index - 1] : undefined;
  const next = index < assets.length - 1 ? assets[index + 1] : undefined;

  // ---- focus management: move in on open, trap, return on close ------------
  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => {
      restoreFocusRef.current?.focus?.();
    };
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        setIndex(index - 1);
        return;
      }
      if (event.key === 'ArrowRight' && index < assets.length - 1) {
        event.preventDefault();
        setIndex(index + 1);
        return;
      }
      if (event.key === 'Tab') {
        // Simple focus trap: cycle within the dialog.
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    },
    [assets.length, index, onClose],
  );

  // ---- image loading (current + neighbour preloading) ----------------------
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  useEffect(() => {
    if (!asset) return;
    let cancelled = false;
    const wanted = [asset, prev, next].filter((a): a is LightboxAsset => Boolean(a));
    for (const wantedAsset of wanted) {
      const key = wantedAsset.id;
      if (urls[key] !== undefined) continue;
      if (wantedAsset.display.plain) {
        // External ref: warm the browser cache for neighbours without state churn.
        const img = new Image();
        img.src = wantedAsset.display.plain;
        if (key === asset.id) setUrls((u) => ({ ...u, [key]: wantedAsset.display.plain! }));
        continue;
      }
      if (wantedAsset.display.authUrl && key === asset.id) setLoadingId(key);
      fetch(wantedAsset.display.authUrl as string, { headers: fetchAssetHeaders() })
        .then((response) => (response.ok ? response.blob() : null))
        .then((blob) => {
          if (cancelled || !blob) return;
          const objectUrl = URL.createObjectURL(blob);
          setUrls((u) => ({ ...u, [key]: objectUrl }));
          if (key === asset.id) setLoadingId((current) => (current === key ? null : current));
        })
        .catch(() => {
          if (key === asset.id) setLoadingId((current) => (current === key ? null : current));
          setUrls((u) => ({ ...u, [key]: null }));
        });
    }
    return () => {
      cancelled = true;
    };
    // urls intentionally omitted: only the presence check needs the latest,
    // and re-running on every fetch would cancel in-flight requests.
    // eslint-ignore-next-line: exhaustive-deps rule is not configured in this repo.
  }, [asset?.id, prev?.id, next?.id]);

  if (!asset) return null;
  const src = urls[asset.id] ?? null;
  const ariaLabel = copy.detail.gallery.replace('{{label}}', siteName);

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-[#0A0E27]/95"
      onClick={onClose}
      data-testid="gallery-lightbox"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full flex-col outline-none"
      >
        <header className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="truncate text-sm font-semibold text-white/90" aria-hidden={false}>
            {ariaLabel}
          </p>
          <button
            type="button"
            aria-label={copy.detail.galleryClose}
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </header>

        <div
          className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-2"
          onTouchStart={(event) => {
            const touch = event.touches[0];
            touchStartRef.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={(event) => {
            const start = touchStartRef.current;
            touchStartRef.current = null;
            if (!start) return;
            const dx = event.changedTouches[0].clientX - start.x;
            const dy = event.changedTouches[0].clientY - start.y;
            if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return;
            if (dx < 0 && index < assets.length - 1) setIndex(index + 1);
            if (dx > 0 && index > 0) setIndex(index - 1);
          }}
        >
          <div className="flex h-full w-full items-center justify-center gap-2">
            <button
              type="button"
              aria-label={copy.detail.galleryPrev}
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-white transition enabled:hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <figure className="flex h-full min-w-0 flex-1 flex-col items-center justify-center">
              <div className="relative flex min-h-0 flex-1 items-center justify-center">
                {loadingId === asset.id && !src && (
                  <Loader2 className="h-8 w-8 animate-spin text-white/70" aria-label={copy.detail.galleryLoading} />
                )}
                {src && (
                  // Plain <img>: gallery assets may be external refs or session
                  // object URLs, so the next/image optimizer does not apply.
                  // biome-ignore lint: no <Image> without a configured loader
                  <img
                    src={src}
                    alt={lightboxAlt(asset, locale)}
                    className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
                    draggable={false}
                  />
                )}
                {!src && loadingId !== asset.id && (
                  <span className="text-sm text-white/60">{asset.kindLabel}</span>
                )}
              </div>
              <figcaption className="mt-2 text-center text-xs font-semibold text-white/80 sm:text-sm">
                {galleryCaption(asset, locale)}
              </figcaption>
            </figure>
            <button
              type="button"
              aria-label={copy.detail.galleryNext}
              disabled={index === assets.length - 1}
              onClick={() => setIndex(index + 1)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-white transition enabled:hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
