import type { Bounds } from '../registry';
export type Position = [number, number];
export type Polygon = { type: 'Polygon'; coordinates: Position[][] };
export type MultiPolygon = { type: 'MultiPolygon'; coordinates: Position[][][] };
export type Geometry =
  | Polygon
  | MultiPolygon
  | { type: 'Point'; coordinates: Position }
  | { type: 'LineString'; coordinates: Position[] }
  | { type: 'MultiLineString'; coordinates: Position[][] };
export type Coverage = Polygon | MultiPolygon;
export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
export function validateBounds(value: readonly number[]): Bounds {
  if (
    value.length !== 4 ||
    value.some((n) => !Number.isFinite(n)) ||
    value[0] < -180 ||
    value[2] > 180 ||
    value[1] < -90 ||
    value[3] > 90 ||
    value[0] >= value[2] ||
    value[1] >= value[3]
  ) {
    throw new Error(
      'Invalid WGS84 bounds; expected west,south,east,north without antimeridian crossing',
    );
  }
  return value as Bounds;
}
export function bboxPolygon(bbox: Bounds): Polygon {
  const [w, s, e, n] = validateBounds(bbox);
  return {
    type: 'Polygon',
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  };
}
export function validateGeometry(value: unknown, bounds?: Bounds): Geometry {
  const raw = record(value, 'geometry');
  let count = 0;
  const position = (value: unknown): Position => {
    if (
      !Array.isArray(value) ||
      value.length < 2 ||
      value.length > 3 ||
      !value.every((v) => typeof v === 'number' && Number.isFinite(v))
    )
      throw new Error('Invalid coordinate');
    const [x, y] = value as number[];
    if (x < -180 || x > 180 || y < -90 || y > 90)
      throw new Error('Coordinates must be WGS84 longitude/latitude');
    if (bounds && (x < bounds[0] || x > bounds[2] || y < bounds[1] || y > bounds[3])) {
      throw new Error('Geometry lies outside the configured country bounding box');
    }
    if (++count > 1_000_000) throw new Error('Geometry exceeds coordinate limit');
    return [x, y];
  };
  const list = <T>(value: unknown, parse: (v: unknown) => T, minimum: number): T[] => {
    if (!Array.isArray(value) || value.length < minimum)
      throw new Error('Empty or incomplete geometry');
    return value.map(parse);
  };
  const line = (value: unknown) => list(value, position, 2);
  const ring = (value: unknown) => {
    const points = list(value, position, 4);
    const first = points[0],
      last = points[points.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1])
      throw new Error('Polygon rings must be closed');
    return points;
  };
  const polygon = (value: unknown) => list(value, ring, 1);
  switch (raw.type) {
    case 'Point':
      return { type: 'Point', coordinates: position(raw.coordinates) };
    case 'LineString':
      return { type: 'LineString', coordinates: line(raw.coordinates) };
    case 'MultiLineString':
      return { type: 'MultiLineString', coordinates: list(raw.coordinates, line, 1) };
    case 'Polygon':
      return { type: 'Polygon', coordinates: polygon(raw.coordinates) };
    case 'MultiPolygon':
      return { type: 'MultiPolygon', coordinates: list(raw.coordinates, polygon, 1) };
    default:
      throw new Error('Unsupported geometry type');
  }
}
