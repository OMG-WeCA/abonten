import type { SiteLocale } from './sites-locale';
import { displayDateOnly, displayNumber, displayUtcTimestamp } from './locale-format';
import { agencyEvidenceText } from './agency-evidence-locale';

export interface MetadataFact {
  label: string;
  value: string;
  href?: string;
}

const labels: Record<string, [string, string]> = {
  localDemoReference: ['Local demo reference', 'Référence de démonstration locale'],
  mediaOwner: ['Media owner', 'Propriétaire du support'],
  sourceUrl: ['Source listing', 'Fiche source'],
  coordinateEvidence: ['Coordinate evidence', 'Preuve des coordonnées'],
  coordinateQuality: ['Coordinate quality', 'Qualité des coordonnées'],
  sourceDimensions: ['Source-reported dimensions', 'Dimensions déclarées par la source'],
  dimensionOrientationVerified: [
    'Width/height orientation specified',
    'Orientation largeur/hauteur précisée',
  ],
  reportedFaceCount: ['Source-reported face count', 'Nombre de faces déclaré par la source'],
  availability: ['Availability', 'Disponibilité'],
  price: ['Price', 'Prix'],
  traffic: ['Traffic', 'Trafic'],
  impressions: ['Impressions', 'Impressions'],
  photoUrl: ['Reference photo source', 'Source de la photo de référence'],
  photoAttribution: ['Photo credit', 'Crédit photo'],
  photoCapturedAt: ['Photo capture date', 'Date de prise de la photo'],
  notes: ['Source notes and caveats', 'Notes et réserves de la source'],
  orientationDeg: ['Orientation (degrees)', 'Orientation (degrés)'],
  viewingDistance: ['Viewing distance', 'Distance de vision'],
  elevation: ['Height above ground', 'Hauteur au-dessus du sol'],
  illumination: ['Illumination', 'Éclairage'],
  illuminationHours: ['Illumination hours', 'Horaires d’éclairage'],
  pixelWidth: ['Pixel width', 'Largeur en pixels'],
  pixelHeight: ['Pixel height', 'Hauteur en pixels'],
  loopLengthSeconds: ['Loop length (seconds)', 'Durée de boucle (secondes)'],
  spotLengthSeconds: ['Spot length (seconds)', 'Durée de spot (secondes)'],
  spotsPerLoop: ['Spots per loop', 'Spots par boucle'],
  collectedAt: ['Collected', 'Collecté'],
  expiresAt: ['Expires', 'Expire'],
};

function labelFor(key: string, locale: SiteLocale | undefined): string {
  const known = labels[key];
  if (known) return known[locale === 'fr' ? 1 : 0];
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Link only ordinary web URLs. React renders every fact as text, never HTML. */
export function metadataLink(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

/** Preserve every JSON leaf, including false/zero/null and nested vendor fields. */
export function metadataFacts(
  payload: Record<string, unknown>,
  locale: SiteLocale | undefined,
): MetadataFact[] {
  const facts: MetadataFact[] = [];
  const unknown = locale === 'fr' ? 'Inconnu' : 'Unknown';
  const empty = locale === 'fr' ? 'Aucune valeur enregistrée' : 'No recorded values';
  function visit(value: unknown, path: string[]): void {
    const label = path.join(' · ');
    if (Array.isArray(value)) {
      if (!value.length) facts.push({ label, value: empty });
      value.forEach((item, index) => visit(item, [...path, String(index + 1)]));
    } else if (value !== null && typeof value === 'object') {
      const entries = Object.entries(value);
      if (!entries.length) facts.push({ label, value: empty });
      for (const [key, item] of entries) visit(item, [...path, labelFor(key, locale)]);
    } else {
      const text =
        value == null || value === ''
          ? unknown
          : typeof value === 'boolean'
            ? locale === 'fr'
              ? value
                ? 'Oui'
                : 'Non'
              : value
                ? 'Yes'
                : 'No'
            : typeof value === 'number'
              ? displayNumber(
                  value,
                  locale,
                  ['referenceYear', 'year'].some((key) => path.at(-1) === labelFor(key, locale))
                    ? { useGrouping: false }
                    : undefined,
                )
              : typeof value === 'string' && path.at(-1) === labelFor('photoCapturedAt', locale)
                ? displayDateOnly(value, locale)
                : typeof value === 'string' &&
                    ['collectedAt', 'expiresAt'].some(
                      (key) => path.at(-1) === labelFor(key, locale),
                    )
                  ? displayUtcTimestamp(value, locale)
                  : typeof value === 'string' && path.at(-1) === labelFor('illumination', locale)
                    ? agencyEvidenceText(value, locale === 'fr' ? 'fr' : 'en')
                    : String(value);
      const href = typeof value === 'string' ? metadataLink(value) : undefined;
      facts.push({ label, value: text, ...(href ? { href } : {}) });
    }
  }
  for (const [key, value] of Object.entries(payload)) visit(value, [labelFor(key, locale)]);
  return facts;
}
