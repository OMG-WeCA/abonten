import type { PlanningFitPreferences } from '@abonten/contracts/planning-draft';

/** Restore only confirmed, bounded preference controls; never scores or source facts. */
export function parsePlanningFitPreferences(value: unknown): PlanningFitPreferences | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.version !== 1) return null;
  const result: PlanningFitPreferences = { version: 1 };
  for (const key of ['targetAreas', 'targetCorridors', 'audienceTags'] as const) {
    const values = row[key];
    if (values === undefined) continue;
    if (
      !Array.isArray(values) ||
      values.length > 8 ||
      values.some(
        (item) =>
          typeof item !== 'string' || !item.trim() || item.length > 80 || item.includes('\u0000'),
      )
    )
      return null;
    result[key] = [
      ...new Map(
        values.map((item) => {
          const text = (item as string).trim();
          return [text.toLocaleLowerCase('en'), text];
        }),
      ).values(),
    ];
  }
  if (row.approachDirection !== undefined) {
    if (!['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].includes(String(row.approachDirection)))
      return null;
    result.approachDirection = row.approachDirection as PlanningFitPreferences['approachDirection'];
  }
  if (row.daypart !== undefined) {
    if (!['any', 'day', 'night'].includes(String(row.daypart))) return null;
    result.daypart = row.daypart as PlanningFitPreferences['daypart'];
  }
  if (row.goal !== undefined) {
    if (!['balanced', 'coverage', 'value'].includes(String(row.goal))) return null;
    result.goal = row.goal as PlanningFitPreferences['goal'];
  }
  return result;
}
