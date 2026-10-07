import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgencyCompare, type AgencyCompareProps } from '../components/agency/AgencyCompare';
import { estimateFaceCost, type FaceCostEstimate } from './agency-planning';
import type { SiteDetail } from './sites-api';

const window = { startDate: '2026-10-01', endDate: '2026-10-04' };
const available = { status: 'available' as const, window, checkedAt: '2026-09-30T12:34:56Z' };
const noop = () => {};
// Synthetic authorized API snapshots; no provider, inventory or enrichment requests.
const site: SiteDetail = {
  id: 'comparison-board',
  organizationId: 'synthetic-org',
  code: 'COMPARE-QA',
  name: 'Synthetic comparison board',
  type: 'billboard',
  format: 'static',
  latitude: 0,
  longitude: 0,
  city: 'Accra',
  country: 'Ghana',
  status: 'listed',
  illuminationType: 'external',
  orientationDeg: 0,
  elevation: 12.5,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  faces: [
    {
      id: 'face-A',
      siteId: 'comparison-board',
      faceLabel: 'A',
      width: 12.5,
      height: 3.5,
      area: 43.75,
      units: 'ft',
      bookable: true,
    },
    {
      id: 'face-B',
      siteId: 'comparison-board',
      faceLabel: 'B',
      width: 8,
      height: 4,
      area: 32,
      units: 'm',
      bookable: true,
    },
  ],
  assets: [],
  rateCards: [
    {
      id: 'published-rate-A',
      siteId: 'comparison-board',
      faceId: 'face-A',
      currency: 'GHS',
      rates: { perDay: 50 },
      effectiveFrom: '2026-01-01',
    },
    {
      id: 'published-rate-B',
      siteId: 'comparison-board',
      faceId: 'face-B',
      currency: 'USD',
      rates: { perDay: 125.5 },
      effectiveFrom: '2026-01-01',
    },
  ],
  metadata: [
    {
      id: 'visibility-source',
      siteId: 'comparison-board',
      dimension: 'visibility',
      payload: { score: 90 },
      source: 'Original English provider name',
      method: 'Original provider-authored method',
      collectedAt: '2026-01-01',
      expiresAt: '2100-01-01',
      verification: 'third_party',
      dataClass: 'production',
    },
  ],
};

function props(overrides: Partial<AgencyCompareProps> = {}): AgencyCompareProps {
  const shortlist = site.faces.map((face, index) => ({
    site,
    faceId: face.id,
    pricingCurrency: index ? 'USD' : 'GHS',
  }));
  return {
    shortlist,
    estimates: shortlist.map((item) =>
      estimateFaceCost(
        item.site,
        item.site.faces.find((face) => face.id === item.faceId)!,
        window,
        item.pricingCurrency,
        available,
      ),
    ),
    availabilityFor: () => available,
    window,
    locale: 'en',
    onOpen: noop,
    onRemove: noop,
    onBack: noop,
    onBrowse: noop,
    ...overrides,
  };
}
const render = (input: AgencyCompareProps) => renderToStaticMarkup(<AgencyCompare {...input} />);

test('two faces on one board retain distinct canonical costs, units, sources and selection order', () => {
  const input = props();
  const original = JSON.stringify(input);
  assert.equal(input.estimates[0].status === 'ready' && input.estimates[0].amount, 150);
  assert.equal(input.estimates[1].status === 'ready' && input.estimates[1].amount, 376.5);
  const html = render(input);
  assert.equal((html.match(/<article /g) ?? []).length, 2);
  assert.ok(html.indexOf('data-face-id="face-A"') < html.indexOf('data-face-id="face-B"'));
  assert.ok(html.includes('150'));
  assert.ok(html.includes('376.5'));
  assert.ok(html.includes('GHS'));
  assert.ok(html.includes('USD'));
  assert.ok(html.includes('12.5 × 3.5 ft'));
  assert.ok(html.includes('8 × 4 m'));
  assert.ok(html.includes('published-rate-A'));
  assert.ok(html.includes('published-rate-B'));
  assert.ok(html.includes('Media only; tax, production, installation'));
  assert.ok(html.includes('30 Sept 2026, 12:34:56 UTC'));
  assert.ok(html.includes('start included, end excluded'));
  assert.ok(html.includes('0 degrees clockwise from north'));
  assert.ok(html.includes('Original English provider name'));
  assert.ok(html.includes('Original provider-authored method'));
  assert.ok(html.includes('Viewing angle is not recorded'));
  assert.ok(html.includes('No source-backed metadata is available.'));
  assert.equal(
    JSON.stringify(input),
    original,
    'Comparison must not mutate canonical inventory/estimates',
  );
});

