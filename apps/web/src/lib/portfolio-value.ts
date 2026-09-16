import type { RateCard } from './sites-api';
import { SUPPORTED_CURRENCIES } from './currencies';

/** One currently effective site-level price per currency; never add overlapping
 * versions, face prices or inferred day/week conversions to a monthly quote. */
export function currentMonthlyRates(cards: RateCard[], now = Date.now()): Record<string, number> {
  const latest = new Map<string, RateCard>();
  for (const card of cards) {
    const from = Date.parse(card.effectiveFrom);
    const to = card.effectiveTo ? Date.parse(card.effectiveTo) : Infinity;
    if (card.faceId || !Number.isFinite(from) || from > now || !(to > now)) continue;
    if (!SUPPORTED_CURRENCIES.some(c => c === card.currency)) continue;
    const previous = latest.get(card.currency);
    if (!previous || from > Date.parse(previous.effectiveFrom) ||
      (from === Date.parse(previous.effectiveFrom) && card.id > previous.id)) latest.set(card.currency, card);
  }
  const result: Record<string, number> = {};
  for (const [currency, card] of latest) {
    const value = card.rates.perMonth;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) result[currency] = value;
  }
  return result;
}


/** Multiple currencies for one site are alternative quotes, not extra income. */
export function selectMonthlyQuote(cards: RateCard[], target: string, now = Date.now()): { currency: string; amount: number } | null {
  const prices = currentMonthlyRates(cards, now);
  if (prices[target] !== undefined) return { currency: target, amount: prices[target] };
  const candidate = [...cards].filter(c => prices[c.currency] !== undefined && !c.faceId &&
    Date.parse(c.effectiveFrom) <= now && (!c.effectiveTo || Date.parse(c.effectiveTo) > now))
    .sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom) || a.currency.localeCompare(b.currency))[0];
  return candidate ? { currency: candidate.currency, amount: prices[candidate.currency] } : null;
}

export function convertPortfolio(totals: Record<string, number>, target: string, rates: Record<string, number>): number {
  let total = 0;
  for (const [currency, amount] of Object.entries(totals)) {
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid amount');
    if (currency === target) { total += amount; continue; }
    if (!Number.isFinite(rates[currency]) || rates[currency] <= 0 || !Number.isFinite(rates[target]) || rates[target] <= 0) throw new Error('Missing exchange rate');
    total += amount / rates[currency] * rates[target];
  }
  if (!Number.isFinite(total)) throw new Error('Invalid total');
  return Math.round(total * 100) / 100;
}
