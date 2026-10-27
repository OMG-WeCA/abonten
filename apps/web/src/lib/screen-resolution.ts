import { displayNumber } from './locale-format';
/** Physical and uploaded-image dimensions must never be used as screen resolution. */
export function screenResolution(
  face: { pixelWidth?: number | null; pixelHeight?: number | null } | undefined,
  locale?: string,
): string {
  const known = (n: number | null | undefined) =>
    typeof n === 'number' && Number.isInteger(n) && n > 0;
  if (!known(face?.pixelWidth) && !known(face?.pixelHeight))
    return locale === 'fr' ? 'Non renseignée' : 'Not recorded';
  const part = (n: number | null | undefined) =>
    known(n) ? displayNumber(n!, locale === 'fr' ? 'fr' : 'en') : '—';
  return `${part(face?.pixelWidth)} × ${part(face?.pixelHeight)} px`;
}
