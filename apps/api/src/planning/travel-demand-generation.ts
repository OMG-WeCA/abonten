import { BadRequestException } from '@nestjs/common';
import type { DemandContribution, DemandZone } from './travel-demand-inputs';
import type { TravelDemandPointDto } from './dto/travel-demand-shared.dto';
import { DEMAND_CATEGORIES } from './travel-demand-geography';
import { coordinate } from './travel-demand-model';

type Category = (typeof DEMAND_CATEGORIES)[number];
type Daypart =
  'weekday_morning' | 'weekday_daytime' | 'weekday_evening' | 'weekend_daytime' | 'overnight';
type Factors = readonly [towardPlaces: number, towardHome: number];
// Each row gives relative timing assumptions for one mapped purpose, not visit measurements.
const PROFILE: Record<Category, Record<Daypart, Factors>> = {
  business: {
    weekday_morning: [4, 0.3],
    weekday_daytime: [1, 1],
    weekday_evening: [0.4, 4],
    weekend_daytime: [0.4, 0.4],
    overnight: [0.1, 0.1],
  },
  education: {
    weekday_morning: [4, 0.3],
    weekday_daytime: [0.7, 1.8],
    weekday_evening: [0.2, 2.6],
    weekend_daytime: [0.3, 0.3],
    overnight: [0.05, 0.05],
  },
  shopping: {
    weekday_morning: [0.8, 0.3],
    weekday_daytime: [2, 1.5],
    weekday_evening: [2, 2.2],
    weekend_daytime: [3.2, 2.8],
    overnight: [0.15, 0.2],
  },
  food_and_drink: {
    weekday_morning: [0.7, 0.3],
    weekday_daytime: [1.6, 1.3],
    weekday_evening: [2.7, 2.5],
    weekend_daytime: [2.5, 2.2],
    overnight: [0.3, 0.5],
  },
  healthcare: {
    weekday_morning: [1.3, 0.7],
    weekday_daytime: [1.2, 1.2],
    weekday_evening: [0.6, 0.8],
    weekend_daytime: [0.7, 0.7],
    overnight: [0.25, 0.25],
  },
  transport: {
    weekday_morning: [1.8, 0.8],
    weekday_daytime: [1.2, 1.2],
    weekday_evening: [1.2, 1.8],
    weekend_daytime: [1.2, 1.2],
    overnight: [0.3, 0.3],
  },
  leisure: {
    weekday_morning: [0.4, 0.3],
    weekday_daytime: [1, 1],
    weekday_evening: [1.8, 2],
    weekend_daytime: [3, 2.7],
    overnight: [0.1, 0.3],
  },
  tourism: {
    weekday_morning: [0.5, 0.3],
    weekday_daytime: [1.4, 1.2],
    weekday_evening: [0.7, 1.4],
    weekend_daytime: [2.8, 2.4],
    overnight: [0.1, 0.2],
  },
  religious: {
    weekday_morning: [0.6, 0.5],
    weekday_daytime: [0.6, 0.6],
    weekday_evening: [1.2, 1.2],
    weekend_daytime: [2.5, 2.5],
    overnight: [0.05, 0.05],
  },
};

export function daypartAt(instant: Date, timeZone: string): Daypart {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'short',
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(instant);
  } catch {
    throw new BadRequestException('Provide a valid departure time and local IANA time zone.');
  }
  const hour = Number(parts.find(({ type }) => type === 'hour')!.value);
  const day = parts.find(({ type }) => type === 'weekday')!.value;
  if (hour < 6 || hour >= 22) return 'overnight';
  if (day === 'Sat' || day === 'Sun') return 'weekend_daytime';
  if (hour < 10) return 'weekday_morning';
  return hour < 16 ? 'weekday_daytime' : 'weekday_evening';
}

function distance(a: TravelDemandPointDto, b: TravelDemandPointDto) {
  const scale = Math.cos((((a.latitude + b.latitude) / 2) * Math.PI) / 180);
  return 111.195 * Math.hypot(a.latitude - b.latitude, (a.longitude - b.longitude) * scale);
}

interface CandidatePair {
  id: string;
  originZone: number;
  destinationZone: number;
  origin: TravelDemandPointDto;
  destination: TravelDemandPointDto;
  distanceKm: number;
  demandWeight: number;
  contributions: DemandContribution[];
}

export function generatePairs(zones: DemandZone[], daypart: Daypart): CandidatePair[] {
  const eligible = zones.filter((zone) => zone.roadPoint !== null);
  const pairs = new Map<string, CandidatePair>();
  for (const home of eligible) {
    if (home.residents === null || home.residents <= 0) continue;
    for (const activity of eligible) {
      if (
        home.id === activity.id ||
        coordinate(home.roadPoint!) === coordinate(activity.roadPoint!)
      )
        continue;
      const distanceKm = distance(home.roadPoint!, activity.roadPoint!);
      const distanceFactor = 1 / (1 + distanceKm / 3) ** 2;
      for (const category of DEMAND_CATEGORIES) {
        const mappedPlaces = activity.places[category];
        if (!mappedPlaces) continue;
        const factors = PROFILE[category][daypart];
        for (const towardHome of [false, true]) {
          const from = towardHome ? activity : home;
          const to = towardHome ? home : activity;
          const id = `zone-${from.id}-to-${to.id}`;
          const localTimeFactor = factors[towardHome ? 1 : 0];
          const weight =
            home.residents * Math.sqrt(mappedPlaces) * localTimeFactor * distanceFactor;
          const pair = pairs.get(id) ?? {
            id,
            originZone: from.id,
            destinationZone: to.id,
            origin: from.roadPoint!,
            destination: to.roadPoint!,
            distanceKm,
            demandWeight: 0,
            contributions: [],
          };
          pair.demandWeight += weight;
          pair.contributions.push({
            homeZone: home.id,
            activityZone: activity.id,
            category,
            direction: towardHome ? 'toward_home' : 'toward_places',
            mappedPlaces,
            localTimeFactor,
            weight,
          });
          pairs.set(id, pair);
        }
      }
    }
  }
  return [...pairs.values()].sort(
    (a, b) => b.demandWeight - a.demandWeight || a.id.localeCompare(b.id),
  );
}
