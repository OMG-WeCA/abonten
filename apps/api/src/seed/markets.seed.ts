import { DataSource } from 'typeorm';
import { MarketEntity } from '../common/entities/market.entity';
import { IDS } from './seed-ids';

/**
 * Market/zone reference data (SPEC §5.1 "market/zone"): the city-level zones
 * planners browse inventory by. Realistic WeCA launch geography; idempotent
 * upserts by deterministic id.
 */
const MARKETS = [
  { id: IDS.market.lagosMainland, name: 'Lagos Mainland', country: 'Nigeria' },
  { id: IDS.market.lagosIsland, name: 'Lagos Island', country: 'Nigeria' },
  { id: IDS.market.abujaFct, name: 'Abuja FCT', country: 'Nigeria' },
  { id: IDS.market.accraMetro, name: 'Accra Metro', country: 'Ghana' },
  { id: IDS.market.kumasiMetro, name: 'Kumasi Metro', country: 'Ghana' },
  { id: IDS.market.doualaMetro, name: 'Douala Metro', country: 'Cameroon' },
  { id: IDS.market.portHarcourt, name: 'Port Harcourt', country: 'Nigeria' },
  { id: IDS.market.cotonouMetro, name: 'Cotonou', country: 'Benin' },
  { id: IDS.market.abidjanMetro, name: 'Abidjan', country: "Côte d'Ivoire" },
];

export async function seedMarkets(ds: DataSource): Promise<void> {
  const repo = ds.getRepository(MarketEntity);
  for (const market of MARKETS) {
    await repo.save(repo.create(market));
  }
  console.log(`  markets: ${MARKETS.length}`);
}
