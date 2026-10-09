import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BRIEF_FIT_CONFIG,
  scorePlanningFace,
  selectPlanningPortfolio,
  type PlanningScoringBrief,
  type PlanningScoringCandidate,
  type ScoringEvidence,
  type ScoringProvenance,
} from './planning-scoring';

const window = { startDate: '2026-11-01', endDate: '2026-12-01' };
const evidence = <T>(value: T, provenance: ScoringProvenance = 'verified'): ScoringEvidence<T> => ({
  value,
  provenance,
  source: 'Synthetic test survey; not live inventory.',
});
const brief: PlanningScoringBrief = {
  window,
  budget: { amount: 10_000_000, currency: 'NGN' },
  targetCountry: 'NG',
  targetCity: 'Lagos',
  fitPreferences: { audienceTags: ['commuters'], daypart: 'day', goal: 'balanced' },
};
function candidate(
  id: string,
  cost = 5_000_000,
  patch: Partial<PlanningScoringCandidate> = {},
): PlanningScoringCandidate {
  return {
    siteId: `site-${id}`,
    faceId: id,
    format: 'static',
    physicalEligible: true,
    availability: 'available',
    coordinateStatus: 'verified',
    coordinates: { latitude: 6.45, longitude: 3.4 },
    geography: {
      country: evidence('Nigeria'),
      city: evidence('Lagos'),
      corridor: evidence(`Corridor ${id}`),
    },
    audience: evidence({ commuters: 0.8 }),
    geometry: {
      faceBearingDeg: evidence(180),
      approachHeadingDeg: evidence(0),
      viewingDistanceM: evidence(40),
      legibilityDistanceM: evidence(100),
      unobstructedFraction: evidence(1),
      dwellSeconds: evidence(12),
    },
    cost: {
      amount: cost,
      currency: 'NGN',
      window,
      basis: 'flight',
      provenance: 'owner_reported',
      source: 'Synthetic published price',
    },
    ...patch,
  };
}
const getFactor = (item: PlanningScoringCandidate, key: string, input = brief) =>
  scorePlanningFace(item, input).factors.find((factor) => factor.key === key)!;

