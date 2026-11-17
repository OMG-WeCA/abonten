import type { TravelDemandPointDto } from './dto/travel-demand-shared.dto';

export function coordinate(point: TravelDemandPointDto): string {
  const longitude = Number(point.longitude.toFixed(6));
  const latitude = Number(point.latitude.toFixed(6));
  return `${longitude === 180 ? -180 : longitude},${latitude}`;
}

export function inverseDurationShares(seconds: number[]): number[] {
  const fastest = Math.min(...seconds);
  const preferences = seconds.map((duration) => fastest / duration);
  const total = preferences.reduce((sum, preference) => sum + preference, 0);
  return preferences.map((preference) => preference / total);
}
