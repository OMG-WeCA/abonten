export type TravelDirection = 'forward' | 'reverse';
export type MetricPoint = readonly [east: number, north: number];

export interface WeightedRoadPassage {
  direction: TravelDirection | null;
  weight: number;
  viewable: boolean | null;
}

interface ApproachSection {
  distanceMetres: number;
  inView: boolean;
  speedMps: number | null;
}

/** Find the longest continuous view using speeds for the visible road sections. */
export function estimateTimeInView(sections: readonly ApproachSection[]) {
  let seconds = 0;
  let distanceMetres = 0;
  let longest = { seconds: 0, distanceMetres: 0 };
  for (const section of sections) {
    if (!section.inView) {
      seconds = 0;
      distanceMetres = 0;
      continue;
    }
    const speed = section.speedMps;
    if (speed === null || !Number.isFinite(speed) || speed <= 0) return null;
    seconds += section.distanceMetres / speed;
    distanceMetres += section.distanceMetres;
    if (seconds > longest.seconds) longest = { seconds, distanceMetres };
  }
  return longest;
}

interface RoadApproach {
  direction: TravelDirection;
  segmentEndIndex: number;
  fraction: number;
}

/** Assess a local road cross-section. Points are in metres relative to its centre. */
export function matchRoadApproach(
  points: readonly MetricPoint[],
  bearingDegrees: number,
  halfWidthMetres: number,
): RoadApproach | 'ambiguous' | null {
  const radians = (bearingDegrees * Math.PI) / 180;
  const east = Math.sin(radians);
  const north = Math.cos(radians);
  let match: RoadApproach | null = null;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const a = ax * east + ay * north;
    const b = bx * east + by * north;
    if (a === 0) continue;
    // An approach ending on the cut counts only if the route leaves on the other side.
    let exit = b;
    for (let next = i + 1; exit === 0 && next < points.length; next++) {
      const [x, y] = points[next];
      exit = x * east + y * north;
    }
    if (exit === 0 || a < 0 === exit < 0) continue;
    const along = b - a;
    const length = Math.hypot(bx - ax, by - ay);
    if (Math.abs(along) < length * Math.SQRT1_2) continue;
    const fraction = -a / along;
    const crossingX = ax + (bx - ax) * fraction;
    const crossingY = ay + (by - ay) * fraction;
    if (Math.abs(crossingX * north - crossingY * east) > halfWidthMetres) continue;
    if (match) return 'ambiguous';
    match = { direction: along > 0 ? 'forward' : 'reverse', segmentEndIndex: i, fraction };
  }
  return match;
}

/** Pass all matched board passages, assessed for this face. */
export function scoreAbontenFace(
  passages: readonly WeightedRoadPassage[],
  direction: TravelDirection,
  comparableApproachWeights: readonly number[],
) {
  let demandWeight = 0;
  let assessableWeight = 0;
  let unresolvedWeight = 0;
  let viewableWeight = 0;
  for (const passage of passages) {
    if (passage.direction === direction) demandWeight += passage.weight;
    if (passage.viewable === null) {
      unresolvedWeight += passage.weight;
      continue;
    }
    assessableWeight += passage.weight;
    if (passage.viewable) viewableWeight += passage.weight;
  }
  const boardWeight = assessableWeight + unresolvedWeight;
  const matchedComparables = comparableApproachWeights.filter(
    (weight) => Number.isFinite(weight) && weight > 0,
  );
  const unknownDirection = passages.some(
    (passage) => passage.direction === null && passage.weight > 0,
  );
  const rank = matchedComparables.reduce(
    (sum, peer) => sum + (peer < demandWeight ? 1 : peer === demandWeight ? 0.5 : 0),
    0,
  );
  return {
    demandWeight,
    directionalDemand:
      !unknownDirection && demandWeight > 0 && matchedComparables.length
        ? (100 * rank) / matchedComparables.length
        : null,
    viewabilityFit:
      boardWeight > 0 && unresolvedWeight === 0 ? (100 * viewableWeight) / boardWeight : null,
    assessableShare: boardWeight > 0 ? assessableWeight / boardWeight : null,
  };
}
