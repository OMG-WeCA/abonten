import type { AgencyDraft } from './agency-draft';
import { planningDays } from './agency-planning';
import { parseAmount } from './number-format';
import { planningDraftSignature, type PlanningWorkSession } from './planning-work-session';

export type PlanAttention = 'budget' | 'flight' | 'expired' | 'selection';

/** An untouched default or successfully saved current snapshot needs no duplicate tab recovery card.
 * Missing legacy metadata remains recoverable; no default dates or market edits are guessed away. */
export function hasRecoverableTabWork(
  draft: AgencyDraft | null,
  session: PlanningWorkSession | null,
): boolean {
  if (!draft) return false;
  if (session?.pendingCreate) return true;
  const baseline = session?.savedSignature ?? session?.initialSignature;
  return !baseline || planningDraftSignature(draft) !== baseline;
}

/** Draft controls only. Never infer inventory availability, prices or audience from saved identifiers. */
export function planningAttention(draft: AgencyDraft, todayUtc: string): PlanAttention[] {
  const items: PlanAttention[] = [];
  const budget = parseAmount(draft.budget);
  if (budget == null || budget <= 0 || budget > 1e12) items.push('budget');
  if (planningDays(draft.window) === null) items.push('flight');
  else if (/^\d{4}-\d{2}-\d{2}$/.test(todayUtc) && draft.window.endDate <= todayUtc)
    items.push('expired');
  if (!draft.faces.length) items.push('selection');
  return items;
}

export function planningDestination({
  draftId,
  view,
  focus,
  newPlan,
}: {
  draftId?: string;
  view?: 'inventory' | 'shortlist' | 'compare';
  focus?: 'budget' | 'flight';
  newPlan?: boolean;
} = {}): string {
  const query = new URLSearchParams();
  if (draftId) query.set('draft', draftId);
  if (newPlan) query.set('new', '1');
  if (view) query.set('view', view);
  if (focus) query.set('focus', focus);
  const suffix = query.toString();
  return `/planner/${suffix ? `?${suffix}` : ''}`;
}

export function attentionDestination(item: PlanAttention, draftId?: string): string {
  return planningDestination({
    draftId,
    ...(item === 'selection'
      ? { view: 'inventory' }
      : { focus: item === 'budget' ? 'budget' : 'flight' }),
  });
}
