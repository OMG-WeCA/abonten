import { BriefFitScore } from '../components/agency/BriefFitScore';
import { BriefFitPreferences } from '../components/agency/BriefFitPreferences';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResearchPriceBaseline } from '../components/agency/ResearchReferenceFacts';
import { BoardDetail } from '../components/agency/BoardDetail';
import { PlannerDataUseDialog } from '../components/agency/PlannerDataUseDialog';
import { AgencyPlanner, ReplyFacts } from '../components/agency/AgencyPlanner';
import { prettyFormat } from '../components/sites/sites-ui';
import { GeographicContextSnapshot } from '../components/sites/GeographicContextPanel';
import type { ContextMetric, SiteGeographicContext } from '@abonten/contracts/enrichment';
import type { SiteDetail } from './sites-api';
import type { PlannerReply, PlannerFacts } from './agency-api';
import { canonicalRecommendationOutput } from '../../../api/src/planning/planning-output';
import { researchSourceUrl, researchAskingPrice, researchFaceLabel } from './research-reference';
import {
  estimateFaceCost,
  selectionDistances,
  summarizeBudget,
  summarizeResearchPrices,
  type FaceCostEstimate,
} from './agency-planning';

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
      contextMayContainBrief={false}
      onBriefContext={noop}
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
  assert.ok(html.includes('Les notes affichées sont recalculées selon les sources actuelles'));
  assert.ok(html.includes('réouverture d’un plan enregistré'));
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
        contextMayContainBrief={false}
        onBriefContext={noop}
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

// Real-source contract fixture only; no remote requests or rehosted photographs.
const researched: SiteDetail = {
  ...site,
  name: 'KING OF MARINA 2.0',
  isResearchReference: true,
  commerciallyBookable: false,
  ownershipKind: 'agency_curated_reference',
  faces: [
    {
      ...site.faces[0],
      faceLabel: 'Reported display',
      width: 15.36,
      height: 6.72,
      units: 'm',
      bookable: false,
    },
  ],
  rateCards: [],
  assets: [],
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
    unknowns: ['Availability', 'Digital slot terms', 'Audience'],
  },
};

test('real research details preserve source monthly price, uncertainty and reference faces without relabeling or loading copied photos', () => {
  // A stale ordinary quote must not overrule the research discriminator.
  const stale = estimateFaceCost(site, site.faces[0], window, 'NGN', availability);
  for (const locale of ['en', 'fr'] as const) {
    const html = renderToStaticMarkup(
      <BoardDetail
        site={researched}
        orgId="synthetic-org"
        locale={locale}
        faceId="face-test"
        onFace={noop}
        estimate={stale}
        selected={false}
        canPlan
        window={window}
        availability={availability}
        onRetryAvailability={noop}
        onAdd={noop}
        onClose={noop}
      />,
    );
    assert.ok(html.includes(locale === 'fr' ? 'SOURCE PUBLIQUE' : 'RESEARCH'));
    assert.ok(html.includes('KING OF MARINA 2.0'));
    assert.ok(html.includes(locale === 'fr' ? 'Support publié' : 'Reported display'));
    if (locale === 'fr') assert.ok(!html.includes('Reported display'));
    assert.ok(html.includes('NGN'));
    assert.ok(html.includes(locale === 'fr' ? '/ mois' : '/ month'));
    assert.ok(html.includes('https://elev8.com.ng/king-of-marina/'));
    assert.ok(html.includes('https://elev8mediabookings.com/'));
    assert.ok(html.includes(locale === 'fr' ? '07 oct. 2026' : '07 Oct 2026'));
    assert.ok(
      html.includes(
        locale === 'fr' ? 'devis de campagne non confirmé' : 'flight quote unconfirmed',
      ),
    );
    assert.ok(html.includes(locale === 'fr' ? 'non vérifiée sur place' : 'not field verified'));
    assert.ok(html.includes('value="face-test"'));
    assert.ok(!html.includes('<img'));
    assert.ok(!html.includes('DEMO'));
    assert.ok(!html.includes('Synthetic'));
    assert.ok(
      !html.includes(
        locale === 'fr' ? 'Disponible au dernier contrôle' : 'Available at last check',
      ),
    );
    assert.ok(
      !html.includes(locale === 'fr' ? 'jours · estimation média' : 'days · media estimate'),
    );
  }
});