test('French comparison localizes controlled labels, evidence, currency and dates without translating source prose', () => {
  const html = render(props({ locale: 'fr' }));
  assert.ok(html.includes('Comparer les faces sélectionnées'));
  assert.ok(html.includes('12,5 × 3,5 pi'));
  assert.ok(html.includes('376,5'));
  assert.ok(html.includes('30 sept. 2026, 12:34:56 UTC'));
  assert.ok(html.includes('début inclus, fin exclue'));
  assert.ok(html.includes('L’angle de vue n’est pas renseigné'));
  assert.ok(html.includes('Aucune métadonnée étayée par une source'));
  assert.ok(html.includes('Éclairage'));
  assert.ok(html.includes('Original English provider name'));
  assert.ok(html.includes('Original provider-authored method'));
  assert.ok(!html.includes('No source-backed metadata is available.'));
  assert.ok(html.includes('aria-label="Ouvrir le panneau Synthetic comparison board, face A"'));
  assert.ok(html.includes('aria-label="Retirer la face B, Synthetic comparison board"'));
});

test('old flight/currency estimates and checks cannot be shown as current prices or confirmed availability', () => {
  const input = props();
  const ready = input.estimates[0];
  assert.equal(ready.status, 'ready');
  if (ready.status !== 'ready') return;
  const first = [input.shortlist[0]];
  const stale = {
    ...ready,
    amount: 987654321,
    window: { startDate: '2025-01-01', endDate: '2025-01-04' },
  };
  const oldCheck = { ...available, window: stale.window };
  const old = render(
    props({ shortlist: first, estimates: [stale], availabilityFor: () => oldCheck }),
  );
  assert.ok(!old.includes('987,654,321'));
  assert.ok(!old.includes('Available at last check'));
  assert.ok(old.includes('Not confirmed'));
  assert.ok(old.includes('No matching flight check'));
  const wrongCurrency = render(
    props({ shortlist: first, estimates: [{ ...ready, currency: 'USD', amount: 876543210 }] }),
  );
  assert.ok(!wrongCurrency.includes('876,543,210'));
  assert.ok(wrongCurrency.includes('current estimate for this flight and currency is unavailable'));
  const wrongFace: FaceCostEstimate = { ...ready, faceId: 'someone-else', amount: 765432109 };
  assert.ok(!render(props({ shortlist: first, estimates: [wrongFace] })).includes('765,432,109'));
});

test('current unavailable flight, missing face and invalid flight keep explicit missing states', () => {
  const input = props();
  const html = render(
    props({
      shortlist: [input.shortlist[0]],
      availabilityFor: () => ({ ...available, status: 'unavailable' }),
    }),
  );
  assert.ok(html.includes('Unavailable at last check'));
  assert.ok(html.includes('This face is unavailable for the selected flight.'));
  assert.ok(html.includes('Quote unavailable'));
  const missing = render(
    props({ shortlist: [{ site: { ...site, faces: [] }, faceId: 'deleted-face' }] }),
  );
  assert.ok(missing.includes('This listed face is no longer available.'));
  assert.ok(missing.includes('Not recorded'));
  assert.ok(!missing.includes('NaN'));
  const invalid = render(props({ window: { startDate: 'invalid', endDate: '' } }));
  assert.ok(invalid.includes('Choose valid flight dates in the planner.'));
  assert.ok(invalid.includes('Choose valid start and exclusive end dates.'));
});

test('empty/single selections expose real actions and full 100-face drafts are not truncated', () => {
  let reads = 0;
  const empty = render(
    props({
      shortlist: [],
      estimates: [],
      availabilityFor: () => {
        reads++;
        return available;
      },
    }),
  );
  assert.equal(reads, 0);
  assert.ok(empty.includes('Choose the faces you want to compare'));
  assert.ok(empty.includes('Browse inventory'));
  assert.ok(!empty.includes('<article '));
  assert.ok(!empty.includes('disabled=""'));
  const one = render(props({ shortlist: [props().shortlist[0]] }));
  assert.ok(one.includes('Find another face'));
  assert.ok(one.includes('Open board details'));
  assert.ok(one.includes('Remove from shortlist'));
  const full = render(
    props({
      shortlist: Array.from({ length: 100 }, (_, index) => ({ site, faceId: `missing-${index}` })),
      estimates: [],
    }),
  );
  assert.equal((full.match(/<article /g) ?? []).length, 100);
  assert.ok(full.includes('data-face-id="missing-99"'));
  assert.ok(full.includes('100 selected faces'));
});