test('higher-fit expensive face defeats two cheaper low-fit redundant faces under the same hard cap', () => {
  const strong = candidate('strong', 9_000_000);
  const weak = (id: string) =>
    candidate(id, 4_000_000, {
      audience: evidence({ commuters: 0.05 }),
      geometry: {
        ...candidate(id).geometry,
        faceBearingDeg: evidence(0),
        unobstructedFraction: evidence(0.1),
        dwellSeconds: evidence(1),
      },
      geography: { ...candidate(id).geography, corridor: evidence('Same weak corridor') },
    });
  const result = selectPlanningPortfolio([weak('weak-a'), weak('weak-b'), strong], brief);
  assert.deepEqual(result.selectedFaceIds, ['strong']);
  assert.equal(result.cost!.amount, 9_000_000);
  assert.equal(result.budgetRemaining, 1_000_000);
  assert.equal(result.confirmedBudgetFit, false);
});
test('outward face normal meets reverse travel heading, with no roadside penalty', () => {
  const northbound = candidate('north');
  const southbound = candidate('south', 5_000_000, {
    geometry: { ...northbound.geometry, approachHeadingDeg: evidence(180) },
  });
  assert.equal(getFactor(northbound, 'visibility').score, 100);
  assert.equal(getFactor(southbound, 'visibility').score, 0);
  assert.equal(scorePlanningFace(southbound, brief).eligible, false);
  // Moving across the road while retaining surveyed orientation/distance is not penalized.
  const across = candidate('across', 5_000_000, {
    coordinates: { latitude: 6.4503, longitude: 3.4 },
  });
  assert.deepEqual(getFactor(across, 'visibility'), getFactor(northbound, 'visibility'));
});
test('opposite advertising faces on one structure need face-specific bearings', () => {
  const southFacing = candidate('face-south');
  const northFacing = candidate('face-north', 5_000_000, {
    siteId: southFacing.siteId,
    geometry: { ...southFacing.geometry, faceBearingDeg: evidence(0) },
  });
  const unknownFacing = candidate('face-unknown', 5_000_000, {
    siteId: southFacing.siteId,
    geometry: { ...southFacing.geometry, faceBearingDeg: undefined },
  });
  assert.ok(
    getFactor(southFacing, 'visibility').range.lower >
      getFactor(northFacing, 'visibility').range.lower,
  );
  assert.ok(
    getFactor(unknownFacing, 'visibility').unknowns.includes('directional_geometry_unverified'),
  );
  assert.equal(getFactor(unknownFacing, 'visibility').coverage, 0);
  assert.equal(scorePlanningFace(unknownFacing, brief).score, null);
});
test('confirmed approach preference changes directional fit without inventing source direction', () => {
  const north = {
    ...brief,
    fitPreferences: { ...brief.fitPreferences, approachDirection: 'N' as const },
  };
  const south = {
    ...brief,
    fitPreferences: { ...brief.fitPreferences, approachDirection: 'S' as const },
  };
  assert.ok(
    getFactor(candidate('a'), 'visibility', north).score! >
      getFactor(candidate('a'), 'visibility', south).score!,
  );
  const absent = candidate('none', 5_000_000, {
    geometry: { ...candidate('none').geometry, approachHeadingDeg: undefined },
  });
  assert.ok(
    getFactor(absent, 'visibility', north).unknowns.includes('directional_geometry_unverified'),
  );
});
test('missing traffic remains provisionally eligible, never supplies audience or reach', () => {
  const sparse = candidate('sparse', 5_000_000, {
    audience: undefined,
    traffic: undefined,
    availability: 'unknown',
  });
  const assessment = scorePlanningFace(sparse, brief);
  const result = selectPlanningPortfolio([sparse], brief);
  assert.equal(assessment.eligible, true);
  assert.equal(result.status, 'ready');
  assert.ok(assessment.unknowns.includes('traffic_unavailable'));
  assert.equal(getFactor(sparse, 'audience').score, null);
  assert.ok(result.diagnostics.includes('availability_verification_required'));
  assert.ok(!('reach' in result));
  assert.ok(!('cpm' in result));
  assert.ok(!('impressions' in result));
});
test('source city and price alone yield wide uncertainty and low evidence confidence', () => {
  const sparse = candidate('sparse', 4_000_000, {
    coordinateStatus: 'owner_reported',
    geometry: undefined,
    audience: undefined,
    geography: {
      country: evidence('Nigeria', 'owner_reported'),
      city: evidence('Lagos', 'owner_reported'),
    },
  });
  const result = scorePlanningFace(sparse, brief);
  assert.ok(result.range.lower < 50);
  assert.ok(result.range.upper - result.range.lower >= 49.99);
  assert.equal(result.confidenceLabel, 'low');
  assert.equal(getFactor(sparse, 'visibility').score, null);
  assert.equal(getFactor(sparse, 'visibility').coverage, 0);
});
test('unknown fields keep null factors rather than fabricated zero observations or averages', () => {
  const unknown = candidate('unknown', 5_000_000, {
    geography: undefined,
    geometry: undefined,
    audience: undefined,
    cost: undefined,
  });
  const result = scorePlanningFace(unknown, brief);
  assert.equal(result.score, null);
  assert.deepEqual(result.range, { lower: 0, upper: 100 });
  assert.ok(result.factors.every((factor) => factor.score === null));
  assert.equal(result.evidenceConfidence, 0);
});
test('research and unverified pins cannot establish exact angular or radius geometry', () => {
  const research = candidate('research', 5_000_000, { coordinateStatus: 'owner_reported' });
  const input = { ...brief, targetRadius: { latitude: 6.45, longitude: 3.4, radiusKm: 1 } };
  const result = scorePlanningFace(research, input);
  assert.equal(result.eligible, true);
  assert.ok(result.unknowns.includes('radius_geometry_unverified'));
  assert.ok(result.unknowns.includes('directional_geometry_unverified'));
  const verified = candidate('verified', 5_000_000, { coordinates: { latitude: 7, longitude: 4 } });
  assert.ok(scorePlanningFace(verified, input).exclusions.includes('radius_mismatch'));
});
test('speed/path-derived dwell retains modeled provenance instead of observed verified status', () => {
  const item = candidate('modeled', 5_000_000, {
    geometry: {
      ...candidate('modeled').geometry,
      dwellSeconds: undefined,
      speedKph: evidence(36),
      viewablePathM: evidence(100),
    },
  });
  const visibility = getFactor(item, 'visibility');
  assert.ok(visibility.provenance.includes('modeled'));
  assert.ok(visibility.sources.some((source) => source.includes('Modeled dwell =')));
  assert.ok(visibility.confidence < 100);
});
test('digital spot loop schedule daypart and dwell affect policy index; share-of-time alone is insufficient', () => {
  const digital = candidate('digital', 5_000_000, {
    format: 'digital_led',
    digital: {
      spotLengthSeconds: evidence(10),
      loopLengthSeconds: evidence(60),
      advertiserSpotsPerLoop: evidence(1),
      scheduleDaypartCoverage: evidence({ day: 1, night: 0 }),
      scheduleWindow: window,
    },
  });
  const slower = { ...digital, digital: { ...digital.digital, loopLengthSeconds: evidence(120) } };
  const moreSpots = {
    ...digital,
    digital: { ...digital.digital, advertiserSpotsPerLoop: evidence(3) },
  };
  assert.ok(getFactor(digital, 'visibility').score! > getFactor(slower, 'visibility').score!);
  assert.ok(getFactor(moreSpots, 'visibility').score! > getFactor(digital, 'visibility').score!);
  const night = {
    ...brief,
    fitPreferences: { ...brief.fitPreferences, daypart: 'night' as const },
  };
  assert.ok(
    getFactor(digital, 'visibility', night).score! < getFactor(digital, 'visibility').score!,
  );
  for (const incomplete of [
    { ...digital, digital: { ...digital.digital, scheduleDaypartCoverage: undefined } },
    { ...digital, geometry: { ...digital.geometry, dwellSeconds: undefined } },
    { ...digital, digital: { ...digital.digital, spotLengthSeconds: evidence(90) } },
  ]) {
    const factor = getFactor(incomplete, 'visibility');
    assert.ok(factor.unknowns.includes('exposure_context_unknown'));
    assert.equal(factor.score, null);
    assert.equal(factor.range.lower, 0);
    assert.ok(factor.range.upper > 0 && factor.range.upper <= 100);
  }
  const noWindow = { ...digital, digital: { ...digital.digital, scheduleWindow: undefined } };
  assert.equal(getFactor(noWindow, 'visibility').score, null);
  const unserved = {
    ...digital,
    geometry: undefined,
    digital: { scheduleDaypartCoverage: evidence({ day: 1, night: 0 }), scheduleWindow: window },
  };
  assert.equal(getFactor(unserved, 'visibility', night).score, 0);
  assert.ok(scorePlanningFace(unserved, night).exclusions.includes('daypart_unserved'));
  assert.equal(selectPlanningPortfolio([unserved], night).status, 'infeasible');
});
test('known night illumination without operating hours remains schedule-unknown', () => {
  const item = candidate('lit', 5_000_000, {
    geometry: { ...candidate('lit').geometry, nightLighting: evidence(true) },
  });
  const night = {
    ...brief,
    fitPreferences: { ...brief.fitPreferences, daypart: 'night' as const },
  };
  assert.ok(getFactor(item, 'visibility', night).unknowns.includes('lighting_schedule_unknown'));
  const hours = {
    ...item,
    geometry: { ...item.geometry, daypartCoverage: evidence({ day: 1, night: 1 }) },
  };
  assert.ok(!getFactor(hours, 'visibility', night).unknowns.includes('lighting_schedule_unknown'));
});
test('unlit night evidence does not imply no daylight utility', () => {
  const item = candidate('unlit', 5_000_000, {
    geometry: { ...candidate('unlit').geometry, nightLighting: evidence(false) },
  });
  const any = { ...brief, fitPreferences: { ...brief.fitPreferences, daypart: 'any' as const } };
  const night = {
    ...brief,
    fitPreferences: { ...brief.fitPreferences, daypart: 'night' as const },
  };
  assert.ok(getFactor(item, 'visibility', any).unknowns.includes('lighting_schedule_unknown'));
  assert.ok(getFactor(item, 'visibility', night).reasons.includes('daypart_unserved'));
  assert.equal(getFactor(item, 'visibility').score, 100);
  const scheduled = {
    ...item,
    geometry: { ...item.geometry, daypartCoverage: evidence({ day: 1, night: 1 }) },
  };
  const actual = getFactor(scheduled, 'visibility', any);
  assert.ok(actual.score! < 100);
  assert.ok(scorePlanningFace(item, night).exclusions.includes('daypart_unserved'));
  const lit = candidate('lit', 5_000_000, {
    geometry: {
      ...item.geometry,
      nightLighting: evidence(true),
      daypartCoverage: evidence({ day: 1, night: 1 }),
    },
  });
  assert.deepEqual(selectPlanningPortfolio([item, lit], night).selectedFaceIds, ['lit']);
  assert.equal(
    getFactor(scheduled, 'visibility', night).reasons.includes('daypart_unserved'),
    true,
  );
});
test('known negative factors expose mismatch reasons rather than misleading positive prose', () => {
  const item = candidate('wrong', 5_000_000, {
    geography: {
      country: evidence('Ghana'),
      city: evidence('Accra'),
      areas: evidence(['Osu']),
      corridor: evidence('Wrong Road'),
    },
    audience: evidence({ commuters: 0 }),
  });
  const input = {
    ...brief,
    fitPreferences: {
      ...brief.fitPreferences,
      targetAreas: ['Ikoyi'],
      targetCorridors: ['Lagos Road'],
    },
  };
  const assessment = scorePlanningFace(item, input);
  for (const code of [
    'country_mismatch',
    'city_mismatch',
    'target_area_mismatch',
    'target_corridor_mismatch',
    'audience_segment_mismatch',
  ])
    assert.ok(assessment.reasons.includes(code));
  assert.ok(!assessment.reasons.includes('country_match'));
});
test('sourced same-corridor redundancy favors distinct corridor without claiming reach', () => {
  const first = candidate('a', 4_000_000);
  const duplicate = candidate('b', 4_000_000, {
    geography: { ...candidate('b').geography, corridor: first.geography!.corridor },
  });
  const distinct = candidate('c', 4_000_000);
  const result = selectPlanningPortfolio([first, duplicate, distinct], brief);
  assert.deepEqual(result.selectedFaceIds, ['a', 'c']);
  const overlap = scorePlanningFace(duplicate, brief, DEFAULT_BRIEF_FIT_CONFIG, [
    first,
  ]).factors.find((item) => item.key === 'contribution')!;
  assert.equal(overlap.score, 20);
  assert.ok(overlap.reasons.includes('overlapping_geographic_proxy'));
  assert.ok(result.assumptions.some((item) => item.includes('not deduplicated reach')));
});
test('mixed source granularities compare common city instead of fabricated new corridor coverage', () => {
  const corridor = candidate('corridor');
  const city = candidate('city', 5_000_000, {
    geography: { country: evidence('Nigeria'), city: evidence('Lagos') },
  });
  const result = scorePlanningFace(corridor, brief, DEFAULT_BRIEF_FIT_CONFIG, [city]);
  assert.equal(result.factors.find((item) => item.key === 'contribution')!.score, 20);
  const unidentified = { ...city, geography: undefined };
  assert.equal(
    scorePlanningFace(corridor, brief, DEFAULT_BRIEF_FIT_CONFIG, [unidentified]).factors.find(
      (item) => item.key === 'contribution',
    )!.score,
    null,
  );
});
test('a city label cannot establish undocumented neighborhood mismatch', () => {
  const city = candidate('city', 5_000_000, {
    geography: { country: evidence('Nigeria'), city: evidence('Lagos') },
  });
  const input = { ...brief, fitPreferences: { ...brief.fitPreferences, targetAreas: ['Ikoyi'] } };
  assert.ok(getFactor(city, 'geography', input).unknowns.includes('target_area_unknown'));
  const sourced = { ...city, geography: { ...city.geography, areas: evidence(['Ikoyi']) } };
  assert.ok(
    getFactor(sourced, 'geography', input).score! > getFactor(city, 'geography', input).score!,
  );
});
test('same short corridor names in distinct sourced cities are not treated as the same corridor', () => {
  const lagos = candidate('lagos', 5_000_000, {
    geography: {
      country: evidence('Nigeria'),
      city: evidence('Lagos'),
      corridor: evidence('Ring Road'),
    },
  });
  const accra = candidate('accra', 5_000_000, {
    geography: {
      country: evidence('Ghana'),
      city: evidence('Accra'),
      corridor: evidence('Ring Road'),
    },
  });
  const wide = { ...brief, targetCountry: undefined, targetCity: undefined };
  assert.equal(
    scorePlanningFace(accra, wide, DEFAULT_BRIEF_FIT_CONFIG, [lagos]).factors.find(
      (item) => item.key === 'contribution',
    )!.score,
    100,
  );
  const unknown = { ...lagos, geography: { corridor: evidence('Ring Road') } };
  assert.equal(
    scorePlanningFace(unknown, wide).factors.find((item) => item.key === 'contribution')!.score,
    null,
  );
});
test('hard availability physical format country city budget currency and flight constraints hold', () => {
  const valid = candidate('valid', 6_000_000);
  const invalid = [
    candidate('unavailable', 1, { availability: 'unavailable' }),
    candidate('physical', 1, { physicalEligible: false }),
    candidate('format', 1, { format: 'mural' }),
    candidate('country', 1, { geography: { country: evidence('Ghana'), city: evidence('Accra') } }),
    candidate('expensive', 11_000_000),
    candidate('fx', 1, { cost: { ...valid.cost!, currency: 'USD' } }),
    candidate('window', 1, {
      cost: { ...valid.cost!, window: { startDate: '2026-11-02', endDate: '2026-12-01' } },
    }),
  ];
  const result = selectPlanningPortfolio([...invalid, valid], { ...brief, formats: ['static'] });
  assert.deepEqual(result.selectedFaceIds, ['valid']);
  assert.ok(result.cost!.amount <= brief.budget!.amount);
  assert.equal(
    selectPlanningPortfolio([valid], {
      ...brief,
      window: { startDate: '2026-02-30', endDate: '2026-03-03' },
    }).status,
    'insufficient_evidence',
  );
});
test('source-qualified monthly price works only for complete calendar month, never prorated', () => {
  const research = candidate('research', 4_000_000, {
    availability: 'unknown',
    cost: { ...candidate('research').cost!, amount: 4_000_000, basis: 'research_month' },
  });
  const result = selectPlanningPortfolio([research], brief);
  assert.equal(result.status, 'ready');
  assert.equal(result.cost!.basis, 'research_month');
  assert.equal(result.confirmedBudgetFit, false);
  const partial = { startDate: '2026-11-02', endDate: '2026-12-01' };
  const item = { ...research, cost: { ...research.cost!, window: partial } };
  const rejected = selectPlanningPortfolio([item], { ...brief, window: partial });
  assert.equal(rejected.status, 'insufficient_evidence');
  assert.equal(rejected.cost, null);
});
test('ordinary flight and research monthly baselines are never combined into a priced portfolio', () => {
  const ordinary = candidate('ordinary', 4_000_000);
  const research = candidate('research', 4_000_000, {
    cost: { ...ordinary.cost!, basis: 'research_month' },
  });
  const result = selectPlanningPortfolio([ordinary, research], brief);
  assert.equal(result.selectedFaceIds.length, 1);
});
test('locked selected prices consume budget and unknown FX or over-cap locks fail coherently', () => {
  const first = candidate('a', 7_000_000);
  const next = candidate('b', 4_000_000);
  const result = selectPlanningPortfolio([first, next], { ...brief, lockedFaceIds: ['a'] });
  assert.deepEqual(result.selectedFaceIds, ['a']);
  assert.equal(result.budgetRemaining, 3_000_000);
  assert.equal(
    selectPlanningPortfolio([first, next], { ...brief, lockedFaceIds: ['a', 'b'] }).status,
    'infeasible',
  );
  assert.equal(
    selectPlanningPortfolio([first, { ...next, cost: undefined }], {
      ...brief,
      lockedFaceIds: ['b'],
    }).status,
    'insufficient_evidence',
  );
  assert.equal(
    selectPlanningPortfolio([{ ...next, cost: { ...next.cost!, currency: 'USD' } }], {
      ...brief,
      lockedFaceIds: ['b'],
    }).status,
    'insufficient_evidence',
  );
});
test('stable ID ties and bounded search reproduce the same portfolio independent of input order', () => {
  const items = Array.from({ length: 50 }, (_, index) =>
    candidate(String(index).padStart(2, '0'), 1_000_000),
  );
  const first = selectPlanningPortfolio(items, brief);
  const second = selectPlanningPortfolio(items.slice().reverse(), brief);
  assert.deepEqual(first, second);
  assert.equal(first.searchPoolCount, 36);
  assert.equal(first.truncated, true);
  assert.equal(first.selectedFaceIds.length, 10);
  assert.ok(first.cost!.amount <= brief.budget!.amount);
});
test('policy weights are explicit versioned presets and invalid configuration cannot create NaN', () => {
  const item = candidate('a');
  const coverage = scorePlanningFace(item, {
    ...brief,
    fitPreferences: { ...brief.fitPreferences, goal: 'coverage' },
  });
  assert.equal(coverage.weights.geography, 40);
  assert.match(coverage.version, /:coverage$/);
  assert.throws(() =>
    scorePlanningFace(item, brief, {
      ...DEFAULT_BRIEF_FIT_CONFIG,
      weights: { ...DEFAULT_BRIEF_FIT_CONFIG.weights, value: -1 },
    }),
  );
  const zeroCore = scorePlanningFace(item, brief, {
    ...DEFAULT_BRIEF_FIT_CONFIG,
    weights: { geography: 0, audience: 0, visibility: 0, contribution: 50, value: 50 },
  });
  assert.ok(Number.isFinite(zeroCore.range.lower));
  assert.equal(zeroCore.factors.find((factor) => factor.key === 'value')!.score, null);
});
test('derived value confidence is bounded by underlying supported evidence, not price alone', () => {
  const item = candidate('owner', 5_000_000, {
    geography: {
      country: evidence('Nigeria', 'owner_reported'),
      city: evidence('Lagos', 'owner_reported'),
    },
    geometry: undefined,
    audience: undefined,
    cost: { ...candidate('owner').cost!, provenance: 'verified' },
  });
  assert.equal(getFactor(item, 'value').confidence, 55);
});

