export { parsePlanningAmount as parseAmount } from '../../../api/src/planning/planning-math';

// Locale-tolerant numeric parsing for partner-entered fields (SPEC §5.1).
// Partners register sites from the field in English and French locales: a
// French keyboard writes decimals with a comma (5,5597; 12,5) while English
// uses a point (5.5597). A naive Number() turns the French form into NaN, and
// naive separator-stripping turns 12,50 into 1250. These helpers accept one
// decimal separator convention and REJECT ambiguous input instead of silently
// changing it by orders of magnitude.

/**
 * Parse a coordinate or dimension value. Accepts a single decimal separator
 * ('5.5597', '5,5597', '-0,2179'); rejects anything ambiguous ('1.234,5',
 * '3 m', '1,234.5'). Returns null when the input is not an unambiguous number.
 */
export function parseDecimal(raw: string): number | null {
  const s = raw.trim().replace(/\s+/g, '');
  if (!s) return null;
  if (s.includes('.') && s.includes(',')) return null; // mixed separators — ambiguous
  if (s.includes(',')) {
    // Decimal comma: optional sign, digits, single comma, digits after.
    if (!/^-?\d+(,\d+)?$/.test(s)) return null;
    const value = Number(s.replace(',', '.'));
    return Number.isFinite(value) ? value : null;
  }
  if (!/^-?(\d+(\.\d+)?|\.\d+)$/.test(s)) return null;
  const value = Number(s);
  return Number.isFinite(value) ? value : null;
}

/** Locale-aware currency display: fr grouping uses spaces ('1 234 500 NGN').
 * Up to 2 decimals so small rates ('12,50') do not round to a different amount. */
export function formatMoney(
  amount: number,
  currency: string,
  locale: 'en' | 'fr' | undefined,
): string {
  const formatter = new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return formatter.format(amount);
}

/** Display area without floating-point noise; never turn unknown area into zero. */
export function formatArea(
  area: number | null | undefined,
  units: string | null | undefined,
  locale: 'en' | 'fr' | undefined,
): string {
  if (area == null || !Number.isFinite(area)) return '—';
  const options =
    area !== 0 && Math.abs(area) < 0.01
      ? { maximumSignificantDigits: 2 }
      : { maximumFractionDigits: 2 };
  const value = new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', options).format(area);
  const unit = units?.trim();
  if (locale === 'fr' && unit === 'ft') return `${value} pieds carrés`;
  return unit ? `${value} ${unit}²` : value;
}
