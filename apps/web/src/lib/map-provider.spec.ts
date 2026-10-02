import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getSitesCopy } from './sites-locale';

const requireModule = createRequire(__filename);
const modulePaths = [
  '../components/sites/mapbox-tiles',
  '../components/sites/RegistrationMap',
  '../components/sites/SiteMap',
];

function withMapEnvironment(
  mode: string,
  optIn: string | undefined,
  token: string | undefined,
  check: () => void,
) {
  const keys = ['NODE_ENV', 'NEXT_PUBLIC_LOCAL_REVIEW_OSM_MAP', 'NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN'];
  const previous = keys.map((key) => process.env[key]);
  const values = [mode, optIn, token];
  try {
    keys.forEach((key, index) => {
      if (values[index] === undefined) delete process.env[key];
      else process.env[key] = values[index];
    });
    modulePaths.forEach((path) => {
      delete requireModule.cache[requireModule.resolve(path)];
    });
    check();
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
    modulePaths.forEach((path) => {
      delete requireModule.cache[requireModule.resolve(path)];
    });
  }
}

function assertBothMaps(enabled: boolean) {
  const { RegistrationMap } = requireModule(
    '../components/sites/RegistrationMap',
  ) as typeof import('../components/sites/RegistrationMap');
  const { SiteMapView } = requireModule(
    '../components/sites/SiteMap',
  ) as typeof import('../components/sites/SiteMap');
  const copy = getSitesCopy('en');
  const registration = renderToStaticMarkup(
    createElement(RegistrationMap, {
      latitude: '6.4371',
      longitude: '3.4564',
      country: 'Nigeria',
      locale: 'en',
      onPick: () => undefined,
    }),
  );
  const detail = renderToStaticMarkup(
    createElement(SiteMapView, {
      latitude: 6.4371,
      longitude: 3.4564,
      siteName: 'Local review site',
      locale: 'en',
      onExit: () => undefined,
    }),
  );
  assert.equal(registration.includes(copy.register.mapUnavailable), !enabled);
  assert.equal(detail.includes(copy.detail.mapUnavailable), !enabled);
}

test('both maps allow the opted-in development basemap without a Mapbox token', () => {
  withMapEnvironment('development', 'true', undefined, () => {
    const provider = requireModule(
      '../components/sites/mapbox-tiles',
    ) as typeof import('../components/sites/mapbox-tiles');
    assert.equal(provider.SITE_MAP_ENABLED, true);
    assert.equal(provider.SITE_MAP_TILES_URL, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    assert.equal(provider.SITE_MAP_TILE_OPTIONS.tileSize, 256);
    assert.equal(provider.SITE_MAP_TILE_OPTIONS.zoomOffset, 0);
    assert.match(provider.SITE_MAP_TILE_OPTIONS.attribution, /OpenStreetMap/);
    assertBothMaps(true);
  });
});

for (const mode of ['production', 'test']) {
  test(`${mode} cannot enable the local-review basemap even with the opt-in flag`, () => {
    withMapEnvironment(mode, 'true', undefined, () => {
      const provider = requireModule(
        '../components/sites/mapbox-tiles',
      ) as typeof import('../components/sites/mapbox-tiles');
      assert.equal(provider.LOCAL_REVIEW_OSM_MAP, false);
      assert.equal(provider.SITE_MAP_ENABLED, false);
      assertBothMaps(false);
    });
  });
}

test('development requires an explicit opt-in when no public token exists', () => {
  withMapEnvironment('development', undefined, undefined, () => {
    assertBothMaps(false);
  });
});

test('production uses Mapbox tile settings with its public build token', () => {
  withMapEnvironment('production', 'true', 'pk.public-test-placeholder', () => {
    const provider = requireModule(
      '../components/sites/mapbox-tiles',
    ) as typeof import('../components/sites/mapbox-tiles');
    assert.equal(provider.LOCAL_REVIEW_OSM_MAP, false);
    assert.match(provider.SITE_MAP_TILES_URL, /^https:\/\/api\.mapbox\.com\//);
    assert.equal(provider.SITE_MAP_TILE_OPTIONS.tileSize, 512);
    assert.equal(provider.SITE_MAP_TILE_OPTIONS.zoomOffset, -1);
    assertBothMaps(true);
  });
});
