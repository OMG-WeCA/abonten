import { DataSource } from 'typeorm';
import { RateCardEntity } from '../common/entities/rate-card.entity';
import { IDS } from './seed-ids';
import { siteCurrency } from './billboard-sites.seed';

// One rate card per site, currency by country, with day/week/month rates.
const RATE_CARDS = [
  { id: IDS.rateCard.ikorodu, siteId: IDS.site.ikorodu, country: 'Nigeria', perDay: 75000, perWeek: 450000, perMonth: 1500000 },
  { id: IDS.rateCard.lekkiepe, siteId: IDS.site.lekkiepe, country: 'Nigeria', perDay: 220000, perWeek: 1300000, perMonth: 4500000 },
  { id: IDS.rateCard.victoria, siteId: IDS.site.victoria, country: 'Nigeria', perDay: 300000, perWeek: 1800000, perMonth: 6000000 },
  { id: IDS.rateCard.ikeja, siteId: IDS.site.ikeja, country: 'Nigeria', perDay: 60000, perWeek: 360000, perMonth: 1200000 },
  { id: IDS.rateCard.apapa, siteId: IDS.site.apapa, country: 'Nigeria', perDay: 55000, perWeek: 330000, perMonth: 1100000 },
  { id: IDS.rateCard.graphic, siteId: IDS.site.graphic, country: 'Ghana', perDay: 1200, perWeek: 7200, perMonth: 24000 },
  { id: IDS.rateCard.spintex, siteId: IDS.site.spintex, country: 'Ghana', perDay: 2000, perWeek: 12000, perMonth: 40000 },
  { id: IDS.rateCard.liberation, siteId: IDS.site.liberation, country: 'Ghana', perDay: 900, perWeek: 5400, perMonth: 18000 },
  { id: IDS.rateCard.bliberte, siteId: IDS.site.bliberte, country: 'Cameroon', perDay: 75000, perWeek: 450000, perMonth: 1500000 },
  { id: IDS.rateCard.akwa, siteId: IDS.site.akwa, country: 'Cameroon', perDay: 180000, perWeek: 1080000, perMonth: 3600000 },
];

const EFFECTIVE_FROM = new Date('2025-01-01T00:00:00Z');

export async function seedRateCards(ds: DataSource): Promise<void> {
  const repo = ds.getRepository(RateCardEntity);
  for (const r of RATE_CARDS) {
    await repo.save(
      repo.create({
        id: r.id,
        organizationId: IDS.org.accraOutdoor,
        siteId: r.siteId,
        currency: siteCurrency(r.country),
        rates: { perDay: r.perDay, perWeek: r.perWeek, perMonth: r.perMonth },
        minBookingDays: r.siteId === IDS.site.apapa ? 7 : null,
        seasonalRules: null,
        effectiveFrom: EFFECTIVE_FROM,
      }),
    );
  }
  console.log(`  rate cards: ${RATE_CARDS.length}`);
}
