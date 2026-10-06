'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AgencyDashboard } from '../../components/agency/AgencyDashboard';
import { AccountLoading } from '../../components/account/WorkspaceFrame';
import { useLocale } from '../../components/LocaleProvider';
function PlannerWorkspace() {
  const params = useSearchParams();
  return <AgencyDashboard key={params.toString()} />;
}
export default function PlannerPage() {
  const { locale } = useLocale();
  return (
    <Suspense fallback={<AccountLoading locale={locale} />}>
      <PlannerWorkspace />
    </Suspense>
  );
}
