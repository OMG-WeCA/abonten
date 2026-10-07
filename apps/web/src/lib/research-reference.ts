import type { ResearchProvenance } from '../../../api/src/common/research-inventory';
import { formatMoney } from './number-format';
import { PLANNING_CURRENCIES } from './agency-planning';

/** Imported links are untrusted metadata; keep source navigation HTTPS-only. */
export function researchSourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** A monthly asking price is a source fact, never a computed flight quote. */
export function researchAskingPrice(
  provenance: ResearchProvenance | null | undefined,
  locale: 'en' | 'fr',
) {
  const price = provenance?.askingPrice;
  return price &&
    price.period === 'month' &&
    price.qualification === 'published_indicative' &&
    Number.isFinite(price.amount) &&
    price.amount > 0 &&
    PLANNING_CURRENCIES.some((currency) => currency === price.currency) &&
    researchSourceUrl(price.sourceUrl)
    ? `${formatMoney(price.amount, price.currency, locale)} / ${locale === 'fr' ? 'mois' : 'month'}`
    : null;
}
