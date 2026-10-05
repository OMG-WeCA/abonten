import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectPlanningEnrichment } from './agency-enrichment';

const now = Date.parse('2026-10-05T12:00:00Z');
const record = { id: 'visibility-1', siteId: 'site-1', dimension: 'visibility',
  payload: { score: 90 }, dataClass: 'production', verification: 'field_verified',
  source: 'Synthetic QA survey', method: 'Synthetic QA sightline assessment',
  collectedAt: '2026-10-01', expiresAt: '2026-11-01' };
test('popup evidence shares model classification and freshness without inventing angle', () => {
  for (const patch of [{ dataClass: 'demo' }, { verification: 'unverified' },
    { expiresAt: '2026-10-04' }, { collectedAt: '2026-10-06' }, { source: null }]) {
    const metric = projectPlanningEnrichment({ id: 'site-1', metadata: [{ ...record, ...patch }] }, null, now).visibility;
    assert.equal(metric.status, 'unavailable');
    assert.equal(metric.value, null);
    assert.ok(metric.reason);
  }
  for (const patch of [{ verification: 'partner_declared' }, { expiresAt: null }]) {
    const metric = projectPlanningEnrichment({ id: 'site-1', metadata: [{ ...record, ...patch }] }, null, now).visibility;
    assert.equal(metric.status, 'partial');
    assert.equal(metric.value, 90);
    assert.ok(metric.warnings.length);
  }
  const projection = projectPlanningEnrichment({ id: 'site-1', elevation: 12, metadata: [record,
    { ...record, id: 'legacy-angle', dimension: 'structure', payload: { viewingAngle: 45 } }] }, null, now);
  assert.equal(projection.visibility.status, 'available');
  assert.equal(projection.visibility.value, 90);
  assert.equal(projection.structure.elevation.value, 12);
  assert.equal(projection.structure.elevation.status, 'partial');
  assert.equal(projection.structure.viewingAngle.value, null);
  assert.equal(projection.audience.ots, null);
});
