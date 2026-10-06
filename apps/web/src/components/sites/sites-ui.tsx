'use client';

// Shared UI for the partner sites workflow. Visual language matches the account
// surfaces (WorkspaceFrame): rounded-xl cards, border-border, primary accents.
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { useEffect, useState } from 'react';
import { ImageOff, X } from 'lucide-react';
import { getSitesCopy } from '../../lib/sites-locale';
import { fetchAssetHeaders } from '../../lib/api';
import type { AssetDisplay, SiteStatus, SiteSummary } from '../../lib/sites-api';
import type { SiteLocale } from '../../lib/sites-locale';
import { useLocale } from '../LocaleProvider';
import { displayUiText } from '../../lib/display-ui-text';

export const inputClass =
  'w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/25';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className = '',
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  const { locale } = useLocale();
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-foreground">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1 text-xs font-medium text-error" role="alert">
          {displayUiText(error, locale)}
        </p>
      ) : null}
      {hint && !error && <p className="mt-1 text-xs leading-5 text-muted">{hint}</p>}
    </div>
  );
}

const statusStyles: Record<SiteStatus, string> = {
  draft: 'bg-muted/15 text-muted',
  pending_review: 'bg-warning/15 text-warning',
  approved: 'bg-info/10 text-info',
  listed: 'bg-success/15 text-success',
  rejected: 'bg-error/10 text-error',
  suspended: 'bg-error/10 text-error',
  decommissioned: 'bg-muted/15 text-muted line-through decoration-muted/50',
};

export function StatusBadge({
  status,
  locale,
}: {
  status: SiteStatus;
  locale: SiteLocale | undefined;
}) {
  const copy = getSitesCopy(locale);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${statusStyles[status] ?? statusStyles.draft}`}
    >
      {copy.status[status] ?? status}
    </span>
  );
}

export function formatCount(count: number, locale: SiteLocale | undefined) {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en').format(count);
}

/** Human label for stored illumination codes (illuminationType column). */
export function prettyIllumination(type: string, locale: SiteLocale | undefined): string {
  const copy = getSitesCopy(locale);
  const key = (type || '').toLowerCase();
  if (key === 'none') return copy.register.illumNone;
  if (key === 'front_lit') return copy.register.illumFront;
  if (key === 'back_lit') return copy.register.illumBack;
  if (key === 'edge_lit') return copy.register.illumEdge;
  if (key === 'led') return copy.register.illumLed;
  return type.replace(/[_-]+/g, ' ');
}

/** A sent-back site is still 'draft' in storage; show it as Rejected. */
export function displayStatus(site: Pick<SiteSummary, 'status' | 'rejectionReason'>): SiteStatus {
  if (site.status === 'draft' && site.rejectionReason) return 'rejected';
  return site.status;
}

/** Human label for a stored format code (static / digital_led / 3d / other). */
export function prettyFormat(format: string, locale: SiteLocale | undefined): string {
  const copy = getSitesCopy(locale);
  const key = (format || '').toLowerCase();
  if (key === 'static') return copy.register.formatStatic;
  if (key === 'digital_led') return copy.register.formatLed;
  if (key === '3d') return copy.register.format3d;
  const labels: Record<string, [string, string]> = {
    tri_vision: ['Tri-vision', 'Trivision'],
    mural: ['Mural', 'Mural'],
    transit: ['Transit', 'Transport'],
    street_furniture: ['Street furniture', 'Mobilier urbain'],
  };
  if (labels[key]) return labels[key][locale === 'fr' ? 1 : 0];
  return format.replace(/[_-]+/g, ' ');
}

/** Thumbnail for a site asset with a graceful empty state. */
export function AssetThumb({
  src,
  alt,
  size = 'h-14 w-20',
  fit,
}: {
  src: string | null;
  alt: string;
  size?: string;
  /** Defaults to object-cover; the lightbox passes object-contain. */
  fit?: 'object-contain' | 'object-cover';
}) {
  if (!src) {
    return (
      <span
        className={`grid ${size} shrink-0 place-items-center rounded-lg border border-border bg-surface text-muted`}
        role="img"
        aria-label={alt}
      >
        <ImageOff className="h-4 w-4" />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={`${size} shrink-0 rounded-lg border border-border ${fit ?? 'object-cover'}`}
    />
  );
}

/**
 * Self-resolving thumbnail. External refs render directly; locally stored refs
 * are fetched with the session (asset endpoints require the JWT, so a plain
 * <img src> can't authenticate — mirrors the avatar pattern's blob approach).
 */
export function AuthAssetThumb({
  display,
  alt,
  size = 'h-14 w-20',
  fit,
}: {
  display: AssetDisplay;
  alt: string;
  size?: string;
  fit?: 'object-contain' | 'object-cover';
}) {
  const blobUrl = useAssetObjectUrl(display.authUrl);
  return <AssetThumb src={display.plain ?? blobUrl} alt={alt} size={size} fit={fit} />;
}

/**
 * Loads an authenticated asset image as an object URL. Asset endpoints require
 * the JWT, so plain <img src> can't be used (mirrors the avatar pattern).
 */
export function useAssetObjectUrl(url: string | null): string | null {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!url) {
      setObjectUrl(null);
      return;
    }
    let revoke: string | null = null;
    let cancelled = false;
    // url is already absolute (assetFileUrl); fetch it directly with the bearer
    // token so the request hits the API even across page/SPA sessions.
    fetch(url, { headers: fetchAssetHeaders() })
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (cancelled || !blob) return;
        revoke = URL.createObjectURL(blob);
        setObjectUrl(revoke);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [url]);
  return objectUrl;
}

export function PendingUploadChip({
  label,
  removeLabel,
  onRemove,
}: {
  label: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-3 pr-1.5 text-xs font-semibold text-primary">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${removeLabel}: ${label}`}
        className="grid h-5 w-5 place-items-center rounded-full transition hover:bg-primary/20"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export function SectionCard({
  title,
  action,
  children,
  className = '',
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-border bg-surface px-5 py-5 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export const selectAttrs = (id: string): SelectHTMLAttributes<HTMLSelectElement> => ({
  id,
  className: inputClass,
});

export const textAreaAttrs = (id: string): TextareaHTMLAttributes<HTMLTextAreaElement> => ({
  id,
  rows: 3,
  className: inputClass,
});

export const numberInput = (id: string): InputHTMLAttributes<HTMLInputElement> => ({
  id,
  type: 'number',
  step: 'any',
  min: '0',
  className: inputClass,
});
