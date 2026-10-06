import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  isOlderThanTwelveMonths,
  plausibilityErrors,
  structureValuesEntered,
} from './sites-plausibility';
import { galleryCaption, lightboxAlt } from './gallery';
import { circlePolygon } from './map-position';
import { SUPPORTED_MARKETS, findMarket, marketLabel } from './markets';
import { sitesCopy } from './sites-locale';

/**
 * Part 1 inventory trust — web-side logic (execution plan §1.4/§1.5):
 * entry plausibility mirrors the API, structure provenance triggers, old-photo
 * guidance, and localized gallery captions/alt text.
 */

test('plausibility rejects orientation outside 0–359', () => {
  assert.deepEqual(plausibilityErrors({ orientationDeg: 360 }), {
    orientationDeg: 'errorOrientation',
  });
  assert.deepEqual(plausibilityErrors({ orientationDeg: -1 }), {
    orientationDeg: 'errorOrientation',
  });
  assert.deepEqual(plausibilityErrors({ orientationDeg: 0 }), {});
  assert.deepEqual(plausibilityErrors({ orientationDeg: 359 }), {});
});

test('plausibility requires a positive viewing distance and non-negative elevation', () => {
  assert.deepEqual(plausibilityErrors({ viewingDistance: 0 }), {
    viewingDistance: 'errorViewingDistance',
  });
  assert.deepEqual(plausibilityErrors({ viewingDistance: 40 }), {});
  assert.deepEqual(plausibilityErrors({ elevation: -0.5 }), { elevation: 'errorElevation' });
  assert.deepEqual(plausibilityErrors({ elevation: 0 }), {});
});

test('plausibility checks illumination hours against the seeded shapes', () => {
  assert.deepEqual(plausibilityErrors({ illuminationHours: 'sometimes' }), {
    illuminationHours: 'errorIlluminationHours',
  });
  assert.deepEqual(plausibilityErrors({ illuminationHours: '18:00-06:00' }), {});
  assert.deepEqual(plausibilityErrors({ illuminationHours: '24/7' }), {});
  assert.deepEqual(plausibilityErrors({ illuminationHours: '18:30–06:00' }), {}); // en dash tolerated
  assert.deepEqual(plausibilityErrors({ illuminationHours: '' }), {});
});

test('plausibility bounds coordinates to the declared country box (NG/GH/CM)', () => {
  assert.deepEqual(plausibilityErrors({ latitude: 48.2, longitude: 11.5, country: 'Nigeria' }), {
    latitude: 'errorCountryBox',
  });
  assert.deepEqual(
    plausibilityErrors({ latitude: 6.6058, longitude: 3.3545, country: 'Nigeria' }),
    {},
  );
  assert.deepEqual(
    plausibilityErrors({ latitude: 5.5597, longitude: -0.2179, country: 'Ghana' }),
    {},
  );
  assert.deepEqual(plausibilityErrors({ latitude: 4.05, longitude: 9.7, country: 'Cameroon' }), {});
  // Unknown countries get no box check (honest limit of free-text country entry).
  assert.deepEqual(plausibilityErrors({ latitude: 48.2, longitude: 11.5, country: 'Germany' }), {});
  assert.deepEqual(plausibilityErrors({ latitude: 48.2, longitude: 11.5 }), {});
});

test('structure provenance is triggered only by entered structure values', () => {
  assert.equal(structureValuesEntered({ orientationDeg: 90 }), true);
  assert.equal(structureValuesEntered({ viewingDistance: '40' }), true);
  assert.equal(structureValuesEntered({ elevation: '' }), false);
  assert.equal(structureValuesEntered({}), false);
});

test('photos older than 12 months draw the replace guidance; unknown dates never warn', () => {
  const now = new Date('2026-09-17T00:00:00Z');
  assert.equal(isOlderThanTwelveMonths('2025-08-01', now), true);
  assert.equal(isOlderThanTwelveMonths('2026-01-01', now), false);
  assert.equal(isOlderThanTwelveMonths(null, now), false);
  assert.equal(isOlderThanTwelveMonths(undefined, now), false);
});

test('gallery captions localize kind + capture date and omit unknown dates', () => {
  const asset = { kindLabel: 'Front-on', capturedAt: '2026-05-12T00:00:00Z' };
  const en = galleryCaption(asset, 'en');
  assert.match(en, /^Front-on · captured/);
  assert.match(en, /12 May 2026/);
  const fr = galleryCaption({ ...asset, kindLabel: 'De face' }, 'fr');
  assert.match(fr, /^De face · prise le/);
  assert.equal(galleryCaption({ kindLabel: 'Diagram', capturedAt: null }, 'en'), 'Diagram');
  // Alt text equals the caption when a date exists.
  assert.equal(lightboxAlt(asset, 'en'), en);
});

test('the lightbox copy ships in both locales with the site-name placeholder', () => {
  assert.ok(sitesCopy.en.detail.gallery.includes('{{label}}'));
  assert.ok(sitesCopy.fr.detail.gallery.includes('{{label}}'));
  assert.ok(sitesCopy.en.detail.mapRadiusNote.length > 0);
  assert.ok(sitesCopy.fr.detail.mapRadiusNote.length > 0);
});

test('the 500 m context circle stays within about one metre of its radius', () => {
  const ring = circlePolygon(6.6058, 3.3545, 500);
  assert.equal(ring[0][0], ring[ring.length - 1][0]); // closed
  assert.equal(ring[0][1], ring[ring.length - 1][1]);
  // The topmost point is ~500 m due north (haversine check).
  const [, lat] = ring[Math.floor(ring.length / 4)];
  const dLat = ((lat - 6.6058) * Math.PI * 6_371_000) / 180;
  assert.ok(Math.abs(dLat - 500) < 2, `north offset ${dLat}`);
});

test('five-market country aliases, accents and defaults are consistent without claiming enrichment coverage', () => {
  assert.deepEqual(
    SUPPORTED_MARKETS.map((market) => market.code),
    ['NG', 'GH', 'BJ', 'CI', 'CM'],
  );
  assert.equal(findMarket('  BÉNIN ')?.currency, 'XOF');
  assert.equal(findMarket('Cote D’Ivoire')?.code, 'CI');
  assert.equal(findMarket('Ivory Coast')?.currency, 'XOF');
  assert.equal(findMarket('Cameroun')?.currency, 'XAF');
  assert.equal(findMarket('NG')?.name, 'Nigeria');
  assert.equal(marketLabel('Cameroon', 'fr'), 'Cameroun');
  assert.deepEqual(
    plausibilityErrors({ latitude: 6.3703, longitude: 2.3912, country: 'Bénin' }),
    {},
  );
  assert.deepEqual(
    plausibilityErrors({ latitude: 5.36, longitude: -4.0083, country: 'Côte d’Ivoire' }),
    {},
  );
  assert.deepEqual(plausibilityErrors({ latitude: 48, longitude: 2, country: 'CI' }), {
    latitude: 'errorCountryBox',
  });
  assert.equal(findMarket('unknown'), undefined);
});
