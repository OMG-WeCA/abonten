/** Keep the externally transferred grounding snapshot independently bounded.
 * Full canonical facts remain in the API response. Numeric prices/distances and
 * identifiers are never rewritten. Enrichment and nonselected face detail are reduced explicitly. */
const SNAPSHOT_LIMIT = 96 * 1024;
type ObjectValue = Record<string, unknown>;
type SnapshotFacts = { sites: readonly { enrichment: unknown; faces?: readonly unknown[] }[] };
type CompactSnapshot<T extends SnapshotFacts> = Omit<T, 'sites'> & {
  sites: Array<Omit<T['sites'][number], 'enrichment'> & { enrichment: unknown }>;
  modelContext: {
    enrichmentDetailReduced: true;
    snapshotByteLimit: number;
    omittedEnrichmentSites: number;
    omittedNonselectedFaces: number;
    warning: string;
  };
};
function object(value: unknown): value is ObjectValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function compact(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) {
    const maximum =
      key === 'nearest'
        ? 4
        : key === 'traffic'
          ? 5
          : key === 'warnings'
            ? 3
            : key === 'vehicleClasses'
              ? 6
              : 50;
    return value.slice(0, maximum).map((item) => compact(item));
  }
  if (!object(value)) return value;
  if (value.status === 'unavailable' && value.value === null)
    return {
      status: value.status,
      value: null,
      unit: value.unit,
      reason: value.reason,
      provenance: value.provenance,
      freshness: value.freshness,
    };
  const result: ObjectValue = {};
  for (const [field, item] of Object.entries(value)) {
    if (field === 'audienceInferenceUsable' || field === 'projectedAt' || field === 'evaluatedAt')
      continue;
    if (
      field === 'value' &&
      Array.isArray(item) &&
      item.some((row) => object(row) && 'observedFrom' in row)
    )
      result[field] = compact(item, 'traffic');
    else if (field === 'method' && typeof item === 'string') result[field] = item.slice(0, 200);
    else result[field] = compact(item, field);
  }
  return result;
}
export function compactPlanningSnapshot<T extends SnapshotFacts>(facts: T): CompactSnapshot<T> {
  const snapshot: ObjectValue = {
    ...facts,
    sites: facts.sites.map((site) => ({
      ...site,
      ...(Array.isArray(site.faces) ? { faces: [...site.faces] } : {}),
      enrichment: compact(site.enrichment),
    })),
    modelContext: {
      enrichmentDetailReduced: true,
      snapshotByteLimit: SNAPSHOT_LIMIT,
      omittedEnrichmentSites: 0,
      omittedNonselectedFaces: 0,
      warning:
        'Enrichment lists and method descriptions are bounded for model input; full canonical source evidence is retained in API facts. Missing/reduced data never means zero. Numeric media costs and distances are unchanged.',
    },
  };
  const sites = snapshot.sites as ObjectValue[];
  const context = snapshot.modelContext as ObjectValue;
  // Prefer the first ranked/selected sites. Never truncate arbitrary JSON bytes,
  // identifiers, numeric facts or a source period to satisfy the transfer limit.
  for (
    let index = sites.length - 1;
    Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > SNAPSHOT_LIMIT && index >= 0;
    index--
  ) {
    sites[index].enrichment = {
      status: 'unavailable',
      reason:
        'Enrichment omitted from this model context to respect the total transfer budget. Full source-backed evidence remains in API facts.',
    };
    context.omittedEnrichmentSites = Number(context.omittedEnrichmentSites) + 1;
  }
  for (
    let index = sites.length - 1;
    Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > SNAPSHOT_LIMIT && index >= 0;
    index--
  ) {
    const faces = sites[index].faces;
    if (!Array.isArray(faces)) continue;
    while (
      faces.length > 1 &&
      Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > SNAPSHOT_LIMIT
    ) {
      let removable = -1;
      for (let faceIndex = faces.length - 1; faceIndex >= 0; faceIndex--) {
        const face: unknown = faces[faceIndex];
        if (object(face) && face.selected !== true) {
          removable = faceIndex;
          break;
        }
      }
      if (removable < 0) break;
      faces.splice(removable, 1);
      context.omittedNonselectedFaces = Number(context.omittedNonselectedFaces) + 1;
    }
  }
  return snapshot as unknown as CompactSnapshot<T>;
}
