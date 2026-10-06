import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { metadataFacts, metadataLink } from './site-metadata-display';

test('controlled structure labels and numeric/date display localize without changing vendor evidence', () => {
  const payload = {
    orientationDeg: 18.83,
    elevation: 2.1,
    illumination: 'external',
    photoCapturedAt: '2026-10-05',
    vendorRaw: 'Unknown source wording, preserved',
  };
  const original = JSON.stringify(payload);
  const fr = metadataFacts(payload, 'fr');
  assert.equal(fr.find((f) => f.label === 'Orientation (degrés)')?.value, '18,83');
  assert.equal(fr.find((f) => f.label === 'Hauteur au-dessus du sol')?.value, '2,1');
  assert.equal(
    fr.find((f) => f.label === 'Photo capture date' || f.label === 'Date de prise de la photo')
      ?.value,
    '05 oct. 2026',
  );
  assert.equal(fr.find((f) => f.label === 'Vendor Raw')?.value, payload.vendorRaw);
  assert.equal(JSON.stringify(payload), original);
});

test('source facts keep unverified coordinates, commercial unknowns and photo caveats explicit', () => {
  const payload = {
    localDemoReference: true,
    coordinateQuality: 'Source-recorded / unverified; not independently surveyed',
    dimensionOrientationVerified: false,
    sourceDimensions: '6 m × 18 m (unordered pair)',
    availability: null,
    price: null,
    traffic: null,
    impressions: null,
    photoCapturedAt: null,
    notes: 'Source title conflicts with detailed format; capture date unknown.',
    sourceUrl: 'https://directory.lasaa.lg.gov.ng/en/billboard-site/marina-annex',
  };
  const original = structuredClone(payload);
  const facts = metadataFacts(payload, 'en');
  assert.equal(facts.length, Object.keys(payload).length);
  assert.equal(
    facts.find((f) => f.label === 'Coordinate quality')?.value,
    payload.coordinateQuality,
  );
  assert.equal(facts.find((f) => f.label === 'Width/height orientation specified')?.value, 'No');
  for (const label of ['Availability', 'Price', 'Traffic', 'Impressions', 'Photo capture date']) {
    assert.equal(facts.find((f) => f.label === label)?.value, 'Unknown');
  }
  assert.equal(facts.find((f) => f.label === 'Source notes and caveats')?.value, payload.notes);
  assert.equal(facts.find((f) => f.label === 'Source listing')?.href, payload.sourceUrl);
  assert.deepEqual(payload, original);
});

test('nested vendor fields and arrays remain readable without dropping zero or false', () => {
  const facts = metadataFacts(
    {
      vendor_data: {
        count: 0,
        valid: false,
        nearby: ['Accra Mall', { distanceMeters: 300 }],
        empty: {},
        missing: [],
      },
    },
    'en',
  );
  assert.deepEqual(facts, [
    { label: 'Vendor data · Count', value: '0' },
    { label: 'Vendor data · Valid', value: 'No' },
    { label: 'Vendor data · Nearby · 1', value: 'Accra Mall' },
    { label: 'Vendor data · Nearby · 2 · Distance Meters', value: '300' },
    { label: 'Vendor data · Empty', value: 'No recorded values' },
    { label: 'Vendor data · Missing', value: 'No recorded values' },
  ]);
});

test('French source labels and unknowns are localized without translating supplied evidence', () => {
  const facts = metadataFacts(
    { mediaOwner: 'ELEV8MEDIA ADVERTISING LTD', price: null, localDemoReference: true },
    'fr',
  );
  assert.deepEqual(facts, [
    { label: 'Propriétaire du support', value: 'ELEV8MEDIA ADVERTISING LTD' },
    { label: 'Prix', value: 'Inconnu' },
    { label: 'Référence de démonstration locale', value: 'Oui' },
  ]);
});

test('metadata links reject executable schemes and embedded credentials', () => {
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,test',
    'https://user:secret@example.com/',
    '<script>alert(1)</script>',
    'LASAA directory',
  ]) {
    assert.equal(metadataLink(value), undefined);
    assert.equal(metadataFacts({ source: value }, 'en')[0].value, value);
    assert.equal(metadataFacts({ source: value }, 'en')[0].href, undefined);
  }
  assert.equal(metadataLink('https://example.com/source'), 'https://example.com/source');
});
