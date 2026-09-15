'use client';

import { MapPin, PlusCircle, Search, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { WorkspaceFrame } from '../../components/account/WorkspaceFrame';
import { useAuth } from '../../components/auth/AuthProvider';
import {
  AuthAssetThumb,
  StatusBadge,
  displayStatus,
  formatCount,
  inputClass,
  prettyFormat,
} from '../../components/sites/sites-ui';
import { getAccountCopy } from '../../lib/account-locale';
import { listSites, siteThumbUrl, type SiteSummary } from '../../lib/sites-api';
import { canManageSites, canSeeSitesArea } from '../../lib/sites-access';
import { getSitesCopy } from '../../lib/sites-locale';

const STATUS_ORDER: Record<string, number> = {
  rejected: 0,
  draft: 1,
  pending_review: 2,
  approved: 3,
  listed: 4,
  suspended: 5,
  decommissioned: 6,
};

export default function SitesPage() {
  const router = useRouter();
  const { activeOrganization, capabilities, profile } = useAuth();
  const copy = getSitesCopy(profile?.locale);
  const accountCopy = getAccountCopy(profile?.locale);
  const orgId = activeOrganization?.organizationId;
  const canView = canSeeSitesArea({ capabilities, orgType: activeOrganization?.type });
  // Mirror of the server rule: only media-partner organizations can manage
  // billboard sites (assertMediaPartnerOrg), whatever role capabilities say.
  const canManage = canManageSites({ capabilities, orgType: activeOrganization?.type });
  const isPlatformAdmin = capabilities.includes('PLATFORM_ADMIN');

  const [sites, setSites] = useState<SiteSummary[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    // Platform admins review through /admin/review; non-partner orgs have no
    // inventory of their own (the server would return an empty list), so skip
    // the pointless request and show the dedicated notice.
    if (isPlatformAdmin || !canView || !orgId) return;
    let cancelled = false;
    setSites(null);
    setTotal(null);
    setError('');
    // Collect every page so totals, search and filters cover the organization's
    // full inventory — not just the first API window.
    (async () => {
      try {
        const collected: SiteSummary[] = [];
        let knownTotal = 0;
        for (let page = 1; ; page += 1) {
          const result = await listSites(orgId, { page });
          collected.push(...result.items);
          knownTotal = result.total;
          if (result.items.length === 0 || collected.length >= result.total) break;
        }
        if (!cancelled) {
          setSites(collected);
          setTotal(knownTotal);
        }
      } catch {
        if (!cancelled) setError(accountCopy.settings.genericError);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, canView, accountCopy.settings.genericError]);

  const filtered = useMemo(() => {
    if (!sites) return null;
    const query = search.trim().toLowerCase();
    return sites
      .map((site) => ({ site, display: displayStatus(site) }))
      .filter((row) => (statusFilter === 'all' ? true : row.display === statusFilter))
      .filter((row) =>
        query
          ? row.site.name.toLowerCase().includes(query) ||
            row.site.code.toLowerCase().includes(query)
          : true,
      )
      .sort(
        (a, b) =>
          (STATUS_ORDER[a.display] ?? 9) - (STATUS_ORDER[b.display] ?? 9) ||
          b.site.createdAt.localeCompare(a.site.createdAt),
      )
      .map((row) => row.site);
  }, [sites, statusFilter, search]);

  const pendingCount = sites?.filter((site) => site.status === 'pending_review').length ?? 0;
  if (isPlatformAdmin) {
    return (
      <WorkspaceFrame current="sites">
        <h1 className="text-3xl font-extrabold tracking-[-0.045em]">{copy.list.platformTitle}</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">{copy.list.platformNotice}</p>
        <button
          type="button"
          onClick={() => router.push('/admin/review')}
          className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary-hover"
        >
          <ShieldCheck className="h-4 w-4" />
          {copy.list.reviewCta}
        </button>
      </WorkspaceFrame>
    );
  }
  const statuses = Array.from(new Set(sites?.map((site) => displayStatus(site)) ?? []));

  if (!canView) {
    return (
      <WorkspaceFrame current="sites">
        <h1 className="text-3xl font-extrabold tracking-[-0.045em]">{copy.list.title}</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">{copy.list.notPartnerNotice}</p>
      </WorkspaceFrame>
    );
  }

  const reasonSnippetOf = (site: SiteSummary) => {
    if (displayStatus(site) !== 'rejected') return null;
    return (
      <span className="mt-1 block truncate text-xs font-medium text-error">{site.rejectionReason}</span>
    );
  };

  return (
    <WorkspaceFrame current="sites">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-[-0.045em]">{copy.list.title}</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            {copy.list.intro}
            {total != null && total > 0 && (
              <span className="font-semibold text-foreground">
                {' · '}{copy.list.countLabel.replace('{{label}}', formatCount(total, profile?.locale))}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isPlatformAdmin && pendingCount > 0 && (
            <button
              type="button"
              onClick={() => router.push('/admin/review')}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 text-sm font-bold text-warning transition hover:bg-warning/20"
            >
              <ShieldCheck className="h-4 w-4" />
              {copy.list.reviewCta} ({pendingCount})
            </button>
          )}
          {canManage && (
            <button
              type="button"
              onClick={() => router.push('/sites/new')}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary-hover"
            >
              <PlusCircle className="h-4 w-4" />
              {copy.list.register}
            </button>
          )}
        </div>
      </div>

      {sites !== null && sites.length > 0 && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative sm:max-w-xs sm:flex-1">
            <span className="sr-only">{copy.list.searchLabel}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={copy.list.searchPlaceholder}
              className={`${inputClass} pl-9`}
            />
          </label>
          {statuses.length > 1 && (
            <nav aria-label={copy.list.all} className="flex flex-wrap gap-2">
              {['all', ...statuses].map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  aria-pressed={statusFilter === status}
                  className={`min-h-9 rounded-full px-3 text-xs font-bold transition ${
                    statusFilter === status
                      ? 'bg-primary text-white'
                      : 'border border-border text-muted hover:text-foreground'
                  }`}
                >
                  {status === 'all' ? copy.list.all : copy.status[status as keyof typeof copy.status]}
                </button>
              ))}
            </nav>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-6 rounded-lg bg-error/10 px-4 py-3 text-sm font-medium text-error">
          {error}
        </p>
      )}

      {!error && filtered === null && (
        <div className="mt-8 space-y-3" aria-hidden>
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-20 animate-pulse rounded-xl border border-border bg-surface" />
          ))}
        </div>
      )}

      {filtered !== null && filtered.length === 0 && sites !== null && sites.length > 0 && (
        <p className="mt-8 rounded-xl border border-border bg-surface px-5 py-6 text-sm text-muted">
          {copy.list.noMatch}
        </p>
      )}

      {filtered !== null && filtered.length > 0 && (
        <ul className="mt-6 grid gap-3">
          {filtered.map((site) => (
            <li key={site.id}>
              <button
                type="button"
                onClick={() => router.push(`/sites/detail/?id=${site.id}`)}
                className="flex w-full items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3.5 text-left transition hover:border-primary/50 hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <AuthAssetThumb display={siteThumbUrl(site)} alt="" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate font-bold">{site.name}</span>
                    <code className="rounded bg-muted/15 px-1.5 py-0.5 text-xs font-semibold text-muted">
                      {site.code}
                    </code>
                    <StatusBadge status={displayStatus(site)} locale={profile?.locale} />
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                    <span className="font-semibold">{prettyFormat(site.format, profile?.locale)}</span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {[site.city, site.region].filter(Boolean).join(', ')}
                    </span>
                  </span>
                  {reasonSnippetOf(site)}

                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {sites !== null && sites.length === 0 && !error && !canManage && (
        <p className="mt-8 rounded-xl border border-border bg-surface px-5 py-6 text-sm text-muted">
          {copy.list.viewOnlyDetail}
        </p>
      )}

      {sites !== null && sites.length === 0 && canManage && (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <h2 className="text-lg font-bold">{copy.list.emptyTitle}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{copy.list.emptyDetail}</p>
          <button
            type="button"
            onClick={() => router.push('/sites/new')}
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-white transition hover:bg-primary-hover"
          >
            <PlusCircle className="h-4 w-4" />
            {copy.list.register}
          </button>
        </div>
      )}
    </WorkspaceFrame>
  );
}
