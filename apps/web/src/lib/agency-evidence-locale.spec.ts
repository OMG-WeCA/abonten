import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
import { agencyEvidenceText, agencyEvidenceUnit } from './agency-evidence-locale';
import {
  estimateFaceCost,
  estimateGrossOts,
  selectionDistances,
  summarizeBudget,
} from './agency-planning';
import { projectPlanningEnrichment } from './agency-enrichment';
import { normalizeText } from '../../../api/src/planning/brief-parser';

const window = { startDate: '2026-10-01', endDate: '2026-10-08' };
const face = { id: 'face-1', siteId: 'site-1', bookable: true };
const rate = {
  id: 'rate-QA_2026',
  siteId: 'site-1',
  currency: 'GHS',
  rates: { perDay: 100 },
  effectiveFrom: '2026-01-01',
};
const site = { id: 'site-1', format: 'static', rateCards: [rate] };

function translated(value: string): string {
  assert.equal(agencyEvidenceText(value, 'en'), value, 'Canonical English must remain unchanged');
  const french = agencyEvidenceText(value, 'fr');
  assert.notEqual(french, value, `Untranslated controlled output: ${value}`);
  assert.equal(
    agencyEvidenceText(french, 'en'),
    value,
    'Known translated copy must switch back to English',
  );
  return french;
}

test('localizes real canonical price failures, cost provenance and assumptions without changing facts', () => {
  const failures = [
    estimateFaceCost(site, face, { startDate: 'invalid', endDate: '2026-10-08' }),
    estimateFaceCost(site, { ...face, bookable: false }, window),
    estimateFaceCost({ ...site, permitExpiresAt: '2026-10-04' }, face, window),
    estimateFaceCost({ ...site, format: 'digital_led' }, face, window),
    estimateFaceCost(site, face, window, 'INVALID'),
    estimateFaceCost({ ...site, rateCards: [] }, face, window),
    estimateFaceCost(
      { ...site, rateCards: [{ ...rate, faceId: face.id, effectiveFrom: 'bad' }] },
      face,
      window,
    ),
    estimateFaceCost({ ...site, rateCards: [{ ...rate, minBookingDays: 14 }] }, face, window),
    estimateFaceCost(
      { ...site, rateCards: [{ ...rate, seasonalRules: { rules: [{}] } }] },
      face,
      window,
    ),
    estimateFaceCost({ ...site, rateCards: [{ ...rate, rates: { perMonth: 100 } }] }, face, window),
  ];
  for (const value of failures) {
    assert.equal(value.status, 'unavailable');
    if (value.status === 'unavailable') translated(value.reason);
  }
  for (const faceId of [undefined, face.id]) {
    const estimate = estimateFaceCost({ ...site, rateCards: [{ ...rate, faceId }] }, face, window);
    assert.equal(estimate.status, 'ready');
    if (estimate.status !== 'ready') continue;
    const original = structuredClone(estimate);
    assert.match(translated(estimate.provenance), /rate-QA_2026/);
    estimate.assumptions.forEach(translated);
    assert.deepEqual(estimate, original);
  }
  const weekly = estimateFaceCost(
    { ...site, rateCards: [{ ...rate, rates: { perWeek: 500 } }] },
    face,
    window,
  );
  assert.equal(weekly.status, 'ready');
  if (weekly.status === 'ready') weekly.assumptions.forEach(translated);
  summarizeBudget([]).assumptions.forEach(translated);
  const distance = selectionDistances([
    { id: 'a', latitude: 0, longitude: 0 },
    { id: 'b', latitude: 1, longitude: 0 },
  ])[0]!;
  translated(distance.method);
  translated(distance.provenance);
  distance.assumptions.forEach(translated);
  assert.equal(distance.unit, 'km');
  const ots = estimateGrossOts(window);
  translated(ots.reason);
  ots.assumptions.forEach(translated);
  assert.equal(ots.value, null);
  assert.equal(ots.reach, null);
});

