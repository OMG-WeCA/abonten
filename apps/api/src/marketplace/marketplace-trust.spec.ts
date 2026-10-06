import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { HttpException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { BillboardSiteEntity } from '../common/entities/billboard-site.entity';
import { SiteFaceEntity } from '../common/entities/site-face.entity';
import { SiteAssetEntity } from '../common/entities/site-asset.entity';
import { SiteMetadataEntity } from '../common/entities/site-metadata.entity';
import { RateCardEntity } from '../common/entities/rate-card.entity';
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
    private readonly source: 'sites' | 'faces' | 'assets' | 'metadata' | 'rates' = 'sites',
  ) {}

  async find({ where }: { where?: Record<string, unknown> } = {}): Promise<Row[]> {
    if (!where) return [...this.table()];
    return this.table().filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
  }

  private table(): Row[] {
    return {
      sites: this.sites,
      faces: this.faces,
      assets: this.assets,
      metadata: this.metadata,
      rates: this.rateCards,
    }[this.source];
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

function buildHarness(): {
  service: MarketplaceService;
  sites: Row[];
  metadata: Row[];
  assets: Row[];
} {
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
  const faces: Row[] = [{ id: 'face-1', siteId: 'site-listed', bookable: true }];
  const assets: Row[] = [
    { id: 'asset-1', siteId: 'site-listed', kind: 'front', capturedAt: '2026-10-01T09:00:00Z' },
  ];
  const rateCards: Row[] = [
    {
      id: 'rate-1',
      siteId: 'site-listed',
      faceId: null,
      effectiveFrom: new Date('2020-01-01'),
      rates: { perDay: 100 },
      currency: 'NGN',
    },
  ];
  const repoFor = async (target: unknown) => {
    const source: 'sites' | 'faces' | 'assets' | 'metadata' | 'rates' =
      target === SiteFaceEntity
        ? 'faces'
        : target === SiteAssetEntity
          ? 'assets'
          : target === SiteMetadataEntity
            ? 'metadata'
            : target === RateCardEntity
              ? 'rates'
              : target === BillboardSiteEntity
                ? 'sites'
                : 'sites';
    return new MarketplaceMemRepo(sites, metadata, faces, assets, rateCards, source);
  };
  const db = { repo: repoFor } as unknown as DatabaseService;
  const service = new MarketplaceService(db);
  return { service, sites, metadata, assets };
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

  it('does not serve a listed legacy site without a front photo as ready inventory', async () => {
    const { service, assets } = buildHarness();
    assets.length = 0;
    await assert.rejects(() => service.getMarketplaceSite('site-listed'), NotFoundException);
  });
  it('does not serve an undated front photo as ready buyer inventory', async () => {
    const { service, assets } = buildHarness();
    assets[0].capturedAt = null;
    await assert.rejects(() => service.getMarketplaceSite('site-listed'), NotFoundException);
  });
});

describe('marketplace detail cancellation boundaries', () => {
  it('does not start face, asset, metadata or rate reads after cancellation during the initial site query', async () => {
    const abort = new AbortController();
    const acquired: unknown[] = [];
    let reads = 0;
    let finish: (rows: object[]) => void = () => {};
    const db = {
      async repo(entity: unknown) {
        acquired.push(entity);
        return {
          async query() {
            reads++;
            return new Promise<object[]>((resolve) => {
              finish = resolve;
            });
          },
        };
      },
    } as unknown as DatabaseService;
    const market = new MarketplaceService(db);
    const pending = market.getMarketplaceSite('abcdefab-0000-4000-8000-000000000001', abort.signal);
    await new Promise((resolve) => setImmediate(resolve));
    abort.abort();
    finish([{ id: 'abcdefab-0000-4000-8000-000000000001', status: 'listed' }]);
    await assert.rejects(
      pending,
      (error: unknown) => error instanceof HttpException && error.getStatus() === 499,
    );
    assert.deepEqual(acquired, [BillboardSiteEntity]);
    assert.equal(reads, 1);
    await assert.rejects(
      market.getMarketplaceSite('site-listed', abort.signal),
      (error: unknown) => error instanceof HttpException && error.getStatus() === 499,
    );
    assert.equal(reads, 1);
    assert.equal(acquired.length, 1);
  });

  it('does not start secondary reads after cancellation while their repositories are acquired', async () => {
    const abort = new AbortController();
    let secondaryReads = 0;
    const waiting: Array<(repository: object) => void> = [];
    const db = {
      async repo(entity: unknown) {
        if (entity === BillboardSiteEntity)
          return {
            async query() {
              return [{ id: 'site-listed', status: 'listed' }];
            },
          };
        return new Promise<object>((resolve) => {
          waiting.push(resolve);
        });
      },
    } as unknown as DatabaseService;
    const pending = new MarketplaceService(db).getMarketplaceSite('site-listed', abort.signal);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(waiting.length, 4);
    abort.abort();
    for (const finish of waiting)
      finish({
        async find() {
          secondaryReads++;
          return [];
        },
        async query() {
          secondaryReads++;
          return [];
        },
      });
    await assert.rejects(
      pending,
      (error: unknown) => error instanceof HttpException && error.getStatus() === 499,
    );
    assert.equal(secondaryReads, 0);
  });
  it('does not start the search count after cancellation during candidate rows', async () => {
    const abort = new AbortController();
    let reads = 0;
    let finish: (rows: object[]) => void = () => {};
    const db = {
      async repo() {
        return {
          async query() {
            reads++;
            return new Promise<object[]>((resolve) => {
              finish = resolve;
            });
          },
        };
      },
    } as unknown as DatabaseService;
    const pending = new MarketplaceService(db).search({ limit: 8 }, abort.signal);
    await new Promise((resolve) => setImmediate(resolve));
    abort.abort();
    finish([]);
    await assert.rejects(
      pending,
      (error: unknown) => error instanceof HttpException && error.getStatus() === 499,
    );
    assert.equal(reads, 1);
  });
});
