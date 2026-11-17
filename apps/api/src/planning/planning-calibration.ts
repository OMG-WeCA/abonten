import type { PlanningStudyAssumptions } from '@abonten/contracts/planning-study';

/** Internal, uncalibrated baseline; never inferred from a campaign offer or TG description. */
export const PLANNING_CALIBRATION_VERSION = 'open-data-travel-baseline-2026-11-08-v2';
export const PLANNING_BASELINE: PlanningStudyAssumptions = {
  tripsPerPersonPerDay: 2.5,
  participation: 0.8,
  recurrence: 0.7,
  weekendTripMultiplier: 0.8,
};
