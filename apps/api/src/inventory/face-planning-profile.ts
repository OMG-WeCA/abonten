import type { FacePlanningProfile } from '@abonten/contracts/planning-profile';

/** Cross-field checks also protect direct service callers, keeping incomplete drafts editable. */
export function planningProfileProblems(profile: FacePlanningProfile | null | undefined): string[] {
  if (profile == null) return [];
  const problems: string[] = [];
  for (const key of ['source', 'method'] as const) {
    if (typeof profile[key] !== 'string' || profile[key].trim().length < 2)
      problems.push(`record the ${key} of the viewing details`);
  }
  for (const [key, min, max, label] of [
    ['facingDeg', 0, 359, 'facing direction must be between 0 and 359 degrees'],
    ['viewingAngleDeg', 1, 180, 'viewing cone must be between 1 and 180 degrees'],
    ['viewingDistanceMetres', Number.MIN_VALUE, Infinity, 'visible distance must be positive'],
    ['minimumViewSeconds', Number.MIN_VALUE, Infinity, 'minimum time in view must be positive'],
  ] as const) {
    const value = profile[key];
    if (value !== undefined && (!Number.isFinite(value) || value < min || value > max))
      problems.push(label);
  }
  if (
    profile.obstruction !== undefined &&
    !['clear', 'partial', 'blocked', 'unknown'].includes(profile.obstruction)
  )
    problems.push('choose a valid obstruction state');
  for (const key of ['sightline', 'roadApproach'] as const) {
    const point = profile[key];
    if (
      point &&
      (!Number.isFinite(point.longitude) ||
        Math.abs(point.longitude) > 180 ||
        !Number.isFinite(point.latitude) ||
        Math.abs(point.latitude) > 90)
    )
      problems.push(`choose a valid ${key === 'sightline' ? 'sightline' : 'road approach'} point`);
  }
  for (const key of ['displaySchedule', 'illuminationSchedule'] as const) {
    const hours = profile[key];
    if (
      hours &&
      (!Number.isFinite(hours.startHour) ||
        !Number.isFinite(hours.endHour) ||
        hours.startHour < 0 ||
        hours.startHour >= 24 ||
        hours.endHour < 0 ||
        hours.endHour > 24 ||
        hours.startHour === hours.endHour)
    )
      problems.push(
        `${key === 'displaySchedule' ? 'display hours' : 'illumination hours'} must use distinct local hours between 0 and 24 (overnight windows are allowed)`,
      );
  }
  return problems;
}
