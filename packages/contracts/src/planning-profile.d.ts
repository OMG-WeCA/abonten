/** Durable partner-declared facts; missing fields stay missing for incomplete drafts. */
export interface FacePlanningProfile {
  facingDeg?: number;
  viewingDistanceMetres?: number;
  /** Total horizontal cone width, centered on the outward face normal. */
  viewingAngleDeg?: number;
  obstruction?: 'clear' | 'partial' | 'blocked' | 'unknown';
  minimumViewSeconds?: number;
  /** Furthest usable road viewpoint declared by the partner, never independent verification. */
  sightline?: { longitude: number; latitude: number };
  /** Optional partner-confirmed driving road selection; separate from the furthest visible viewpoint. */
  roadApproach?: { longitude: number; latitude: number };
  /** Local hours; start > end crosses midnight, 0–24 means all day. */
  displaySchedule?: { startHour: number; endHour: number };
  illuminationSchedule?: { startHour: number; endHour: number };
  source: string;
  method: string;
  collectedAt?: string;
}
