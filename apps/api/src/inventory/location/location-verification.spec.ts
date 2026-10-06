import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { ConfigService } from '@nestjs/config';
import {
  locationCountryCode,
  locationDecision,
  locationFingerprint,
  type GeocodingCandidate,
  type LocationInput,
  type LocationVerification,
} from './location-verification';
import { LocationVerificationService, mapboxCandidates } from './location-verification.service';

const input: LocationInput = {
  address: '10 Synthetic Test Road',
  city: 'Lagos',
  country: 'Nigeria',
  latitude: 6.45,
  longitude: 3.4,
};
const precise: GeocodingCandidate = {
  latitude: 6.45,
  longitude: 3.4,
  countryCode: 'NG',
  featureType: 'address',
  accuracy: 'rooftop',
  confidence: 'exact',
  componentsMatched: true,
};
describe('address/pin verification policy', () => {
  it('accepts five countries and bilingual aliases without confusing Benin City with Benin', () => {
    for (const [country, code] of [
      ['Nigeria', 'ng'],
      ['Ghana', 'gh'],
      ['Bénin', 'bj'],
      ['Côte d’Ivoire', 'ci'],
      ['Cameroun', 'cm'],
    ]) {
      assert.equal(locationCountryCode(country), code);
      assert.equal(
        locationDecision({ ...input, country }, [{ ...precise, countryCode: code }]).status,
        'matched',
      );
    }
    assert.equal(locationCountryCode('Benin City'), null);
    assert.equal(locationDecision({ ...input, city: 'Benin City' }, [precise]).status, 'matched');
  });
  it('only rejects an unambiguous precise country-consistent address over 250 m away', () => {
    const mismatch = locationDecision(input, [{ ...precise, latitude: 6.46 }], 'fr');
    assert.equal(mismatch.status, 'mismatch');
    assert.equal(mismatch.reasonCode, 'address_pin_mismatch');
    assert.ok(mismatch.distanceMeters! > 1000);
    assert.match(mismatch.message, /soumettez à nouveau/);
    assert.equal(locationDecision(input, [{ ...precise, latitude: 6.451 }]).status, 'matched');
  });
  it('does not reject street/city centroids, interpolated, ambiguous, uncertain or cross-country results', () => {
    for (const patch of [
      { featureType: 'street' },
      { featureType: 'place' },
      { accuracy: 'interpolated' },
      { accuracy: 'parcel' },
      { confidence: 'medium' },
      { componentsMatched: false },
      { countryCode: 'gh' },
      { latitude: NaN },
      { longitude: 181 },
    ]) {
      assert.equal(
        locationDecision(input, [{ ...precise, latitude: 7, ...patch }]).status,
        'unable_to_verify',
      );
    }
    assert.equal(
      locationDecision(input, [precise, { ...precise, latitude: 7 }]).reasonCode,
      'ambiguous_address',
    );
    assert.equal(locationDecision(input, []).status, 'unable_to_verify');
  });
  it('does not reject missing address, failed provider or invalid inputs', () => {
    assert.equal(
      locationDecision({ ...input, address: '' }, [precise]).reasonCode,
      'address_incomplete',
    );
    assert.equal(
      locationDecision({ ...input, latitude: NaN }, [precise]).reasonCode,
      'invalid_coordinates',
    );
    assert.equal(
      locationDecision(input, [], 'en', 'provider_unavailable').status,
      'unable_to_verify',
    );
  });
  it('fingerprints all location fields, normalizes harmless typography and never hashes enrichment', () => {
    for (const patch of [
      { address: '20 Other Road' },
      { city: 'Accra' },
      { region: 'Other' },
      { country: 'Ghana' },
      { latitude: 6.46 },
      { longitude: 3.41 },
    ]) {
      assert.notEqual(locationFingerprint({ ...input, ...patch }), locationFingerprint(input));
    }
    assert.equal(
      locationFingerprint({ ...input, country: ' Nigeria ' }),
      locationFingerprint(input),
    );
  });
});
describe('Mapbox adapter admission', () => {
  it('does not use a map token as permanent geocoding authorization', async () => {
    const service = new LocationVerificationService(
      new ConfigService({
        MAPBOX_GEOCODING_ENABLED: 'false',
        MAPBOX_PUB_KEY: 'pk.synthetic',
        MAPBOX_GEOCODING_PERMANENT_ALLOWED: 'false',
      }),
    );
    const decision = await service.verify(input);
    assert.equal(decision.reasonCode, 'provider_not_configured');
    assert.equal(decision.status, 'unable_to_verify');
  });
  it('requires documented explicit component matches and exact actual numeric coordinates', () => {
    const props = {
      feature_type: 'address',
      coordinates: { latitude: 6.45, longitude: 3.4, accuracy: 'rooftop' },
      match_code: { confidence: 'exact', street: 'matched', place: 'matched', country: 'matched' },
      context: { country: { country_code: 'NG' } },
    };
    assert.equal(
      locationDecision(input, mapboxCandidates({ features: [{ properties: props }] })).status,
      'matched',
    );
    assert.equal(
      locationDecision(
        input,
        mapboxCandidates({
          features: [
            { properties: { ...props, coordinates: { ...props.coordinates, latitude: null } } },
          ],
        }),
      ).status,
      'unable_to_verify',
    );
    assert.equal(
      locationDecision(
        input,
        mapboxCandidates({
          features: [
            { properties: { ...props, match_code: { ...props.match_code, street: 'unmatched' } } },
          ],
        }),
      ).status,
      'unable_to_verify',
    );
  });
});