test('full portfolio excludes two richly evidenced wrong-facing bargains instead of offsetting with fit and price', () => {
  const proper = candidate('proper', 9_000_000);
  const wrong = (id: string) =>
    candidate(id, 4_000_000, { geometry: { ...proper.geometry, faceBearingDeg: evidence(0) } });
  const result = selectPlanningPortfolio([wrong('cheap-a'), wrong('cheap-b'), proper], brief);
  assert.deepEqual(result.selectedFaceIds, ['proper']);
  assert.equal(result.cost!.amount, 9_000_000);
  for (const bad of result.assessments.filter((item) => item.faceId !== 'proper')) {
    assert.equal(bad.exposure.physical.value, 0);
    assert.equal(bad.exposure.usable.value, 0);
    assert.equal(bad.planningUtility.supported, 0);
    assert.equal(bad.eligible, false);
    assert.ok(bad.exclusions.includes('directional_approach_mismatch'));
  }
});
test('one-second advertiser allocation in an hour-long loop attenuates the whole portfolio utility', () => {
  const proper = candidate('proper', 9_000_000);
  const scarce = (id: string) =>
    candidate(id, 4_000_000, {
      format: 'digital_led',
      digital: {
        spotLengthSeconds: evidence(1),
        loopLengthSeconds: evidence(3600),
        advertiserSpotsPerLoop: evidence(1),
        scheduleDaypartCoverage: evidence({ day: 1, night: 1 }),
        scheduleWindow: window,
      },
    });
  const result = selectPlanningPortfolio([scarce('digital-a'), scarce('digital-b'), proper], brief);
  assert.deepEqual(result.selectedFaceIds, ['proper']);
  for (const item of result.assessments.filter((item) => item.faceId !== 'proper')) {
    assert.equal(item.exposure.physical.value, 1);
    assert.ok(item.exposure.delivery.value! < 0.001);
    assert.ok(item.planningUtility.supported < 0.1);
    assert.ok(item.score! < 0.1);
  }
});
test('tiny positive purchased daypart coverage scales the entire score and cannot beat normal delivery', () => {
  const proper = candidate('proper', 9_000_000);
  const tiny = (id: string) =>
    candidate(id, 4_000_000, {
      format: 'digital_led',
      digital: {
        spotLengthSeconds: evidence(10),
        loopLengthSeconds: evidence(60),
        advertiserSpotsPerLoop: evidence(1),
        scheduleDaypartCoverage: evidence({ day: 0.000001, night: 1 }),
        scheduleWindow: window,
      },
    });
  const ordinary = {
    ...tiny('ordinary'),
    digital: {
      ...tiny('ordinary').digital,
      scheduleDaypartCoverage: evidence({ day: 1, night: 1 }),
    },
  };
  const reduced = scorePlanningFace(tiny('tiny'), brief);
  assert.ok(
    reduced.planningUtility.supported <
      scorePlanningFace(ordinary, brief).planningUtility.supported * 0.000002,
  );
  assert.deepEqual(
    selectPlanningPortfolio([tiny('tiny-a'), tiny('tiny-b'), proper], brief).selectedFaceIds,
    ['proper'],
  );
});
test('removing sourced city does not award unknown overlap a full novelty multiplier', () => {
  const selected = candidate('first');
  const duplicate = candidate('duplicate', 4_000_000, { geography: { ...selected.geography } });
  const unknown = { ...duplicate, geography: { ...duplicate.geography, city: undefined } };
  const knownAssessment = scorePlanningFace(duplicate, brief, DEFAULT_BRIEF_FIT_CONFIG, [selected]);
  const unknownAssessment = scorePlanningFace(unknown, brief, DEFAULT_BRIEF_FIT_CONFIG, [selected]);
  assert.equal(knownAssessment.planningUtility.overlapMultiplier, 0.2);
  assert.equal(unknownAssessment.planningUtility.overlapMultiplier, 0.2);
  assert.deepEqual(unknownAssessment.planningUtility.overlapRange, { lower: 0.2, upper: 1 });
  assert.ok(
    unknownAssessment.planningUtility.supported <= knownAssessment.planningUtility.supported,
  );
});
test('required physical conditions remain noncompensatory even when another condition is missing', () => {
  for (const geometry of [
    { ...candidate('a').geometry, faceBearingDeg: evidence(0), dwellSeconds: undefined },
    { ...candidate('a').geometry, faceBearingDeg: evidence(90), dwellSeconds: undefined },
    { ...candidate('a').geometry, unobstructedFraction: evidence(0), faceBearingDeg: undefined },
    { ...candidate('a').geometry, dwellSeconds: evidence(0), faceBearingDeg: undefined },
    { ...candidate('a').geometry, legibilityDistanceM: evidence(0), dwellSeconds: undefined },
    {
      ...candidate('a').geometry,
      dwellSeconds: undefined,
      viewablePathM: evidence(0),
      speedKph: evidence(40),
    },
  ]) {
    const item = scorePlanningFace(candidate('zero', 4_000_000, { geometry }), brief);
    assert.equal(item.exposure.usable.value, 0);
    assert.equal(item.eligible, false);
    assert.equal(item.planningUtility.supported, 0);
    assert.equal(item.planningUtility.provisional, 0);
  }
});
test('unknown exposure is a separate interest tier and cannot displace a supported eligible face', () => {
  const proper = candidate('proper', 9_000_000);
  const unknown = (id: string) =>
    candidate(id, 4_000_000, { geometry: undefined, coordinateStatus: 'owner_reported' });
  const result = selectPlanningPortfolio(
    [unknown('unknown-a'), unknown('unknown-b'), proper],
    brief,
  );
  assert.deepEqual(result.selectedFaceIds, ['proper']);
  const fallback = selectPlanningPortfolio([unknown('unknown-a'), unknown('unknown-b')], brief);
  assert.equal(fallback.status, 'ready');
  assert.equal(fallback.objective, 0);
  assert.ok(fallback.provisionalObjective > 0);
  assert.ok(fallback.diagnostics.includes('provisional_interest_exposure_unknown'));
  for (const item of fallback.selectedAssessments) {
    assert.equal(item.score, null);
    assert.equal(item.utilityTier, 'provisional_interest');
    assert.equal(item.exposure.usable.value, null);
    assert.equal(item.planningUtility.exposureMultiplier, null);
    assert.equal(item.planningUtility.supported, 0);
  }
});
test('sourced zero advertiser allocation is unusable even with absent geometry, dwell and loop', () => {
  const zero = candidate('zero', 4_000_000, {
    format: 'digital_led',
    geometry: undefined,
    digital: { advertiserSpotsPerLoop: evidence(0), scheduleWindow: window },
  });
  const assessment = scorePlanningFace(zero, brief);
  assert.equal(assessment.exposure.delivery.value, 0);
  assert.equal(assessment.exposure.usable.value, 0);
  assert.equal(assessment.eligible, false);
  assert.ok(assessment.exclusions.includes('advertiser_allocation_unserved'));
  assert.deepEqual(
    selectPlanningPortfolio([zero, candidate('proper', 9_000_000)], brief).selectedFaceIds,
    ['proper'],
  );
  const otherFlight = {
    ...zero,
    digital: {
      ...zero.digital,
      scheduleWindow: { startDate: '2026-12-01', endDate: '2027-01-01' },
    },
  };
  assert.equal(scorePlanningFace(otherFlight, brief).exposure.delivery.value, null);
});
test('sourced static daypart coverage overrides the default daylight placement policy and attenuates utility', () => {
  const full = candidate('full', 9_000_000);
  const zero = candidate('zero', 4_000_000, {
    geometry: { ...full.geometry, daypartCoverage: evidence({ day: 0, night: 1 }) },
  });
  const partial = candidate('partial', 4_000_000, {
    geometry: { ...full.geometry, daypartCoverage: evidence({ day: 0.000001, night: 1 }) },
  });
  assert.equal(scorePlanningFace(zero, brief).eligible, false);
  assert.equal(scorePlanningFace(zero, brief).exposure.usable.value, 0);
  assert.ok(scorePlanningFace(partial, brief).planningUtility.supported < 0.001);
  assert.deepEqual(selectPlanningPortfolio([zero, partial, full], brief).selectedFaceIds, ['full']);
});
test('sourced zero static night coverage is decisive without lighting dwell or physical geometry', () => {
  const item = candidate('night-zero', 4_000_000, {
    geometry: { daypartCoverage: evidence({ day: 1, night: 0 }) },
  });
  const night = {
    ...brief,
    fitPreferences: { ...brief.fitPreferences, daypart: 'night' as const },
  };
  const assessment = scorePlanningFace(item, night);
  assert.equal(assessment.exposure.physical.value, null);
  assert.equal(assessment.exposure.delivery.value, 0);
  assert.equal(assessment.exposure.usable.value, 0);
  assert.equal(assessment.eligible, false);
  assert.ok(assessment.exclusions.includes('daypart_unserved'));
  assert.equal(assessment.planningUtility.provisional, 0);
  assert.equal(selectPlanningPortfolio([item], night).status, 'infeasible');
});
test('sourced zero static coverage across both dayparts is decisive without other exposure evidence', () => {
  const item = candidate('all-day-zero', 4_000_000, {
    geometry: { daypartCoverage: evidence({ day: 0, night: 0 }) },
  });
  const any = { ...brief, fitPreferences: { ...brief.fitPreferences, daypart: 'any' as const } };
  const assessment = scorePlanningFace(item, any);
  assert.equal(assessment.exposure.delivery.value, 0);
  assert.equal(assessment.exposure.usable.value, 0);
  assert.equal(assessment.eligible, false);
  assert.ok(assessment.exclusions.includes('daypart_unserved'));
  assert.equal(assessment.planningUtility.supported, 0);
  assert.equal(assessment.planningUtility.provisional, 0);
  assert.equal(selectPlanningPortfolio([item], any).status, 'infeasible');
  // One served daypart plus unknown lighting remains unknown, never a zero
  // invented from the absent lighting evidence.
  const partlyServed = { ...item, geometry: { daypartCoverage: evidence({ day: 1, night: 0 }) } };
  assert.equal(scorePlanningFace(partlyServed, any).exposure.delivery.value, null);
  assert.equal(scorePlanningFace(partlyServed, any).eligible, true);
});
