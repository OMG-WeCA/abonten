// Pure map helpers for the immersive site view (execution plan §1.5.2).
export interface SiteMapPosition {
  latitude: number;
  longitude: number;
  /** Entered facing direction in degrees (unverified). Optional. */
  orientationDeg?: number | null;
  siteName: string;
}

/** Circle polygon of `radiusM` metres around a WGS84 point (no turf needed). */
export function circlePolygon(
  latitude: number,
  longitude: number,
  radiusM: number,
  steps = 64,
): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const latRad = (latitude * Math.PI) / 180;
  for (let i = 0; i <= steps; i += 1) {
    const bearing = (i / steps) * 2 * Math.PI;
    const dx = radiusM * Math.cos(bearing);
    const dy = radiusM * Math.sin(bearing);
    const dLat = dy / 111_320;
    const dLng = dx / (111_320 * Math.max(Math.cos(latRad), 0.01));
    points.push([longitude + dLng, latitude + dLat]);
  }
  return points;
}
