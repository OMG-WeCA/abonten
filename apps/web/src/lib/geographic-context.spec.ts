import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ContextMetric, ContextProvenance, SiteGeographicContext } from '@abonten/contracts/enrichment';
import { GeographicContextContent, GeographicContextPanel } from '../components/sites/GeographicContextPanel';
import { saveSession } from './api';
import { availableContextValue, beginGeographicContextLoad, getGeographicContext, sourceWebUrl, type GeographicContextState } from './geographic-context';
import { geographicContextCopy } from './geographic-context-locale';

const originalFetch = globalThis.fetch;
const provenance: ContextProvenance = {
  importId: 'reference-import-123', sourceKey: 'osm-geofabrik', version: '2026-09-01',
  referenceYear: 2026, publishedAt: null, fetchedAt: '2026-09-01T00:00:00Z',
  licence: 'ODbL-1.0', licenceUrl: 'https://www.openstreetmap.org/copyright',
  attribution: '© OpenStreetMap contributors', sourceUrl: 'https://download.geofabrik.de/africa/ghana.html',
  checksum: 'a'.repeat(64), quality: 'mapped', warnings: [],
};

function missing<T>(): ContextMetric<T> {
  return { status: 'unavailable', value: null, method: 'No reference import', provenance: null, warnings: [] };
}

function context(siteId = 'site-a'): SiteGeographicContext {
  return {
    siteId, countryCode: 'GH', supported: true, generatedAt: '2026-09-30T10:00:00Z', dataClass: 'production',
    disclaimer: 'Geographic context only', nearestRoad: missing(), administrative: [missing(), missing()],
    catchments: [250, 500, 1000].map((radius) => ({ radiusMetres: radius as 250 | 500 | 1000, pois: missing(), population: missing() })),
    traffic: missing(),
  };
}

function render(value: SiteGeographicContext, locale: 'en' | 'fr' = 'en') {
  return renderToStaticMarkup(createElement(GeographicContextContent, { context: value, locale }));
}

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) },
  });
  process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.test';
  saveSession({ accessToken: 'test-access', refreshToken: 'test-refresh', activeOrgId: 'org-a' });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
});

test('geographic context uses authenticated tenant API and no cache', async () => {
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://api.example.test/api/inventory/sites/site-a/geographic-context');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('X-Org-Id'), 'org-a');
    assert.equal(headers.get('Authorization'), 'Bearer test-access');
    assert.equal(init?.cache, 'no-store');
    assert.equal(init?.method, 'GET');
    assert.ok(init?.signal);
    return Response.json(context());
  };
  assert.equal((await getGeographicContext('org-a', 'site-a')).siteId, 'site-a');
});

test('geographic context refuses demo data or a different site response', async () => {
  for (const response of [{ ...context(), dataClass: 'demo' }, context('site-b')]) {
    globalThis.fetch = async () => Response.json(response);
    await assert.rejects(getGeographicContext('org-a', 'site-a'), /Invalid geographic context response/);
  }
});

test('an already cancelled request never reaches transport', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return Response.json(context()); };
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(getGeographicContext('org-a', 'site-a', controller.signal), { name: 'AbortError' });
  assert.equal(called, false);
});

test('cancellation aborts transport and ignores a late resolved response', async () => {
  let release!: (response: Response) => void;
  let signal: AbortSignal | undefined | null;
  globalThis.fetch = async (_input, init) => {
    signal = init?.signal;
    return new Promise<Response>((resolve) => { release = resolve; });
  };
  const states: GeographicContextState[] = [];
  const cancel = beginGeographicContextLoad('org-a', 'site-a', (state) => states.push(state));
  assert.deepEqual(states, [{ status: 'loading' }]);
  cancel();
  assert.equal(signal?.aborted, true);
  release(Response.json(context()));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(states, [{ status: 'loading' }]);
});

test('site or organization navigation keeps the new result when the old result arrives last', async () => {
  let releaseOld!: (response: Response) => void;
  globalThis.fetch = async (input) => String(input).includes('/site-a/')
    ? new Promise<Response>((resolve) => { releaseOld = resolve; })
    : Response.json(context('site-b'));
  const states: GeographicContextState[] = [];
  const onState = (state: GeographicContextState) => { states.push(state); };
  const cancelOld = beginGeographicContextLoad('org-a', 'site-a', onState);
  cancelOld();
  const cancelNew = beginGeographicContextLoad('org-b', 'site-b', onState);
  await new Promise((resolve) => setImmediate(resolve));
  releaseOld(Response.json(context()));
  await new Promise((resolve) => setImmediate(resolve));
  const latest = states.at(-1);
  assert.equal(latest?.status, 'ready');
  assert.equal(latest?.status === 'ready' ? latest.context.siteId : null, 'site-b');
  cancelNew();
});

test('a failed request can be retried without synthetic fallback metrics', async () => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? Response.json({ message: 'private diagnostic' }, { status: 503 }) : Response.json(context());
  const states: GeographicContextState[] = [];
  beginGeographicContextLoad('org-a', 'site-a', (state) => states.push(state));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(states.at(-1), { status: 'error', inaccessible: false });
  beginGeographicContextLoad('org-a', 'site-a', (state) => states.push(state));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(states.at(-1)?.status, 'ready');
});

test('authorization failures use the inaccessible state', async () => {
  globalThis.fetch = async () => Response.json({ message: 'private diagnostic' }, { status: 403 });
  const states: GeographicContextState[] = [];
  beginGeographicContextLoad('org-a', 'site-a', (state) => states.push(state));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(states.at(-1), { status: 'error', inaccessible: true });
});