test('expired and synthetic metadata never become comparison audience/visibility measurements', () => {
  for (const record of [
    { ...site.metadata[0], expiresAt: '2020-01-01' },
    { ...site.metadata[0], dataClass: 'demo' },
  ]) {
    const html = render(
      props({ shortlist: [{ site: { ...site, metadata: [record] }, faceId: 'face-A' }] }),
    );
    assert.ok(!html.includes('90 score out of 100'));
    assert.ok(html.includes('Not recorded'));
    assert.ok(
      html.includes(
        record.dataClass === 'demo'
          ? 'No source-backed metadata is available.'
          : 'Metadata is expired or has a future collection date.',
      ),
    );
  }
});

test('synthetic inventory keeps its name and sample calculations but never claims commercial availability', () => {
  const sample = {
    ...site,
    isDemo: true,
    commerciallyBookable: false,
    demoProvenance:
      'Synthetic agency demonstration sample; dimensions, location and NGN prices are illustrative. No verified media, commercial booking, permit or audience claim.',
  };
  for (const locale of ['en', 'fr'] as const) {
    const html = render(props({ locale, shortlist: [{ site: sample, faceId: 'face-A' }] }));
    assert.ok(html.includes(site.name));
    assert.ok(html.includes('DEMO'));
    assert.ok(html.includes(locale === 'fr' ? 'Coût média fictif' : 'Sample media cost'));
    assert.ok(html.includes(locale === 'fr' ? 'Disponible dans l’exemple' : 'Available in sample'));
    assert.ok(
      html.includes(locale === 'fr' ? 'Dimensions illustratives' : 'Illustrative dimensions'),
    );
    assert.ok(
      html.includes(locale === 'fr' ? 'sans inventaire' : 'No verified media') ||
        html.includes('Aucun média vérifié'),
    );
    assert.ok(
      !html.includes(
        locale === 'fr' ? 'Disponible au dernier contrôle' : 'Available at last check',
      ),
    );
    assert.ok(
      !html.includes(
        locale === 'fr'
          ? 'Déclaration enregistrée de l’inventaire'
          : 'Registered inventory declaration',
      ),
    );
  }
});

test('sample unavailable and unknown checks stay distinct', () => {
  const sample = { ...site, isDemo: true, commerciallyBookable: false };
  for (const status of ['unavailable', 'unknown'] as const) {
    const html = render(
      props({
        shortlist: [{ site: sample, faceId: 'face-A' }],
        availabilityFor: () => ({ ...available, status }),
      }),
    );
    assert.ok(html.includes('Sample availability'));
    assert.ok(html.includes(status === 'unavailable' ? 'Unavailable in sample' : 'Not confirmed'));
    assert.ok(!html.includes('Available in sample'));
  }
});

test('research comparison keeps advertised monthly rate apart from flight quotes and date availability', () => {
  const reference: SiteDetail = {
    ...site,
    isResearchReference: true,
    commerciallyBookable: false,
    faces: [{ ...site.faces[0], bookable: false }],
    rateCards: [],
    metadata: [],
    researchProvenance: {
      publisher: 'ELEV8 Media',
      operatorName: 'ELEV8MEDIA ADVERTISING LTD',
      siteSourceUrl: 'https://elev8.com.ng/king-of-marina/',
      accessedAt: '2026-10-07T00:09:00Z',
      coordinateVerification: 'operator_published_not_field_verified',
      dimensionsUnit: 'm',
      askingPrice: {
        amount: 4500000,
        currency: 'NGN',
        period: 'month',
        sourceUrl: 'https://elev8mediabookings.com/',
        accessedAt: '2026-10-07T00:09:00Z',
        qualification: 'published_indicative',
      },
      unknowns: [],
    },
  };
  for (const locale of ['en', 'fr'] as const) {
    const html = render(props({ locale, shortlist: [{ site: reference, faceId: 'face-A' }] }));
    assert.ok(html.includes(locale === 'fr' ? 'SOURCE PUBLIQUE' : 'RESEARCH'));
    assert.ok(html.includes(locale === 'fr' ? '/ mois' : '/ month'));
    assert.ok(html.includes(locale === 'fr' ? 'Non confirmée' : 'Not confirmed'));
    assert.ok(
      html.includes(locale === 'fr' ? 'Dimensions publiées' : 'Publicly reported dimensions'),
    );
    assert.ok(
      !html.includes(
        locale === 'fr' ? 'Disponible au dernier contrôle' : 'Available at last check',
      ),
    );
    assert.ok(
      !html.includes(
        locale === 'fr' ? 'Coût média pour cette diffusion' : 'Media cost for this flight',
      ),
    );
    assert.ok(
      !html.includes(
        locale === 'fr'
          ? 'Déclaration enregistrée de l’inventaire'
          : 'Registered inventory declaration',
      ),
    );
    assert.ok(!html.includes('DEMO'));
  }
});
