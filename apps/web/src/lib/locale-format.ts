/** Display formatting only: stored coordinates, dates and evidence remain unchanged. */
export function displayNumber(
  value: number,
  locale?: string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    maximumFractionDigits: 20,
    ...options,
  }).format(value);
}

/** A calendar day is not a timestamp. Format UTC solely to prevent timezone day shifts. */
export function displayDateOnly(value: string, locale?: string): string {
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return value;
  const date = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) return value;
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Unknown EXIF timezone stays unknown; never infer a machine/browser timezone. */
export function displayUtcTimestamp(value: string, locale?: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return displayDateOnly(value, locale);
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return value;
  const day = value.slice(0, 10);
  const calendarDay = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(calendarDay.getTime()) || calendarDay.toISOString().slice(0, 10) !== day)
    return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return `${new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
    hourCycle: 'h23',
  }).format(date)} UTC`;
}