test('localizes canonical enrichment warnings and extraction limits while retaining unknown source evidence', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const record = {
    id: 'visibility-QA',
    dimension: 'visibility',
    payload: { score: 90 },
    dataClass: 'production',
    verification: 'partner_declared',
    source: 'Synthetic original source',
    method: 'Mesure originale personnalisée',
    collectedAt: '2026-10-01',
  };
  const value = projectPlanningEnrichment(
    { id: 'site-1', elevation: 12, metadata: [record] },
    null,
    now,
  );
  const original = structuredClone(value);
  translated(value.structure.viewingAngle.reason!);
  translated(value.structure.elevation.reason!);
  value.structure.elevation.warnings.forEach(translated);
  value.visibility.warnings.forEach(translated);
  translated(value.audience.reason);
  assert.equal(agencyEvidenceUnit(value.structure.elevation.unit, 'fr'), 'mètres au-dessus du sol');
  assert.equal(agencyEvidenceText(record.method, 'fr'), record.method);
  assert.equal(agencyEvidenceText(record.source, 'fr'), record.source);
  assert.deepEqual(value, original);
  const brief = normalizeText('Synthetic source text '.repeat(4000));
  assert.equal(brief.text.length, 60000);
  assert.match(translated(brief.warnings[0]!), /60 000 caractères/);
  assert.equal(
    agencyEvidenceText('Slide 1\nSynthetic original document text\nWorksheet 1: Example', 'fr'),
    'Slide 1\nSynthetic original document text\nWorksheet 1: Example',
  );
});

test('bounded templates preserve identifiers and count values, reverse known French, and leave arbitrary text verbatim', () => {
  for (const source of [
    'Published face rate card abc-123_QA; effective dates use UTC calendar days.',
    'Published site-default rate card source:rate/2026; effective dates use UTC calendar days.',
    'Minimum booking duration is 1200 days.',
    '9007199254740991 native raster cells contain NoData and are excluded, not counted as zero',
    'Device location was unavailable during camera capture.',
    'Face no longer available.',
    'Face added to your draft shortlist.',
    'Draft shortlist cleared.',
    'This draft holds up to 100 faces. Remove a face before adding another.',
    'No checked faces fit this budget, currency and flight. Adjust the constraints.',
    'This tab’s draft restored. Board facts are checked again; brief and conversation start fresh.',
    '1200 draft faces still need loading; 0 deleted or inaccessible faces removed. Brief and conversation start fresh.',
    'Shortlisted 12 boards by lowest published media cost. 2 boards could not be checked.',
    'Shortlisted 12 boards by lowest published media cost. ',
  ])
    translated(source);
  assert.match(
    agencyEvidenceText('Minimum booking duration is 1200 days.', 'fr'),
    /1\u202f200 jours/,
  );
  for (const source of [
    'Provider comment: No published rate covers this flight.',
    'Minimum booking duration is 01 days.',
    'Published face rate card a\nprovider text; effective dates use UTC calendar days.',
    `Published face rate card ${'x'.repeat(129)}; effective dates use UTC calendar days.`,
    'La durée minimale de réservation est de 1 23 jours.',
    '1 23 faces restent à vérifier ; 0 faces supprimées ou inaccessibles retirées. Document et conversation réinitialisés.',
    'Shortlisted 01 boards by lowest published media cost. ',
    'Mes données originales restent en français.',
    '__proto__',
    '<script>unknown original evidence</script>',
  ]) {
    assert.equal(agencyEvidenceText(source, 'fr'), source);
    assert.equal(agencyEvidenceText(source, 'en'), source);
  }
  for (const [input, french] of [
    ['vehicles', 'véhicules'],
    ['field_verified', 'Vérifié sur le terrain'],
    ['audience', 'Audience'],
    ['illumination', 'Éclairage'],
    ['northbound', 'Vers le nord'],
  ]) {
    assert.equal(
      agencyEvidenceUnit(input, 'en'),
      input === 'field_verified' ? 'Field verified' : input,
    );
    assert.equal(agencyEvidenceUnit(input, 'fr'), french);
  }
  assert.equal(
    agencyEvidenceText(
      '1200 faces restent à vérifier ; 0 faces supprimées ou inaccessibles retirées. Document et conversation réinitialisés.',
      'en',
    ),
    '1200 draft faces still need loading; 0 deleted or inaccessible faces removed. Brief and conversation start fresh.',
  );
  assert.equal(
    agencyEvidenceText(
      'Aucune face vérifiée ne correspond au budget, à la devise et aux dates.',
      'en',
    ),
    'No checked faces fit this budget, currency and flight. Adjust the constraints.',
  );
  for (const [input, label] of [
    ['partner_declared', 'Partner declared'],
    ['third_party', 'Third-party'],
    ['read_budget_exhausted', 'Read limit reached'],
    ['temporarily_unavailable', 'Temporarily unavailable'],
    ['both_directions', 'Both directions'],
    ['light_vehicle', 'Light vehicle'],
    ['heavy_vehicle', 'Heavy vehicle'],
  ])
    assert.equal(agencyEvidenceUnit(input, 'en'), label);
  assert.equal(agencyEvidenceUnit('ft', 'en'), 'ft');
  assert.equal(agencyEvidenceUnit('provider_custom_unit', 'en'), 'provider_custom_unit');
  assert.equal(agencyEvidenceUnit('provider_custom_unit', 'fr'), 'provider_custom_unit');
  assert.equal(
    agencyEvidenceText(
      'La position de l’appareil était indisponible lors de la prise de photo.',
      'en',
    ),
    'Device location was unavailable during camera capture.',
  );
});

