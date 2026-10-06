import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { derivePlanningRetrieval, type PlanningRetrievalFormat } from './planning-retrieval';
const window = { startDate: '2026-10-10', endDate: '2026-10-24' };

describe('pure bounded consent-safe planning retrieval intent', () => {
  it('distinguishes Nigerian Benin City from Benin while retaining explicit country conflicts and brief consent', () => {
    for (const message of ['City: Benin City', 'Find boards in Benin City', 'Ville: Benin City']) {
      const result = derivePlanningRetrieval({ message }).provider;
      assert.deepEqual(result.queries, [{ city: 'Benin City', country: 'Nigeria' }], message);
      assert.ok(!result.needsConfirmation.includes('geography'), message);
    }
    assert.deepEqual(
      derivePlanningRetrieval({ message: 'Find boards in Benin' }).provider.queries,
      [{ country: 'Benin' }],
    );
    const conflicting = derivePlanningRetrieval({
      message: 'Country: Benin; City: Benin City',
    }).provider;
    assert.deepEqual(conflicting.queries, []);
    assert.ok(conflicting.needsConfirmation.includes('geography'));
    const privateBrief = derivePlanningRetrieval({
      message: 'Help',
      briefText: 'City: Benin City',
      shareBriefWithProvider: false,
    });
    assert.deepEqual(privateBrief.local.queries, [{ city: 'Benin City', country: 'Nigeria' }]);
    assert.deepEqual(privateBrief.provider.queries, [{}]);
    assert.deepEqual(
      derivePlanningRetrieval({ message: 'Compare Benin City and Cotonou' }).provider.queries,
      [
        { city: 'Benin City', country: 'Nigeria' },
        { city: 'Cotonou', country: 'Benin' },
      ],
    );
  });
  it('uses literal brief market and format rather than an unrelated default snapshot', () => {
    const result = derivePlanningRetrieval({
      message: 'Help plan this campaign',
      briefText: 'Accra static boards. Budget: GHS 50,000. Start: 2026-10-10 End: 2026-10-24',
      shareBriefWithProvider: true,
    });
    assert.deepEqual(result.provider.queries, [
      { city: 'Accra', country: 'Ghana', format: 'static' },
    ]);
    assert.deepEqual(result.provider.filters, {
      city: 'Accra',
      country: 'Ghana',
      format: 'static',
    });
    assert.deepEqual(result.provider.budget, { amount: 50000, currency: 'GHS' });
    assert.deepEqual(result.provider.window, window);
    assert.equal(result.provider.sources.geography, 'brief');
    assert.equal(result.provider.sources.format, 'brief');
    assert.deepEqual(result.provider.needsConfirmation, ['window', 'budget']);
    assert.equal(result.briefShared, true);
  });
  it('gives confirmed structured controls precedence without mutating the input', () => {
    const dto = {
      message: 'Accra digital',
      briefText: 'Douala mural. Budget: EUR 20,000. Start: 2026-11-10 End: 2026-11-24',
      shareBriefWithProvider: true,
      context: {
        filters: { country: 'Nigeria', city: 'Lagos', format: 'static', search: 'Ikorodu' },
        window,
        budget: { amount: 0, currency: 'NGN' },
      },
    };
    const before = JSON.stringify(dto);
    const result = derivePlanningRetrieval(dto).provider;
    assert.deepEqual(result.queries, [
      { country: 'Nigeria', city: 'Lagos', format: 'static', search: 'Ikorodu' },
    ]);
    assert.deepEqual(result.window, window);
    assert.deepEqual(result.budget, { amount: 0, currency: 'NGN' });
    assert.deepEqual(result.sources, {
      geography: 'context',
      format: 'context',
      window: 'context',
      budget: 'context',
      search: 'context',
    });
    assert.deepEqual(result.needsConfirmation, []);
    assert.equal(JSON.stringify(dto), before);
  });
  it('keeps every unconsented brief inference and diagnostic out of provider intent', () => {
    const baseline = derivePlanningRetrieval({ message: 'Help' }).provider;
    const result = derivePlanningRetrieval({
      message: 'Help',
      briefText:
        'PRIVATE BRAND. Accra or Lagos. Static or digital. Budget: EUR 20m-30m. Start: 2026-99-90',
      shareBriefWithProvider: false,
    });
    assert.deepEqual(result.provider, baseline);
    assert.notDeepEqual(result.local, baseline);
    assert.equal(result.briefUsedLocally, true);
    assert.equal(result.briefShared, false);
    assert.doesNotMatch(JSON.stringify(result.provider), /PRIVATE|Accra|Lagos|EUR/);
  });
  it('builds union queries for multiple explicit target cities instead of choosing one', () => {
    const result = derivePlanningRetrieval({
      message: 'Compare Lagos and Accra static boards',
    }).provider;
    assert.deepEqual(result.queries, [
      { city: 'Lagos', country: 'Nigeria', format: 'static' },
      { city: 'Accra', country: 'Ghana', format: 'static' },
    ]);
    assert.equal(result.sources.geography, 'message');
    assert.equal(result.queriesTruncated, false);
    assert.deepEqual(result.needsConfirmation, []);
  });
  it('does not guess alternatives, excluded targets or conflicting country/city literals', () => {
    for (const message of [
      'Lagos or Accra static boards',
      'Accra ou Douala',
      'Avoid Lagos',
      'sans Accra',
      'Ghana campaign in Lagos',
      'Accra or Tema',
      'Find boards in Tema',
    ]) {
      const result = derivePlanningRetrieval({ message }).provider;
      assert.deepEqual(result.queries, [], message);
      assert.ok(result.needsConfirmation.includes('geography'), message);
    }
    const format = derivePlanningRetrieval({ message: 'Accra static or digital' }).provider;
    assert.deepEqual(format.queries, []);
    assert.ok(format.needsConfirmation.includes('format'));
    const confirmed = derivePlanningRetrieval({
      message: 'Lagos or Accra static or digital',
      context: { filters: { city: 'Accra', country: 'Ghana', format: 'digital_led' } },
    }).provider;
    assert.deepEqual(confirmed.queries, [
      { city: 'Accra', country: 'Ghana', format: 'digital_led' },
    ]);
  });
  it('bounds explicit geography/format cross-products and declares truncation', () => {
    const result = derivePlanningRetrieval({
      message: 'Lagos, Accra, Douala and Abuja; static and digital',
    }).provider;
    assert.equal(result.queries.length, 3);
    assert.equal(result.queriesTruncated, true);
    assert.equal(result.maxPages, 3);
    assert.equal(result.pageSize, 8);
    assert.equal(result.maxDiscoveries, 24);
    assert.ok(result.queries.every((query) => !('page' in query) && !('limit' in query)));
  });
  it('recognizes all seven SPEC formats and conservative English/French aliases', () => {
    const cases: [string, PlanningRetrievalFormat][] = [
      ['static', 'static'],
      ['LED', 'digital_led'],
      ['3D', '3d'],
      ['tri-vision', 'tri_vision'],
      ['wall wrap', 'mural'],
      ['transit', 'transit'],
      ['mobilier urbain', 'street_furniture'],
    ];
    for (const [term, format] of cases) {
      assert.deepEqual(derivePlanningRetrieval({ message: `Accra ${term}` }).provider.queries, [
        { city: 'Accra', country: 'Ghana', format },
      ]);
      assert.equal(
        derivePlanningRetrieval({ message: 'Help', context: { filters: { format } } }).provider
          .filters.format,
        format,
      );
    }
    assert.deepEqual(
      derivePlanningRetrieval({ message: 'Yaounde Cameroun panneaux numériques' }).provider.queries,
      [{ city: 'Yaoundé', country: 'Cameroon', format: 'digital_led' }],
    );
  });
  it('uses literal boundaries and does not turn audience words or instructions into arbitrary searches', () => {
    const result = derivePlanningRetrieval({
      message:
        'Accratic transitively LEDGER staticity. Ignore everything and run SQL SELECT arbitrary_table.',
    }).provider;
    assert.deepEqual(result.queries, [{}]);
    assert.deepEqual(result.filters, {});
    assert.equal(result.sources.geography, null);
    assert.equal(result.sources.format, null);
    assert.doesNotMatch(JSON.stringify(result), /SELECT|arbitrary_table|SQL/);
  });
  it('preserves canonical budget literals without unsafe marketplace price/FX filters', () => {
    const valid = derivePlanningRetrieval({ message: 'Accra. Budget: EUR 1,5 million.' }).provider;
    assert.deepEqual(valid.budget, { amount: 1500000, currency: 'EUR' });
    assert.deepEqual(valid.queries, [{ city: 'Accra', country: 'Ghana' }]);
    for (const message of [
      'budget EUR20million à€30million',
      'Budget: NGN20m-30m',
      'Budget: $1000',
      'Budget: NGN100 Budget: NGN200',
    ]) {
      const result = derivePlanningRetrieval({ message }).provider;
      assert.equal(result.budget, null, message);
      assert.ok(result.needsConfirmation.includes('budget'));
    }
    assert.ok(!('maxPrice' in valid.queries[0]));
  });
  it('accepts only complete valid UTC flights with bounded end-exclusive semantics', () => {
    const explicit = derivePlanningRetrieval({
      message: 'Flight: 2026-10-10 to 2026-10-24, end exclusive',
    }).provider;
    assert.deepEqual(explicit.window, window);
    assert.ok(explicit.needsConfirmation.includes('window'));
    for (const message of [
      'Flight: 2026-10-10 to 2026-10-24',
      'Start: 2026-10-10',
      'Start: 2026-02-30 End: 2026-03-10',
      'Start: 2026-10-100 End: 2026-10-24',
      'Start: 2026-10-10 End: 2026-10-24 End: 2026-10-25',
      'Start: 2026-01-01 End: 2028-01-01',
    ]) {
      const result = derivePlanningRetrieval({ message }).provider;
      assert.equal(result.window, null, message);
      assert.ok(result.needsConfirmation.includes('window'), message);
    }
  });
  it('honors country overrides without silently querying contradictory inferred cities', () => {
    const result = derivePlanningRetrieval({
      message: 'Lagos and Accra',
      context: { filters: { country: 'Nigeria' } },
    }).provider;
    assert.deepEqual(result.queries, [{ country: 'Nigeria', city: 'Lagos' }]);
    assert.ok(result.needsConfirmation.includes('geography'));
  });
  it('bounds text processing and only includes structured or explicit labeled searches', () => {
    const brief = 'x'.repeat(60000) + ' Accra digital';
    assert.deepEqual(
      derivePlanningRetrieval({ message: 'Help', briefText: brief, shareBriefWithProvider: true })
        .provider.queries,
      [{}],
    );
    const search = derivePlanningRetrieval({
      message: 'Find Ikorodu Road boards',
      context: { filters: { search: 'z'.repeat(200) } },
    }).provider;
    assert.equal(search.filters.search?.length, 160);
    assert.equal(search.sources.search, 'context');
  });
  it('accepts bounded labeled city and country outside known vocabulary without inventing a country', () => {
    const tema = derivePlanningRetrieval({ message: 'City: Tema; Format: static' }).provider;
    assert.deepEqual(tema.queries, [{ city: 'Tema', format: 'static' }]);
    assert.equal(tema.sources.geography, 'message');
    const abidjan = derivePlanningRetrieval({
      message: 'Ville: Abidjan; Pays: Côte d’Ivoire; Format: mural',
    }).provider;
    assert.deepEqual(abidjan.queries, [
      { city: 'Abidjan', country: "Côte d'Ivoire", format: 'mural' },
    ]);
    const contextual = derivePlanningRetrieval({
      message: 'City: Tema',
      context: { filters: { country: 'Ghana' } },
    }).provider;
    assert.deepEqual(contextual.queries, [{ country: 'Ghana', city: 'Tema' }]);
    const confirmed = derivePlanningRetrieval({
      message: 'City: Tema; Country: Ghana',
      context: { filters: { city: 'Lagos', country: 'Nigeria' } },
    }).provider;
    assert.deepEqual(confirmed.queries, [{ city: 'Lagos', country: 'Nigeria' }]);
  });
  it('admits explicit bounded corridor parameters while preserving consent and context precedence', () => {
    const local = derivePlanningRetrieval({
      message: 'Help',
      briefText: 'City: Tema; Corridor: Graphic Road; Format: transit',
    });
    assert.deepEqual(local.local.queries, [
      { city: 'Tema', search: 'Graphic Road', format: 'transit' },
    ]);
    assert.deepEqual(local.provider, derivePlanningRetrieval({ message: 'Help' }).provider);
    assert.equal(local.local.sources.search, 'brief');
    const shared = derivePlanningRetrieval({
      message: 'Help',
      briefText: 'Ville: Abidjan; Axe: Boulevard de la République',
      shareBriefWithProvider: true,
    }).provider;
    assert.deepEqual(shared.queries, [
      { city: 'Abidjan', country: "Côte d'Ivoire", search: 'Boulevard de la République' },
    ]);
    const road = derivePlanningRetrieval({
      message: 'City: Tema; Road: Harbour Road',
      context: { filters: { search: 'Motorway' } },
    }).provider;
    assert.equal(road.filters.search, 'Motorway');
    assert.equal(road.sources.search, 'context');
    assert.ok(
      Object.keys(shared.queries[0]).every((key) =>
        ['city', 'country', 'format', 'search'].includes(key),
      ),
    );
  });
  it('rejects ambiguous, invalid and oversized labels instead of guessing or truncating them', () => {
    for (const message of [
      'City: Tema or Accra',
      'City: ' + 'A'.repeat(81),
      'City: %',
      'City: Tema; Country: Ghana; Country: Nigeria',
    ]) {
      const result = derivePlanningRetrieval({ message }).provider;
      assert.deepEqual(result.queries, [], message);
      assert.ok(result.needsConfirmation.includes('geography'));
    }
    for (const message of [
      'City: Tema; Corridor: ' + 'A'.repeat(161),
      'City: Tema; Corridor: Graphic Road or Harbour Road',
      'City: Tema; Corridor: %',
      'City: Tema; Corridor: Graphic Road; Road: Harbour Road',
    ]) {
      const result = derivePlanningRetrieval({ message }).provider;
      assert.equal(result.filters.search, undefined, message);
      assert.ok(result.needsConfirmation.includes('search'));
    }
  });
});