test('research metadata cannot turn unsafe links or malformed asking rates into usable source prices', () => {
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,test',
    'http://example.test/',
    'https://user:pass@example.test/',
    '/relative',
    'not a URL',
  ])
    assert.equal(researchSourceUrl(value), undefined);
  assert.equal(
    researchSourceUrl('https://elev8.com.ng/king-of-marina/'),
    'https://elev8.com.ng/king-of-marina/',
  );
  assert.equal(researchAskingPrice(null, 'en'), null);
  const provenance = researched.researchProvenance!;
  const price = provenance.askingPrice!;
  for (const patch of [
    { amount: NaN },
    { amount: -1 },
    { currency: 'BAD' },
    { sourceUrl: 'http://example.test/' },
  ])
    assert.equal(
      researchAskingPrice({ ...provenance, askingPrice: { ...price, ...patch } }, 'en'),
      null,
    );
});

test('research baseline renders the qualified monthly subtotal and reserve without claiming confirmed budget fit', () => {
  const references = [4500000, 4500000, 5500000, 4000000].map((amount, index) => ({
    ...researched,
    id: `reference-${index}`,
    researchProvenance: {
      ...researched.researchProvenance!,
      askingPrice: { ...researched.researchProvenance!.askingPrice!, amount },
    },
  }));
  const monthly = { startDate: '2026-11-01', endDate: '2026-12-01' };
  const baseline = summarizeResearchPrices(references, monthly, {
    amount: 22000000,
    currency: 'NGN',
  });
  assert.equal(baseline.confirmedBudgetFit, false);
  for (const locale of ['en', 'fr'] as const) {
    const html = renderToStaticMarkup(
      <ResearchPriceBaseline baseline={baseline} locale={locale} currency="NGN" />,
    );
    assert.ok(html.includes(locale === 'fr' ? '18 500 000' : '18,500,000'));
    assert.ok(html.includes(locale === 'fr' ? '3 500 000' : '3,500,000'));
    assert.ok(html.includes(locale === 'fr' ? 'réserve sans devis' : 'unquoted reserve'));
    assert.ok(
      html.includes(
        locale === 'fr'
          ? 'devis et budget de campagne non confirmés'
          : 'flight quote and budget fit unconfirmed',
      ),
    );
    assert.ok(html.includes('https://elev8mediabookings.com/'));
  }
  const shorter = summarizeResearchPrices(references, window, {
    amount: 22000000,
    currency: 'NGN',
  });
  const html = renderToStaticMarkup(
    <ResearchPriceBaseline baseline={shorter} locale="en" currency="NGN" />,
  );
  assert.ok(html.includes('cannot be prorated'));
  assert.ok(!html.includes('unquoted reserve'));
});