test('all three catchments and honest empty states render even with no imports', () => {
  const html = render(context());
  for (const radius of ['250', '500', '1,000']) assert.ok(html.includes(`Radius · ${radius} m`));
  assert.ok(html.includes('Unavailable'));
  assert.ok(html.includes('No actual licensed traffic observations'));
  assert.ok(html.includes('No production source available'));
  assert.ok(!html.includes('0 residents'));
});

test('zero mapped POIs is distinct from unavailable and retains the OSM caution', () => {
  const value = context();
  value.catchments[0].pois = { status: 'available', value: { mappedCount: 0, byCategory: {}, nearest: [], completeness: 'unknown' }, method: 'Geodesic circle', provenance, warnings: [] };
  const html = render(value);
  assert.ok(html.includes('No POIs mapped in this catchment'));
  assert.ok(html.includes('A zero count does not establish'));
  assert.ok(html.includes('Reference year: 2026'));
  assert.ok(html.includes('ODbL-1.0'));
  assert.ok(html.includes('reference-import-123'));
});

test('partial population is labelled and never extrapolated to full coverage', () => {
  const value = context();
  value.catchments[0].population = { status: 'partial', value: { people: 125.4, validCoverageFraction: 0.6, rasterCoverageFraction: 0.8, unit: 'people' }, method: 'Area-weighted cells', provenance: { ...provenance, quality: 'modelled' }, warnings: ['Incomplete raster coverage'] };
  const html = render(value);
  assert.ok(html.includes('125.4'));
  assert.ok(html.includes('60%'));
  assert.ok(html.includes('80%'));
  assert.ok(html.includes('Partial estimate: residents in the covered area only.'));
  assert.ok(html.includes('Incomplete raster coverage'));
  assert.ok(!html.includes('209'));
});

test('all-NoData population still shows known coverage without rendering zero residents', () => {
  const value = context();
  value.catchments[0].population = { status: 'unavailable', value: { people: null, validCoverageFraction: 0, rasterCoverageFraction: 1, unit: 'people' }, method: 'Area-weighted cells', provenance: { ...provenance, quality: 'modelled' }, warnings: [] };
  const html = render(value);
  assert.ok(html.includes('100%'));
  assert.ok(html.includes('Valid population coverage'));
  assert.ok(!html.includes('0 residents'));
  assert.equal(availableContextValue(value.catchments[0].population), null);
});

test('a real zero population remains a value when valid coverage is complete', () => {
  const value = context();
  value.catchments[0].population = { status: 'available', value: { people: 0, validCoverageFraction: 1, rasterCoverageFraction: 1, unit: 'people' }, method: 'Area-weighted cells', provenance: { ...provenance, quality: 'modelled' }, warnings: [] };
  const html = render(value);
  assert.ok(html.includes('0 <span'));
  assert.ok(html.includes('>residents</span>'));
  assert.equal(availableContextValue(value.catchments[0].population)?.people, 0);
});

test('observations show counts, intervals, duration and definitions without daily scaling', () => {
  const value = context();
  value.traffic = { status: 'available', value: [{ sourceId: 'survey-1', observedFrom: '2026-09-01T09:00:00Z', observedTo: '2026-09-01T09:30:00Z', durationMinutes: 30, count: 72, unit: 'vehicles', direction: 'northbound', vehicleClasses: ['cars', 'buses'], method: 'Manual count', distanceMetres: 50 }], method: 'Observed survey', provenance: { ...provenance, quality: 'observed' }, warnings: [] };
  const html = render(value);
  assert.ok(html.includes('72 vehicles'));
  assert.ok(html.includes('Duration (minutes)'));
  assert.ok(html.includes('northbound'));
  assert.ok(html.includes('cars, buses'));
  assert.ok(html.includes('They are not annual average daily traffic'));
  assert.ok(!html.includes('3,456'));
  value.traffic.provenance = { ...provenance, quality: 'modelled' };
  assert.ok(!render(value).includes('72 vehicles'));
});

test('demo content and unsafe provenance URLs cannot render production metrics or script links', () => {
  const value = context();
  value.nearestRoad = { status: 'available', value: { sourceId: 'road-1', name: 'Test road', roadClass: 'primary', distanceMetres: 2 }, method: 'Nearest line', provenance: { ...provenance, sourceUrl: 'javascript:alert(1)', licenceUrl: 'data:text/html,example' }, warnings: [] };
  assert.ok(!render(value).includes('javascript:'));
  assert.ok(!render(value).includes('data:text'));
  assert.ok(!render({ ...value, dataClass: 'demo' } as unknown as SiteGeographicContext).includes('Test road'));
  assert.equal(sourceWebUrl('https://user:password@example.test'), undefined);
  assert.equal(sourceWebUrl('/relative'), undefined);
});

test('English and French geographic copy remain aligned and French renders', () => {
  assert.deepEqual(Object.keys(geographicContextCopy.en), Object.keys(geographicContextCopy.fr));
  const html = render(context(), 'fr');
  assert.ok(html.includes('Population résidentielle modélisée'));
  assert.ok(html.includes('Rayon · 1 000 m'));
  const panel = renderToStaticMarkup(createElement(GeographicContextPanel, { orgId: 'org-a', siteId: 'site-a', revision: '1', locale: 'fr' }));
  assert.ok(panel.includes('Contexte géographique'));
  assert.ok(panel.includes('Chargement du contexte géographique'));
  assert.ok(panel.includes('Alpha'));
});
