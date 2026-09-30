import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { ContextProvenance } from '@abonten/contracts/enrichment';
import { CONTEXT_RADII, catchmentReadBounds, populationMetric, unavailable } from './context-math';

const source: ContextProvenance = {
  importId: 'test',
  sourceKey: 'worldpop',
  version: '2026',
  referenceYear: 2026,
  publishedAt: null,
  fetchedAt: '2026-01-01T00:00:00Z',
  licence: 'CC BY 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'WorldPop',
  sourceUrl: 'https://data.worldpop.org/',
  checksum: '0'.repeat(64),
  quality: 'modelled',
  warnings: [],
};
describe('geographic context math', () => {
  it('keeps missing data null, but preserves a genuinely observed zero', () => {
    assert.equal(unavailable('none').value, null);
    const empty = populationMetric(
      { people: null, validArea: 0, rasterArea: 100, catchmentArea: 100 },
      source,
    );
    assert.equal(empty.status, 'unavailable');
    assert.equal(empty.value?.people, null);
    const zero = populationMetric(
      { people: 0, validArea: 100, rasterArea: 100, catchmentArea: 100 },
      source,
    );
    assert.equal(zero.status, 'available');
    assert.equal(zero.value?.people, 0);
  });
  it('does not extrapolate partial population coverage', () => {
    const partial = populationMetric(
      { people: 17.5, validArea: 25, rasterArea: 75, catchmentArea: 100 },
      source,
    );
    assert.equal(partial.status, 'partial');
    assert.deepEqual(partial.value, {
      people: 17.5,
      validCoverageFraction: 0.25,
      rasterCoverageFraction: 0.75,
      unit: 'people',
    });
    assert.equal(partial.provenance?.quality, 'modelled');
  });
  it('clamps floating-point coverage overshoot', () => {
    const result = populationMetric(
      { people: 10, validArea: 100.000001, rasterArea: 100.000001, catchmentArea: 100 },
      source,
    );
    assert.equal(result.value?.validCoverageFraction, 1);
  });
  it('labels even a small real NoData gap as partial', () => {
    const result = populationMetric({ people: 10, validArea: 99.9, rasterArea: 100, catchmentArea: 100 }, source);
    assert.equal(result.status, 'partial');
  });
  it('supports fixed radii and conservative longitude windows on both hemispheres', () => {
    assert.deepEqual(CONTEXT_RADII, [250, 500, 1000]);
    for (const lat of [6, -6, 60, -60]) {
      const box = catchmentReadBounds(lat, -0.2);
      assert.ok(box[0] < -0.2 && box[2] > -0.2 && box[1] < lat && box[3] > lat);
    }
  });
});
