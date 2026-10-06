'use client';

import { AlertTriangle, ChevronDown, ExternalLink, Loader2, ShieldCheck, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { displayNumber } from '../../../lib/locale-format';
import { formatArea } from '../../../lib/number-format';
import { agencyEvidenceUnit } from '../../../lib/agency-evidence-locale';
import { ApiError } from '../../../lib/api';

/** Fill a single {{label}} placeholder used by confirm-dialog copy. */
const withLabel = (template: string, label: string): string => template.replace('{{label}}', label);
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { WorkspaceFrame } from '../../../components/account/WorkspaceFrame';
import { useAuth } from '../../../components/auth/AuthProvider';
import {
  AuthAssetThumb,
  Field,
  StatusBadge,
  inputClass,
  prettyFormat,
  prettyIllumination,
} from '../../../components/sites/sites-ui';
import {
  approveSite,
  getSite,
  listSites,
  rejectSite,
  siteThumbUrl,
  assetDisplay,
  type AssetDisplay,
  type SiteDetail,
  type SiteSummary,
} from '../../../lib/sites-api';
import { marketLabel } from '../../../lib/markets';
import { getSitesCopy } from '../../../lib/sites-locale';

export default function ReviewQueuePage() {
  const router = useRouter();
  const { profile, capabilities, activeOrganization } = useAuth();
  const copy = getSitesCopy(profile?.locale);
  const orgId = activeOrganization?.organizationId;
  const isAdmin = capabilities.includes('PLATFORM_ADMIN');

  const [sites, setSites] = useState<SiteSummary[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  // Detail (and its error) are keyed by site id: a slow GET for A resolving
  // after B was opened can no longer render A's data under B's controls.
  const [detail, setDetail] = useState<{ id: string; data: SiteDetail } | null>(null);
  const [detailError, setDetailError] = useState<{ id: string; message: string } | null>(null);
  // Monotonic token per detail request: stale GETs are dropped, so one site's
  // data can never render beneath another site's approval controls.
  const detailRequestRef = useRef(0);
  const [zoom, setZoom] = useState<{ src: AssetDisplay; alt: string } | null>(null);
  const zoomCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!zoom) return;
    zoomCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setZoom(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoom]);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  const load = useCallback(async () => {
    setSites(null);
    setLoadError('');
    try {
      // Server-side pending_review filter + pagination: if more than one page
      // of sites exists, the queue would silently lose submissions beyond the
      // first window (sites come back newest-first across all orgs).
      const collected: SiteSummary[] = [];
      for (let page = 1; ; page += 1) {
        const result = await listSites(orgId, { status: 'pending_review', page });
        collected.push(...result.items);
        if (result.items.length < 100) break;
      }
      setSites(collected);
    } catch {
      setLoadError(copy.admin.loadError);
    }
  }, [orgId, copy.admin.loadError]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <WorkspaceFrame current="review">
        <p className="rounded-xl border border-border bg-surface px-5 py-6 text-sm text-muted">
          {copy.detail.noAccess}
        </p>
      </WorkspaceFrame>
    );
  }

  const openDetail = async (siteId: string) => {
    if (openId === siteId) {
      setOpenId(null);
      setDetail(null);
      setDetailError(null);
      detailRequestRef.current += 1; // invalidate any in-flight fetch
      return;
    }
    setDetailError(null);
    setOpenId(siteId);
    setDetail(null);
    const token = (detailRequestRef.current += 1);
    try {
      const data = await getSite(orgId, siteId);
      // Drop stale responses: only the newest request may paint its detail.
      if (detailRequestRef.current === token) {
        setDetail({ id: siteId, data });
      }
    } catch {
      if (detailRequestRef.current === token) {
        setDetailError({ id: siteId, message: copy.admin.loadError });
      }
    }
  };

  const approve = (site: SiteSummary) => {
    if (!window.confirm(withLabel(copy.admin.approveConfirm, site.name))) return;
    setActionError('');
    setBusy(`approve-${site.id}`);
    approveSite(orgId, site.id)
      .then(() => {
        setSites((previous) => previous?.filter((s) => s.id !== site.id) ?? null);
        if (openId === site.id) {
          setOpenId(null);
          setDetail(null);
          setDetailError(null);
        }
      })
      .catch((error) =>
        setActionError(
          error instanceof ApiError && error.message
            ? copy.admin.actionFailed + error.message
            : copy.admin.actionFailedGeneric,
        ),
      )
      .finally(() => setBusy(''));
  };

  const onReject = (event: FormEvent, site: SiteSummary) => {
    event.preventDefault();
    if (!reason.trim()) {
      setReasonError(copy.admin.reasonRequired);
      return;
    }
    setReasonError('');
    setBusy(`reject-${site.id}`);
    rejectSite(orgId, site.id, reason.trim())
      .then(() => {
        setSites((previous) => previous?.filter((s) => s.id !== site.id) ?? null);
        setRejectingId(null);
        setReason('');
        if (openId === site.id) {
          setOpenId(null);
          setDetail(null);
          setDetailError(null);
        }
      })
      .catch((error) =>
        setActionError(
          error instanceof ApiError && error.message
            ? copy.admin.actionFailed + error.message
            : copy.admin.actionFailedGeneric,
        ),
      )
      .finally(() => setBusy(''));
  };

  return (
    <WorkspaceFrame current="review">
      <h1 className="text-3xl font-extrabold tracking-[-0.045em]">{copy.admin.title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{copy.admin.intro}</p>

      {loadError && (
        <p
          role="alert"
          className="mt-6 rounded-lg bg-error/10 px-4 py-3 text-sm font-medium text-error"
        >
          {loadError}
        </p>
      )}

      {sites === null && !loadError && (
        <div className="mt-8 space-y-3" aria-hidden>
          {[0, 1].map((row) => (
            <div
              key={row}
              className="h-24 animate-pulse rounded-xl border border-border bg-surface"
            />
          ))}
        </div>
      )}

      {sites !== null && sites.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-success" />
          <p className="mt-3 text-sm text-muted">{copy.admin.empty}</p>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="mt-5 inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-sm font-semibold transition hover:bg-surface-2"
          >
            {copy.detail.back}
          </button>
        </div>
      )}

      {actionError && (
        <p
          role="alert"
          className="mt-6 rounded-lg bg-error/10 px-4 py-3 text-sm font-medium text-error"
        >
          {actionError}
        </p>
      )}

      <ul className="mt-6 space-y-3 pb-10">
        {sites?.map((site) => (
          <li key={site.id} className="rounded-xl border border-border bg-surface px-4 py-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <button
                type="button"
                onClick={() => setZoom({ src: siteThumbUrl(site), alt: site.name })}
                aria-label={`${copy.admin.viewSite} — ${site.name}`}
                className="shrink-0 rounded-lg transition hover:opacity-90"
              >
                <AuthAssetThumb display={siteThumbUrl(site)} alt={site.name} />
              </button>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate font-bold">{site.name}</span>
                  <code className="rounded bg-muted/15 px-1.5 py-0.5 text-xs font-semibold text-muted">
                    {site.code}
                  </code>
                  <StatusBadge status={site.status} locale={profile?.locale} />
                </span>
                <span className="mt-1 block text-xs text-muted">
                  {[site.city, site.region, marketLabel(site.country, profile?.locale)]
                    .filter(Boolean)
                    .join(', ')}{' '}
                  ·{' '}
                  <span className="font-semibold">
                    {prettyFormat(site.format, profile?.locale)}
                  </span>
                  {site.width != null && site.height != null
                    ? ` · ${displayNumber(site.width, profile?.locale)} × ${displayNumber(site.height, profile?.locale)}${site.units ? ` ${agencyEvidenceUnit(site.units, profile?.locale === 'fr' ? 'fr' : 'en')}` : ''}`
                    : ''}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Link
                  href={`/sites/detail/?id=${site.id}`}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-bold transition hover:bg-surface-2"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {copy.admin.viewSite}
                </Link>
                <button
                  type="button"
                  onClick={() => void openDetail(site.id)}
                  aria-expanded={openId === site.id}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-bold transition hover:bg-surface-2"
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition ${openId === site.id ? 'rotate-180' : ''}`}
                  />
                  {openId === site.id ? copy.admin.hideDetails : copy.admin.viewDetails}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => approve(site)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-success px-3 text-xs font-bold text-white transition hover:brightness-95 disabled:opacity-60"
                >
                  {busy === `approve-${site.id}` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  )}
                  {copy.admin.approve}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    setRejectingId(rejectingId === site.id ? null : site.id);
                    setReason('');
                    setReasonError('');
                  }}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-error/40 px-3 text-xs font-bold text-error transition hover:bg-error/10 disabled:opacity-60"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {copy.admin.reject}
                </button>
              </span>
            </div>

            {rejectingId === site.id && (
              <form
                onSubmit={(event) => onReject(event, site)}
                className="mt-4 space-y-3 rounded-lg border border-error/30 bg-error/5 p-3"
              >
                <Field
                  label={copy.admin.rejectReasonLabel}
                  htmlFor={`reason-${site.id}`}
                  error={reasonError}
                >
                  <textarea
                    id={`reason-${site.id}`}
                    rows={2}
                    value={reason}
                    onChange={(event) => {
                      setReason(event.target.value);
                      setReasonError('');
                    }}
                    placeholder={copy.admin.rejectReasonPlaceholder}
                    aria-invalid={Boolean(reasonError)}
                    className={inputClass}
                  />
                </Field>
                <button
                  type="submit"
                  disabled={busy === `reject-${site.id}`}
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-error px-3 text-xs font-bold text-white transition hover:brightness-95 disabled:opacity-60"
                >
                  {busy === `reject-${site.id}` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {copy.admin.rejectSubmit}
                </button>
              </form>
            )}

            {openId === site.id && (
              <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3 text-sm">
                {detail === null && detailError?.id !== site.id && <p className="text-muted">…</p>}
                {detailError?.id === site.id && <p className="text-error">{detailError.message}</p>}
                {detail?.id === site.id && (
                  <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                    {(
                      [
                        [
                          copy.detail.addressLabel,
                          [detail.data.address, detail.data.city, detail.data.region]
                            .filter(Boolean)
                            .join(', ') || '—',
                        ],
                        [
                          copy.detail.dimsLabel,
                          `${detail.data.width != null ? displayNumber(detail.data.width, profile?.locale) : '—'} × ${detail.data.height != null ? displayNumber(detail.data.height, profile?.locale) : '—'} ${detail.data.units ? agencyEvidenceUnit(detail.data.units, profile?.locale === 'fr' ? 'fr' : 'en') : ''}`.trim(),
                        ],
                        [
                          copy.detail.areaLabel,
                          detail.data.area != null
                            ? formatArea(detail.data.area, detail.data.units, profile?.locale)
                            : '—',
                        ],
                        [
                          copy.detail.coordsLabel,
                          `${detail.data.latitude}, ${detail.data.longitude}`,
                        ],
                        [
                          copy.detail.illuminationLabel,
                          `${prettyIllumination(detail.data.illuminationType, profile?.locale)}${detail.data.illuminationHours ? ` · ${detail.data.illuminationHours}` : ''}`,
                        ],
                        [copy.detail.permitLabel, detail.data.permitRef ?? copy.detail.permitNone],
                      ] as Array<[string, string]>
                    ).map(([label, value]) => (
                      <div key={label} className="contents">
                        <dt className="text-muted">{label}</dt>
                        <dd className="font-medium">{value}</dd>
                      </div>
                    ))}
                    <div className="contents sm:col-span-2">
                      <dt className="text-muted">{copy.register.description}</dt>
                      <dd className="whitespace-pre-line font-medium">
                        {detail.data.description || '—'}
                      </dd>
                    </div>
                    <div className="contents sm:col-span-2">
                      <dt className="text-muted">{copy.detail.faces}</dt>
                      <dd className="font-medium">
                        {detail.data.faces.length === 0
                          ? '—'
                          : detail.data.faces
                              .map(
                                (face) =>
                                  `${face.faceLabel} (${displayNumber(face.width, profile?.locale)} × ${displayNumber(face.height, profile?.locale)} ${agencyEvidenceUnit(face.units, profile?.locale === 'fr' ? 'fr' : 'en')})`,
                              )
                              .join(', ')}
                      </dd>
                    </div>
                    <div className="contents sm:col-span-2">
                      <dt className="text-muted">{copy.detail.rates}</dt>
                      <dd className="font-medium">
                        {detail.data.rateCards.length === 0
                          ? '—'
                          : detail.data.rateCards
                              .map(
                                (card) =>
                                  `${card.currency} · ${Object.values(card.rates)
                                    .filter(Boolean)
                                    .map((value) => displayNumber(value!, profile?.locale))
                                    .join(' / ')}`,
                              )
                              .join(', ')}
                      </dd>
                    </div>
                  </dl>
                )}
                {detail?.id === site.id && detail.data.assets.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted">
                      {copy.detail.photos}
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-3">
                      {detail.data.assets.map((asset) => (
                        <li key={asset.id}>
                          <button
                            type="button"
                            onClick={() =>
                              setZoom({
                                src: assetDisplay(asset),
                                alt: site.name,
                              })
                            }
                            className="rounded-lg transition hover:opacity-90"
                          >
                            <AuthAssetThumb
                              display={assetDisplay(asset)}
                              alt={`${site.name} — ${({ front: copy.register.photoFront, context: copy.register.photoContext, night: copy.register.photoNight, diagram: copy.register.photoDiagram, board_video: profile?.locale === 'fr' ? 'Vidéo du panneau' : 'Board video' } as Record<string, string>)[asset.kind] ?? asset.kind}`}
                              size="h-28 w-40"
                            />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {zoom !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={zoom.alt}
          className="fixed inset-0 z-50 grid place-items-center bg-background/90 px-4"
          onClick={() => setZoom(null)}
        >
          <button
            ref={zoomCloseRef}
            type="button"
            aria-label={copy.detail.close}
            onClick={() => setZoom(null)}
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-border bg-surface-2 text-foreground transition hover:bg-surface"
          >
            <X className="h-4 w-4" />
          </button>
          <AuthAssetThumb
            display={zoom.src}
            alt={zoom.alt}
            size="h-[80vh] w-full max-w-3xl"
            fit="object-contain"
          />
        </div>
      )}
    </WorkspaceFrame>
  );
}
