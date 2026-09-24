import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { DatabaseService } from '../common/database.service';
import { MarketplaceService } from './marketplace.service';

/**
 * Marketplace demo-data suppression (execution plan §1.4.1, SPEC §5.1):
 * seeded demo-class metadata (fictional traffic counts, audience demographics,
 * visibility scores) must never reach planner/buyer surfaces — neither the
 * search key-metadata aggregate nor the buyer detail metadata array. The
 * in-memory harness honors the predicate it finds in the service's SQL, so
 * removing the filter from the query fails these tests with demo data present.
 */

type Row = Record<string, unknown>;

class MarketplaceMemRepo {
  constructor(
    private readonly sites: Row[],
    private readonly metadata: Row[],
    private readonly faces: Row[] = [],
    private readonly assets: Row[] = [],
    private readonly rateCards: Row[] = [],
  ) {}

  async find({ where }: { where?: Record<string, unknown> } = {}): Promise<Row[]> {
    if (!where) return [...this.table()];
    return this.table().filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
  }

  private table(): Row[] {
    return [...this.sites, ...this.faces, ...this.assets, ...this.metadata, ...this.rateCards];
  }

  /** Honors data_class predicates found in the SQL; includes demo rows otherwise. */
  private filtered(sql: string, rows: Row[]): Row[] {
    // The predicate must appear inside the metadata query itself (subselect or
    // WHERE). Anything else means demo rows flow to planners.
    const predicate = /data_class\s+IS\s+NULL\s+OR\s+data_class\s+<>\s*'demo'/i;
    if (predicate.test(sql)) return rows.filter((r) => (r.dataClass ?? 'production') !== 'demo');
    return rows;
  }

  async query(sql: string, params: unknown[]): Promise<Row[]> {
    const s = sql.replace(/\s+/g, ' ').trim();
    // Buyer-detail site row (SITE_COLUMNS projection).
    if (/FROM billboard_sites WHERE id = \$1/.test(s)) {
      return this.sites.filter((r) => r.id === params[0]).map((r) => structuredClone(r));
    }
    // Search rows: extract the keyMetadata subselect and apply its predicate.
    // The subselect is correlated to s.id, not to a query param.
    if (/jsonb_object_agg\(dimension, payload\)/.test(s)) {
      const sub = s.slice(s.indexOf('(SELECT jsonb_object_agg'), s.indexOf('AS "keyMetadata"'));
      const rows = this.metadata.map((r) => structuredClone(r));
      const kept = this.filtered(sub, rows);
      const agg: Record<string, unknown> = {};
      for (const row of kept) agg[row.dimension as string] = row.payload;
      const site = this.sites.find((r) => r.status === 'listed');
      return [
        {
          ...structuredClone(site),
          faceCount: this.faces.filter((r) => r.siteId === params[0]).length,
          keyMetadata: JSON.stringify(agg),
          thumbnail: null,
        },
      ];
    }
    // Buyer-detail metadata read (production filter lives in the SQL).
    if (/FROM site_metadata WHERE site_id = \$1/.test(s)) {
      const rows = this.metadata
        .filter((r) => r.siteId === params[0])
        .map((r) => structuredClone(r));
      return this.filtered(s, rows).map((r) => {
        const camel: Row = {};
        for (const [k, v] of Object.entries(r)) camel[k] = v;
        return camel;
      });
    }
    // Count query for pagination.
    if (/SELECT count\(\*\)::int/.test(s)) {
      return [{ c: this.sites.length }];
    }
    throw new Error(`Unexpected query: ${s}`);
  }
}

function buildHarness(): { service: MarketplaceService; sites: Row[]; metadata: Row[] } {
  const sites: Row[] = [
    {
      id: 'site-listed',
      code: 'LKI-001',
      name: 'Listed Fixture',
      type: 'billboard',
      format: 'static',
      city: 'Lagos',
      country: 'Nigeria',
      status: 'listed',
    },
  ];
  const metadata: Row[] = [
    {
      id: 'meta-production',
      siteId: 'site-listed',
      dimension: 'traffic',
      payload: { aadt: 12000, source: 'partner survey 2026' },
      dataClass: 'production',
    },
    {
      id: 'meta-demo',
      siteId: 'site-listed',
      dimension: 'audience',
      payload: { demographic: 'invented fiction' },
      dataClass: 'demo',
    },
    {
      id: 'meta-legacy',
      siteId: 'site-listed',
      dimension: 'visibility',
      payload: { score: 0.8 },
      dataClass: null, // pre-migration rows count as production
    },
  ];
  const harness = new MarketplaceMemRepo(sites, metadata);
  const repoFor = async (_target: unknown) => harness;
  const db = { repo: repoFor } as unknown as DatabaseService;
  const service = new MarketplaceService(db);
  return { service, sites, metadata };
}

const query = { page: 1, limit: 10 } as never;

describe('marketplace demo-data suppression (§1.4.1)', () => {
  it('search keyMetadata aggregates production rows only — demo fiction never reaches planners', async () => {
    const { service } = buildHarness();
    const result = await service.search(query);
    assert.equal(result.items.length, 1);
    const agg = JSON.parse(result.items[0].keyMetadata as string) as Record<string, unknown>;
    assert.deepEqual(Object.keys(agg).sort(), ['traffic', 'visibility']);
    assert.equal(agg['audience'], undefined);
    // The fictional demo payload must not leak through the aggregate either.
    assert.equal(JSON.stringify(agg).includes('invented fiction'), false);
  });

  it('buyer detail metadata excludes demo rows while keeping legacy unclassified rows', async () => {
    const { service } = buildHarness();
    const site = await service.getMarketplaceSite('site-listed');
    const dims = (site.metadata as Array<{ dimension: string }>).map((m) => m.dimension).sort();
    assert.deepEqual(dims, ['traffic', 'visibility']);
    assert.equal(
      (site.metadata as Array<Record<string, unknown>>).some((m) => m.dataClass === 'demo'),
      false,
    );
  });
});
