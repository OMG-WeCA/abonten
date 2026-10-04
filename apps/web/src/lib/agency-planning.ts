/** Re-export the API-owned pure rules so UI estimates and planner grounding use
 * one canonical calculation source without importing server runtime code. */
export * from '../../../api/src/planning/planning-math';