import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { DatabaseService } from '../../common/database.service';
import type { StorageService } from '../../common/storage.service';
import type { AuthenticatedUser } from '../../auth/authenticated-user';
import { CapabilityResolverService } from '../../capabilities/capability-resolver.service';
import { InventoryService } from '../inventory.service';
import { BillboardSiteEntity } from '../../common/entities/billboard-site.entity';
import { SiteFaceEntity } from '../../common/entities/site-face.entity';
import { RateCardEntity } from '../../common/entities/rate-card.entity';

function inventoryHarness(
  verify: (value: LocationInput, locale?: string) => Promise<ReturnType<typeof locationDecision>>,
  realReadiness = false,
) {
  const site: Record<string, unknown> = {
    ...input,
    id: 'site-test',
    organizationId: 'org-test',
    status: 'draft',
    format: 'static',
    width: 12,
    height: 3,
    locationVerification: null,
  };
  const audit: unknown[] = [];
  let auditFails = false;
  let datedFront = true;
  let lockedFrontReads = 0;
  const query = async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM site_assets')) return datedFront ? [{ ok: 1 }] : [];
    if (sql.startsWith('SELECT')) return params[0] === site.id ? [structuredClone(site)] : [];
    if (sql.startsWith('UPDATE billboard_sites SET location_verification')) {
      site.locationVerification = JSON.parse(params[0] as string);
      site.status = params[1];
      site.rejectionReason = params[2];
      return [];
    }
    if (sql.startsWith("UPDATE billboard_sites SET status = 'approved'")) {
      site.status = 'approved';
      site.rejectionReason = null;
      return [];
    }
    if (sql.startsWith("UPDATE billboard_sites SET status = 'listed'")) {
      site.status = 'listed';
      return [];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const repoFor = (target: unknown, locked = false) => {
    if (target === BillboardSiteEntity)
      return {
        query: async (sql: string, params: unknown[]) => {
          if (locked && sql.includes('FROM site_assets')) lockedFrontReads++;
          return query(sql, params);
        },
      };
    if (target === SiteFaceEntity)
      return { find: async () => [{ id: 'face-test', siteId: 'site-test', bookable: true }] };
    if (target === RateCardEntity)
      return {
        find: async () => [
          { siteId: 'site-test', rates: { perDay: 100 }, effectiveFrom: new Date('2020-01-01') },
        ],
      };
    return {
      create: (row: unknown) => row,
      save: async (row: unknown) => {
        if (auditFails) throw new Error('audit unavailable');
        audit.push(row);
        return row;
      },
    };
  };
  const manager = { query, getRepository: (target: unknown) => repoFor(target, true) };
  const db = {
    repo: async (target: unknown) => repoFor(target),
    transaction: async (work: (manager: EntityManager) => Promise<unknown>) => {
      const before = structuredClone(site),
        beforeCount = audit.length;
      try {
        return await work(manager as unknown as EntityManager);
      } catch (e) {
        Object.assign(site, before);
        audit.length = beforeCount;
        throw e;
      }
    },
  } as unknown as DatabaseService;
  const service = new InventoryService(
    db,
    new CapabilityResolverService(),
    {} as StorageService,
    { verify } as LocationVerificationService,
  );
  if (!realReadiness)
    (service as unknown as { listingProblems: () => Promise<string[]> }).listingProblems =
      async () => [];
  return {
    site,
    audit,
    service,
    setAuditFails: () => {
      auditFails = true;
    },
    setDatedFront: (value: boolean) => {
      datedFront = value;
    },
    lockedFrontReads: () => lockedFrontReads,
  };
}
const actor = { userId: 'user-test' } as AuthenticatedUser;
describe('saved inventory address verification lifecycle', () => {
  it('automatically rejects a confirmed mismatch with persisted actionable reason and one audit', async () => {
    const h = inventoryHarness(async (value, locale) =>
      locationDecision(value, [{ ...precise, latitude: 6.46 }], locale),
    );
    const result = await h.service.submitSite(actor, 'org-test', 'site-test', 'fr');
    assert.equal(result.status, 'rejected');
    assert.equal(h.site.status, 'rejected');
    assert.match(result.rejectionReason!, /soumettez à nouveau/);
    assert.equal((h.site.locationVerification as { status: string }).status, 'mismatch');
    assert.equal(h.audit.length, 1);
    assert.equal(
      (await h.service.submitSite(actor, 'org-test', 'site-test', 'fr')).status,
      'rejected',
    );
    assert.equal(h.audit.length, 1);
  });
  it('keeps uncertain or failed checks pending and unpublished; repeats replay without calls or audits', async () => {
    let calls = 0;
    const h = inventoryHarness(async (value) => {
      calls++;
      return locationDecision(value, [], 'en', 'provider_unavailable');
    });
    assert.equal(
      (await h.service.submitSite(actor, 'org-test', 'site-test')).status,
      'pending_review',
    );
    assert.equal(
      (await h.service.submitSite(actor, 'org-test', 'site-test')).status,
      'pending_review',
    );
    assert.equal(h.audit.length, 1);
    assert.equal(calls, 1);
  });
  it('an explicit check of pending inventory automatically rejects a confirmed mismatch and retries replay it', async () => {
    let calls = 0;
    const h = inventoryHarness(async (value) => {
      calls++;
      return locationDecision(value, [{ ...precise, latitude: 6.46 }]);
    });
    h.site.status = 'pending_review';
    assert.equal(
      (await h.service.verifySiteLocation(actor, 'org-test', 'site-test')).status,
      'mismatch',
    );
    assert.equal(h.site.status, 'rejected');
    assert.match(String(h.site.rejectionReason), /Correct the address or pin/);
    assert.equal((h.audit[0] as { action: string }).action, 'inventory.site.rejected');
    assert.equal(
      (await h.service.verifySiteLocation(actor, 'org-test', 'site-test')).status,
      'mismatch',
    );
    assert.equal((await h.service.submitSite(actor, 'org-test', 'site-test')).status, 'rejected');
    assert.equal(calls, 1);
    assert.equal(h.audit.length, 1);
  });
  it('corrects legacy pending-review mismatch evidence without another provider call', async () => {
    let calls = 0;
    const h = inventoryHarness(async (value) => {
      calls++;
      return locationDecision(value, [precise]);
    });
    h.site.status = 'pending_review';
    h.site.locationVerification = locationDecision(input, [{ ...precise, latitude: 6.46 }]);
    await h.service.verifySiteLocation(actor, 'org-test', 'site-test');
    assert.equal(h.site.status, 'rejected');
    assert.equal(calls, 0);
    assert.equal(h.audit.length, 1);
  });
  it('rechecks readiness under the parent lock after a dated front disappears during geocoding', async () => {
    const h = inventoryHarness(async (value) => {
      h.setDatedFront(false);
      return locationDecision(value, [precise]);
    }, true);
    await assert.rejects(
      h.service.submitSite(actor, 'org-test', 'site-test'),
      /known capture date/,
    );
    assert.equal(h.site.status, 'draft');
    assert.equal(h.site.locationVerification, null);
    assert.equal(h.audit.length, 0);
    assert.equal(h.lockedFrontReads(), 1);
  });
  it('reads approval readiness through the locked transaction and prevents an incomplete listing', async () => {
    const h = inventoryHarness(async (value) => locationDecision(value, [precise]), true);
    h.site.status = 'pending_review';
    h.setDatedFront(false);
    await assert.rejects(
      h.service.approveSite(actor, undefined, 'site-test'),
      /known capture date/,
    );
    assert.equal(h.site.status, 'pending_review');
    assert.equal(h.audit.length, 0);
    assert.equal(h.lockedFrontReads(), 1);
  });
  it('does not persist a stale provider result after a pin was corrected during lookup', async () => {
    const h = inventoryHarness(async (value) => {
      h.site.latitude = 6.46;
      return locationDecision(value, [precise]);
    });
    await assert.rejects(h.service.submitSite(actor, 'org-test', 'site-test'), ConflictException);
    assert.equal(h.site.status, 'draft');
    assert.equal(h.site.locationVerification, null);
    assert.equal(h.audit.length, 0);
  });
  it('blocks cross-tenant checks before provider access and rolls back if audit persistence fails', async () => {
    let calls = 0;
    const h = inventoryHarness(async (value) => {
      calls++;
      return locationDecision(value, [precise]);
    });
    await assert.rejects(
      h.service.verifySiteLocation(actor, 'other-org', 'site-test'),
      ForbiddenException,
    );
    assert.equal(calls, 0);
    h.setAuditFails();
    await assert.rejects(h.service.submitSite(actor, 'org-test', 'site-test'), /audit unavailable/);
    assert.equal(h.site.status, 'draft');
    assert.equal(h.site.locationVerification, null);
    assert.equal(h.audit.length, 0);
  });
  it('saved check reuses the result during submit but never silently publishes matched inventory', async () => {
    let calls = 0;
    const h = inventoryHarness(async (value) => {
      calls++;
      return locationDecision(value, [precise]);
    });
    assert.equal(
      (await h.service.verifySiteLocation(actor, 'org-test', 'site-test')).status,
      'matched',
    );
    assert.equal(h.site.status, 'draft');
    assert.equal(
      (await h.service.submitSite(actor, 'org-test', 'site-test')).status,
      'pending_review',
    );
    assert.equal(calls, 1);
    assert.equal(h.audit.length, 2);
  });
  for (const reason of ['provider_unavailable', 'ambiguous_address', 'country_uncertain']) {
    it(`retains an aged confirmed mismatch through ${reason}, resubmission and approval attempts`, async () => {
      let calls = 0;
      const h = inventoryHarness(async (value) => {
        calls++;
        return locationDecision(value, [], 'en', reason);
      });
      const previous = locationDecision(input, [{ ...precise, latitude: 6.46 }]);
      previous.checkedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      h.site.status = 'rejected';
      h.site.locationVerification = previous;
      h.site.rejectionReason = previous.message;
      const result = await h.service.verifySiteLocation(actor, 'org-test', 'site-test', 'fr');
      assert.ok('inputFingerprint' in result);
      assert.equal(result.status, 'mismatch');
      assert.equal(result.checkedAt, previous.checkedAt);
      assert.equal(result.distanceMeters, previous.distanceMeters);
      assert.equal(result.lastAttempt?.reasonCode, reason);
      assert.equal(result.lastAttempt?.status, 'unable_to_verify');
      assert.ok(
        new Date(result.lastAttempt!.checkedAt).getTime() > new Date(previous.checkedAt).getTime(),
      );
      assert.match(result.lastAttempt!.message, /reste applicable/);
      assert.equal(h.site.status, 'rejected');
      assert.equal(h.site.rejectionReason, previous.message);
      const replay = await h.service.submitSite(actor, 'org-test', 'site-test');
      assert.equal(replay.status, 'rejected');
      assert.equal(replay.rejectionReason, previous.message);
      assert.equal(replay.locationVerification.lastAttempt?.reasonCode, reason);
      assert.match(
        replay.locationVerification.lastAttempt!.message,
        /previously confirmed mismatch still applies/,
      );
      await assert.rejects(h.service.approveSite(actor, undefined, 'site-test'), /mismatch/);
      assert.equal(h.site.status, 'rejected');
      assert.equal(calls, 1);
      assert.equal(h.audit.length, 1);
      assert.equal((h.audit[0] as { action: string }).action, 'inventory.site.updated');
    });
  }
  it('retains aged draft mismatch on an inconclusive submission instead of reopening review', async () => {
    const h = inventoryHarness(async (value) =>
      locationDecision(value, [], 'en', 'provider_unavailable'),
    );
    const previous = locationDecision(input, [{ ...precise, latitude: 6.46 }]);
    previous.checkedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    h.site.locationVerification = previous;
    const result = await h.service.submitSite(actor, 'org-test', 'site-test');
    assert.equal(result.status, 'rejected');
    assert.equal(result.locationVerification.status, 'mismatch');
    assert.equal(result.locationVerification.lastAttempt?.reasonCode, 'provider_unavailable');
    assert.match(result.rejectionReason!, /Correct the address or pin/);
    await assert.rejects(h.service.approveSite(actor, undefined, 'site-test'), /mismatch/);
    assert.equal(h.audit.length, 1);
  });
  it('uses the latest locked mismatch evidence when an inconclusive lookup finishes', async () => {
    const h = inventoryHarness(async (value) => {
      h.site.locationVerification = locationDecision(value, [{ ...precise, latitude: 6.46 }]);
      return locationDecision(value, [], 'en', 'provider_unavailable');
    });
    const result = await h.service.verifySiteLocation(actor, 'org-test', 'site-test');
    assert.ok('inputFingerprint' in result);
    assert.equal(result.status, 'mismatch');
    assert.equal(result.lastAttempt?.reasonCode, 'provider_unavailable');
    assert.equal((h.site.locationVerification as LocationVerification).status, 'mismatch');
  });
  it('a definitive subsequent match resolves evidence but requires resubmission and ordinary approval', async () => {
    const h = inventoryHarness(async (value) => locationDecision(value, [precise]));
    const previous = locationDecision(input, [{ ...precise, latitude: 6.46 }]);
    previous.checkedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    previous.lastAttempt = {
      status: 'unable_to_verify',
      reasonCode: 'provider_unavailable',
      checkedAt: new Date().toISOString(),
      provider: 'mapbox',
      message: 'Synthetic prior retry',
    };
    h.site.status = 'rejected';
    h.site.locationVerification = previous;
    h.site.rejectionReason = previous.message;
    const result = await h.service.verifySiteLocation(actor, 'org-test', 'site-test');
    assert.ok('inputFingerprint' in result);
    assert.equal(result.status, 'matched');
    assert.equal(result.lastAttempt, undefined);
    assert.equal(h.site.status, 'rejected');
    assert.equal(h.site.rejectionReason, previous.message);
    await assert.rejects(
      h.service.approveSite(actor, undefined, 'site-test'),
      /expected pending_review/,
    );
    assert.equal(
      (await h.service.submitSite(actor, 'org-test', 'site-test')).status,
      'pending_review',
    );
    assert.equal(h.site.status, 'pending_review');
    assert.equal(h.site.rejectionReason, null);
    assert.equal((await h.service.approveSite(actor, undefined, 'site-test')).status, 'listed');
    assert.equal(h.audit.length, 3);
  });
});
