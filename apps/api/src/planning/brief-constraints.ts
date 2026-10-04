export interface BriefConstraints {
  budget: number | null;
  currency: string | null;
  cities: string[];
  startDate: string | null;
  endDate: string | null;
  evidence: string[];
}

/** Monetary decimals use at most two places. Thousands groups must have exactly
 * three digits and one consistent separator. Never strip arbitrary punctuation. */
function monetaryNumber(token: string, hasMultiplier: boolean): number | null {
  const normalized = token.replace(/[\u00a0\u202f]/g, ' ');
  if (/^\d+$/.test(normalized)) return Number(normalized);
  const spaced = /^\d{1,3}(?: \d{3})+(?:[.,]\d{1,2})?$/;
  if (spaced.test(normalized)) return Number(normalized.replace(/ /g, '').replace(',', '.'));
  if (/^\d+[.,]\d{1,2}$/.test(normalized)) return Number(normalized.replace(',', '.'));
  // With a magnitude suffix, "1,234 million" can mean 1.234 million
  // or 1,234 million across locales. Require an unambiguous spelling.
  if (hasMultiplier && /^\d{1,3}[.,]\d{3}$/.test(normalized)) return null;
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(normalized)) {
    return Number(normalized.replace(/,/g, ''));
  }
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(normalized)) {
    return Number(normalized.replace(/\./g, '').replace(',', '.'));
  }
  return null;
}

function monetaryCandidate(value: string): { amount: number; length: number } | null {
  // Consume every adjacent number separator before validating the grammar. A
  // failed token must not become its leading digits (20 000 must never be 20).
  const token = /^[+-]?\d[\d., \u00a0\u202f'’+−–—-]*/.exec(value);
  if (!token) return null;
  const fullNumber = token[0].trimEnd();
  // A single final full stop is sentence punctuation only when followed by
  // whitespace or EOF. Validate the entire preceding number; repeated stops
  // and malformed grouping still fail. Keep the stop before continuation text
  // so a unit in the next sentence can never become this amount's multiplier.
  const sentenceStop =
    fullNumber.endsWith('.') &&
    (value.length === fullNumber.length || /\s/u.test(value[fullNumber.length]));
  const rawNumber = sentenceStop ? fullNumber.slice(0, -1) : fullNumber;
  const remainder = value.slice(sentenceStop ? rawNumber.length : token[0].length);
  const suffix =
    /^(million(?:s)?|billion(?:s)?|milliard(?:s)?|thousand(?:s)?|m|k)(?![\p{L}\p{N}_])/iu.exec(
      remainder,
    );
  const multiplier = suffix
    ? /^(million|millions|m)$/i.test(suffix[1])
      ? 1e6
      : /^(billion|billions|milliard|milliards)$/i.test(suffix[1])
        ? 1e9
        : 1e3
    : 1;
  const after = remainder.slice(suffix?.[0].length ?? 0);
  const tail = after.trimStart();
  // The literal must be one amount, never the first operand of a range,
  // calculation or list. Magnitude suffixes otherwise hide these operators
  // from the numeric tokenizer ("20m-30m" must not suggest 20 million).
  if (/^[\p{Sm}+\-−–—*/=<>%±×÷⁄∕^&|~!_]/u.test(tail) || /^\d/.test(tail)) return null;
  if (/^[.,;:([{]\s*(?:(?:[A-Z]{3}|₦|\$|€)\s*)?[+\-−]?\d/iu.test(tail)) return null;
  if (/^[.,;:]\s*[\p{Sm}+\-−–—*/=<>%±×÷⁄∕^&|~!_]/u.test(tail)) return null;
  if (/^\.{2,}/.test(tail)) return null;
  if (/^(?:to|or|à|and|et|ou)(?![\p{L}_])\s*(?:(?:[A-Z]{3}|₦|\$|€)\s*)?[+\-−]?\d/iu.test(tail))
    return null;
  // Attached letters, percent/ratio syntax and unsupported magnitude words are
  // not a complete monetary token. Ordinary separated prose may follow it.
  const separated = token[0].length > rawNumber.length;
  if (!suffix && !separated && /^[\p{L}\p{N}_%/]/u.test(after)) return null;
  if (suffix && /^[\p{L}\p{N}_%/]/u.test(after)) return null;
  if (
    /^[%/_]/.test(after) ||
    /^(trillion(?:s)?|bn|mn|b|crore(?:s)?|lakh(?:s)?|hundred(?:s)?)(?![\p{L}\p{N}_])/iu.test(after)
  )
    return null;
  if (/^\s*(NGN|GHS|XAF|XOF|USD|EUR)(?![\p{L}\p{N}_])/iu.test(after)) return null;
  if (/^[\t\r\n]+\d/.test(after)) return null;
  const continuation = /^[ \u00a0\u202f]*([\p{L}\p{N}_]+)/u.exec(after);
  if (
    continuation &&
    !/^(for|pour|in|à|over|across|covering|including|excluding|total|Lagos|Accra|Douala|Abuja|Kumasi|Yaoundé)$/iu.test(
      continuation[1],
    )
  )
    return null;
  const parsed = monetaryNumber(rawNumber, Boolean(suffix));
  if (parsed === null) return null;
  const amount = parsed * multiplier;
  return Number.isFinite(amount) && amount > 0 && amount <= 1e12
    ? { amount, length: suffix ? token[0].length + suffix[0].length : rawNumber.length }
    : null;
}

/** Conservative literal extraction. Every value is a suggestion for confirmation. */
export function extractConstraints(text: string): BriefConstraints {
  const result: BriefConstraints = {
    budget: null,
    currency: null,
    cities: [],
    startDate: null,
    endDate: null,
    evidence: [],
  };
  const budget =
    /(?<![\p{L}\p{N}_])(?:budget|spend|allocation)\s*(?:of|is|de|est|:|=)?\s*(NGN|GHS|XAF|XOF|USD|EUR|₦|\$|€)(?![\p{L}_])\s*/giu;
  const candidates = [...text.matchAll(budget)];
  if (candidates.length === 1) {
    const match = candidates[0];
    const value = text.slice(match.index! + match[0].length);
    const parsed = monetaryCandidate(value);
    if (parsed !== null) {
      result.budget = parsed.amount;
      result.currency =
        ({ '₦': 'NGN', '€': 'EUR' } as Record<string, string>)[match[1]] ??
        (/^[A-Z]{3}$/i.test(match[1]) ? match[1].toUpperCase() : null);
      result.evidence.push(match[0] + value.slice(0, parsed.length));
    }
  }
  for (const city of ['Lagos', 'Accra', 'Douala', 'Abuja', 'Kumasi', 'Yaoundé']) {
    if (new RegExp(`\\b${city}\\b`, 'i').test(text)) result.cities.push(city);
  }
  const dates =
    /(?<![\p{L}\p{N}_])(?:start(?: date)?|end(?: date)?)\s*[:=]\s*(\d{4}-\d{2}-\d{2})(?![\p{L}\p{N}_])/giu;
  const dateCandidates: Record<string, Set<string>> = { startDate: new Set(), endDate: new Set() };
  for (const match of text.matchAll(dates)) {
    const date = new Date(`${match[1]}T00:00:00Z`);
    if (!Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === match[1]) {
      const key = /^start/i.test(match[0]) ? 'startDate' : 'endDate';
      dateCandidates[key].add(match[1]);
      result.evidence.push(match[0]);
    }
  }
  for (const key of ['startDate', 'endDate'] as const) {
    if (dateCandidates[key].size === 1) result[key] = [...dateCandidates[key]][0];
  }
  return result;
}
