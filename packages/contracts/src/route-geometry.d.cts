export interface RoutePoint {
  latitude: number;
  longitude: number;
}
export function decodeRoutePath(encoded: string): RoutePoint[] | null;
export function displayRoute(points: RoutePoint[]): RoutePoint[];
