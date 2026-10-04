import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  AdministrativeContext,
  ContextMetric,
  ContextProvenance,
  SiteGeographicContext,
} from '@abonten/contracts/enrichment';
import { projectPlanningEnrichment, type PlanningEnrichmentMetadata } from './planning-enrichment';

const now = Date.parse('2026-10-04T12:00:00Z');
const metadata = (patch: Partial<PlanningEnrichmentMetadata> = {}): PlanningEnrichmentMetadata => ({
  id: 'visibility',
  siteId: 'site',
  dimension: 'visibility',
  payload: { score: 82 },
  source: 'Licensed field survey',
  method: 'Structured sightline survey',
  verification: 'field_verified',
  confidence: 0.7,
  dataClass: 'production',
  collectedAt: '2026-09-01T00:00:00Z',
  expiresAt: '2027-09-01T00:00:00Z',
  ...patch,
});
const provenance: ContextProvenance = {
  importId: 'import',
  sourceKey: 'worldpop',
  version: '2025-v1',
  referenceYear: 2025,
  publishedAt: '2026-01-01T00:00:00Z',
  fetchedAt: '2026-02-01T00:00:00Z',
  licence: 'CC BY 4.0',
  licenceUrl: 'https://example.test/licence',
  attribution: 'Synthetic test fixture of production shape',
  sourceUrl: 'https://example.test/source',
  checksum: 'a'.repeat(64),
  quality: 'modelled',
  warnings: [],
};
const metric = <T>(
  value: T | null,
  status: ContextMetric<T>['status'] = 'available',
): ContextMetric<T> => ({
  value,
  status,
  provenance: { ...provenance },
  method: 'Declared canonical source method',
  warnings: [],
});
const context = (): SiteGeographicContext => ({
  siteId: 'site',
  countryCode: 'GH',
  supported: true,
  generatedAt: '2026-10-04T11:00:00Z',
  dataClass: 'production',
  disclaimer: 'Geographic context, not audience',
  nearestRoad: metric({
    sourceId: 'road-absolute',
    name: null,
    roadClass: 'service',
    distanceMetres: 15,
  }),
  nearestNamedRoad: {
    ...metric({
      sourceId: 'road-named',
      name: 'Graphic Road',
      roadClass: 'primary',
      distanceMetres: 100,
    }),
    searchRadiusMetres: 1000,
    searchCoverage: 'partial',
    status: 'partial',
  },
  administrative: [
    metric([{ sourceId: 'adm1', name: 'Greater Accra', level: 1 }]),
    metric<AdministrativeContext[]>(null, 'unavailable'),
  ],
  catchments: [
    {
      radiusMetres: 500,
      pois: metric({ mappedCount: 0, byCategory: {}, nearest: [], completeness: 'unknown' }),
      population: metric(
        { people: 1200, validCoverageFraction: 0.6, rasterCoverageFraction: 0.8, unit: 'people' },
        'partial',
      ),
    },
  ],
  traffic: metric([
    {
      sourceId: 'count',
      observedFrom: '2026-09-01T08:00:00Z',
      observedTo: '2026-09-01T08:30:00Z',
      durationMinutes: 30,
      count: 250,
      unit: 'vehicles',
      direction: 'eastbound',
      vehicleClasses: ['car'],
      method: 'manual observed count',
      distanceMetres: 80,
    },
  ]),
});

test('missing enrichment stays null with explicit units and reasons, never zero or audience', () => {
  const result = projectPlanningEnrichment({ id: 'site' }, undefined, now);
  for (const value of [
    result.visibility,
    result.declaredTraffic,
    result.structure.elevation,
    result.geographic.traffic,
    result.geographic.catchments[0].population,
  ]) {
    assert.equal(value.value, null);
    assert.equal(value.status, 'unavailable');
    assert.ok(value.reason);
    assert.ok(value.unit);
    assert.equal(value.audienceInferenceUsable, false);
  }
  assert.deepEqual(result.audience.ots, null);
  assert.equal(result.audience.reach, null);
});

