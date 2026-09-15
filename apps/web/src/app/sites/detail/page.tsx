'use client';

import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock3,
  Banknote,
  Loader2,
  Pencil,
  PlusCircle,
  Trash2,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError } from '../../../lib/api';
import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { WorkspaceFrame } from '../../../components/account/WorkspaceFrame';
import { useAuth } from '../../../components/auth/AuthProvider';
import {
  AuthAssetThumb,
  Field,
  SectionCard,
  StatusBadge,
  displayStatus,
  inputClass,
  prettyFormat,
  prettyIllumination,
} from '../../../components/sites/sites-ui';
import {
  addFace,
  addRateCard,
  assetDisplay,
  deleteAsset,
  endRateCard,
  getSite,
  removeFace,
  submitSite,
  updateSite,
  uploadAsset,
  type RateCard,
  type SiteAsset,
  type SiteDetail,
  type SiteFace,
} from '../../../lib/sites-api';
import { SUPPORTED_CURRENCIES } from '../../../lib/currencies';
import { formatMoney, parseAmount, parseDecimal } from '../../../lib/number-format';
import { getSitesCopy, type SiteLocale } from '../../../lib/sites-locale';


function DetailInner() {
  const router = useRouter();
  const params = useSearchParams();
  const siteId = params.get('id') ?? '';
  const photoErrorParam = params.get('photoError') === '1';
  const { activeOrganization, capabilities, profile } = useAuth();
  const locale = profile?.locale;
  const copy = getSitesCopy(profile?.locale);
  const orgId = activeOrganization?.organizationId;
  const canEdit = capabilities.includes('INVENTORY_EDIT');
  const canCreateFace = capabilities.includes('INVENTORY_CREATE');

  const [site, setSite] = useState<SiteDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  // Records the busy key whose in-flight request the user just cancelled, so
  // run() can tell a deliberate cancel apart from a slow-connection timeout.
  const cancelledKeyRef = useRef<string | null>(null);

  const reload = useCallback(async () => {
    if (!orgId) {
      setLoadError(copy.detail.notFound);
      return;
    }
    if (!siteId) {
      setLoadError(copy.detail.notFound);
      return;
    }
    try {
      setSite(await getSite(orgId, siteId));
      setLoadError('');
    } catch (error) {
      setLoadError(
        error instanceof ApiError && error.status === 403
          ? copy.detail.notFound
          : copy.admin.loadError,
      );
    }
  }, [orgId, siteId, copy.detail.notFound, copy.admin.loadError]);

  useEffect(() => {
    setSite(null);
    setLoadError('');
    void reload();
  }, [reload]);

  const detailsEditable = site !== null && canEdit;
  const canDelete = capabilities.includes('INVENTORY_DELETE');
  const hasFrontPhoto = site?.assets.some((asset) => asset.kind === 'front') ?? false;
  const hasFace = (site?.faces.length ?? 0) > 0;
  const hasLiveRate = site?.rateCards.some((card) => !card.effectiveTo) ?? false;
  // SPEC §7.1 step 2 requires coordinates, format, dimensions and a reference
  // image to submit; faces and rate cards are expected next steps, not blockers.
  const canSubmitAll = hasFrontPhoto;
  const rejected = site?.status === 'draft' && Boolean(site?.rejectionReason);

  const run = async (key: string, action: () => Promise<void>) => {
    if (busy) return;
    setActionError('');
    setBusy(key);
    try {
      await action();
    } catch (error) {
      const abortedUpload =
        ((error as { name?: string })?.name === 'AbortError' && key.startsWith('upload-')) as boolean;
      if (error instanceof ApiError) {
        setActionError(`${copy.detail.actionFailed}${error.message}`);
      } else if (abortedUpload && cancelledKeyRef.current === key) {
        // User-initiated Cancel: silent, the busy state already clears.
        cancelledKeyRef.current = null;
      } else if (abortedUpload) {
        setActionError(copy.detail.uploadTimedOut);
      } else {
        setActionError(copy.detail.actionFailedGeneric);
      }
    } finally {
      setBusy('');
    }
  };

  if (loadError) {
    return (
      <WorkspaceFrame current="sites">
        <div className="rounded-xl border border-border bg-surface px-5 py-8 text-center">
          <p className="text-sm text-muted">{loadError}</p>
          <button
            type="button"
            onClick={() => router.push('/sites')}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold transition hover:bg-surface-2"
          >
            {copy.detail.back}
          </button>
        </div>
      </WorkspaceFrame>
    );
  }

  return (
    <WorkspaceFrame current="sites">
      <button
        type="button"
        onClick={() => router.push('/sites')}
        className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-muted transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {copy.detail.back}
      </button>

      {site === null ? (
        <div className="mt-6 space-y-3" aria-hidden>
          <div className="h-24 animate-pulse rounded-xl border border-border bg-surface" />
          <div className="h-40 animate-pulse rounded-xl border border-border bg-surface" />
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-3xl font-extrabold tracking-[-0.045em]">{site.name}</h1>
            <code className="rounded bg-muted/15 px-2 py-1 text-xs font-semibold text-muted">{site.code}</code>
            <StatusBadge status={displayStatus(site)} locale={profile?.locale} />
          </div>

          {photoErrorParam && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-medium text-warning"
            >
              {copy.detail.photoUploadFailed}
            </p>
          )}
          {rejected && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-error/30 bg-error/10 px-4 py-3.5"
            >
              <p className="flex items-start gap-2 text-sm font-bold text-error">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {copy.detail.rejectedBanner}
              </p>
              <p className="mt-1.5 pl-6 text-sm text-foreground">“{site.rejectionReason}”</p>
              <p className="mt-1 pl-6 text-xs text-muted">{copy.detail.rejectedFix}</p>
            </div>
          )}
          {site.status === 'pending_review' && (
            <p className="mt-4 flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
              <Clock3 className="h-4 w-4 shrink-0" />
              {copy.detail.underReview}
            </p>
          )}
          {site.status === 'listed' && (
            <p className="mt-4 flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {copy.detail.listedNote}
            </p>
          )}

          {site.status === 'draft' && canEdit && (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {!rejected && site.status === 'draft' && (
                <button
                  type="button"
                  disabled={Boolean(busy) || !canSubmitAll}
                  onClick={() => {
                    if (!window.confirm(withLabel(copy.detail.submitConfirm, site.name))) return;
                    void run('submit', async () => {
                      await submitSite(orgId, site.id);
                      await reload();
                    });
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-60"
                >
                  {busy === 'submit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {copy.detail.submitForReview}
                </button>
              )}
              {rejected && (
                <button
                  type="button"
                  disabled={Boolean(busy) || !canSubmitAll}
                  onClick={() => {
                    if (!window.confirm(withLabel(copy.detail.resubmitConfirm, site.name))) return;
                    void run('submit', async () => {
                      await submitSite(orgId, site.id);
                      await reload();
                    });
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-60"
                >
                  {busy === 'submit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {copy.detail.resubmit}
                </button>
              )}
              {!hasFrontPhoto && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {copy.detail.frontRequired}
                </p>
              )}
              {hasFrontPhoto && (!hasFace || !hasLiveRate) && (
                <p className="text-xs text-muted">{copy.detail.advisorySuggestion}</p>
              )}
            </div>
          )}

          {actionError && (
            <p role="alert" className="mt-4 rounded-lg bg-error/10 px-4 py-3 text-sm font-medium text-error">
              {actionError}
            </p>
          )}

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <DetailsSection
              site={site}
              orgId={orgId}
              editable={detailsEditable}
              locale={locale}
              copy={copy}
              busy={busy}
              reload={reload}
              run={run}
            />
            <PhotosSection
              site={site}
              orgId={orgId}
              editable={canEdit}
              onUploadCancelled={(busyKey) => (cancelledKeyRef.current = busyKey)}
              onUploadSettled={(busyKey) => {
                if (cancelledKeyRef.current === busyKey) cancelledKeyRef.current = null;
              }}
              copy={copy}
              busy={busy}
              reload={reload}
              run={run}
            />
            <FacesSection
              site={site}
              orgId={orgId}
              editable={canEdit && canCreateFace}
              removable={canDelete}
              copy={copy}
              busy={busy}
              reload={reload}
              run={run}
            />
            <RatesSection
              site={site}
              orgId={orgId}
              editable={canEdit}
              locale={locale}
              copy={copy}
              busy={busy}
              reload={reload}
              run={run}
            />
          </div>
        </div>
      )}
    </WorkspaceFrame>
  );
}

// ------------------------------------------------------------------ details
function DetailsSection({
  site,
  orgId,
  editable,
  locale,
  copy,
  busy,
  reload,
  run,
}: {
  site: SiteDetail;
  orgId: string | undefined;
  editable: boolean;
  locale: SiteLocale | undefined;
  copy: ReturnType<typeof getSitesCopy>;
  busy: string;
  reload: () => Promise<void>;
  run: (key: string, action: () => Promise<void>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<'latitude' | 'longitude' | 'width' | 'height', string>>
  >({});
  const [form, setForm] = useState({
    name: site.name,
    format: site.format,
    latitude: String(site.latitude ?? ''),
    longitude: String(site.longitude ?? ''),
    address: site.address ?? '',
    city: site.city ?? '',
    region: site.region ?? '',
    country: site.country,
    width: String(site.width ?? ''),
    height: String(site.height ?? ''),
    units: site.units ?? 'm',
    orientationDeg: site.orientationDeg != null ? String(site.orientationDeg) : '',
    illuminationType: site.illuminationType,
    illuminationHours: site.illuminationHours ?? '',
    description: site.description ?? '',
  });

  const rows: Array<[string, string]> = [
    [copy.detail.formatLabel, prettyFormat(site.format, locale)],
    [copy.detail.dimsLabel, `${site.width ?? '—'} × ${site.height ?? '—'} ${site.units ?? ''}`.trim()],
    [copy.detail.areaLabel, site.area != null ? `${site.area} ${site.units ?? ''}`.trim() : '—'],
    [copy.detail.coordsLabel, `${site.latitude}, ${site.longitude}`],
    [copy.detail.addressLabel, [site.address, site.city, site.region].filter(Boolean).join(', ') || '—'],
    [copy.detail.illuminationLabel, `${prettyIllumination(site.illuminationType, locale)}${site.illuminationHours ? ` · ${site.illuminationHours}` : ''}`],
    [copy.detail.orientationLabel, site.orientationDeg != null ? `${site.orientationDeg}°` : '—'],
    [copy.detail.permitLabel, site.permitRef ?? copy.detail.permitNone],
  ];

  const onSave = (event: FormEvent) => {
    event.preventDefault();
    // Same rules as registration (SPEC §5.1): unambiguous numbers, latitude
    // ±90°, longitude ±180°, positive dimensions. French decimal commas
    // ('12,5') parse normally; mixed/ambiguous entries must be fixed here,
    // never posted.
    const lat = parseDecimal(form.latitude);
    const lon = parseDecimal(form.longitude);
    const width = parseDecimal(form.width);
    const height = parseDecimal(form.height);
    const next: Partial<Record<'latitude' | 'longitude' | 'width' | 'height', string>> = {};
    if (lat === null) next.latitude = copy.register.requiredFields;
    else if (Math.abs(lat) > 90) next.latitude = copy.register.requiredFields;
    if (lon === null) next.longitude = copy.register.requiredFields;
    else if (Math.abs(lon) > 180) next.longitude = copy.register.requiredFields;
    if (width === null || width <= 0) next.width = copy.register.requiredFields;
    if (height === null || height <= 0) next.height = copy.register.requiredFields;
    setFieldErrors(next);
    if (Object.keys(next).length > 0) return;
    // Validation guarantees every value parsed and inside range.
    const latValue = lat as number;
    const lonValue = lon as number;
    const widthValue = width as number;
    const heightValue = height as number;
    const orientation = parseDecimal(form.orientationDeg);
    void run('details', async () => {
      await updateSite(orgId, site.id, {
        name: form.name.trim(),
        format: form.format,
        latitude: latValue,
        longitude: lonValue,
        city: form.city.trim(),
        country: form.country.trim(),
        width: widthValue,
        height: heightValue,
        units: form.units,
        ...(orientation !== null ? { orientationDeg: orientation } : { orientationDeg: null }),
        illuminationType: form.illuminationType,
        ...(form.illuminationType !== 'none'
          ? { illuminationHours: form.illuminationHours.trim() || undefined }
          : { illuminationHours: null }),
        address: form.address.trim() || null,
        region: form.region.trim() || null,
        description: form.description.trim() || null,
      });
      setEditing(false);
      await reload();
    });
  };

  return (
    <SectionCard
      title={copy.detail.details}
      action={
        editable && !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold transition hover:bg-surface-2"
          >
            <Pencil className="h-3.5 w-3.5" />
            {copy.detail.edit}
          </button>
        ) : undefined
      }
    >
      {editing ? (
        <form onSubmit={onSave} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={copy.register.name} htmlFor="dName" className="sm:col-span-2">
              <input
                id="dName"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className={inputClass}
                required
              />
            </Field>
            <Field label={copy.detail.formatLabel} htmlFor="dFormat">
              <select
                id="dFormat"
                value={form.format}
                onChange={(event) => setForm({ ...form, format: event.target.value })}
                className={inputClass}
              >
                <option value="static">{copy.register.formatStatic}</option>
                <option value="digital_led">{copy.register.formatLed}</option>
                <option value="3d">{copy.register.format3d}</option>
              </select>
            </Field>
            <Field
              label={copy.detail.coordsLabel}
              htmlFor="dLat"
              error={fieldErrors.latitude ?? fieldErrors.longitude}
            >
              <span className="flex gap-2">
                <input
                  id="dLat"
                  type="text"
                  inputMode="decimal"
                  value={form.latitude}
                  onChange={(event) => setForm({ ...form, latitude: event.target.value })}
                  className={inputClass}
                  aria-label={copy.register.latitude}
                  required
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.longitude}
                  onChange={(event) => setForm({ ...form, longitude: event.target.value })}
                  className={inputClass}
                  aria-label={copy.register.longitude}
                  required
                />
              </span>
            </Field>
            <Field label={copy.detail.addressLabel} htmlFor="dAddress">
              <input
                id="dAddress"
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label={copy.register.city} htmlFor="dCity">
              <input
                id="dCity"
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
                className={inputClass}
                required
              />
            </Field>
            <Field
              label={copy.detail.dimsLabel}
              htmlFor="dWidth"
              error={fieldErrors.width ?? fieldErrors.height}
            >
              <span className="flex gap-2">
                <input
                  id="dWidth"
                  type="text"
                  inputMode="decimal"
                  min="0"
                  value={form.width}
                  onChange={(event) => setForm({ ...form, width: event.target.value })}
                  className={inputClass}
                  aria-label={copy.register.width}
                  required
                />
                <input
                  type="text"
                  inputMode="decimal"
                  min="0"
                  value={form.height}
                  onChange={(event) => setForm({ ...form, height: event.target.value })}
                  className={inputClass}
                  aria-label={copy.register.height}
                  required
                />
              </span>
            </Field>
            <Field label={copy.register.orientation} htmlFor="dOrient" hint={copy.register.orientationHint}>
              <input
                id="dOrient"
                type="text"
                inputMode="decimal"
                min="0"
                max="359"
                value={form.orientationDeg}
                onChange={(event) => setForm({ ...form, orientationDeg: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label={copy.register.illuminationType} htmlFor="dIllum">
              <select
                id="dIllum"
                value={form.illuminationType}
                onChange={(event) => setForm({ ...form, illuminationType: event.target.value })}
                className={inputClass}
              >
                <option value="none">{copy.register.illumNone}</option>
                <option value="front_lit">{copy.register.illumFront}</option>
                <option value="back_lit">{copy.register.illumBack}</option>
                <option value="edge_lit">{copy.register.illumEdge}</option>
                <option value="led">{copy.register.illumLed}</option>
              </select>
            </Field>
            {form.illuminationType !== 'none' && (
              <Field label={copy.register.illuminationHours} htmlFor="dIllumHours">
                <input
                  id="dIllumHours"
                  value={form.illuminationHours}
                  onChange={(event) => setForm({ ...form, illuminationHours: event.target.value })}
                  className={inputClass}
                />
              </Field>
            )}
            <Field label={copy.register.description} htmlFor="dDesc" className="sm:col-span-2">
              <textarea
                id="dDesc"
                rows={3}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                className={inputClass}
              />
            </Field>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={busy === 'details'}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-70"
            >
              {busy === 'details' && <Loader2 className="h-4 w-4 animate-spin" />}
              {copy.detail.save}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="min-h-10 rounded-lg px-3 text-sm font-semibold text-muted transition hover:text-foreground"
            >
              {copy.detail.cancel}
            </button>
          </div>
        </form>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
          <div className="contents">
            <dt className="text-muted">{copy.register.description}</dt>
            <dd className="whitespace-pre-line font-medium">{site.description || '—'}</dd>
          </div>
        </dl>
      )}
    </SectionCard>
  );
}

// ------------------------------------------------------------------- photos
function PhotosSection({
  site,
  orgId,
  editable,
  copy,
  busy,
  reload,
  run,
  onUploadCancelled,
  onUploadSettled,
}: {
  site: SiteDetail;
  orgId: string | undefined;
  editable: boolean;
  copy: ReturnType<typeof getSitesCopy>;
  busy: string;
  reload: () => Promise<void>;
  run: (key: string, action: () => Promise<void>) => Promise<void>;
  onUploadCancelled?: (busyKey: string) => void;
  onUploadSettled?: (busyKey: string) => void;
}) {
  const [uploadError, setUploadError] = useState('');
  const uploadAbortRef = useRef<AbortController | null>(null);
  const kinds: Array<keyof typeof copy.register & string> = ['photoFront', 'photoContext', 'photoNight'];
  const kindValue = (label: string) =>
    label === copy.register.photoFront ? 'front' : label === copy.register.photoContext ? 'context' : 'night';

  const onUpload = (kind: string, files: FileList | null) => {
    setUploadError('');
    const file = files?.[0];
    if (!file || !orgId) return;
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
      setUploadError(copy.register.photoError);
      return;
    }
    // A cancel flag from a previous attempt must not swallow this upload's
    // own timeout, so retire it before the new request starts.
    onUploadSettled?.(`upload-${kind}`);
    void run(`upload-${kind}`, async () => {
      const controller = new AbortController();
      uploadAbortRef.current = controller;
      try {
        await uploadAsset(orgId, site.id, kind, file, controller.signal);
        await reload();
        // Settled after reload too: a Cancel clicked while reload was still in
        // flight sets the flag last, so this clears it at the very end.
        onUploadSettled?.(`upload-${kind}`);
      } finally {
        if (uploadAbortRef.current === controller) uploadAbortRef.current = null;
      }
    });
  };

  return (
    <SectionCard title={copy.detail.photos}>
      {site.assets.length === 0 && <p className="text-sm text-muted">{copy.detail.noPhotos}</p>}
      {site.assets.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {site.assets.map((asset: SiteAsset) => (
            <li key={asset.id} className="group relative">
              <AssetItem asset={asset} copy={copy} />
              {editable && (
                <button
                  type="button"
                  aria-label={`${copy.register.photoRemove}: ${photoKindLabel(asset.kind, copy)}`}
                  disabled={busy === `del-${asset.id}`}
                  onClick={() => {
                    if (!window.confirm(withLabel(copy.register.photoRemoveConfirm, photoKindLabel(asset.kind, copy))))
                      return;
                    void run(`del-${asset.id}`, async () => {
                      await deleteAsset(orgId, site.id, asset.id);
                      await reload();
                    });
                  }}
                  className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-background/85 text-error transition hover:bg-background/95"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {(uploadError || busy.startsWith('upload-')) && (
        <div className="mt-3">
          {uploadError && (
            <p role="alert" className="text-xs font-medium text-error">
              {uploadError}
            </p>
          )}
          {busy.startsWith('upload-') && (
            <p className="flex items-center gap-2 text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {copy.detail.uploading}
              <button
                type="button"
                aria-label={`${copy.detail.cancel} ${copy.detail.uploading}`}
                onClick={() => {
                  onUploadCancelled?.(busy);
                  uploadAbortRef.current?.abort();
                }}
                className="ml-1 font-bold text-error underline underline-offset-2 transition hover:text-error/80"
              >
                {copy.detail.cancel}
              </button>
            </p>
          )}
        </div>
      )}
      {editable && (
        <div className="mt-4 flex flex-wrap gap-3">
          {kinds.map((label) => (
            <label
              key={label}
              className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold transition hover:bg-surface-2"
            >
              {busy === `upload-${kindValue(copy.register[label])}` ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlusCircle className="h-3.5 w-3.5 text-primary" />
              )}
              {copy.register[label]}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  onUpload(kindValue(copy.register[label]), event.target.files);
                  event.target.value = '';
                }}
              />
            </label>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/** Replace a single {{label}} placeholder in confirm-dialog copy. */
const withLabel = (template: string, label: string): string =>
  template.replace('{{label}}', label);

function photoKindLabel(kind: SiteAsset['kind'], copy: ReturnType<typeof getSitesCopy>): string {
  return kind === 'front'
    ? copy.register.photoFront
    : kind === 'context'
      ? copy.register.photoContext
      : kind === 'night'
        ? copy.register.photoNight
        : kind;
}

function AssetItem({ asset, copy }: { asset: SiteAsset; copy: ReturnType<typeof getSitesCopy> }) {
  const label = photoKindLabel(asset.kind, copy);
  return (
    <figure>
      <AuthAssetThumb display={assetDisplay(asset)} alt={label} size="h-28 w-full" />
      <figcaption className="mt-1 text-xs font-semibold text-muted">{label}</figcaption>
    </figure>
  );
}

// -------------------------------------------------------------------- faces
function FacesSection({
  site,
  orgId,
  editable,
  removable,
  copy,
  busy,
  reload,
  run,
}: {
  site: SiteDetail;
  orgId: string | undefined;
  editable: boolean;
  removable: boolean;
  copy: ReturnType<typeof getSitesCopy>;
  busy: string;
  reload: () => Promise<void>;
  run: (key: string, action: () => Promise<void>) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ faceLabel: '', width: '', height: '', units: 'm' });
  const faceWidth = parseDecimal(form.width);
  const faceHeight = parseDecimal(form.height);
  const area = faceWidth !== null && faceHeight !== null ? faceWidth * faceHeight : NaN;

  const onAdd = (event: FormEvent) => {
    event.preventDefault();
    if (!orgId || !Number.isFinite(area) || area <= 0 || faceWidth === null || faceHeight === null) return;
    void run('face', async () => {
      await addFace(orgId, site.id, {
        faceLabel: form.faceLabel.trim(),
        width: faceWidth,
        height: faceHeight,
        area,
        units: form.units,
        bookable: true,
      });
      setForm({ faceLabel: '', width: '', height: '', units: form.units });
      setAdding(false);
      await reload();
    });
  };

  return (
    <SectionCard
      title={copy.detail.faces}
      action={
        editable && !adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold transition hover:bg-surface-2"
          >
            <PlusCircle className="h-3.5 w-3.5 text-primary" />
            {copy.detail.addFace}
          </button>
        ) : undefined
      }
    >
      {site.faces.length === 0 && <p className="text-sm text-muted">{copy.detail.noFaces}</p>}
      {site.faces.length > 0 && (
        <ul className="space-y-2">
          {site.faces.map((face: SiteFace) => (
            <li
              key={face.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5"
            >
              <div>
                <p className="text-sm font-bold">
                  {face.faceLabel}
                  <span className="ml-2 font-medium text-muted">
                    {face.width} × {face.height} {face.units} · {face.area} {face.units}²
                  </span>
                </p>
                <p className="text-xs text-muted">
                  {copy.detail.faceBookable}: {face.bookable ? '✓' : '—'}
                </p>
              </div>
              {removable && (
                <button
                  type="button"
                  aria-label={`${copy.detail.faceRemove}: ${face.faceLabel}`}
                  disabled={busy === `face-del-${face.id}`}
                  onClick={() => {
                    if (!window.confirm(withLabel(copy.detail.faceRemoveConfirm, face.faceLabel))) return;
                    void run(`face-del-${face.id}`, async () => {
                      await removeFace(orgId, face.id);
                      await reload();
                    });
                  }}
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-error/10 hover:text-error"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && editable && (
        <form onSubmit={onAdd} className="mt-4 space-y-3 rounded-lg border border-border bg-surface-2 p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={copy.detail.faceLabel} htmlFor="faceLabel">
              <input
                id="faceLabel"
                value={form.faceLabel}
                onChange={(event) => setForm({ ...form, faceLabel: event.target.value })}
                className={inputClass}
                required
                maxLength={20}
              />
            </Field>
            <Field label={copy.detail.faceSize} htmlFor="faceWidth">
              <span className="flex gap-2">
                <input
                  id="faceWidth"
                  type="text"
                  inputMode="decimal"
                  min="0"
                  value={form.width}
                  onChange={(event) => setForm({ ...form, width: event.target.value })}
                  className={inputClass}
                  aria-label={copy.register.width}
                  required
                />
                <input
                  type="text"
                  inputMode="decimal"
                  min="0"
                  value={form.height}
                  onChange={(event) => setForm({ ...form, height: event.target.value })}
                  className={inputClass}
                  aria-label={copy.register.height}
                  required
                />
              </span>
            </Field>
            <Field label={copy.register.units} htmlFor="faceUnits">
              <select
                id="faceUnits"
                value={form.units}
                onChange={(event) => setForm({ ...form, units: event.target.value })}
                className={inputClass}
              >
                <option value="m">m</option>
                <option value="ft">ft</option>
              </select>
            </Field>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={busy === 'face'}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-70"
            >
              {busy === 'face' && <Loader2 className="h-4 w-4 animate-spin" />}
              {copy.detail.addFace}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="min-h-10 rounded-lg px-3 text-sm font-semibold text-muted transition hover:text-foreground"
            >
              {copy.detail.cancel}
            </button>
          </div>
        </form>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------- rate cards
function RatesSection({
  site,
  orgId,
  editable,
  locale,
  copy,
  busy,
  reload,
  run,
}: {
  site: SiteDetail;
  orgId: string | undefined;
  editable: boolean;
  locale: SiteLocale | undefined;
  copy: ReturnType<typeof getSitesCopy>;
  busy: string;
  reload: () => Promise<void>;
  run: (key: string, action: () => Promise<void>) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    currency: 'NGN',
    perDay: '',
    perWeek: '',
    perMonth: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
  });
  const [formError, setFormError] = useState('');
  const [rateErrors, setRateErrors] = useState<
    Partial<Record<'perDay' | 'perWeek' | 'perMonth', string>>
  >({});

  const onAdd = (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    // Parse each amount locale-aware: spaces are thousands grouping, a comma
    // or point with 1-2 digits is a decimal ('12,50' → 12.50). Ambiguous
    // magnitudes ('6,000', '6.000') are rejected, never reinterpreted, so
    // nothing invalid or 100×-off reaches the API.
    const parsed: Partial<Record<'perDay' | 'perWeek' | 'perMonth', number>> = {};
    const invalid: Partial<Record<'perDay' | 'perWeek' | 'perMonth', string>> = {};
    for (const field of ['perDay', 'perWeek', 'perMonth'] as const) {
      const raw = form[field].trim();
      if (raw === '') continue;
      const value = parseAmount(raw);
      if (value === null || value <= 0) {
        const stripped = raw.replace(/[\s\u00A0\u202F']/g, '');
        const ambiguous =
          (stripped.includes('.') && stripped.includes(',')) ||
          /^[-+]?\d{1,3}([.,]\d{3})+$/.test(stripped);
        invalid[field] = ambiguous ? copy.detail.rateValueAmbiguous : copy.detail.rateValueInvalid;
      } else {
        parsed[field] = value;
      }
    }
    if (Object.keys(invalid).length > 0) {
      setRateErrors((previous) => ({ ...previous, perDay: undefined, perWeek: undefined, perMonth: undefined, ...invalid }));
      return;
    }
    if (Object.keys(parsed).length === 0 || !orgId) {
      setFormError(copy.detail.rateHint);
      return;
    }
    void run('rate', async () => {
      await addRateCard(orgId, site.id, {
        currency: form.currency,
        rates: parsed,
        effectiveFrom: form.effectiveFrom,
      });
      setForm({ ...form, perDay: '', perWeek: '', perMonth: '' });
      setRateErrors({});
      setAdding(false);
      await reload();
    });
  };

  const money = (amount: number | undefined, currency: string) =>
    amount == null ? undefined : formatMoney(amount, currency, locale);

  return (
    <SectionCard
      title={copy.detail.rates}
      action={
        editable && !adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold transition hover:bg-surface-2"
          >
            <PlusCircle className="h-3.5 w-3.5 text-primary" />
            {copy.detail.addRate}
          </button>
        ) : undefined
      }
    >
      {site.rateCards.length === 0 && <p className="text-sm text-muted">{copy.detail.noRates}</p>}
      {site.rateCards.length > 0 && (
        <ul className="space-y-2">
          {site.rateCards.map((card: RateCard) => (
            <li key={card.id} className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-bold">
                  <Banknote className="h-4 w-4 text-primary" />
                  {card.currency}
                </p>
                {editable && !card.effectiveTo && (
                  <button
                    type="button"
                    disabled={busy === `rate-end-${card.id}`}
                    onClick={() => {
                      if (!window.confirm(withLabel(copy.detail.rateEndConfirm, card.currency))) return;
                      void run(`rate-end-${card.id}`, async () => {
                        await endRateCard(orgId, card.id, new Date().toISOString().slice(0, 10));
                        await reload();
                      });
                    }}
                    className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-bold text-muted transition hover:text-foreground disabled:opacity-60"
                  >
                    <Ban className="h-3 w-3" />
                    {copy.detail.rateEnd}
                  </button>
                )}
              </div>
              <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
                {card.rates.perDay != null && (
                  <span>
                    {copy.detail.perDay}: {money(card.rates.perDay, card.currency)}
                  </span>
                )}
                {card.rates.perWeek != null && (
                  <span>
                    {copy.detail.perWeek}: {money(card.rates.perWeek, card.currency)}
                  </span>
                )}
                {card.rates.perMonth != null && (
                  <span>
                    {copy.detail.perMonth}: {money(card.rates.perMonth, card.currency)}
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-muted">
                {copy.detail.effectiveFrom} {card.effectiveFrom.slice(0, 10)}
                {card.effectiveTo ? ` · ${copy.detail.effectiveTo} ${card.effectiveTo.slice(0, 10)}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
      {adding && editable && (
        <form onSubmit={onAdd} className="mt-4 space-y-3 rounded-lg border border-border bg-surface-2 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={copy.detail.currency} htmlFor="rateCurrency">
              <select
                id="rateCurrency"
                value={form.currency}
                onChange={(event) => setForm({ ...form, currency: event.target.value })}
                className={inputClass}
              >
                {SUPPORTED_CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={copy.detail.effectiveFrom} htmlFor="rateFrom">
              <input
                id="rateFrom"
                type="date"
                value={form.effectiveFrom}
                onChange={(event) => setForm({ ...form, effectiveFrom: event.target.value })}
                className={inputClass}
                required
              />
            </Field>
            <Field label={copy.detail.perDay} htmlFor="rateDay" error={rateErrors.perDay}>
              <input
                id="rateDay"
                type="text"
                inputMode="decimal"
                min="0"
                value={form.perDay}
                onChange={(event) => setForm({ ...form, perDay: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label={copy.detail.perWeek} htmlFor="rateWeek" error={rateErrors.perWeek}>
              <input
                id="rateWeek"
                type="text"
                inputMode="decimal"
                min="0"
                value={form.perWeek}
                onChange={(event) => setForm({ ...form, perWeek: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label={copy.detail.perMonth} htmlFor="rateMonth" error={rateErrors.perMonth}>
              <input
                id="rateMonth"
                type="text"
                inputMode="decimal"
                min="0"
                value={form.perMonth}
                onChange={(event) => setForm({ ...form, perMonth: event.target.value })}
                className={inputClass}
              />
            </Field>
          </div>
          {formError && (
            <p role="alert" className="text-xs font-medium text-error">
              {formError}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={busy === 'rate'}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-70"
            >
              {busy === 'rate' && <Loader2 className="h-4 w-4 animate-spin" />}
              {copy.detail.addRate}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="min-h-10 rounded-lg px-3 text-sm font-semibold text-muted transition hover:text-foreground"
            >
              {copy.detail.cancel}
            </button>
          </div>
        </form>
      )}
    </SectionCard>
  );
}

export default function SiteDetailPage() {
  return (
    <Suspense fallback={null}>
      <DetailInner />
    </Suspense>
  );
}
