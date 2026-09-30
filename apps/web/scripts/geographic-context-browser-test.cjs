// Mocked-API browser regression coverage; no fixture is imported into production data.
// Build first: pnpm --filter @abonten/web exec next build --webpack
// Run with Playwright available, optionally PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate) {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (predicate()) return;
    await delay(10);
  }
  throw new Error('Expected mocked request did not arrive');
}
const base = 'http://127.0.0.1:3001';
const output = process.env.BROWSER_TEST_OUTPUT || '/tmp/abonten-geographic-context-ui';
const server = spawn(process.execPath, [path.join(__dirname, 'serve-static-export.cjs')], { stdio: 'ignore' });
const source = { importId: 'browser-test-only', sourceKey: 'osm-geofabrik', version: 'test-fixture', referenceYear: 2026, publishedAt: '2026-09-01T00:00:00Z', fetchedAt: '2026-09-30T00:00:00Z', licence: 'ODbL-1.0', licenceUrl: 'https://www.openstreetmap.org/copyright', attribution: '© OpenStreetMap contributors', sourceUrl: 'https://download.geofabrik.de/africa/ghana.html', checksum: 'b'.repeat(64), quality: 'mapped', warnings: [] };
const missing = () => ({ status: 'unavailable', value: null, method: 'No production reference import', provenance: null, warnings: [] });
const metric = (value, provenance = source) => ({ status: 'available', value, method: 'Geodesic spatial intersection', provenance, warnings: [] });
function geographicContext(siteId) {
  return { siteId, countryCode: 'GH', supported: true, generatedAt: '2026-09-30T10:00:00Z', dataClass: siteId === 'site-demo' ? 'demo' : 'production', disclaimer: 'Geographic context only',
    nearestRoad: metric({ sourceId: 'road-1', name: `Mapped road ${siteId}`, roadClass: 'primary', distanceMetres: 42.3 }),
    administrative: [metric([{ sourceId: 'adm1', name: 'Greater Accra', level: 1 }]), metric([{ sourceId: 'adm2', name: 'Accra Metropolitan', level: 2 }])],
    catchments: [250, 500, 1000].map((radiusMetres) => ({ radiusMetres,
      pois: metric({ mappedCount: radiusMetres === 250 ? 0 : 12, byCategory: radiusMetres === 250 ? {} : { school: 4, market: 8 }, nearest: radiusMetres === 250 ? [] : [{ sourceId: 'poi-1', name: 'Market fixture', category: 'market', distanceMetres: 320 }], completeness: 'unknown' }),
      population: radiusMetres === 1000 ? missing() : { ...metric({ people: radiusMetres === 250 ? 125.4 : 285, validCoverageFraction: radiusMetres === 250 ? 0.6 : 1, rasterCoverageFraction: radiusMetres === 250 ? 0.8 : 1, unit: 'people' }, { ...source, sourceKey: 'worldpop-r2025a-2026', licence: 'CC-BY-4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', sourceUrl: 'https://www.worldpop.org/', attribution: 'WorldPop, University of Southampton', quality: 'modelled' }), status: radiusMetres === 250 ? 'partial' : 'available', warnings: radiusMetres === 250 ? ['Incomplete valid raster coverage; reported residents cover only valid cell areas.'] : [] },
    })), traffic: missing() };
}
const site = (id) => ({ id, organizationId: 'org-a', code: 'QA-ONLY', name: `Site ${id}`, type: 'billboard', format: 'static', latitude: 5.6, longitude: -0.2, country: 'Ghana', city: 'Accra', width: 12, height: 3, area: 36, units: 'm', illuminationType: 'none', status: 'draft', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-30T00:00:00Z', faces: [], assets: [], metadata: [], rateCards: [] });

(async () => {
  let browser;
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await fetch(base)).ok) break; } catch {}
      if (attempt === 99) throw new Error('Static server did not start');
      await delay(100);
    }
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('abonten.session', JSON.stringify({ accessToken: 'mock-access', refreshToken: 'mock-refresh', activeOrgId: 'org-a' }));
    });
    let locale = 'en';
    let failContext = true;
    let contextCalls = 0;
    let releaseSlowContext;
    let releaseSlowSite;
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const response = (body, status = 200) => route.fulfill({ status, json: body, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } }).catch(() => {});
      if (request.method() === 'OPTIONS') return response({});
      if (url.pathname === '/api/me') return response({ user: { id: 'test-user', email: 'test@example.test', name: 'Test User', locale, timezone: 'UTC', status: 'active', hasAvatar: false }, activeOrgId: 'org-a', capabilities: ['INVENTORY_VIEW', 'INVENTORY_CREATE', 'INVENTORY_EDIT'] });
      if (url.pathname === '/api/me/organizations') return response([{ organizationId: 'org-a', role: 'org_owner', name: 'Browser test organization', type: 'media_partner', country: 'Ghana', defaultCurrency: 'GHS', defaultLocale: locale }]);
      const match = url.pathname.match(/^\/api\/inventory\/sites\/([^/]+)(\/geographic-context)?$/);
      if (match) {
        const id = match[1];
        assert.equal(request.headers()['x-org-id'], 'org-a');
        assert.equal(request.headers().authorization, 'Bearer mock-access');
        if (match[2]) {
          contextCalls++;
          if (id === 'site-context-slow') await new Promise((resolve) => { releaseSlowContext = resolve; });
          if (failContext) return response({ message: 'Temporary mock outage' }, 503);
          return response(geographicContext(id));
        }
        if (id === 'site-detail-slow') await new Promise((resolve) => { releaseSlowSite = resolve; });
        return response(site(id));
      }
      if (url.pathname === '/api/inventory/markets') return response({ items: [] });
      return response({ items: [], total: 0 });
    });
    await page.goto(`${base}/sites/detail/?id=site-a`);
    await page.getByText('Geographic context could not be loaded.', { exact: false }).waitFor();
    failContext = false;
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.getByText('Mapped road site-a', { exact: true }).waitFor();
    assert.ok(contextCalls >= 2);
    assert.ok(await page.getByText('Partial estimate: residents in the covered area only.', { exact: true }).isVisible());
    assert.ok(await page.getByText('No POIs mapped in this catchment', { exact: true }).isVisible());
    assert.ok(await page.getByText('No actual licensed traffic observations are available for this site.', { exact: true }).isVisible());
    await page.locator('summary').filter({ hasText: 'Source and method' }).first().click();
    assert.ok(await page.getByText('browser-test-only', { exact: true }).first().isVisible());
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
    assert.ok(await page.getByRole('heading', { name: 'Faces', exact: true }).isVisible());
    assert.ok(await page.getByRole('heading', { name: 'Rate cards', exact: true }).isVisible());
    await fs.mkdir(output, { recursive: true });
    const panel = () => page.locator('section').filter({ has: page.getByRole('heading', { name: locale === 'fr' ? 'Contexte géographique' : 'Geographic context', exact: true }) }).first();
    await panel().screenshot({ path: path.join(output, 'desktop-en-dark.png') });

    const navigate = (id) => page.evaluate((nextId) => window.history.pushState(null, '', `/sites/detail/?id=${nextId}`), id);
    await navigate('site-context-slow');
    await page.getByText('Loading geographic context…', { exact: true }).waitFor();
    await waitFor(() => releaseSlowContext);
    await navigate('site-b');
    await page.getByText('Mapped road site-b', { exact: true }).waitFor();
    releaseSlowContext();
    await delay(150);
    assert.equal(await page.getByText('Mapped road site-context-slow', { exact: true }).count(), 0);
    await navigate('site-detail-slow');
    await waitFor(() => releaseSlowSite);
    await navigate('site-c');
    await page.getByText('Mapped road site-c', { exact: true }).waitFor();
    releaseSlowSite();
    await delay(150);
    assert.equal(await page.getByRole('heading', { name: 'Site site-detail-slow', exact: true }).count(), 0);
    await navigate('site-demo');
    await page.getByText('Geographic context could not be loaded.', { exact: false }).waitFor();
    assert.equal(await page.getByText('Mapped road site-demo', { exact: true }).count(), 0);

    locale = 'fr';
    await page.goto(`${base}/sites/detail/?id=site-fr`);
    await page.getByRole('heading', { name: 'Contexte géographique', exact: true }).waitFor();
    await page.getByText('Mapped road site-fr', { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'mobile horizontal overflow');
    await panel().screenshot({ path: path.join(output, 'mobile-fr-dark.png') });
    await page.evaluate(() => { localStorage.setItem('theme', 'light'); });
    await page.reload();
    await page.getByText('Mapped road site-fr', { exact: true }).waitFor();
    await panel().screenshot({ path: path.join(output, 'mobile-fr-light.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'light mobile horizontal overflow');
    assert.deepEqual(pageErrors, []);
    console.log(JSON.stringify({ result: 'PASS', api: 'mocked fixtures only', checks: ['error/retry', 'partial and unavailable values', 'zero POI caution', 'source disclosure', 'existing edit/cancel and sections', 'loading', 'late context cancellation', 'late site cancellation', 'demo rejection', 'English/French', '390px mobile no overflow', 'dark/light', 'no runtime errors'], screenshots: output }, null, 2));
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
