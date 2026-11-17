/** Re-export the API-owned pure rules so UI estimates and planner grounding use
 * one canonical calculation source without importing server runtime code. */
export * from '../../../api/src/planning/planning-math';

function shiftPlanningDate(value: string, days: number): string {
  const time = /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T00:00:00Z`) : NaN;
  return Number.isFinite(time) ? new Date(time + days * 86_400_000).toISOString().slice(0, 10) : '';
}
/** Human campaign dates include the last day; stored API windows exclude their end. */
export const planningLastDay = (exclusiveEnd: string) => shiftPlanningDate(exclusiveEnd, -1);
export const planningExclusiveEnd = (lastDay: string) => shiftPlanningDate(lastDay, 1);
