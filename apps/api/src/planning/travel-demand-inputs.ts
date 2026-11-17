import type { TravelDemandPointDto } from './dto/travel-demand-shared.dto';
export interface DemandInputSource {
  layer: string;
  sourceKey: string;
  version: string;
  referenceYear: number;
  attribution: string;
  licenceUrl: string;
}
export interface DemandZone {
  id: number;
  residents: number | null;
  populationCoverage: number;
  roadPoint: TravelDemandPointDto | null;
  places: Record<string, number>;
  center?: TravelDemandPointDto;
  schoolCount?: number;
  selectedSchoolCount?: number;
}
export interface DemandContribution {
  homeZone: number;
  activityZone: number;
  category: string;
  direction: 'toward_places' | 'toward_home';
  mappedPlaces: number;
  localTimeFactor: number;
  weight: number;
}
