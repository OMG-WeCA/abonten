/** Public facts, never partner verification or a flight quote. */
export interface ResearchProvenance {
  publisher: string;
  operatorName: string;
  siteSourceUrl: string;
  accessedAt: string;
  coordinateVerification: 'operator_published_not_field_verified';
  dimensionsUnit: 'm';
  coordinateAccuracy?: 'operator_published_precision_unknown';
  coordinateMethod?: string;
  askingPrice?: {
    amount: number;
    currency: string;
    period: 'month';
    sourceUrl: string;
    accessedAt: string;
    qualification: 'published_indicative';
  };
  corroborationUrls?: string[];
  unknowns: string[];
}
export function researchDisclosure(isResearchReference: boolean, researchProvenance?: unknown) {
  return isResearchReference
    ? {
        isResearchReference: true as const,
        commerciallyBookable: false as const,
        researchProvenance: parseResearchProvenance(researchProvenance),
        ownershipKind: 'agency_curated_reference' as const,
        eligibleExactScoring: false as const,
      }
    : {};
}

export function parseResearchProvenance(value: unknown): ResearchProvenance {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Missing research provenance');
  const p = value as Record<string, unknown>;
  const text = (v: unknown, max = 200): v is string =>
    typeof v === 'string' &&
    v.trim().length > 0 &&
    v.length <= max &&
    Array.from(v).every((character) => character.charCodeAt(0) >= 32);
  const date = (v: unknown): v is string =>
    text(v, 30) && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(v) && Number.isFinite(Date.parse(v));
  const url = (v: unknown): v is string => {
    if (!text(v, 1000)) return false;
    try {
      const u = new URL(v);
      return (
        u.protocol === 'https:' &&
        !u.username &&
        !u.password &&
        !u.hash &&
        u.hostname.includes('.') &&
        u.hostname !== 'localhost'
      );
    } catch {
      return false;
    }
  };
  if (
    Object.keys(p).some(
      (key) =>
        ![
          'publisher',
          'operatorName',
          'siteSourceUrl',
          'accessedAt',
          'coordinateVerification',
          'dimensionsUnit',
          'coordinateAccuracy',
          'coordinateMethod',
          'askingPrice',
          'corroborationUrls',
          'unknowns',
        ].includes(key),
    ) ||
    !text(p.publisher) ||
    !text(p.operatorName) ||
    !url(p.siteSourceUrl) ||
    !date(p.accessedAt) ||
    p.coordinateVerification !== 'operator_published_not_field_verified' ||
    p.dimensionsUnit !== 'm' ||
    !Array.isArray(p.unknowns) ||
    p.unknowns.length > 20 ||
    !p.unknowns.every((item) => text(item, 160)) ||
    (p.coordinateAccuracy !== undefined &&
      p.coordinateAccuracy !== 'operator_published_precision_unknown') ||
    (p.coordinateMethod !== undefined && !text(p.coordinateMethod, 300)) ||
    (p.corroborationUrls !== undefined &&
      (!Array.isArray(p.corroborationUrls) ||
        p.corroborationUrls.length > 5 ||
        !p.corroborationUrls.every(url)))
  )
    throw new Error('Invalid bounded research provenance');
  let askingPrice: ResearchProvenance['askingPrice'];
  if (p.askingPrice !== undefined) {
    if (!p.askingPrice || typeof p.askingPrice !== 'object' || Array.isArray(p.askingPrice))
      throw new Error('Invalid asking price');
    const a = p.askingPrice as Record<string, unknown>;
    if (
      Object.keys(a).sort().join(',') !==
        'accessedAt,amount,currency,period,qualification,sourceUrl' ||
      typeof a.amount !== 'number' ||
      !Number.isFinite(a.amount) ||
      a.amount <= 0 ||
      a.amount > 1e12 ||
      typeof a.currency !== 'string' ||
      !['NGN', 'GHS', 'XAF', 'XOF', 'USD', 'EUR'].includes(a.currency) ||
      a.period !== 'month' ||
      a.qualification !== 'published_indicative' ||
      !url(a.sourceUrl) ||
      !date(a.accessedAt)
    )
      throw new Error('Invalid indicative monthly asking price');
    askingPrice = {
      amount: a.amount,
      currency: a.currency,
      period: a.period,
      qualification: a.qualification,
      sourceUrl: a.sourceUrl,
      accessedAt: a.accessedAt,
    };
  }
  return {
    publisher: p.publisher,
    operatorName: p.operatorName,
    siteSourceUrl: p.siteSourceUrl,
    accessedAt: p.accessedAt,
    coordinateVerification: p.coordinateVerification,
    dimensionsUnit: p.dimensionsUnit,
    ...(p.coordinateAccuracy ? { coordinateAccuracy: p.coordinateAccuracy } : {}),
    ...(typeof p.coordinateMethod === 'string' ? { coordinateMethod: p.coordinateMethod } : {}),
    ...(askingPrice ? { askingPrice } : {}),
    ...(Array.isArray(p.corroborationUrls)
      ? { corroborationUrls: p.corroborationUrls as string[] }
      : {}),
    unknowns: p.unknowns as string[],
  };
}