/** Guard against new canonical explanations silently bypassing display localization.
 * Exceptions/internal errors are outside this successful-evidence display contract. */
test('all controlled explanatory literals in canonical planning sources have display translations', () => {
  const paths = [
    '../api/src/planning/planning-math.ts',
    '../api/src/planning/planning-enrichment.ts',
    '../api/src/planning/planning-snapshot.ts',
    'src/lib/agency-draft.ts',
    '../api/src/enrichment/geographic-context.service.ts',
    '../api/src/enrichment/context-math.ts',
  ];
  for (const path of paths) {
    const source = ts.createSourceFile(
      path,
      readFileSync(resolve(process.cwd(), path), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node) => {
      if (
        ts.isStringLiteral(node) &&
        /^[A-Z][a-z].{15}/.test(node.text) &&
        node.text.includes(' ')
      ) {
        let parent: ts.Node | undefined = node.parent;
        let thrown = false;
        while (parent) {
          if (ts.isThrowStatement(parent)) thrown = true;
          parent = parent.parent;
        }
        if (!thrown) translated(node.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
});

// Read the actual canonical parser warnings, including its isolated PDF program.
test('Office and isolated PDF parser warnings have reversible display translations', () => {
  const parser = ts.createSourceFile(
    'brief-parser.ts',
    readFileSync(resolve(process.cwd(), '../api/src/planning/brief-parser.ts'), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const extraction = ts.createSourceFile(
    'brief-extraction.service.ts',
    readFileSync(resolve(process.cwd(), '../api/src/planning/brief-extraction.service.ts'), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const warnings: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText() === 'warnings' &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      for (const entry of node.initializer.elements)
        if (ts.isStringLiteral(entry)) warnings.push(entry.text);
    }
    if (
      ts.isTaggedTemplateExpression(node) &&
      node.tag.getText() === 'String.raw' &&
      ts.isNoSubstitutionTemplateLiteral(node.template)
    ) {
      const isolated = ts.createSourceFile(
        'isolated-parser.js',
        node.template.text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS,
      );
      const pdfVisit = (item: ts.Node) => {
        if (ts.isCallExpression(item) && item.expression.getText().endsWith('.warnings.unshift')) {
          for (const argument of item.arguments)
            if (ts.isStringLiteral(argument)) warnings.push(argument.text);
        }
        ts.forEachChild(item, pdfVisit);
      };
      pdfVisit(isolated);
    }
    ts.forEachChild(node, visit);
  };
  visit(parser);
  visit(extraction);
  assert.equal(
    warnings.length,
    2,
    'Both canonical Office and PDF warning boundaries must be inspected',
  );
  warnings.forEach(translated);
});
