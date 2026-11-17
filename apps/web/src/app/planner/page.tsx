'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PlanningJourney } from '../../components/planning-journey/PlanningJourney';
import { AccountLoading } from '../../components/account/WorkspaceFrame';
import { useLocale } from '../../components/LocaleProvider';
function PlannerWorkspace() {
  const params = useSearchParams();
  return (
    <PlanningJourney
      key={params.toString()}
      intent={{
        draftId: params.get('draft'),
        newPlan: params.get('new') === '1',
        view: params.get('view'),
        focus: params.get('focus'),
      }}
    />
  );
}
export default function PlannerPage() {
  const { locale } = useLocale();
  return (
    <Suspense fallback={<AccountLoading locale={locale} />}>
      <PlannerWorkspace />
    </Suspense>
  );
}
