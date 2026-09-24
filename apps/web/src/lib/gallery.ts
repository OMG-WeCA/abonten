// Pure gallery helpers (execution plan §1.5.1): localized captions and alt
// text for the photo lightbox, shared by the partner and admin surfaces.
import { getSitesCopy } from './sites-locale';

export interface GalleryAsset {
  kindLabel: string;
  capturedAt?: string | null;
}

/** Localized capture caption: "Front-on · captured 12 May 2026". */
export function galleryCaption(asset: GalleryAsset, locale: 'en' | 'fr'): string {
  if (!asset.capturedAt) return asset.kindLabel;
  const when = new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(asset.capturedAt));
  const capturedWord = locale === 'fr' ? 'prise le' : 'captured';
  return `${asset.kindLabel} · ${capturedWord} ${when}`;
}

/** Meaningful alt text: kind + capture date; falls back to the kind label. */
export function lightboxAlt(asset: GalleryAsset, locale: 'en' | 'fr'): string {
  const copy = getSitesCopy(locale);
  void copy;
  return galleryCaption(asset, locale) || asset.kindLabel;
}