test('current verified visibility retains exact collection, confidence and source without converting score to exposure', () => {
  const record = metadata({ collectedAt: new Date('2026-09-01T00:00:00Z') });
  const result = projectPlanningEnrichment({ id: 'site', metadata: [record] }, undefined, now);
  assert.equal(result.visibility.status, 'available');
  assert.equal(result.visibility.value, 82);
  assert.equal(result.visibility.unit, 'score out of 100');
  assert.equal(result.visibility.freshness.status, 'current');
  assert.equal(result.visibility.freshness.collectedAt, '2026-09-01T00:00:00.000Z');
  assert.deepEqual(result.visibility.provenance, {
    recordId: 'visibility',
    source: record.source,
    method: record.method,
    verification: 'field_verified',
    confidence: 0.7,
    dataClass: 'production',
  });
  assert.equal(result.audience.ots, null);
});

test('expired, future, unverified, malformed and demo metadata never become production values', () => {
  for (const patch of [
    { expiresAt: '2026-10-04T12:00:00Z' },
    { collectedAt: '2027-01-01' },
    { verification: 'unverified' },
    { source: '' },
    { dataClass: null },
    { dataClass: 'demo' },
    { payload: { score: 99, synthetic: true } },
    { payload: { score: -1 } },
    { payload: { score: 101 } },
    { payload: { score: Infinity } },
  ] satisfies Partial<PlanningEnrichmentMetadata>[]) {
    const result = projectPlanningEnrichment(
      { id: 'site', metadata: [metadata(patch)] },
      undefined,
      now,
    );
    assert.equal(result.visibility.value, null, JSON.stringify(patch));
    assert.equal(result.visibility.status, 'unavailable');
  }
  const demo = projectPlanningEnrichment(
    { id: 'site', metadata: [metadata({ dataClass: 'demo' })] },
    undefined,
    now,
  );
  assert.equal(demo.syntheticInputsExcluded, true);
});

test('partner declarations and expiry-free measurements are partial with unknown freshness', () => {
  const result = projectPlanningEnrichment(
    { id: 'site', metadata: [metadata({ verification: 'partner_declared', expiresAt: null })] },
    undefined,
    now,
  );
  assert.equal(result.visibility.value, 82);
  assert.equal(result.visibility.status, 'partial');
  assert.equal(result.visibility.freshness.status, 'unknown');
  assert.equal(result.visibility.warnings.length, 2);
});

test('structure is registered declaration until its actual value has a matching measurement record', () => {
  const site = {
    id: 'site',
    orientationDeg: 90,
    viewingDistance: 200,
    elevation: 8,
    illuminationType: 'front_lit',
    illuminationHours: '18:00-06:00',
  };
  const record = metadata({
    dimension: 'structure',
    payload: { fields: ['orientationDeg'], orientationDeg: 90 },
    verification: 'partner_declared',
    expiresAt: null,
  });
  const result = projectPlanningEnrichment({ ...site, metadata: [record] }, undefined, now);
  assert.equal(result.structure.orientation.value, 90);
  assert.equal(result.structure.orientation.unit, 'degrees clockwise from north');
  assert.equal(
    result.structure.orientation.provenance &&
      'recordId' in result.structure.orientation.provenance &&
      result.structure.orientation.provenance.recordId,
    'visibility',
  );
  assert.equal(result.structure.elevation.value, 8);
  assert.equal(result.structure.elevation.provenance, null);
  assert.equal(result.structure.elevation.status, 'partial');
  assert.equal(result.structure.viewingAngle.value, null);
  assert.match(result.structure.viewingAngle.reason!, /orientation is a separate/);
  assert.equal(result.structure.illumination.status, 'partial');
  const conflicting = metadata({
    ...record,
    id: 'newer',
    collectedAt: '2026-10-01',
    payload: { orientationDeg: 180 },
  });
  assert.equal(
    projectPlanningEnrichment({ ...site, metadata: [record, conflicting] }, undefined, now)
      .structure.orientation.provenance,
    null,
  );
});

test('canonical geography preserves separate named road, partial population and observed period without extrapolation', () => {
  const result = projectPlanningEnrichment({ id: 'site' }, context(), now);
  assert.equal(result.geographic.nearestRoad.value?.distanceMetres, 15);
  assert.equal(result.geographic.nearestRoad.value?.name, null);
  assert.equal(result.geographic.nearestNamedRoad.value?.distanceMetres, 100);
  assert.equal(result.geographic.nearestNamedRoad.searchCoverage, 'partial');
  const population = result.geographic.catchments.find(
    (row) => row.radiusMetres === 500,
  )!.population;
  assert.equal(population.status, 'partial');
  assert.equal(population.value?.people, 1200);
  assert.equal(population.value?.validCoverageFraction, 0.6);
  assert.equal(population.freshness.referenceYear, 2025);
  assert.equal(population.freshness.status, 'unknown');
  assert.equal(result.geographic.traffic.value?.[0].count, 250);
  assert.equal(result.geographic.traffic.value?.[0].durationMinutes, 30);
  assert.equal(result.geographic.traffic.value?.[0].observedTo, '2026-09-01T08:30:00.000Z');
  assert.equal(
    result.geographic.catchments.find((row) => row.radiusMetres === 500)!.pois.value?.mappedCount,
    0,
  );
  assert.equal(result.audience.ots, null);
  assert.equal(result.audience.reach, null);
});

