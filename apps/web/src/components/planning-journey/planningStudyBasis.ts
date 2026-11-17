import type { PlanningStudyDaypart } from '@abonten/contracts/planning-study';
import businessDayparts from '@abonten/contracts/planning-dayparts.json';
export { planningStudyBasis } from '../../../../api/src/planning/planning-math';

export const STUDY_DAYPARTS: PlanningStudyDaypart[] = businessDayparts as PlanningStudyDaypart[];