test('planner selection shows research monthly asking prices and approximate published-point spacing', () => {
  const monthly = { startDate: '2026-11-01', endDate: '2026-12-01' };
  const estimate = {
    status: 'unavailable' as const,
    siteId: researched.id,
    faceId: 'face-test',
    reason: 'Research reference: full-flight quote unavailable.',
  };
  const other = {
    ...researched,
    id: 'other-reference',
    name: 'LEKKI GATEWAY',
    faces: [{ ...researched.faces[0], id: 'other-face', siteId: 'other-reference' }],
  };
  for (const locale of ['en', 'fr'] as const) {
    for (const partial of [false, true]) {
      const html = renderToStaticMarkup(
        <AgencyPlanner
          contextMayContainBrief={false}
          onBriefContext={noop}
          open
          orgId="synthetic-org"
          locale={locale}
          canPlan
          window={monthly}
          budget="22000000"
          onBudget={noop}
          currency="NGN"
          onCurrency={noop}
          shortlist={[
            { site: researched, faceId: 'face-test' },
            { site: other, faceId: 'other-face' },
          ]}
          estimates={[estimate, { ...estimate, siteId: other.id, faceId: 'other-face' }]}
          summary={summarizeBudget(
            [
              estimate,
              { ...estimate, siteId: other.id, faceId: 'other-face' },
              ...(partial
                ? [{ ...estimate, siteId: 'unresolved', faceId: 'unresolved-face' }]
                : []),
            ],
            { amount: 22000000, currency: 'NGN' },
          )}
          distances={[
            {
              ...selectionDistances([
                { id: researched.id, latitude: 6.450732, longitude: 3.389668 },
                { id: other.id, latitude: 6.437117, longitude: 3.456371 },
              ])[0],
              value: 7.534,
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
      assert.ok(html.includes(locale === 'fr' ? 'SOURCE PUBLIQUE' : 'RESEARCH'));
      assert.ok(html.includes(locale === 'fr' ? '/ mois' : '/ month'));
      assert.ok(html.includes(locale === 'fr' ? 'Support publié' : 'Reported display'));
      if (locale === 'fr') assert.ok(!html.includes('Reported display'));
      assert.ok(
        html.includes(
          locale === 'fr' ? 'Sous-total média mensuel publié' : 'Advertised monthly media subtotal',
        ),
      );
      assert.ok(html.includes(locale === 'fr' ? '≈ 7,5' : '≈ 7.5'));
      assert.ok(
        html.includes(
          locale === 'fr' ? 'distances sont approximatives' : 'distances are approximate',
        ),
      );
      assert.ok(
        html.includes(
          locale === 'fr'
            ? 'devis et disponibilité non confirmés'
            : 'quote and availability unconfirmed',
        ),
      );
      assert.ok(!html.includes('7.534'));
      assert.ok(!html.includes('DEMO'));
      if (partial)
        assert.ok(!html.includes(locale === 'fr' ? 'réserve sans devis' : 'unquoted reserve'));
    }
  }
});

test('only the controlled research face label is localized', () => {
  assert.equal(researchFaceLabel('Reported display', true, 'fr'), 'Support publié');
  assert.equal(researchFaceLabel('Reported display', true, 'en'), 'Reported display');
  assert.equal(researchFaceLabel('Reported display', false, 'fr'), 'Reported display');
  for (const label of [
    'Operator face A',
    'reported display',
    'Display supplied by partner',
    null,
    undefined,
  ]) {
    assert.equal(researchFaceLabel(label, true, 'fr'), label);
  }
});

function canonicalReplyFixture(
  locale: 'en' | 'fr',
  budgetAmount = 22000000,
  selected = false,
): PlannerReply {
  const monthly = { startDate: '2026-11-01', endDate: '2026-12-01' };
  const facts: PlannerFacts = {
    checkedAt: '2026-10-07T12:00:00Z',
    window: monthly,
    requestedBudget: { amount: budgetAmount, currency: 'NGN' },
    sites: [4500000, 4500000, 5500000, 4000000].map((amount, index) => ({
      siteId: `reference-${index}`,
      name: ['KING OF MARINA 2.0', 'LEKKI GATEWAY', 'OSBORNE HEIGHTS', 'TOWER OF OWORO'][index],
      city: 'Lagos',
      country: 'Nigeria',
      latitude: 6.45 + index * 0.01,
      longitude: 3.39 + index * 0.01,
      isResearchReference: true,
      researchProvenance: {
        ...researched.researchProvenance!,
        askingPrice: { ...researched.researchProvenance!.askingPrice!, amount },
      },
      faces: [
        {
          faceId: `face-${index}`,
          faceLabel: 'Reported display',
          selected: selected && index === 0,
          availability: 'unknown',
          estimate: {
            status: 'unavailable',
            siteId: `reference-${index}`,
            faceId: `face-${index}`,
            reason:
              'Research interest only; a confirmed full-flight quote and commercial availability are unavailable.',
          },
        },
      ],
    })),
    budget: summarizeBudget([]),
    distances: [],
    ots: null,
    reach: null,
    assumptions: [],
  };
  facts.researchPrices = summarizeResearchPrices(
    facts.sites.filter((site) => site.faces.some((face) => face.selected)),
    monthly,
    facts.requestedBudget,
  );
  const output = canonicalRecommendationOutput(
    {
      recommendations: facts.sites.map((site) => ({
        siteId: site.siteId,
        faceId: site.faces[0].faceId,
        reasonCode: 'source_monthly_price',
        reason: 'HALLUCINATED MAINLAND GUARANTEE',
      })),
      message: 'HALLUCINATED MAINLAND GUARANTEE',
      questions: ['HALLUCINATED MAINLAND GUARANTEE'],
      questionCodes: ['prioritize_areas'],
    },
    { ...facts, requestedBudget: facts.requestedBudget! },
    locale,
  );
  return {
    mode: 'openai',
    provider: 'openai',
    model: 'gpt-6-luna',
    aiAvailable: true,
    constraints: {
      budget: null,
      currency: null,
      cities: [],
      startDate: null,
      endDate: null,
      evidence: [],
    },
    missing: [],
    requiresConfirmation: true,
    ...output,
    facts,
  };
}

test('recommended portfolio and empty current draft retain separate budgets, periods and coverage states', () => {
  for (const locale of ['en', 'fr'] as const) {
    const reply = canonicalReplyFixture(locale);
    const html = renderToStaticMarkup(<ReplyFacts reply={reply} locale={locale} onSelect={noop} />);
    const draftIndex = html.indexOf('data-testid="current-draft-facts"');
    const portfolio = html.slice(0, draftIndex),
      draft = html.slice(draftIndex);
    assert.ok(portfolio.includes('data-testid="recommended-portfolio-facts"'));
    assert.ok(portfolio.includes('data-testid="recommended-portfolio-spacing"'));
    assert.ok(
      portfolio.includes(
        locale === 'fr'
          ? 'positions publiées · précision inconnue'
          : 'published points · accuracy unknown',
      ),
    );
    assert.ok(portfolio.includes(locale === 'fr' ? '18 500 000' : '18,500,000'));
    assert.ok(portfolio.includes(locale === 'fr' ? '3 500 000' : '3,500,000'));
    assert.ok(portfolio.includes(locale === 'fr' ? '01 nov. 2026' : '01 Nov 2026'));
    assert.ok(portfolio.includes(locale === 'fr' ? 'fin exclusive' : 'end exclusive'));
    assert.ok(
      portfolio.includes(
        locale === 'fr' ? 'Couverture des sous-zones inconnue' : 'Subarea coverage unknown',
      ),
    );
    assert.ok(portfolio.includes('Lagos · Nigeria'));
    assert.ok(portfolio.includes(locale === 'fr' ? 'Support publié' : 'Reported display'));
    assert.ok(
      draft.includes(
        locale === 'fr' ? 'Coût média du brouillon actuel' : 'Current draft media cost',
      ),
    );
    assert.ok(!draft.includes(locale === 'fr' ? '18 500 000' : '18,500,000'));
    assert.ok(!draft.includes('KING OF MARINA 2.0'));
    assert.ok(!draft.includes('recommended-portfolio-spacing'));
    assert.ok(!html.includes('HALLUCINATED'));
    assert.ok(
      html.includes(
        locale === 'fr' ? 'Quelles zones sont obligatoires' : 'Which areas must be covered',
      ),
    );
  }
});

test('accepted recommendation totals do not replace the narrower current draft source subtotal', () => {
  const reply = canonicalReplyFixture('en', 22000000, true);
  const html = renderToStaticMarkup(<ReplyFacts reply={reply} locale="en" onSelect={noop} />);
  const index = html.indexOf('data-testid="current-draft-facts"');
  assert.ok(html.slice(0, index).includes('18,500,000'));
  assert.ok(html.slice(index).includes('4,500,000'));
  assert.ok(!html.slice(index).includes('18,500,000'));
  assert.ok(!html.slice(index).includes('LEKKI GATEWAY'));
});

test('over-budget rejected portfolios show no accepted cards or misleading recommended subtotal', () => {
  for (const locale of ['en', 'fr'] as const) {
    const reply = canonicalReplyFixture(locale, 10000000);
    assert.equal(reply.recommendationSummary!.status, 'budget_exceeded');
    const html = renderToStaticMarkup(<ReplyFacts reply={reply} locale={locale} onSelect={noop} />);
    assert.ok(
      html.includes(
        locale === 'fr'
          ? 'dépasse le budget média comparable'
          : 'exceeds the comparable media budget',
      ),
    );
    assert.ok(!html.includes('KING OF MARINA 2.0'));
    assert.ok(!html.includes(locale === 'fr' ? '18 500 000' : '18,500,000'));
    assert.ok(!html.includes('research-price-baseline'));
  }
});

test('legacy openai replies cannot repeat raw reasons or questions without the new canonical summary', () => {
  const reply = canonicalReplyFixture('en');
  delete reply.recommendationSummary;
  reply.recommendations![0].reason = 'HALLUCINATED MAINLAND GUARANTEE';
  reply.questions = ['HALLUCINATED MAINLAND GUARANTEE'];
  const html = renderToStaticMarkup(<ReplyFacts reply={reply} locale="en" onSelect={noop} />);
  assert.ok(!html.includes('HALLUCINATED'));
  assert.ok(html.includes('KING OF MARINA 2.0'));
});

test('current draft DEMO cost label requires a selected priced contribution, not retrieved inventory', () => {
  const demo = { ...site, isDemo: true };
  const monthly = { startDate: '2026-11-01', endDate: '2026-12-01' };
  const price = estimateFaceCost(demo, demo.faces[0], monthly, 'NGN', {
    status: 'available',
    window: monthly,
  });
  assert.equal(price.status, 'ready');
  for (const locale of ['en', 'fr'] as const) {
    for (const scenario of [
      { selected: false, priced: true, included: false },
      { selected: true, priced: false, included: false },
      { selected: true, priced: true, included: false },
      { selected: true, priced: true, included: true },
    ]) {
      const reply = canonicalReplyFixture(locale, 22000000, false);
      const estimate: FaceCostEstimate = scenario.priced
        ? price
        : {
            status: 'unavailable',
            siteId: demo.id,
            faceId: demo.faces[0].id,
            reason: 'No published rate covers this flight.',
          };
      reply.facts!.sites.push({
        siteId: demo.id,
        name: demo.name,
        city: 'Lagos',
        country: 'Nigeria',
        latitude: demo.latitude,
        longitude: demo.longitude,
        isDemo: true,
        faces: [
          {
            faceId: demo.faces[0].id,
            selected: scenario.selected,
            availability: 'available',
            estimate,
          },
        ],
      });
      reply.facts!.budget = summarizeBudget(scenario.included ? [estimate] : []);
      const html = renderToStaticMarkup(
        <ReplyFacts reply={reply} locale={locale} onSelect={noop} />,
      );
      const draft = html.slice(html.indexOf('data-testid="current-draft-facts"'));
      assert.equal(
        draft.includes(locale === 'fr' ? 'Comprend des coûts DEMO' : 'Includes DEMO costs'),
        scenario.included,
        JSON.stringify(scenario),
      );
    }
  }
});

test('shortlist DEMO cost label stays absent until its ready estimate contributes to the displayed subtotal', () => {
  const demo = { ...site, isDemo: true };
  const price = estimateFaceCost(demo, demo.faces[0], window, 'NGN', availability);
  assert.equal(price.status, 'ready');
  for (const locale of ['en', 'fr'] as const)
    for (const included of [false, true]) {
      const html = renderToStaticMarkup(
        <AgencyPlanner
          contextMayContainBrief={false}
          onBriefContext={noop}
          open
          orgId="synthetic-org"
          locale={locale}
          canPlan
          window={window}
          budget="2000"
          onBudget={noop}
          currency="NGN"
          onCurrency={noop}
          shortlist={[{ site: demo, faceId: demo.faces[0].id }]}
          estimates={[price]}
          summary={summarizeBudget(included ? [price] : [])}
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
      assert.equal(
        html.includes(locale === 'fr' ? 'Comprend des coûts DEMO' : 'Includes DEMO costs'),
        included,
      );
    }
});

const unknownPolicyComponent = () => ({
  value: null,
  range: { lower: 0, upper: 1 },
  confidence: 0,
  provenance: [],
  sources: [],
  reasons: [],
  unknowns: ['exposure_context_unknown'],
});
const policyComponent = (
  value: number,
): import('../../../api/src/planning/planning-scoring').PlanningExposureComponent => ({
  value,
  range: { lower: value, upper: value },
  confidence: 55,
  provenance: ['owner_reported'],
  sources: ['Synthetic policy source'],
  reasons: ['purchased_daypart_coverage'],
  unknowns: [],
});
const unknownExposure = () => ({
  physical: unknownPolicyComponent(),
  delivery: unknownPolicyComponent(),
  usable: unknownPolicyComponent(),
  status: 'unknown' as const,
  method: 'uncalibrated_multiplicative_policy' as const,
});
const provisionalUtility = () => ({
  supported: 0,
  provisional: 0.2,
  overlapMultiplier: 0,
  exposureMultiplier: null,
  overlapRange: { lower: 0, upper: 1 },
});

test('brief-fit display separates supported range from confidence and leaves missing factors unknown in English and French', async () => {
  const assessment: import('../../../api/src/planning/planning-scoring').PlanningFaceAssessment = {
    version: 'brief-fit-v2-provisional:balanced',
    exposure: {
      ...unknownExposure(),
      physical: policyComponent(1),
      delivery: policyComponent(0.24),
      usable: policyComponent(0.24),
      status: 'supported',
    },
    utilityTier: 'supported_exposure',
    planningUtility: {
      supported: 24,
      provisional: 0,
      overlapMultiplier: 0.2,
      exposureMultiplier: 0.24,
      overlapRange: { lower: 0.2, upper: 0.2 },
    },
    siteId: site.id,
    faceId: site.faces[0].id,
    score: 24,
    range: { lower: 24, upper: 94 },
    evidenceCoverage: 30,
    evidenceConfidence: 16.5,
    confidenceLabel: 'low',
    eligible: true,
    provisional: true,
    exclusions: [],
    weights: { geography: 30, audience: 20, visibility: 30, contribution: 10, value: 10 },
    reasons: ['country_match'],
    unknowns: ['audience_segment_unknown'],
    factors: [
      {
        key: 'audience',
        weight: 20,
        score: null,
        range: { lower: 0, upper: 100 },
        coverage: 0,
        confidence: 0,
        provenance: [],
        sources: [],
        reasons: [],
        unknowns: ['audience_segment_unknown'],
      },
    ],
  };
  const en = renderToStaticMarkup(<BriefFitScore assessment={assessment} locale="en" />);
  assert.ok(en.includes('24–94 /100'));
  assert.ok(en.includes('Evidence confidence low'));
  assert.ok(en.includes('Supported contribution'));
  assert.ok(en.includes('Target audience evidence missing'));
  assert.ok(en.includes('Unknown'));
  assert.ok(!en.includes('0–100 /100'));
  assert.ok(en.includes('not measured exposure, OTS or effectiveness'));
  const fr = renderToStaticMarkup(<BriefFitScore assessment={assessment} locale="fr" />);
  assert.ok(fr.includes('Confiance des données faible'));
  assert.ok(fr.includes('Données d’audience cible manquantes'));
  assert.ok(!fr.includes('country_match'));
  assert.ok(!fr.includes('audience_segment_unknown'));
  assert.ok(!fr.includes('Unknown'));
  const missing = renderToStaticMarkup(
    <BriefFitScore
      assessment={{ ...assessment, score: null, range: { lower: 0, upper: 100 } }}
      locale="en"
    />,
  );
  assert.ok(missing.includes('Brief fit <b>Unknown'));
  assert.ok(!missing.includes('0–100 /100'));
});

test('brief-fit source prose stays escaped and priorities expose localized confirmed controls', async () => {
  const score: import('../../../api/src/planning/planning-scoring').PlanningFaceAssessment = {
    version: 'test-policy',
    exposure: unknownExposure(),
    utilityTier: 'provisional_interest',
    planningUtility: provisionalUtility(),
    siteId: site.id,
    faceId: site.faces[0].id,
    score: 10,
    range: { lower: 10, upper: 100 },
    evidenceCoverage: 10,
    evidenceConfidence: 5,
    confidenceLabel: 'low',
    eligible: true,
    provisional: true,
    exclusions: [],
    weights: { geography: 30, audience: 20, visibility: 30, contribution: 10, value: 10 },
    reasons: [],
    unknowns: [],
    factors: [
      {
        key: 'value',
        weight: 10,
        score: 100,
        range: { lower: 100, upper: 100 },
        coverage: 100,
        confidence: 55,
        provenance: ['owner_reported'],
        sources: ['<img src=x onerror=alert(1)>'],
        reasons: ['supported_fit_per_budget_share'],
        unknowns: [],
      },
    ],
  };
  const markup = renderToStaticMarkup(<BriefFitScore assessment={score} locale="fr" />);
  assert.ok(markup.includes('&lt;img'));
  assert.ok(!markup.includes('<img'));
  assert.ok(markup.includes('Déclaré par le propriétaire'));
  const preferences = renderToStaticMarkup(
    <BriefFitPreferences value={{ version: 1 }} locale="fr" onChange={noop} />,
  );
  assert.ok(preferences.includes('Priorités du brief'));
  assert.ok(preferences.includes('Confirmez les priorités avant de noter'));
  assert.ok(preferences.includes('Sens d’approche'));
  assert.ok(preferences.includes('Appliquer les priorités'));
});

test('tiny digital purchased delivery stays distinct from physical visibility and fit in both languages', () => {
  const assessment: import('../../../api/src/planning/planning-scoring').PlanningFaceAssessment = {
    version: 'brief-fit-v2-provisional:balanced',
    siteId: site.id,
    faceId: site.faces[0].id,
    score: 0.4,
    range: { lower: 0.4, upper: 0.75 },
    evidenceCoverage: 70,
    evidenceConfidence: 55,
    confidenceLabel: 'medium',
    eligible: true,
    provisional: true,
    exclusions: [],
    weights: { geography: 30, audience: 20, visibility: 30, contribution: 10, value: 10 },
    factors: [],
    reasons: [],
    unknowns: [],
    exposure: {
      physical: policyComponent(0.75),
      delivery: policyComponent(0.01),
      usable: policyComponent(0.0075),
      status: 'supported',
      method: 'uncalibrated_multiplicative_policy',
    },
    utilityTier: 'supported_exposure',
    planningUtility: {
      supported: 0.4,
      provisional: 0,
      overlapMultiplier: 0.2,
      exposureMultiplier: 0.0075,
      overlapRange: { lower: 0.2, upper: 0.2 },
    },
  };
  const en = renderToStaticMarkup(<BriefFitScore assessment={assessment} locale="en" />);
  assert.ok(en.includes('0.4–0.75 /100'));
  assert.ok(en.includes('Physical visibility index</dt><dd>75 /100'));
  assert.ok(en.includes('Campaign usable-exposure index</dt><dd>0.75 /100'));
  assert.ok(en.includes('Purchased delivery index'));
  assert.ok(en.includes('1 /100'));
  assert.ok(en.includes('Uncalibrated exposure policy'));
  assert.ok(en.includes('no measured OTS or attention'));
  const fr = renderToStaticMarkup(<BriefFitScore assessment={assessment} locale="fr" />);
  assert.ok(fr.includes('Indice d’exposition utile de campagne</dt><dd>0,75 /100'));
  assert.ok(fr.includes('Indice de diffusion achetée'));
  assert.ok(fr.includes('non calibrée'));
  const tiny = renderToStaticMarkup(
    <BriefFitScore
      assessment={{
        ...assessment,
        exposure: { ...assessment.exposure, usable: policyComponent(0.000001) },
      }}
      locale="en"
    />,
  );
  assert.ok(tiny.includes('&lt;0.01 /100'));
});

test('sparse exposure is unknown provisional interest and impossible exposure is excluded without effectiveness claims', () => {
  const assessment: import('../../../api/src/planning/planning-scoring').PlanningFaceAssessment = {
    version: 'brief-fit-v2-provisional:balanced',
    siteId: site.id,
    faceId: site.faces[0].id,
    score: null,
    range: { lower: 0, upper: 50 },
    evidenceCoverage: 0,
    evidenceConfidence: 0,
    confidenceLabel: 'low',
    eligible: true,
    provisional: true,
    exclusions: [],
    weights: { geography: 30, audience: 20, visibility: 30, contribution: 10, value: 10 },
    factors: [],
    reasons: [],
    unknowns: ['provisional_interest_exposure_unknown'],
    exposure: unknownExposure(),
    utilityTier: 'provisional_interest',
    planningUtility: provisionalUtility(),
  };
  const en = renderToStaticMarkup(<BriefFitScore assessment={assessment} locale="en" />);
  assert.ok(en.includes('Brief fit <b>Unknown'));
  assert.ok(en.includes('Physical visibility index</dt><dd>Unknown'));
  assert.ok(en.includes('Campaign usable-exposure index</dt><dd>Unknown'));
  assert.ok(en.includes('Provisional interest only'));
  assert.ok(en.includes('Policy bounds with missing evidence'));
  assert.ok(en.includes('0–100 /100'));
  assert.ok(en.includes('no demonstrated performance improvement'));
  assert.ok(!en.includes('0.2 /100'));
  const fr = renderToStaticMarkup(<BriefFitScore assessment={assessment} locale="fr" />);
  assert.ok(fr.includes('aucune amélioration de performance démontrée'));
  const countryMismatch = renderToStaticMarkup(
    <BriefFitScore
      assessment={{
        ...assessment,
        eligible: false,
        utilityTier: 'ineligible',
        exclusions: ['country_mismatch'],
      }}
      locale="en"
    />,
  );
  assert.ok(countryMismatch.includes('Excluded by confirmed planning constraints'));
  assert.ok(!countryMismatch.includes('Known incompatible exposure'));
  assert.ok(!countryMismatch.includes('exposure incompatibility'));
  assert.ok(countryMismatch.includes('Campaign usable-exposure index</dt><dd>Unknown'));
  const blocked = renderToStaticMarkup(
    <BriefFitScore
      assessment={{
        ...assessment,
        score: 0,
        range: { lower: 0, upper: 0 },
        eligible: false,
        utilityTier: 'ineligible',
        exclusions: ['usable_exposure_impossible'],
        exposure: {
          ...assessment.exposure,
          status: 'unusable',
          physical: policyComponent(0),
          usable: policyComponent(0),
        },
      }}
      locale="en"
    />,
  );
  assert.ok(blocked.includes('Known incompatible exposure'));
  assert.ok(blocked.includes('excluded from automatic plans'));
  assert.ok(blocked.includes('blocks automatic selection'));
});