test('cross-site metadata and context are rejected, including demo context and invalid provenance', () => {
  const wrong = context();
  wrong.siteId = 'private-other-site';
  const result = projectPlanningEnrichment(
    { id: 'site', metadata: [metadata({ siteId: 'other' })] },
    wrong,
    now,
  );
  assert.equal(result.visibility.value, null);
  assert.equal(result.geographic.nearestRoad.value, null);
  assert.equal(
    projectPlanningEnrichment({ id: 'site' }, { ...context(), dataClass: 'demo' }, now).geographic
      .traffic.value,
    null,
  );
  for (const patch of [
    { sourceKey: 'demo-fixture' },
    { checksum: 'bad' },
    { fetchedAt: '2027-01-01' },
  ]) {
    const invalid = context();
    invalid.traffic.provenance = { ...provenance, ...patch };
    assert.equal(
      projectPlanningEnrichment({ id: 'site' }, invalid, now).geographic.traffic.value,
      null,
    );
  }
});

test('NoData population and invalid observation count/unit remain unavailable', () => {
  const input = context();
  input.catchments[0].population.value!.people = null;
  assert.equal(
    projectPlanningEnrichment({ id: 'site' }, input, now).geographic.catchments[1].population.value,
    null,
  );
  for (const count of [-1, 1.5, Infinity]) {
    const invalid = context();
    invalid.traffic.value![0].count = count;
    assert.equal(
      projectPlanningEnrichment({ id: 'site' }, invalid, now).geographic.traffic.value,
      null,
    );
  }
  const mismatchedInterval = context();
  mismatchedInterval.traffic.value![0].durationMinutes = 60;
  assert.equal(
    projectPlanningEnrichment({ id: 'site' }, mismatchedInterval, now).geographic.traffic.value,
    null,
  );
});

test('zero observed values are retained and arbitrary source payload properties never reach grounding', () => {
  const input = context();
  input.traffic.value![0].count = 0;
  input.catchments[0].population.value!.people = 0;
  Object.assign(input.catchments[0].population.value!, {
    injectedProperty: 'SYNTHETIC untrusted payload',
  });
  Object.assign(input.catchments[0].population.provenance!, {
    injectedProperty: 'SYNTHETIC untrusted payload',
  });
  const result = projectPlanningEnrichment({ id: 'site' }, input, now);
  assert.equal(result.geographic.traffic.value![0].count, 0);
  assert.equal(result.geographic.catchments[1].population.value!.people, 0);
  assert.equal(JSON.stringify(result).includes('injectedProperty'), false);
});

test('synthetic site cannot turn plausible structure or source-labelled counts into production evidence', () => {
  const result = projectPlanningEnrichment(
    {
      id: 'site',
      synthetic: true,
      elevation: 8,
      metadata: [metadata({ dimension: 'traffic', payload: { aadt: 85000 } })],
    },
    context(),
    now,
  );
  assert.equal(result.syntheticInputsExcluded, true);
  assert.equal(result.structure.elevation.value, null);
  assert.equal(result.declaredTraffic.value, null);
  assert.equal(result.geographic.traffic.value, null);
});

test('large source text and arrays are bounded without changing numerical values or generating audience totals', () => {
  const input = context();
  input.traffic.value = Array.from({ length: 200 }, (_, index) => ({
    ...input.traffic.value![0],
    sourceId: 'x'.repeat(1000) + index,
  }));
  input.traffic.warnings = Array.from({ length: 100 }, () => 'x'.repeat(2000));
  const result = projectPlanningEnrichment({ id: 'site' }, input, now);
  assert.equal(result.geographic.traffic.value?.length, 50);
  assert.equal(result.geographic.traffic.value?.[0].sourceId.length, 512);
  assert.ok(result.geographic.traffic.warnings.length <= 13);
  assert.ok(JSON.stringify(result).length < 384 * 1024);
  assert.equal(result.audience.ots, null);
});
