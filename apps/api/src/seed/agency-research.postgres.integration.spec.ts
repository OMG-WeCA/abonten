import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source';
import { DatabaseService } from '../common/database.service';
import { MarketplaceService } from '../marketplace/marketplace.service';
import { InventoryService } from '../inventory/inventory.service';
import { GeographicContextService } from '../enrichment/geographic-context.service';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import type { StorageService } from '../common/storage.service';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { PlanningService } from '../planning/planning.service';
import { OpenAiPlannerProvider } from '../planning/openai-planner.provider';
import { AgencyResearchInventoryScope1760000006000 } from '../migrations/1760000006000-AgencyResearchInventoryScope';
import {
  importAgencyResearch,
  parseResearchManifest,
  RESEARCH_AGENCY_ID,
  RESEARCH_AGENCY_NAME,
} from './agency-research.import';
const url = process.env.POSTGRES_INTEGRATION_URL;
const foreignOrg = randomUUID(),
  platformOrg = randomUUID(),
  userId = randomUUID();
const manifest = {
  version: 'research-qa-v1',
  records: [
    {
      key: 'research-qa',
      name: 'Source-qualified reference',
      address: 'CMS Marina',
      city: 'Lagos',
      region: 'Lagos State',
      country: 'Nigeria',
      format: 'digital_led',
      latitude: 6.450732,
      longitude: 3.389668,
      width: 15.36,
      height: 6.72,
      provenance: {
        publisher: 'Elev8 Media',
        operatorName: 'Elev8 Media',
        siteSourceUrl: 'https://elev8.com.ng/king-of-marina/',
        accessedAt: '2026-10-07T00:00:00Z',
        coordinateVerification: 'operator_published_not_field_verified',
        dimensionsUnit: 'm',
        askingPrice: {
          amount: 4500000,
          currency: 'NGN',
          period: 'month',
          sourceUrl: 'https://elev8mediabookings.com/',
          accessedAt: '2026-10-07T00:00:00Z',
          qualification: 'published_indicative',
        },
        unknowns: [
          'availability',
          'LED slot duration',
          'taxes',
          'production',
          'permits',
          'traffic',
        ],
      },
    },
  ],
};
const options = {
  organizationId: RESEARCH_AGENCY_ID,
  expectedName: RESEARCH_AGENCY_NAME,
  manifest,
};
it('rejects incomplete, invented or unbounded source facts before database access', () => {
  assert.throws(() =>
    parseResearchManifest({ ...manifest, records: [{ ...manifest.records[0], latitude: null }] }),
  );
  assert.throws(() =>
    parseResearchManifest({
      ...manifest,
      records: [
        {
          ...manifest.records[0],
          provenance: {
            ...manifest.records[0]!.provenance,
            askingPrice: { ...manifest.records[0]!.provenance.askingPrice, period: 'day' },
          },
        },
      ],
    }),
  );
  assert.throws(() =>
    parseResearchManifest({
      ...manifest,
      records: [
        {
          ...manifest.records[0],
          provenance: { ...manifest.records[0]!.provenance, traffic: 123456 },
        },
      ],
    }),
  );
  assert.throws(() =>
    parseResearchManifest({
      ...manifest,
      records: [
        {
          ...manifest.records[0],
          provenance: { ...manifest.records[0]!.provenance, siteSourceUrl: 'javascript:alert(1)' },
        },
      ],
    }),
  );
});
it(
  'research import is isolated, insert-only, inert and model-grounded without invented quotes',
  { skip: !url },
  async () => {
    const schema = `research_${randomUUID().replaceAll('-', '')}`;
    const db = new DataSource({
      type: 'postgres',
      entities: AppDataSource.options.entities,
      migrations: AppDataSource.options.migrations,
      url,
      schema,
      logging: false,
      extra: { options: `-c search_path=${schema},public`, max: 4 },
    });
    await db.initialize();
    try {
      await db.query(`CREATE SCHEMA "${schema}"`);
      await db.runMigrations();
      for (const [id, name, type] of [
        [RESEARCH_AGENCY_ID, RESEARCH_AGENCY_NAME, 'agency'],
        [foreignOrg, 'Other QA agency', 'agency'],
        [platformOrg, 'QA platform', 'platform'],
      ])
        await db.query(
          "INSERT INTO organizations(id,name,type,country) VALUES($1,$2,$3,'Nigeria')",
          [id, name, type],
        );
      await db.query(
        "INSERT INTO users(id,email,name) VALUES($1,'research-qa@example.test','QA actor')",
        [userId],
      );
      for (const [org, role] of [
        [RESEARCH_AGENCY_ID, 'planner'],
        [foreignOrg, 'planner'],
        [platformOrg, 'platform_admin'],
      ])
        await db.query(
          "INSERT INTO memberships(user_id,organization_id,role,status) VALUES($1,$2,$3,'active')",
          [userId, org, role],
        );
      const dry = await importAgencyResearch(db, options);
      assert.deepEqual(dry.inserted, { sites: 0, faces: 0, audits: 0 });
      assert.equal((await db.query('SELECT count(*)::int n FROM billboard_sites'))[0].n, 0);
      const first = await importAgencyResearch(db, { ...options, apply: true });
      assert.deepEqual(first.inserted, { sites: 1, faces: 1, audits: 2 });
      assert.deepEqual((await importAgencyResearch(db, { ...options, apply: true })).inserted, {
        sites: 0,
        faces: 0,
        audits: 0,
      });
      for (const table of [
        'rate_cards',
        'site_assets',
        'site_metadata',
        'personal_planning_drafts',
        'bookings',
      ])
        assert.equal((await db.query(`SELECT count(*)::int n FROM ${table}`))[0].n, 0);
      const database = new DatabaseService(db),
        market = new MarketplaceService(database),
        inventory = new InventoryService(
          database,
          new CapabilityResolverService(),
          {} as StorageService,
        ),
        geographic = new GeographicContextService(database, inventory);
      const planning = new PlanningService(database, market, undefined, undefined, geographic),
        actor = {
          userId,
          email: 'research-qa@example.test',
          sessionVersion: 0,
        } as AuthenticatedUser;
      const { id, faceId } = first.boards[0]!;
      for (const org of [foreignOrg, platformOrg, undefined]) {
        assert.equal(
          (
            await market.search(
              { limit: 100, startDate: '2026-11-01', endDate: '2026-12-01' },
              undefined,
              org,
            )
          ).total,
          0,
        );
        await assert.rejects(market.getMarketplaceSite(id, undefined, org), NotFoundException);
        await assert.rejects(inventory.assertCanReadSite(actor, org, id), NotFoundException);
        await assert.rejects(geographic.getSiteContext(actor, org, id), NotFoundException);
        await assert.rejects(
          planning.siteOptions(id, { startDate: '2026-11-01', endDate: '2026-12-01' }, org),
          NotFoundException,
        );
      }
      const search = await market.search(
        { limit: 100, startDate: '2026-11-01', endDate: '2026-12-01' },
        undefined,
        RESEARCH_AGENCY_ID,
      );
      assert.equal(search.total, 1);
      assert.equal(search.items[0]!.isResearchReference, true);
      assert.equal(search.items[0]!.startingPrice, null);
      const detail = await market.getMarketplaceSite(id, undefined, RESEARCH_AGENCY_ID);
      assert.equal(detail.isDemo, false);
      assert.equal(detail.isResearchReference, true);
      assert.equal(detail.commerciallyBookable, false);
      assert.equal(detail.faces[0]!.bookable, false);
      assert.equal(detail.faces[0]!.spotLengthSeconds, null);
      assert.ok(!('researchAgencyId' in detail) && !('research_agency_id' in detail));
      const siteOptions = await planning.siteOptions(
        id,
        { startDate: '2026-11-01', endDate: '2026-12-01' },
        RESEARCH_AGENCY_ID,
      );
      assert.equal(siteOptions.availabilityKind, 'research_unconfirmed');
      assert.equal(siteOptions.faces[0]!.available, null);
      const context = await geographic.getSiteContext(actor, RESEARCH_AGENCY_ID, id);
      assert.equal(context.traffic.value, null);
      assert.match(context.disclaimer, /not field verified/);
      for (const action of [
        () =>
          inventory.updateSite(actor, RESEARCH_AGENCY_ID, id, { name: 'Impersonated operator' }),
        () =>
          inventory.addFace(actor, RESEARCH_AGENCY_ID, id, {
            faceLabel: 'Fake',
            width: 1,
            height: 1,
            area: 1,
            units: 'm',
          }),
        () => inventory.suspendSite(actor, platformOrg, id),
        () => inventory.approveSite(actor, platformOrg, id),
        () => inventory.verifySiteLocation(actor, RESEARCH_AGENCY_ID, id),
      ])
        await assert.rejects(action, ForbiddenException);
      const dto = {
        message: 'Compare public-source monthly baseline, not a quote',
        context: {
          selectedSiteIds: [id],
          selectedFaceIds: [faceId],
          window: { startDate: '2026-11-01', endDate: '2026-12-01' },
          budget: { amount: 22000000, currency: 'NGN' },
        },
      };
      const local = await planning.plan(dto, { userId, user: actor, orgId: RESEARCH_AGENCY_ID });
      const site = local.facts.sites[0]!;
      assert.equal(site.faces[0]!.availability, 'unknown');
      assert.equal(site.faces[0]!.flightEligible, null);
      assert.equal(site.faces[0]!.estimate.status, 'unavailable');
      assert.equal(site.budgetMatch, 'unknown');
      assert.equal(site.researchProvenance!.askingPrice!.amount, 4500000);
      assert.equal(local.facts.budget.fit, 'unknown');
      assert.deepEqual(local.facts.budget.totals, {});
      assert.equal(local.facts.ots, null);
      assert.equal(local.facts.reach, null);
      const truncated = await planning.plan(
        { ...dto, context: { ...dto.context, selectionTruncated: true } },
        { userId, user: actor, orgId: RESEARCH_AGENCY_ID },
      );
      assert.equal(
        truncated.facts.researchPrices.unquotedReserve,
        null,
        'Omitted selections cannot yield a full-budget reserve',
      );
      let snapshot: unknown;
      const provider = {
        configured: true,
        admit: () => ({ release: () => {} }),
        complete: async (input: { snapshot: unknown }) => {
          snapshot = input.snapshot;
          return {
            message: 'Research interest; quote and availability require confirmation.',
            recommendations: [{ siteId: id, faceId, reason: 'Published monthly rate' }],
            questions: [],
          };
        },
      } as unknown as OpenAiPlannerProvider;
      const modelPlanning = new PlanningService(database, market, provider);
      const result = await modelPlanning.plan(dto, {
        userId,
        user: actor,
        orgId: RESEARCH_AGENCY_ID,
      });
      assert.equal(result.recommendations.length, 1);
      assert.match(JSON.stringify(snapshot), /published_indicative/);
      assert.match(JSON.stringify(snapshot), /operator_published_not_field_verified/);
      assert.match(JSON.stringify(snapshot), /agency_curated_reference/);
      await assert.rejects(
        planning.plan(dto, { userId, user: actor, orgId: foreignOrg }),
        BadRequestException,
      );
      await assert.rejects(
        importAgencyResearch(db, {
          ...options,
          apply: true,
          manifest: { ...manifest, records: [{ ...manifest.records[0], name: 'Changed source' }] },
        }),
      );
      const collisionBefore = (await db.query('SELECT count(*)::int n FROM audit_logs'))[0].n;
      assert.equal(collisionBefore, 2);
      const runner = db.createQueryRunner();
      try {
        await new AgencyResearchInventoryScope1760000006000().down(runner);
      } finally {
        await runner.release();
      }
      assert.equal(
        (await db.query('SELECT status FROM billboard_sites WHERE id=$1', [id]))[0].status,
        'draft',
      );
    } finally {
      await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await db.destroy();
    }
  },
);
