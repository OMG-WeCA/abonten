import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { BoardDetail } from '../components/agency/BoardDetail';
import { PlannerDataUseDialog } from '../components/agency/PlannerDataUseDialog';
import { AgencyPlanner } from '../components/agency/AgencyPlanner';
import { prettyFormat } from '../components/sites/sites-ui';
import { GeographicContextSnapshot } from '../components/sites/GeographicContextPanel';
import type { ContextMetric, SiteGeographicContext } from '@abonten/contracts/enrichment';
import type { SiteDetail } from './sites-api';
import { estimateFaceCost, selectionDistances, summarizeBudget } from './agency-planning';

const window = { startDate: '2026-10-01', endDate: '2026-10-08' };
const availability = { status: 'available' as const, window, checkedAt: '2026-09-30T12:34:56Z' };
const noop = () => {};
// Synthetic evidence; no browser, provider, photo or geographic request is performed.
const site: SiteDetail = {
  id: 'board-test',
  organizationId: 'synthetic-org',
  code: 'SYNTHETIC',
  name: 'Test board',
  type: 'billboard',
  format: 'static',
  latitude: 6.45,
  longitude: 3.42,
  city: 'Lagos',
  country: 'Nigeria',
  illuminationType: 'none',
  status: 'listed',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  faces: [
    {
      id: 'face-test',
      siteId: 'board-test',
      faceLabel: 'A',
      width: 12.5,
      height: 3.5,
      area: 43.75,
      units: 'ft',
      bookable: true,
    },
  ],
  assets: [],
  metadata: [
    {
      id: 'source-test',
      siteId: 'board-test',
      dimension: 'environment',
      payload: {},
      source: 'Original English source name',
      method: 'Original provider-authored method',
      verification: 'partner_declared',
    },
  ],
  rateCards: [
    {
      id: 'rate-test',
      siteId: 'board-test',
      currency: 'NGN',
      rates: { perDay: 120.5 },
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-12-31',
    },
  ],
};

test('board evidence renders current-locale controlled reasons, units and rate dates while preserving arbitrary source content', () => {
  const render = (locale: 'en' | 'fr') =>
    renderToStaticMarkup(
      <BoardDetail
        site={site}
        orgId="synthetic-org"
        locale={locale}
        faceId="face-test"
        onFace={noop}
        estimate={{
          status: 'unavailable',
          siteId: site.id,
          faceId: 'face-test',
          reason: 'No published rate covers this flight.',
        }}
        selected={false}
        canPlan
        window={window}
        availability={availability}
        onRetryAvailability={noop}
        onAdd={noop}
        onClose={noop}
      />,
    );
  const fr = render('fr');
  assert.ok(fr.includes('Aucun tarif publié ne couvre cette période de diffusion.'));
  assert.ok(fr.includes('12,5 × 3,5 pi'));
  assert.ok(fr.includes('Environnement'));
  assert.ok(fr.includes('Déclaré par le partenaire'));
  assert.ok(fr.includes('01 janv. 2026'));
  assert.ok(fr.includes('fin inclusive'));
  assert.ok(fr.includes('Original English source name'));
  assert.ok(fr.includes('Original provider-authored method'));
  assert.ok(!fr.includes('No published rate covers this flight.'));
  assert.ok(render('en').includes('No published rate covers this flight.'));
});

test('planner renders French decimal distances, cost assumptions and UTC checks without changing the canonical estimate', () => {
  const estimate = estimateFaceCost(site, site.faces[0], window, 'NGN', availability);
  assert.equal(estimate.status, 'ready');
  const original = JSON.stringify(estimate);
  const html = renderToStaticMarkup(
    <AgencyPlanner
      open
      orgId="synthetic-org"
      locale="fr"
      canPlan
      window={window}
      budget="2000"
      onBudget={noop}
      currency="NGN"
      onCurrency={noop}
      shortlist={[{ site, faceId: 'face-test' }]}
      estimates={[estimate]}
      summary={summarizeBudget([estimate], { amount: 2000, currency: 'NGN' })}
      distances={[
        {
          ...selectionDistances([
            { id: site.id, latitude: 6.45, longitude: 3.42 },
            { id: 'other-test', latitude: 6.46, longitude: 3.43 },
          ])[0],
          value: 12.34,
        },
      ]}
      onSelect={noop}
      onRemove={noop}
      onClear={noop}
      onClose={noop}
      onRecommend={noop}
      recommending={false}
      onCancelRecommendation={noop}
      canRecommend
      notice=""
    />,
  );
  assert.ok(html.includes('12,34'));
  assert.ok(html.includes('fin exclusive'));
  assert.ok(html.includes('01 oct. 2026'));
  assert.ok(html.includes('12:34:56 UTC'));
  assert.ok(html.includes('Tarif journalier'));
  assert.ok(!html.includes('Daily rate × flight days'));
  assert.equal(JSON.stringify(estimate), original);
});

test('all controlled billboard formats have French labels', () => {
  assert.equal(prettyFormat('transit', 'fr'), 'Transport');
  assert.equal(prettyFormat('street_furniture', 'fr'), 'Mobilier urbain');
  assert.equal(prettyFormat('tri_vision', 'fr'), 'Trivision');
  assert.equal(prettyFormat('unknown_vendor_format', 'fr'), 'unknown vendor format');
});

