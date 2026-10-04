import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPlannerSelection } from './planner-selection';

const id = (kind: number, index: number) =>
  `${kind}0000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const item = (index: number, board = index) => ({
  site: { id: id(1, board) },
  faceId: id(2, index),
  pricingCurrency: 'GHS',
});

test('thirteen shortlisted boards produce a coherent partial twelve-board context', () => {
  const draft = Array.from({ length: 13 }, (_, index) => item(index + 1));
  const selection = buildPlannerSelection(draft, null);
  assert.equal(selection.selectedSiteIds.length, 12);
  assert.equal(selection.selectedFaceIds.length, 12);
  assert.equal(selection.omittedFaces, 1);
  assert.equal(selection.selectionTruncated, true);
  assert.ok(
    draft
      .filter((face) => selection.selectedFaceIds.includes(face.faceId))
      .every((face) => selection.selectedSiteIds.includes(face.site.id)),
  );
});
test('an opened thirteenth board preserves coupled parent/face bounds', () => {
  const draft = Array.from({ length: 12 }, (_, index) => item(index + 1));
  const selection = buildPlannerSelection(draft, id(1, 13));
  assert.equal(selection.selectedSiteIds.length, 12);
  assert.equal(selection.selectedSiteIds[0], id(1, 13));
  assert.equal(selection.selectedFaceIds.length, 11);
  assert.equal(selection.omittedFaces, 1);
  assert.equal(selection.selectionTruncated, true);
  assert.ok(
    draft
      .filter((face) => selection.selectedFaceIds.includes(face.faceId))
      .every((face) => selection.selectedSiteIds.includes(face.site.id)),
  );
});
test('face limit and selected pricing currency remain consistent for multi-face boards', () => {
  const draft = Array.from({ length: 30 }, (_, index) => item(index + 1, (index % 2) + 1));
  const selection = buildPlannerSelection(draft, null);
  assert.equal(selection.selectedSiteIds.length, 2);
  assert.equal(selection.selectedFaceIds.length, 24);
  assert.equal(selection.omittedFaces, 6);
  assert.equal(selection.faceCurrencies.length, 24);
  assert.ok(
    selection.faceCurrencies.every(
      (face) => face.currency === 'GHS' && selection.selectedFaceIds.includes(face.faceId),
    ),
  );
});
test('normal selections are complete and repeated or invalid faces do not inflate context', () => {
  const face = item(1);
  const selection = buildPlannerSelection(
    [face, face, { ...item(2), pricingCurrency: 'ZZZ' }],
    face.site.id,
  );
  assert.equal(selection.selectionTruncated, false);
  assert.equal(selection.omittedFaces, 0);
  assert.equal(selection.selectedFaceIds.length, 2);
  assert.deepEqual(selection.faceCurrencies, [{ faceId: face.faceId, currency: 'GHS' }]);
  const invalid = buildPlannerSelection([{ site: { id: 'bad' }, faceId: 'bad' }], 'bad');
  assert.equal(invalid.selectedSiteIds.length, 0);
  assert.equal(invalid.selectedFaceIds.length, 0);
  assert.equal(invalid.selectionTruncated, true);
});
