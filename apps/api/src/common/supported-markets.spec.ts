import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { findMarket, isWithinMarket, SUPPORTED_MARKETS } from './supported-markets';
import { plausibilityProblems } from '../inventory/inventory-validation';
import { derivePlanningRetrieval } from '../planning/planning-retrieval';
import { plainToInstance } from 'class-transformer';
import { CreateSiteDto, UpdateSiteDto, ListSitesQueryDto } from '../inventory/dto/inventory.dto';
import { MarketplaceQueryDto } from '../marketplace/dto/marketplace.dto';

test('five markets preserve canonical names, currency and French/ISO aliases', () => {
  assert.equal(SUPPORTED_MARKETS.length, 5);
  for (const market of SUPPORTED_MARKETS) {
    for (const alias of [market.code, market.name, market.labels.fr, ...market.aliases]) {
      assert.equal(findMarket(alias)?.name, market.name, alias);
    }
    assert.equal(isWithinMarket(market.center[1], market.center[0], market.name), true);
    assert.deepEqual(
      plausibilityProblems({
        country: market.labels.fr,
        latitude: market.center[1],
        longitude: market.center[0],
      }),
      [],
    );
    assert.ok(
      plausibilityProblems({ country: market.code, latitude: 45, longitude: 0 }).length > 0,
    );
  }
  assert.equal(findMarket('Côte d’Ivoire')?.currency, 'XOF');
  assert.equal(findMarket('Bénin')?.currency, 'XOF');
  assert.equal(findMarket('Cameroun')?.currency, 'XAF');
  assert.equal(findMarket('unknown'), undefined);
});

test('French market discovery identifies Benin and Ivory Coast without inventing a single choice', () => {
  assert.deepEqual(
    derivePlanningRetrieval({ message: 'Panneaux à Cotonou au Bénin' }).provider.queries,
    [{ city: 'Cotonou', country: 'Benin' }],
  );
  assert.deepEqual(
    derivePlanningRetrieval({ message: 'Panneaux à Abidjan en Côte d’Ivoire' }).provider.queries,
    [{ city: 'Abidjan', country: "Côte d'Ivoire" }],
  );
  const alternatives = derivePlanningRetrieval({ message: 'Bénin ou Côte d’Ivoire' });
  assert.ok(alternatives.provider.needsConfirmation.includes('geography'));
});

test('registration, correction and discovery use the same canonical country aliases', () => {
  assert.equal(plainToInstance(CreateSiteDto, { country: 'Bénin' }).country, 'Benin');
  assert.equal(plainToInstance(UpdateSiteDto, { country: 'Cameroun' }).country, 'Cameroon');
  assert.equal(plainToInstance(ListSitesQueryDto, { country: 'CI' }).country, "Côte d'Ivoire");
  assert.equal(
    plainToInstance(MarketplaceQueryDto, { country: 'Côte d’Ivoire' }).country,
    "Côte d'Ivoire",
  );
});