test('budget input accepts French grouped decimals and plain English amounts, rejecting ambiguous amounts', () => {
  const estimate = estimateFaceCost(site, site.faces[0], window, 'NGN', availability);
  const render = (budget: string, locale: 'en' | 'fr') =>
    renderToStaticMarkup(
      <AgencyPlanner
        open
        orgId="synthetic-org"
        locale={locale}
        canPlan
        window={window}
        budget={budget}
        onBudget={noop}
        currency="NGN"
        onCurrency={noop}
        shortlist={[{ site, faceId: 'face-test' }]}
        estimates={[estimate]}
        summary={summarizeBudget([estimate])}
        distances={[]}
        onSelect={noop}
        onRemove={noop}
        onClear={noop}
        onClose={noop}
        onRecommend={noop}
        recommending={false}
        onCancelRecommendation={noop}
        canRecommend
        notice=""
      />,
    );
  const fr = render('3 000 000,50', 'fr');
  assert.ok(fr.includes('type="text"'));
  assert.ok(fr.includes('inputMode="decimal"'));
  assert.ok(fr.includes('max="3000000.5"'));
  assert.ok(!fr.includes('Saisissez un budget supérieur à zéro.'));
  assert.ok(render('3000000.50', 'en').includes('max="3000000.5"'));
  for (const locale of ['en', 'fr'] as const) {
    const ambiguous = render('1,234', locale);
    assert.ok(!ambiguous.includes('<progress'));
    assert.ok(
      ambiguous.includes(
        locale === 'fr' ? 'Saisissez un montant sans ambiguïté' : 'Enter an unambiguous amount',
      ),
    );
  }
});

test('geographic evidence translates controlled method/warning text and keeps original source attribution', () => {
  const metric: ContextMetric<never> = {
    status: 'unavailable',
    value: null,
    method:
      'Observed counting locations within 1000 metres; proximity does not establish exposure to the billboard.',
    warnings: ['No observed counting location within 1000 metres. Traffic remains unknown.'],
    provenance: {
      importId: 'synthetic-import',
      sourceKey: 'Original English provider name',
      version: 'test',
      referenceYear: 2026,
      publishedAt: '2026-10-01',
      fetchedAt: '2026-10-02T10:20:30Z',
      licence: 'Synthetic test licence',
      licenceUrl: 'https://example.test/licence',
      attribution: 'Original English provider attribution',
      sourceUrl: 'https://example.test/source',
      checksum: 'test-only',
      quality: 'observed',
      warnings: [],
    },
  };
  const context: SiteGeographicContext = {
    siteId: site.id,
    countryCode: 'NG',
    supported: true,
    generatedAt: '2026-10-02T11:20:30Z',
    dataClass: 'production',
    disclaimer: 'Synthetic fixture only',
    nearestRoad: metric,
    administrative: [],
    catchments: [{ radiusMetres: 500, pois: metric, population: metric }],
    traffic: metric,
  };
  const html = renderToStaticMarkup(
    <GeographicContextSnapshot context={context} locale="fr" radius={500} onRadiusChange={noop} />,
  );
  assert.ok(html.includes('Aucun lieu de comptage observé'));
  assert.ok(html.includes('la proximité ne prouve pas l’exposition au panneau'));
  assert.ok(!html.includes('Traffic remains unknown.'));
  assert.ok(html.includes('Original English provider name'));
  assert.ok(html.includes('Original English provider attribution'));
  assert.ok(html.includes('11:20:30 UTC'));
  assert.ok(html.includes('01 oct. 2026'));
});

test('on-demand data-use information names the provider and text scope without acting as sharing consent', () => {
  for (const locale of ['en', 'fr'] as const) {
    const html = renderToStaticMarkup(
      <PlannerDataUseDialog locale={locale} connected onClose={noop} />,
    );
    assert.ok(html.includes('<dialog'));
    assert.ok(html.includes('aria-labelledby="planner-data-use-title"'));
    assert.ok(html.includes('OpenAI'));
    assert.ok(
      html.includes(
        locale === 'fr' ? 'fichier original n’est pas envoyé' : 'original file is not sent',
      ),
    );
    assert.ok(
      html.includes(
        locale === 'fr'
          ? 'après votre confirmation et votre autorisation'
          : 'after you confirm and authorize it',
      ),
    );
    assert.ok(!html.includes('type="checkbox"'));
    assert.ok(!html.includes('accept'));
  }
});

test('demo popup distinguishes sample cost and unknown availability without changing its sample name', () => {
  const sample = { ...site, isDemo: true, commerciallyBookable: false, metadata: [] };
  const price = estimateFaceCost(sample, sample.faces[0], window, 'NGN', availability);
  assert.equal(price.status, 'ready');
  if (price.status !== 'ready') return;
  for (const locale of ['en', 'fr'] as const) {
    for (const status of ['available', 'unknown'] as const) {
      const html = renderToStaticMarkup(
        <BoardDetail
          site={sample}
          orgId="synthetic-org"
          locale={locale}
          faceId="face-test"
          onFace={noop}
          estimate={{ ...price, availability: status }}
          selected={false}
          canPlan
          window={window}
          availability={{ ...availability, status }}
          onRetryAvailability={noop}
          onAdd={noop}
          onClose={noop}
        />,
      );
      assert.ok(html.includes(site.name));
      assert.ok(html.includes('DEMO'));
      assert.ok(html.includes(locale === 'fr' ? 'Face fictive' : 'Sample face'));
      assert.ok(html.includes(locale === 'fr' ? 'coût média fictif' : 'sample media cost'));
      assert.ok(
        html.includes(
          status === 'available'
            ? locale === 'fr'
              ? 'Disponible dans l’exemple'
              : 'Available in sample'
            : locale === 'fr'
              ? 'Disponibilité fictive non confirmée'
              : 'Sample availability unconfirmed',
        ),
      );
      assert.ok(
        !html.includes(
          locale === 'fr' ? 'Disponible au dernier contrôle' : 'Available at last check',
        ),
      );
    }
  }
});
