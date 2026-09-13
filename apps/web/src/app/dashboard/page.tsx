'use client';

import {
  ArrowRight,
  Camera,
  CircleCheck,
  Landmark,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { WorkspaceFrame } from '../../components/account/WorkspaceFrame';
import { useAuth } from '../../components/auth/AuthProvider';
import { getAccountCopy } from '../../lib/account-locale';

const workspaceIcons = {
  media_partner: Landmark,
  agency: SlidersHorizontal,
  brand: CircleCheck,
  platform: ShieldCheck,
};

export default function DashboardPage() {
  const router = useRouter();
  const { activeOrganization, capabilities, profile } = useAuth();
  const copy = getAccountCopy(profile?.locale);
  const type = activeOrganization?.type ?? 'agency';
  const details = copy.dashboard[type];
  const WorkspaceIcon = workspaceIcons[type];
  const canManageOrganization = capabilities.includes('ORG_SETTINGS_EDIT');
  const hasFieldAccess =
    activeOrganization?.type === 'media_partner' && capabilities.includes('POP_CAPTURE');
  const isPlatformAdmin = capabilities.includes('PLATFORM_ADMIN');

  return (
    <WorkspaceFrame current="dashboard">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-surface-2 px-6 py-8 shadow-xl shadow-black/10 sm:px-9 sm:py-10">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-primary" />
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full border-[22px] border-primary/10" />
        <div className="relative max-w-3xl">
          <p className="text-sm font-semibold text-foreground">{details.name}</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.045em] sm:text-4xl">
            {details.lead}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted">{details.detail}</p>
          <button
            type="button"
            onClick={() => router.push('/settings')}
            className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary-hover"
          >
            {copy.dashboard.reviewSettings} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <section className="border-t border-border pt-5">
          <div className="flex items-start gap-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <WorkspaceIcon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-bold">
                {copy.dashboard.signedInAs} {profile?.name}
              </h2>
              <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted">
                {copy.dashboard.activeOrganization}{' '}
                <span className="font-semibold text-foreground">{activeOrganization?.name}</span> ·{' '}
                {activeOrganization?.country} · {activeOrganization?.defaultCurrency}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface px-5 py-5">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h2 className="font-bold">{copy.dashboard.cleanStart}</h2>
              <p className="mt-1.5 text-sm leading-6 text-muted">
                {copy.dashboard.cleanStartDetail}
              </p>
            </div>
          </div>
        </section>
      </div>

      {(hasFieldAccess || isPlatformAdmin || canManageOrganization) && (
        <section className="mt-8 border-t border-border pt-6">
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-muted">
            {copy.dashboard.accessNoted}
          </h2>
          <div className="mt-4 flex flex-wrap gap-x-7 gap-y-4 text-sm">
            {hasFieldAccess && (
              <p className="flex items-center gap-2 text-foreground">
                <Camera className="h-4 w-4 text-primary" />
                {copy.dashboard.fieldAccess}
              </p>
            )}
            {canManageOrganization && (
              <p className="flex items-center gap-2 text-foreground">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                {copy.dashboard.orgAccess}
              </p>
            )}
            {isPlatformAdmin && (
              <p className="flex items-center gap-2 text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                {copy.dashboard.platformAccess}
              </p>
            )}
          </div>
        </section>
      )}
    </WorkspaceFrame>
  );
}
