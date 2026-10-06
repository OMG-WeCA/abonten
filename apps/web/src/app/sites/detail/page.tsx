'use client';

import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock3,
  Banknote,
  Loader2,
  MapPin,
  Pencil,
  PlusCircle,
  Trash2,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUnsavedNavigation, confirmUnsavedNavigation } from '../../../lib/unsaved-navigation';
import { ApiError } from '../../../lib/api';
import {
  Suspense,
  useEffect,
  useCallback,
  useRef,
  useState,
  type FormEvent,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { WorkspaceFrame } from '../../../components/account/WorkspaceFrame';
import { useAuth } from '../../../components/auth/AuthProvider';
import {
  MediaCapturePicker,
  type PendingSiteMedia,
} from '../../../components/sites/MediaCapturePicker';
import { AuthBoardVideo, MediaEvidence } from '../../../components/sites/BoardMedia';
import { LocationVerification } from '../../../components/sites/LocationVerification';
import { RegistrationMap } from '../../../components/sites/RegistrationMap';
import { Lightbox, lightboxAlt, type LightboxAsset } from '../../../components/sites/Lightbox';
import { SiteMapView } from '../../../components/sites/SiteMap';
import { PartnerAvailability } from '../../../components/sites/PartnerAvailability';
import { GeographicContextPanel } from '../../../components/sites/GeographicContextPanel';
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
  listMarkets,
  removeFace,
  submitSite,
  updateFace,
  updateSite,
  uploadAsset,
  uploadBoardVideo,
  withdrawFutureRateCard,
  type Market,
  type RateCard,
  type SeasonalRule,
  type SiteAsset,
  type SiteDetail,
  type SiteFace,
} from '../../../lib/sites-api';
import { SUPPORTED_MARKETS, findMarket } from '../../../lib/markets';
import { SUPPORTED_CURRENCIES } from '../../../lib/currencies';
import { metadataFacts, metadataLink } from '../../../lib/site-metadata-display';
import { displayDateOnly, displayNumber, displayUtcTimestamp } from '../../../lib/locale-format';
import { agencyEvidenceText, agencyEvidenceUnit } from '../../../lib/agency-evidence-locale';
import { formatArea, formatMoney, parseAmount, parseDecimal } from '../../../lib/number-format';
import { getSitesCopy, type SiteLocale } from '../../../lib/sites-locale';
import { plausibilityErrors } from '../../../lib/sites-plausibility';

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
  const [mapOpen, setMapOpen] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<PendingSiteMedia[]>([]);
  const resourceRef = useRef('');
  const [unsavedSections, setUnsavedSections] = useState<Record<string, boolean>>({});
  const markUnsavedSection = useCallback(
    (section: string, dirty: boolean) =>
      setUnsavedSections((previous) =>
        previous[section] === dirty ? previous : { ...previous, [section]: dirty },
      ),
    [],
  );
  useUnsavedNavigation(
    pendingMedia.length > 0 || Object.values(unsavedSections).some(Boolean),
    locale === 'fr'
      ? 'Quitter cette page ? Les modifications et médias non enregistrés seront perdus. Choisissez Annuler pour continuer.'
      : 'Leave this page? Unsaved changes and media will be discarded. Choose Cancel to keep editing.',
  );
  const goBack = () => {
    if (confirmUnsavedNavigation()) router.push('/sites');
  };

  // Records the busy key whose in-flight request the user just cancelled, so
  // run() can tell a deliberate cancel apart from a slow-connection timeout.
  const cancelledKeyRef = useRef<string | null>(null);
  const loadControllerRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;
    if (!orgId) {
      setLoadError(copy.detail.notFound);
      return;
    }
    if (!siteId) {
      setLoadError(copy.detail.notFound);
      return;
    }
    try {
      const loaded = await getSite(orgId, siteId, controller.signal);
      if (controller.signal.aborted) return;
      setSite(loaded);
      setLoadError('');
    } catch (error) {
      if (controller.signal.aborted) return;
      setLoadError(
        error instanceof ApiError && error.status === 403
          ? copy.detail.notFound
          : copy.admin.loadError,
      );
    }
  }, [orgId, siteId, copy.detail.notFound, copy.admin.loadError]);

  useEffect(() => {
    const resource = `${orgId ?? ''}:${siteId}`;
    if (resourceRef.current !== resource) {
      resourceRef.current = resource;
      setSite(null);
      setPendingMedia([]);
    }
    setLoadError('');
    void reload();
    return () => loadControllerRef.current?.abort();
  }, [reload, orgId, siteId]);

  const detailsEditable = site !== null && canEdit;
  const canDelete = capabilities.includes('INVENTORY_DELETE');
  const hasFrontPhoto =
    site?.assets.some((asset) => asset.kind === 'front' && asset.capturedAt) ?? false;
  const undatedFrontPhoto =
    !hasFrontPhoto && (site?.assets.some((asset) => asset.kind === 'front') ?? false);
  const frontPhotoRequirement = undatedFrontPhoto
    ? locale === 'fr'
      ? 'La date de la photo de face est inconnue. Importez une photo de remplacement avec une date intégrée ou indiquez sa date de prise de vue réelle.'
      : 'The front photo capture date is unknown. Upload a replacement with embedded date metadata or declare its actual capture date.'
    : copy.detail.frontRequired;
  const today = new Date().toISOString().slice(0, 10);
  const bookableFaces = site?.faces.filter((face) => face.bookable) ?? [];
  const hasFace = bookableFaces.length > 0;
  const digitalReady =
    site?.format !== 'digital_led' ||
    bookableFaces.every((face) =>
      Boolean(
        face.pixelWidth &&
        face.pixelHeight &&
        face.spotLengthSeconds &&
        face.loopLengthSeconds &&
        face.spotsPerLoop,
      ),
    );
  const hasLiveRate =
    hasFace &&
    bookableFaces.every((face) =>
      site?.rateCards.some(
        (card) =>
          (!card.faceId || card.faceId === face.id) &&
          card.effectiveFrom.slice(0, 10) <= today &&
          (!card.effectiveTo || card.effectiveTo.slice(0, 10) >= today) &&
          Object.values(card.rates).some((value) => typeof value === 'number' && value > 0),
      ),
    );
  const permitCurrent = !site?.permitExpiresAt || site.permitExpiresAt.slice(0, 10) >= today;
  const canSubmitAll = hasFrontPhoto && hasFace && hasLiveRate && digitalReady && permitCurrent;
  const rejected =
    Boolean(site?.rejectionReason) && (site?.status === 'draft' || site?.status === 'rejected');

  const run = async (key: string, action: () => Promise<void>) => {
    if (busy) return;
    setActionError('');
    setBusy(key);
    try {
      await action();
    } catch (error) {
      const abortedUpload = ((error as { name?: string })?.name === 'AbortError' &&
        key.startsWith('upload-')) as boolean;
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
            onClick={() => void reload()}
            className="mt-4 min-h-10 rounded-lg bg-primary px-4 text-sm font-bold text-white"
          >
            {locale === 'fr' ? 'Réessayer' : 'Retry'}
          </button>
          <button
            type="button"
            onClick={goBack}
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
        onClick={goBack}
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
            <code className="rounded bg-muted/15 px-2 py-1 text-xs font-semibold text-muted">
              {site.code}
            </code>
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
          <div className="mt-4">
            <LocationVerification
              site={site}
              orgId={orgId}
              locale={locale}
              editable={canEdit}
              onUpdated={reload}
            />
          </div>
          {site.status === 'pending_review' && (
            <p className="mt-4 flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
              <Clock3 className="h-4 w-4 shrink-0" />
              {copy.detail.underReview}
            </p>
          )}
          {site.status === 'listed' && canSubmitAll && (
            <p className="mt-4 flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {copy.detail.listedNote}
            </p>
          )}
          {site.status === 'listed' && !canSubmitAll && (
            <div
              role="alert"
              className="mt-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
            >
              <p>{copy.detail.bookingSetupNeeded}</p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {!hasFrontPhoto && <li>{frontPhotoRequirement}</li>}
                {!hasFace && <li>{copy.detail.faceRequired}</li>}
                {hasFace && !hasLiveRate && <li>{copy.detail.rateRequired}</li>}
                {hasFace && !digitalReady && <li>{copy.detail.digitalRequired}</li>}
                {!permitCurrent && <li>{copy.detail.permitExpired}</li>}
              </ul>
            </div>
          )}

          {(site.status === 'draft' || site.status === 'rejected') && canEdit && (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {!rejected && site.status === 'draft' && (
                <button
                  type="button"
                  disabled={Boolean(busy) || !canSubmitAll}
                  onClick={() => {
                    if (!window.confirm(withLabel(copy.detail.submitConfirm, site.name))) return;
                    void run('submit', async () => {
                      await submitSite(orgId, site.id, locale);
                      await reload();
                    });
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-60"
                >
                  {busy === 'submit' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
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
                      await submitSite(orgId, site.id, locale);
                      await reload();
                    });
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-60"
                >
                  {busy === 'submit' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {copy.detail.resubmit}
                </button>
              )}
              {!hasFrontPhoto && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {frontPhotoRequirement}
                </p>
              )}
              {hasFrontPhoto && !hasFace && (
                <p className="text-xs text-warning">{copy.detail.faceRequired}</p>
              )}
              {hasFrontPhoto && hasFace && !hasLiveRate && (
                <p className="text-xs text-warning">{copy.detail.rateRequired}</p>
              )}
              {hasFrontPhoto && hasFace && !digitalReady && (
                <p className="text-xs text-warning">{copy.detail.digitalRequired}</p>
              )}
              {!permitCurrent && (
                <p className="text-xs text-warning">{copy.detail.permitExpired}</p>
              )}
            </div>
          )}

          {actionError && (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-error/10 px-4 py-3 text-sm font-medium text-error"
            >
              {actionError}
            </p>
          )}

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <DetailsSection
              onUnsavedChange={markUnsavedSection}
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
              pending={pendingMedia}
              setPending={setPendingMedia}
              site={site}
              orgId={orgId}
              editable={canEdit}
              locale={locale}
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
              onUnsavedChange={markUnsavedSection}
              locale={locale}
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
              onUnsavedChange={markUnsavedSection}
              site={site}
              orgId={orgId}
              editable={canEdit}
              locale={locale}
              copy={copy}
              busy={busy}
              reload={reload}
              run={run}
            />
            <PartnerAvailability
              orgId={orgId}
              faces={site.faces}
              editable={canEdit}
              locale={locale}
            />
            <GeographicContextPanel
              orgId={orgId}
              siteId={site.id}
              revision={site.updatedAt}
              locale={locale}
              onViewMap={() => setMapOpen(true)}
            />
            <MetadataSection site={site} locale={locale} copy={copy} />
            <MapSection
              site={site}
              locale={locale}
              copy={copy}
              mapOpen={mapOpen}
              onOpen={() => setMapOpen(true)}
              onExit={() => setMapOpen(false)}
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
  onUnsavedChange,
}: {
  onUnsavedChange: (section: string, dirty: boolean) => void;
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
  useEffect(() => {
    onUnsavedChange('details', editing);
    return () => onUnsavedChange('details', false);
  }, [editing, onUnsavedChange]);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});
  const [markets, setMarkets] = useState<Market[]>([]);
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
    viewingDistance: site.viewingDistance != null ? String(site.viewingDistance) : '',
    elevation: site.elevation != null ? String(site.elevation) : '',
    illuminationType: site.illuminationType,
    illuminationHours: site.illuminationHours ?? '',
    description: site.description ?? '',
    permitRef: site.permitRef ?? '',
    permitExpiresAt: site.permitExpiresAt ? String(site.permitExpiresAt).slice(0, 10) : '',
  });
  const [prov, setProv] = useState({ source: '', method: '', date: '' });
  // Tracks the structure values as loaded, so provenance is only required when
  // a hand-entered value actually changed (SPEC §5.1 trust contract 3).
  const initialStructure = useRef({
    orientationDeg: site.orientationDeg ?? null,
    viewingDistance: site.viewingDistance ?? null,
    elevation: site.elevation ?? null,
  });
  const changedStructure = (['orientationDeg', 'viewingDistance', 'elevation'] as const).filter(
    (field) => {
      const current = initialStructure.current[field];
      const incoming = form[field];
      if (incoming === '') return false;
      return Number(incoming) !== Number(current);
    },
  );

  useEffect(() => {
    if (editing && orgId && markets.length === 0) {
      void listMarkets(orgId)
        .then((response) => setMarkets(response.items))
        .catch(() => undefined);
    }
  }, [editing, orgId, markets.length]);

  const rows: Array<[string, string]> = [
    [copy.detail.formatLabel, prettyFormat(site.format, locale)],
    [
      copy.detail.dimsLabel,
      `${site.width != null ? displayNumber(site.width, locale) : '—'} × ${site.height != null ? displayNumber(site.height, locale) : '—'} ${site.units ? agencyEvidenceUnit(site.units, locale === 'fr' ? 'fr' : 'en') : ''}`.trim(),
    ],
    [copy.detail.areaLabel, formatArea(site.area, site.units, locale)],
    [copy.detail.coordsLabel, `${site.latitude}, ${site.longitude}`],
    [
      copy.detail.addressLabel,
      [site.address, site.city, site.region].filter(Boolean).join(', ') || '—',
    ],
    [
      copy.detail.illuminationLabel,
      `${prettyIllumination(site.illuminationType, locale)}${site.illuminationHours ? ` · ${site.illuminationHours}` : ''}`,
    ],
    [
      copy.detail.orientationLabel,
      site.orientationDeg != null ? `${displayNumber(site.orientationDeg, locale)}°` : '—',
    ],
    [
      copy.detail.viewingDistanceLabel,
      site.viewingDistance != null ? `${displayNumber(site.viewingDistance, locale)} m` : '—',
    ],
    [
      copy.detail.elevationLabel,
      site.elevation != null ? `${displayNumber(site.elevation, locale)} m` : '—',
    ],
    [copy.detail.permitLabel, site.permitRef ?? copy.detail.permitNone],
    [
      copy.detail.permitExpiryLabel,
      site.permitExpiresAt
        ? displayDateOnly(String(site.permitExpiresAt), locale)
        : copy.detail.permitNone,
    ],
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
    const next: Partial<Record<string, string>> = {};
    if (lat === null) next.latitude = copy.register.requiredFields;
    else if (Math.abs(lat) > 90) next.latitude = copy.register.requiredFields;
    if (lon === null) next.longitude = copy.register.requiredFields;
    else if (Math.abs(lon) > 180) next.longitude = copy.register.requiredFields;
    if (width === null || width <= 0) next.width = copy.register.requiredFields;
    if (height === null || height <= 0) next.height = copy.register.requiredFields;
    const orientation = parseDecimal(form.orientationDeg);
    const viewingDistance = parseDecimal(form.viewingDistance);
    const elevation = parseDecimal(form.elevation);
    const plausibility = plausibilityErrors({
      latitude: lat ?? undefined,
      longitude: lon ?? undefined,
      country: form.country,
      orientationDeg: orientation ?? undefined,
      viewingDistance: viewingDistance ?? undefined,
      elevation: elevation ?? undefined,
      illuminationHours: form.illuminationHours.trim() || undefined,
    });
    const localized = (key: string): string =>
      (copy.register as Record<string, string>)[key] ?? key;
    for (const [field, messageKey] of Object.entries(plausibility)) {
      if (messageKey) next[field] = localized(messageKey);
    }
    setFieldErrors(next);
    const errored = Object.values(next).filter(Boolean);
    if (errored.length > 1) {
      setFieldErrors((previous) => ({
        ...previous,
        __summary: `${errored.length} ${copy.register.errorSummarySuffix}`,
      }));
    }
    if (errored.length > 0) {
      const firstId = Object.keys(next)[0];
      document.getElementById(detailFieldId(firstId))?.focus?.();
      return;
    }
    // Validation guarantees every value parsed and inside range.
    const latValue = lat as number;
    const lonValue = lon as number;
    const widthValue = width as number;
    const heightValue = height as number;
    const patch: Parameters<typeof updateSite>[2] = {
      name: form.name.trim(),
      format: form.format,
      latitude: latValue,
      longitude: lonValue,
      city: form.city.trim(),
      country: form.country.trim(),
      width: widthValue,
      height: heightValue,
      units: form.units,
      // Structure values are never wiped: an emptied field simply keeps the
      // stored value (the API rejects null wipes for numeric core fields), so
      // corrections are provenance-tagged overwrites, not removals.
      ...(orientation !== null ? { orientationDeg: orientation } : {}),
      ...(viewingDistance !== null ? { viewingDistance } : {}),
      ...(elevation !== null ? { elevation } : {}),
      illuminationType: form.illuminationType,
      ...(form.illuminationType !== 'none'
        ? { illuminationHours: form.illuminationHours.trim() || undefined }
        : { illuminationHours: null }),
      address: form.address.trim() || null,
      region: form.region.trim() || null,
      description: form.description.trim() || null,
      ...(form.permitRef.trim() ? { permitRef: form.permitRef.trim() } : { permitRef: null }),
      ...(form.permitExpiresAt
        ? { permitExpiresAt: form.permitExpiresAt }
        : { permitExpiresAt: null }),
    };
    // Provenance: required only when a structure value actually changes.
    const changedStructure = (['orientationDeg', 'viewingDistance', 'elevation'] as const).filter(
      (field) => {
        const current = initialStructure.current[field];
        const incoming = patch[field] ?? null;
        if (incoming == null) return false;
        return Number(incoming) !== Number(current);
      },
    );
    if (changedStructure.length > 0) {
      if (!prov.source.trim() || !prov.method.trim()) {
        setFieldErrors((previous) => ({
          ...previous,
          provSource: copy.register.provenanceRequired,
          provMethod: copy.register.provenanceRequired,
        }));
        document.getElementById('dProvSource')?.focus?.();
        return;
      }
      patch.structureProvenance = {
        source: prov.source.trim(),
        method: prov.method.trim(),
        ...(prov.date ? { collectedAt: prov.date } : {}),
      };
    }
    void run('details', async () => {
      await updateSite(orgId, site.id, patch);
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
                <option value="tri_vision">{copy.register.formatTriVision}</option>
                <option value="mural">{copy.register.formatMural}</option>
                <option value="transit">{copy.register.formatTransit}</option>
                <option value="street_furniture">{copy.register.formatStreetFurniture}</option>
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
            <Field label={copy.register.region} htmlFor="dRegion">
              <input
                id="dRegion"
                value={form.region}
                onChange={(event) => setForm({ ...form, region: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label={copy.register.country} htmlFor="dCountry">
              <select
                id="dCountry"
                value={findMarket(form.country)?.name ?? form.country}
                onChange={(event) => setForm({ ...form, country: event.target.value })}
                className={inputClass}
                required
              >
                {!findMarket(form.country) && (
                  <option value={form.country}>
                    {form.country || (locale === 'fr' ? 'Choisir le pays' : 'Choose country')}
                  </option>
                )}
                {SUPPORTED_MARKETS.map((market) => (
                  <option key={market.code} value={market.name}>
                    {market.labels[locale === 'fr' ? 'fr' : 'en']}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <RegistrationMap
                latitude={form.latitude}
                longitude={form.longitude}
                country={form.country}
                locale={locale === 'fr' ? 'fr' : 'en'}
                onPick={(latitude, longitude) =>
                  setForm((previous) => ({ ...previous, latitude, longitude }))
                }
              />
              <p className="mt-2 text-xs text-muted">
                {locale === 'fr'
                  ? 'Enregistrez vos corrections avant de revérifier l’adresse et le repère.'
                  : 'Save your corrections before checking the address and pin again.'}
              </p>
            </div>
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
                <select
                  value={form.units}
                  onChange={(event) => setForm({ ...form, units: event.target.value })}
                  aria-label={copy.register.units}
                  className="w-20 shrink-0 rounded-lg border border-border bg-surface-2 px-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
                >
                  <option value="m">m</option>
                  <option value="ft">ft</option>
                </select>
              </span>
            </Field>
            <Field
              label={copy.register.orientation}
              htmlFor="dOrient"
              hint={copy.register.orientationHint}
              error={fieldErrors.orientationDeg}
            >
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
            <Field
              label={copy.register.viewingDistance}
              htmlFor="dViewingDistance"
              hint={copy.register.viewingDistanceHint}
              error={fieldErrors.viewingDistance}
            >
              <input
                id="dViewingDistance"
                type="text"
                inputMode="decimal"
                min="0"
                value={form.viewingDistance}
                onChange={(event) => setForm({ ...form, viewingDistance: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field
              label={copy.register.elevation}
              htmlFor="dElevation"
              hint={copy.register.elevationHint}
              error={fieldErrors.elevation}
            >
              <input
                id="dElevation"
                type="text"
                inputMode="decimal"
                min="0"
                value={form.elevation}
                onChange={(event) => setForm({ ...form, elevation: event.target.value })}
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
              <Field
                label={copy.register.illuminationHours}
                htmlFor="dIllumHours"
                error={fieldErrors.illuminationHours}
              >
                <input
                  id="dIllumHours"
                  value={form.illuminationHours}
                  onChange={(event) => setForm({ ...form, illuminationHours: event.target.value })}
                  className={inputClass}
                />
              </Field>
            )}
            <Field
              label={copy.register.permitRef}
              htmlFor="dPermitRef"
              hint={copy.register.permitRefHint}
            >
              <input
                id="dPermitRef"
                value={form.permitRef}
                onChange={(event) => setForm({ ...form, permitRef: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label={copy.register.permitExpiry} htmlFor="dPermitExpiry">
              <input
                id="dPermitExpiry"
                type="date"
                value={form.permitExpiresAt}
                onChange={(event) => setForm({ ...form, permitExpiresAt: event.target.value })}
                className={inputClass}
              />
            </Field>
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
          {changedStructure.length > 0 && (
            <div className="rounded-lg border border-border bg-surface-2 px-4 py-4">
              <h3 className="text-sm font-bold">{copy.register.provenanceHeading}</h3>
              <p className="mt-1 text-xs leading-5 text-muted">{copy.register.provenanceHint}</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <Field
                  label={copy.register.provenanceSource}
                  htmlFor="dProvSource"
                  error={fieldErrors.provSource}
                >
                  <input
                    id="dProvSource"
                    value={prov.source}
                    onChange={(event) => setProv({ ...prov, source: event.target.value })}
                    maxLength={80}
                    list="provenanceSourcesDetail"
                    placeholder={copy.register.provenanceSourcePlaceholder}
                    className={inputClass}
                  />
                  <datalist id="provenanceSourcesDetail">
                    <option
                      value={locale === 'fr' ? 'Vue de rue Google Maps' : 'Google Maps street view'}
                    />
                    <option value={locale === 'fr' ? 'Visite du site' : 'Site visit'} />
                    <option value={locale === 'fr' ? 'Plan de relevé' : 'Survey plan'} />
                  </datalist>
                </Field>
                <Field label={copy.register.provenanceMethod} htmlFor="dProvMethod">
                  <input
                    id="dProvMethod"
                    value={prov.method}
                    onChange={(event) => setProv({ ...prov, method: event.target.value })}
                    maxLength={80}
                    placeholder={copy.register.provenanceMethodPlaceholder}
                    className={inputClass}
                  />
                </Field>
                <Field label={copy.register.provenanceDate} htmlFor="dProvDate">
                  <input
                    id="dProvDate"
                    type="date"
                    value={prov.date}
                    onChange={(event) => setProv({ ...prov, date: event.target.value })}
                    max={new Date().toISOString().slice(0, 10)}
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>
          )}
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
              disabled={busy === 'details'}
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

function detailFieldId(field: string): string {
  const map: Record<string, string> = {
    name: 'dName',
    latitude: 'dLat',
    longitude: 'dLat',
    width: 'dWidth',
    height: 'dWidth',
    orientationDeg: 'dOrient',
    viewingDistance: 'dViewingDistance',
    elevation: 'dElevation',
    illuminationHours: 'dIllumHours',
    provSource: 'dProvSource',
    provMethod: 'dProvMethod',
  };
  return map[field] ?? `d-${field}`;
}

// ------------------------------------------------------------------- photos
function PhotosSection({
  pending,
  setPending,
  site,
  orgId,
  editable,
  locale,
  copy,
  busy,
  reload,
  run,
  onUploadCancelled,
  onUploadSettled,
}: {
  pending: PendingSiteMedia[];
  setPending: Dispatch<SetStateAction<PendingSiteMedia[]>>;
  site: SiteDetail;
  orgId: string | undefined;
  editable: boolean;
  locale: SiteLocale | undefined;
  copy: ReturnType<typeof getSitesCopy>;
  busy: string;
  reload: () => Promise<void>;
  run: (key: string, action: () => Promise<void>) => Promise<void>;
  onUploadCancelled?: (busyKey: string) => void;
  onUploadSettled?: (busyKey: string) => void;
}) {
  const [uploadError, setUploadError] = useState('');
  const [mediaErrors, setMediaErrors] = useState<Record<string, string>>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const photos = site.assets.filter(
    (asset) => asset.mediaType !== 'video' && asset.kind !== 'board_video',
  );
  const videos = site.assets.filter(
    (asset) => asset.mediaType === 'video' || asset.kind === 'board_video',
  );
  const galleryAssets: LightboxAsset[] = photos.map((asset) => ({
    id: asset.id,
    display: assetDisplay(asset),
    kind: asset.kind,
    capturedAt: asset.capturedAt ?? null,
    kindLabel: photoKindLabel(asset.kind, copy),
  }));
  const upload = () => {
    if (!orgId || busy || pending.length === 0) return;
    if (site.format !== 'digital_led' && pending.some((media) => media.kind === 'board_video')) {
      setUploadError(
        locale === 'fr'
          ? 'Retirez la vidéo sélectionnée ou rétablissez le format LED avant l’enregistrement.'
          : 'Remove the selected video or restore LED format before saving.',
      );
      return;
    }
    setUploadError('');
    setMediaErrors({});
    onUploadSettled?.('upload-media');
    void run('upload-media', async () => {
      const controller = new AbortController();
      uploadAbortRef.current = controller;
      try {
        for (const media of pending) {
          if (controller.signal.aborted) break;
          try {
            if (media.kind === 'board_video')
              await uploadBoardVideo(
                orgId,
                site.id,
                media.file,
                controller.signal,
                media.capturedAt || undefined,
                media.id,
              );
            else
              await uploadAsset(
                orgId,
                site.id,
                media.kind,
                media.file,
                controller.signal,
                media.capturedAt || undefined,
                {
                  captureMethod: media.captureMethod,
                  deviceLatitude: media.deviceLatitude,
                  deviceLongitude: media.deviceLongitude,
                  deviceAccuracyMeters: media.deviceAccuracyMeters,
                  deviceCapturedAt: media.deviceCapturedAt,
                  deviceLocationRecordedAt: media.deviceLocationRecordedAt,
                  missingMetadataReason: media.missingMetadataReason || undefined,
                  clientRequestId: media.id,
                },
              );
            setPending((previous) => previous.filter((item) => item.id !== media.id));
          } catch (error) {
            if (controller.signal.aborted) throw error;
            setMediaErrors((previous) => ({
              ...previous,
              [media.id]:
                error instanceof ApiError && error.status < 500
                  ? error.message
                  : locale === 'fr'
                    ? 'Le transfert n’a pas abouti. Vérifiez la connexion et réessayez.'
                    : 'Upload could not finish. Check your connection and retry.',
            }));
          }
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setUploadError(
            locale === 'fr'
              ? 'Les fichiers restants sont conservés. Corrigez le fichier signalé ou réessayez.'
              : 'Remaining files are preserved. Correct the reported file or retry.',
          );
        throw error;
      } finally {
        uploadAbortRef.current = null;
        await reload();
        if (!controller.signal.aborted) onUploadSettled?.('upload-media');
      }
    });
  };
  const remove = (asset: SiteAsset) => {
    if (
      !window.confirm(
        withLabel(
          copy.register.photoRemoveConfirm,
          asset.kind === 'board_video'
            ? locale === 'fr'
              ? 'Vidéo du panneau LED'
              : 'LED board video'
            : photoKindLabel(asset.kind, copy),
        ),
      )
    )
      return;
    void run(`del-${asset.id}`, async () => {
      await deleteAsset(orgId, site.id, asset.id);
      await reload();
    });
  };
  return (
    <SectionCard
      title={locale === 'fr' ? 'Photos et vidéos du panneau' : 'Board photos and videos'}
    >
      {site.assets.length === 0 && <p className="text-sm text-muted">{copy.detail.noPhotos}</p>}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((asset, index) => (
          <li key={asset.id} className="relative">
            <button
              type="button"
              data-testid={`gallery-thumb-${asset.kind}`}
              onClick={() => setLightboxIndex(index)}
              className="block w-full cursor-zoom-in text-left"
              aria-label={lightboxAlt(
                {
                  kindLabel: photoKindLabel(asset.kind, copy),
                  capturedAt: asset.capturedAt ?? null,
                },
                locale === 'fr' ? 'fr' : 'en',
              )}
            >
              <AssetItem asset={asset} copy={copy} />
            </button>
            {editable && (
              <button
                type="button"
                disabled={Boolean(busy)}
                aria-label={`${copy.register.photoRemove}: ${photoKindLabel(asset.kind, copy)}`}
                onClick={() => remove(asset)}
                className="absolute right-1 top-1 grid min-h-9 min-w-9 place-items-center rounded-full bg-background/95 text-error"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <MediaEvidence asset={asset} locale={locale} />
          </li>
        ))}
      </ul>
      {videos.length > 0 && (
        <div className="mt-4 space-y-3">
          {videos.map((asset) => (
            <div key={asset.id}>
              <AuthBoardVideo asset={asset} locale={locale} />
              <MediaEvidence asset={asset} locale={locale} />
              {editable && (
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => remove(asset)}
                  className="mt-2 min-h-9 text-xs font-semibold text-error"
                >
                  {locale === 'fr' ? 'Retirer la vidéo' : 'Remove video'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {editable && (
        <div className="mt-5 border-t border-border pt-4">
          <MediaCapturePicker
            value={pending}
            onChange={setPending}
            locale={locale}
            allowVideo={site.format === 'digital_led'}
            disabled={Boolean(busy)}
            errors={mediaErrors}
          />
          {uploadError && (
            <p role="alert" className="mt-2 text-sm text-error">
              {uploadError}
            </p>
          )}
          {pending.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={upload}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                {busy === 'upload-media' && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy === 'upload-media'
                  ? copy.detail.uploading
                  : locale === 'fr'
                    ? 'Enregistrer les médias'
                    : 'Save media'}
              </button>
              {busy === 'upload-media' && (
                <button
                  type="button"
                  className="min-h-10 text-sm font-semibold text-error"
                  onClick={() => {
                    onUploadCancelled?.('upload-media');
                    uploadAbortRef.current?.abort();
                  }}
                >
                  {copy.detail.cancel}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {lightboxIndex !== null && galleryAssets[lightboxIndex] && (
        <Lightbox
          assets={galleryAssets}
          initialIndex={lightboxIndex}
          siteName={site.name}
          locale={locale === 'fr' ? 'fr' : 'en'}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </SectionCard>
  );
}

/** Replace a single {{label}} placeholder in confirm-dialog copy. */
const withLabel = (template: string, label: string): string => template.replace('{{label}}', label);

function photoKindLabel(kind: SiteAsset['kind'], copy: ReturnType<typeof getSitesCopy>): string {
  return kind === 'front'
    ? copy.register.photoFront
    : kind === 'context'
      ? copy.register.photoContext
      : kind === 'night'
        ? copy.register.photoNight
        : kind === 'diagram'
          ? copy.register.photoDiagram
          : kind;
}

function AssetItem({ asset, copy }: { asset: SiteAsset; copy: ReturnType<typeof getSitesCopy> }) {
  const label = photoKindLabel(asset.kind, copy);
  return (
    <figure>
      <AuthAssetThumb
        display={assetDisplay(asset)}
        alt={label}
        size="h-28 w-full"
        fit="object-cover"
      />
      <figcaption className="mt-1 text-xs font-semibold text-muted">{label}</figcaption>
    </figure>
  );
}

// -------------------------------------------------------------------- faces
function FacesSection({
  locale,
  site,
  orgId,
  editable,
  removable,
  copy,
  busy,
  reload,
  run,
  onUnsavedChange,
}: {
  onUnsavedChange: (section: string, dirty: boolean) => void;
  locale: SiteLocale | undefined;
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
  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => {
    onUnsavedChange('faces', adding || editingId !== null);
    return () => onUnsavedChange('faces', false);
  }, [adding, editingId, onUnsavedChange]);
  const [formError, setFormError] = useState('');
  const emptyForm = {
    faceLabel: '',
    width: '',
    height: '',
    units: 'm',
    printableArea: '',
    bleedMm: '',
    substrate: '',
    fileRequirements: '',
    bookable: true,
    pixelWidth: '',
    pixelHeight: '',
    spotLengthSeconds: '',
    loopLengthSeconds: '',
    spotsPerLoop: '',
    proofOfPlay: false,
  };
  const [form, setForm] = useState(emptyForm);
  const isDigital = site.format === 'digital_led';
  const faceWidth = parseDecimal(form.width);
  const faceHeight = parseDecimal(form.height);
  const area = faceWidth !== null && faceHeight !== null ? faceWidth * faceHeight : NaN;

  const digitalValues = () => {
    if (!isDigital) return {};
    const pixelWidth = parseDecimal(form.pixelWidth);
    const pixelHeight = parseDecimal(form.pixelHeight);
    const spot = parseDecimal(form.spotLengthSeconds);
    const loop = parseDecimal(form.loopLengthSeconds);
    const spots = parseDecimal(form.spotsPerLoop);
    return {
      ...(pixelWidth !== null ? { pixelWidth } : {}),
      ...(pixelHeight !== null ? { pixelHeight } : {}),
      ...(spot !== null ? { spotLengthSeconds: spot } : {}),
      ...(loop !== null ? { loopLengthSeconds: loop } : {}),
      ...(spots !== null ? { spotsPerLoop: Math.round(spots) } : {}),
      proofOfPlay: form.proofOfPlay,
    };
  };

  const validateFace = (): boolean => {
    if (!form.faceLabel.trim() || faceWidth === null || faceHeight === null || area <= 0)
      return false;
    if (
      form.bleedMm.trim() &&
      (parseDecimal(form.bleedMm) === null || parseDecimal(form.bleedMm)! < 0)
    ) {
      setFormError(copy.detail.bleedInvalid);
      return false;
    }
    if (isDigital) {
      const numeric = [
        form.pixelWidth,
        form.pixelHeight,
        form.spotLengthSeconds,
        form.loopLengthSeconds,
        form.spotsPerLoop,
      ];
      const bad = numeric.some(
        (raw) => raw.trim() !== '' && (parseDecimal(raw) === null || parseDecimal(raw)! <= 0),
      );
      if (bad) {
        setFormError(copy.detail.digitalPositive);
        return false;
      }
    }
    setFormError('');
    return true;
  };

  const onAdd = (event: FormEvent) => {
    event.preventDefault();
    if (!orgId || !validateFace()) return;
    void run('face', async () => {
      await addFace(orgId, site.id, {
        faceLabel: form.faceLabel.trim(),
        width: faceWidth!,
        height: faceHeight!,
        area,
        units: form.units,
        bookable: form.bookable,
        ...(form.printableArea.trim() ? { printableArea: form.printableArea.trim() } : {}),
        ...(form.bleedMm.trim() ? { bleedMm: parseDecimal(form.bleedMm)! } : {}),
        ...(form.substrate.trim() ? { substrate: form.substrate.trim() } : {}),
        ...(form.fileRequirements.trim() ? { fileRequirements: form.fileRequirements.trim() } : {}),
        ...digitalValues(),
      });
      setForm({ ...emptyForm, units: form.units });
      setAdding(false);
      await reload();
    });
  };

  const onEdit = (event: FormEvent, face: SiteFace) => {
    event.preventDefault();
    if (!orgId || !validateFace()) return;
    void run(`face-edit-${face.id}`, async () => {
      await updateFace(orgId, face.id, {
        faceLabel: form.faceLabel.trim(),
        width: faceWidth!,
        height: faceHeight!,
        area,
        units: form.units,
        bookable: form.bookable,
        printableArea: form.printableArea.trim() || null,
        bleedMm: form.bleedMm.trim() ? parseDecimal(form.bleedMm)! : null,
        substrate: form.substrate.trim() || null,
        fileRequirements: form.fileRequirements.trim() || null,
        ...digitalValues(),
      });
      setEditingId(null);
      await reload();
    });
  };

  const startEdit = (face: SiteFace) => {
    setEditingId(face.id);
    setForm({
      faceLabel: face.faceLabel,
      width: String(face.width),
      height: String(face.height),
      units: face.units,
      printableArea: face.printableArea ?? '',
      bleedMm: face.bleedMm != null ? String(face.bleedMm) : '',
      substrate: face.substrate ?? '',
      fileRequirements: face.fileRequirements ?? '',
      bookable: face.bookable,
      pixelWidth: face.pixelWidth != null ? String(face.pixelWidth) : '',
      pixelHeight: face.pixelHeight != null ? String(face.pixelHeight) : '',
      spotLengthSeconds: face.spotLengthSeconds != null ? String(face.spotLengthSeconds) : '',
      loopLengthSeconds: face.loopLengthSeconds != null ? String(face.loopLengthSeconds) : '',
      spotsPerLoop: face.spotsPerLoop != null ? String(face.spotsPerLoop) : '',
      proofOfPlay: face.proofOfPlay ?? false,
    });
  };

  return (
    <SectionCard
      title={copy.detail.faces}
      action={
        editable && !adding ? (
          <button
            type="button"
            onClick={() => {
              setForm({ ...emptyForm, units: site.faces[0]?.units ?? 'm' });
              setAdding(true);
            }}
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
            <li key={face.id} className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
              {editingId === face.id ? (
                <FaceForm
                  form={form}
                  setForm={setForm}
                  isDigital={isDigital}
                  formError={formError}
                  busy={busy}
                  busyKey={`face-edit-${face.id}`}
                  copy={copy}
                  submitLabel={copy.detail.faceUpdate}
                  onSubmit={(event) => onEdit(event, face)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">
                      {face.faceLabel}
                      <span className="ml-2 font-medium text-muted">
                        {displayNumber(face.width, locale)} × {displayNumber(face.height, locale)}{' '}
                        {agencyEvidenceUnit(face.units, locale === 'fr' ? 'fr' : 'en')} ·{' '}
                        {formatArea(face.area, face.units, locale)}
                      </span>
                    </p>
                    <p className="text-xs text-muted">
                      {copy.detail.faceBookable}: {face.bookable ? '✓' : '—'}
                      {face.printableArea
                        ? ` · ${copy.detail.facePrintable}: ${face.printableArea}`
                        : ''}
                      {isDigital && face.spotLengthSeconds != null
                        ? ` · ${copy.detail.spotLength} ${displayNumber(face.spotLengthSeconds, locale)} s / ${copy.detail.loopLength} ${face.loopLengthSeconds != null ? displayNumber(face.loopLengthSeconds, locale) : '—'} s`
                        : ''}
                    </p>
                    {(face.bleedMm != null || face.substrate || face.fileRequirements) && (
                      <p className="mt-1 text-xs text-muted">
                        {[
                          face.bleedMm != null
                            ? `${copy.detail.bleed} ${displayNumber(face.bleedMm, locale)} mm`
                            : '',
                          face.substrate ? `${copy.detail.substrate}: ${face.substrate}` : '',
                          face.fileRequirements
                            ? `${copy.detail.fileRequirements}: ${face.fileRequirements}`
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {editable && (
                      <button
                        type="button"
                        aria-label={`${copy.detail.faceEdit}: ${face.faceLabel}`}
                        onClick={() => startEdit(face)}
                        className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-surface hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {removable && (
                      <button
                        type="button"
                        aria-label={`${copy.detail.faceRemove}: ${face.faceLabel}`}
                        disabled={busy === `face-del-${face.id}`}
                        onClick={() => {
                          if (
                            !window.confirm(
                              withLabel(copy.detail.faceRemoveConfirm, face.faceLabel),
                            )
                          )
                            return;
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
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && editable && (
        <FaceForm
          form={form}
          setForm={setForm}
          isDigital={isDigital}
          formError={formError}
          busy={busy}
          busyKey="face"
          copy={copy}
          submitLabel={copy.detail.addFace}
          onSubmit={onAdd}
          onCancel={() => setAdding(false)}
        />
      )}
    </SectionCard>
  );
}

function FaceForm({
  form,
  setForm,
  isDigital,
  formError,
  busy,
  busyKey,
  copy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  form: {
    faceLabel: string;
    width: string;
    height: string;
    units: string;
    printableArea: string;
    bleedMm: string;
    substrate: string;
    fileRequirements: string;
    bookable: boolean;
    pixelWidth: string;
    pixelHeight: string;
    spotLengthSeconds: string;
    loopLengthSeconds: string;
    spotsPerLoop: string;
    proofOfPlay: boolean;
  };
  setForm: React.Dispatch<React.SetStateAction<typeof form>>;
  isDigital: boolean;
  formError: string;
  busy: string;
  busyKey: string;
  copy: ReturnType<typeof getSitesCopy>;
  submitLabel: string;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 space-y-3 rounded-lg border border-border bg-surface-2 p-3"
    >
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
            <select
              value={form.units}
              onChange={(event) => setForm({ ...form, units: event.target.value })}
              aria-label={copy.register.units}
              className="w-16 shrink-0 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-primary"
            >
              <option value="m">m</option>
              <option value="ft">ft</option>
            </select>
          </span>
        </Field>
        <Field
          label={copy.detail.facePrintable}
          htmlFor="facePrintable"
          hint={copy.detail.facePrintableHint}
        >
          <input
            id="facePrintable"
            value={form.printableArea}
            onChange={(event) => setForm({ ...form, printableArea: event.target.value })}
            maxLength={60}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={copy.detail.bleed} htmlFor="faceBleed" hint={copy.detail.bleedHint}>
          <input
            id="faceBleed"
            type="text"
            inputMode="decimal"
            value={form.bleedMm}
            onChange={(event) => setForm({ ...form, bleedMm: event.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label={copy.detail.substrate} htmlFor="faceSubstrate">
          <input
            id="faceSubstrate"
            value={form.substrate}
            onChange={(event) => setForm({ ...form, substrate: event.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label={copy.detail.fileRequirements} htmlFor="faceFiles">
          <input
            id="faceFiles"
            value={form.fileRequirements}
            onChange={(event) => setForm({ ...form, fileRequirements: event.target.value })}
            className={inputClass}
          />
        </Field>
      </div>
      <label className="inline-flex min-h-8 items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={form.bookable}
          onChange={(event) => setForm({ ...form, bookable: event.target.checked })}
          className="h-4 w-4 rounded border-border accent-[#E4002B]"
        />
        {copy.detail.faceBookable}
      </label>
      {isDigital && (
        <div className="rounded-lg border border-border bg-surface px-3 py-3">
          <h3 className="text-sm font-bold">{copy.detail.digitalHeading}</h3>
          <p className="mt-1 text-xs leading-5 text-muted">{copy.detail.digitalHeadingHint}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label={copy.detail.pixelWidth} htmlFor="facePixelWidth">
              <input
                id="facePixelWidth"
                type="text"
                inputMode="numeric"
                min="1"
                value={form.pixelWidth}
                onChange={(event) => setForm({ ...form, pixelWidth: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label={copy.detail.pixelHeight} htmlFor="facePixelHeight">
              <input
                id="facePixelHeight"
                type="text"
                inputMode="numeric"
                min="1"
                value={form.pixelHeight}
                onChange={(event) => setForm({ ...form, pixelHeight: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label={copy.detail.spotLength} htmlFor="faceSpot">
              <input
                id="faceSpot"
                type="text"
                inputMode="decimal"
                min="0"
                value={form.spotLengthSeconds}
                onChange={(event) => setForm({ ...form, spotLengthSeconds: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label={copy.detail.loopLength} htmlFor="faceLoop">
              <input
                id="faceLoop"
                type="text"
                inputMode="decimal"
                min="0"
                value={form.loopLengthSeconds}
                onChange={(event) => setForm({ ...form, loopLengthSeconds: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label={copy.detail.spotsPerLoop} htmlFor="faceSpots">
              <input
                id="faceSpots"
                type="text"
                inputMode="numeric"
                min="1"
                value={form.spotsPerLoop}
                onChange={(event) => setForm({ ...form, spotsPerLoop: event.target.value })}
                className={inputClass}
              />
            </Field>
            <label className="flex items-end gap-2 pb-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.proofOfPlay}
                onChange={(event) => setForm({ ...form, proofOfPlay: event.target.checked })}
                className="h-4 w-4 rounded border-border accent-[#E4002B]"
              />
              {copy.detail.proofOfPlay}
            </label>
          </div>
        </div>
      )}
      {formError && (
        <p role="alert" className="text-xs font-medium text-error">
          {formError}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy === busyKey}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-70"
        >
          {busy === busyKey && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-10 rounded-lg px-3 text-sm font-semibold text-muted transition hover:text-foreground"
        >
          {copy.detail.cancel}
        </button>
      </div>
    </form>
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
  onUnsavedChange,
}: {
  onUnsavedChange: (section: string, dirty: boolean) => void;
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
  useEffect(() => {
    onUnsavedChange('rates', adding);
    return () => onUnsavedChange('rates', false);
  }, [adding, onUnsavedChange]);
  const [form, setForm] = useState({
    currency: (findMarket(site.country)?.currency ?? 'NGN') as string,
    faceId: '',
    minBookingDays: '1',
    perDay: '',
    perWeek: '',
    perMonth: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
  });
  const [seasonal, setSeasonal] = useState<SeasonalRule[]>([]);
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
      setRateErrors((previous) => ({
        ...previous,
        perDay: undefined,
        perWeek: undefined,
        perMonth: undefined,
        ...invalid,
      }));
      return;
    }
    if (Object.keys(parsed).length === 0 || !orgId) {
      setFormError(copy.detail.rateHint);
      return;
    }
    const minBookingDays = Number(form.minBookingDays);
    if (!Number.isInteger(minBookingDays) || minBookingDays < 1) {
      setFormError(copy.detail.minBookingInvalid);
      return;
    }
    void run('rate', async () => {
      await addRateCard(orgId, site.id, {
        ...(form.faceId ? { faceId: form.faceId } : {}),
        minBookingDays,
        currency: form.currency,
        rates: parsed,
        effectiveFrom: form.effectiveFrom,
        ...(seasonal.length > 0 ? { seasonalRules: { rules: seasonal } } : {}),
      });
      setForm({ ...form, perDay: '', perWeek: '', perMonth: '' });
      setSeasonal([]);
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
                {editable &&
                card.effectiveFrom.slice(0, 10) > new Date().toISOString().slice(0, 10) ? (
                  <button
                    type="button"
                    disabled={busy === `rate-withdraw-${card.id}`}
                    onClick={() => {
                      if (
                        !window.confirm(withLabel(copy.detail.rateWithdrawConfirm, card.currency))
                      )
                        return;
                      void run(`rate-withdraw-${card.id}`, async () => {
                        await withdrawFutureRateCard(orgId, card.id);
                        await reload();
                      });
                    }}
                    className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-bold text-muted transition hover:text-foreground disabled:opacity-60"
                  >
                    <Ban className="h-3 w-3" />
                    {copy.detail.rateWithdraw}
                  </button>
                ) : (
                  editable &&
                  !card.effectiveTo && (
                    <button
                      type="button"
                      disabled={busy === `rate-end-${card.id}`}
                      onClick={() => {
                        if (!window.confirm(withLabel(copy.detail.rateEndConfirm, card.currency)))
                          return;
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
                  )
                )}
              </div>
              <p className="mt-1 text-xs font-semibold text-muted">
                {card.faceId
                  ? `${copy.detail.rateScope}: ${site.faces.find((face) => face.id === card.faceId)?.faceLabel ?? '—'}`
                  : copy.detail.rateAllFaces}
                {card.minBookingDays
                  ? ` · ${copy.detail.minBookingDays}: ${displayNumber(card.minBookingDays, locale)}`
                  : ''}
              </p>
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
              {card.seasonalRules && (
                <p className="mt-1 text-xs text-muted">
                  {copy.detail.seasonalHeading}:{' '}
                  {(card.seasonalRules as { rules?: SeasonalRule[] }).rules
                    ?.map((rule) => `${rule.label} ×${displayNumber(rule.multiplier, locale)}`)
                    .join(', ') || '—'}
                </p>
              )}
              <p className="mt-1 text-xs text-muted">
                {copy.detail.effectiveFrom} {displayDateOnly(card.effectiveFrom, locale)}
                {card.effectiveTo
                  ? ` · ${copy.detail.effectiveTo} ${displayDateOnly(card.effectiveTo, locale)}`
                  : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
      {adding && editable && (
        <form
          onSubmit={onAdd}
          className="mt-4 space-y-3 rounded-lg border border-border bg-surface-2 p-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={copy.detail.rateScope} htmlFor="rateFace">
              <select
                id="rateFace"
                value={form.faceId}
                onChange={(event) => setForm({ ...form, faceId: event.target.value })}
                className={inputClass}
              >
                <option value="">{copy.detail.rateAllFaces}</option>
                {site.faces.map((face) => (
                  <option key={face.id} value={face.id}>
                    {face.faceLabel}
                  </option>
                ))}
              </select>
            </Field>
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
            <Field label={copy.detail.minBookingDays} htmlFor="rateMinDays">
              <input
                id="rateMinDays"
                type="number"
                min="1"
                step="1"
                value={form.minBookingDays}
                onChange={(event) => setForm({ ...form, minBookingDays: event.target.value })}
                className={inputClass}
              />
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
          <div className="rounded-lg border border-border bg-surface px-3 py-3">
            <h3 className="text-sm font-bold">{copy.detail.seasonalHeading}</h3>
            <p className="mt-1 text-xs leading-5 text-muted">{copy.detail.seasonalHint}</p>
            {seasonal.length === 0 && (
              <p className="mt-2 text-xs text-muted">{copy.detail.seasonalEmpty}</p>
            )}
            {seasonal.map((rule, index) => (
              <div key={index} className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
                <input
                  aria-label={`${copy.detail.seasonalLabel} ${index + 1}`}
                  value={rule.label}
                  onChange={(event) =>
                    setSeasonal((rules) =>
                      rules.map((r, i) => (i === index ? { ...r, label: event.target.value } : r)),
                    )
                  }
                  placeholder={copy.detail.seasonalLabel}
                  className={inputClass}
                />
                <input
                  type="date"
                  aria-label={`${copy.detail.seasonalFrom} ${index + 1}`}
                  value={rule.from}
                  onChange={(event) =>
                    setSeasonal((rules) =>
                      rules.map((r, i) => (i === index ? { ...r, from: event.target.value } : r)),
                    )
                  }
                  className={inputClass}
                />
                <input
                  type="date"
                  aria-label={`${copy.detail.seasonalTo} ${index + 1}`}
                  value={rule.to}
                  onChange={(event) =>
                    setSeasonal((rules) =>
                      rules.map((r, i) => (i === index ? { ...r, to: event.target.value } : r)),
                    )
                  }
                  className={inputClass}
                />
                <span className="flex gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={`${copy.detail.seasonalMultiplier} ${index + 1}`}
                    value={String(rule.multiplier)}
                    onChange={(event) =>
                      setSeasonal((rules) =>
                        rules.map((r, i) =>
                          i === index
                            ? { ...r, multiplier: parseDecimal(event.target.value) ?? 0 }
                            : r,
                        ),
                      )
                    }
                    className={`w-20 ${inputClass}`}
                  />
                  <button
                    type="button"
                    aria-label={copy.detail.seasonalRemove}
                    onClick={() => setSeasonal((rules) => rules.filter((_, i) => i !== index))}
                    className="grid h-10 w-9 place-items-center rounded-lg text-muted transition hover:bg-error/10 hover:text-error"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setSeasonal((rules) => [...rules, { label: '', from: '', to: '', multiplier: 1 }])
              }
              className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs font-bold text-primary"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              {copy.detail.seasonalAdd}
            </button>
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

// ----------------------------------------------------------- metadata (RO)
function MetadataSection({
  site,
  locale,
  copy,
}: {
  site: SiteDetail;
  locale: SiteLocale | undefined;
  copy: ReturnType<typeof getSitesCopy>;
}) {
  return (
    <details className="rounded-xl border border-border bg-surface p-5">
      <summary className="min-h-11 cursor-pointer text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        {copy.detail.metadataHeading}
      </summary>
      <p className="text-xs leading-5 text-muted">{copy.detail.metadataIntro}</p>
      {site.metadata.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{copy.detail.metadataEmpty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {site.metadata.map((record) => (
            <li
              key={record.id}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">
                  {agencyEvidenceUnit(record.dimension, locale === 'fr' ? 'fr' : 'en')}
                </span>
                <span className="rounded-full bg-muted/15 px-2 py-0.5 text-[11px] font-semibold text-muted">
                  {verificationLabel(record.verification, copy)}
                </span>
                {record.dataClass === 'demo' && (
                  <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
                    {copy.detail.metadataDemo}
                  </span>
                )}
              </div>
              <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
                {metadataFacts(record.payload, locale).map((fact, index) => (
                  <div key={index} className="contents">
                    <dt className="text-muted">{fact.label}</dt>
                    <dd className="min-w-0 whitespace-pre-wrap break-words font-medium">
                      {fact.href ? (
                        <a
                          href={fact.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-info underline underline-offset-2"
                        >
                          {fact.value}
                        </a>
                      ) : (
                        fact.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted">
                {record.source && (
                  <span>
                    {copy.detail.metadataBy}:{' '}
                    {metadataLink(record.source) ? (
                      <a
                        href={metadataLink(record.source)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-words text-info underline underline-offset-2"
                      >
                        {record.source}
                      </a>
                    ) : (
                      record.source
                    )}
                  </span>
                )}
                {record.method && (
                  <span>
                    {copy.detail.metadataMethod}:{' '}
                    {agencyEvidenceText(record.method, locale === 'fr' ? 'fr' : 'en')}
                  </span>
                )}
                {record.confidence != null && (
                  <span>
                    {copy.detail.metadataConfidence}:{' '}
                    {displayNumber(record.confidence, locale, {
                      style: 'percent',
                      maximumFractionDigits: 0,
                    })}
                  </span>
                )}
                {record.collectedAt && (
                  <span>
                    {copy.detail.metadataCollected}:{' '}
                    {displayUtcTimestamp(record.collectedAt, locale)}
                  </span>
                )}
                {record.expiresAt && (
                  <span>
                    {copy.detail.metadataExpires}: {displayUtcTimestamp(record.expiresAt, locale)}
                  </span>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function verificationLabel(
  verification: string | null | undefined,
  copy: ReturnType<typeof getSitesCopy>,
): string {
  switch (verification) {
    case 'partner_declared':
      return copy.detail.verificationPartnerDeclared;
    case 'field_verified':
      return copy.detail.verificationFieldVerified;
    case 'third_party':
      return copy.detail.verificationThirdParty;
    default:
      return copy.detail.verificationUnverified;
  }
}

// ----------------------------------------------------------------- location
function MapSection({
  site,
  locale,
  copy,
  mapOpen,
  onOpen,
  onExit,
}: {
  site: SiteDetail;
  locale: SiteLocale | undefined;
  copy: ReturnType<typeof getSitesCopy>;
  mapOpen: boolean;
  onOpen: () => void;
  onExit: () => void;
}) {
  return (
    <SectionCard title={copy.detail.mapHeading}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5 text-sm">
        <div className="contents">
          <dt className="text-muted">{copy.detail.coordsLabel}</dt>
          <dd className="font-medium">
            {site.latitude}, {site.longitude}
          </dd>
        </div>
        <div className="contents">
          <dt className="text-muted">{copy.detail.orientationLabel}</dt>
          <dd className="font-medium">
            {site.orientationDeg != null ? `${displayNumber(site.orientationDeg, locale)}°` : '—'}
          </dd>
        </div>
      </dl>
      <button
        type="button"
        data-testid="site-map-open"
        onClick={onOpen}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-white transition hover:bg-primary-hover"
      >
        <MapPin className="h-4 w-4" />
        {copy.detail.viewOnMap}
      </button>
      {mapOpen && (
        <SiteMapView
          latitude={Number(site.latitude)}
          longitude={Number(site.longitude)}
          orientationDeg={site.orientationDeg ?? null}
          siteName={site.name}
          locale={locale === 'fr' ? 'fr' : 'en'}
          onExit={onExit}
        />
      )}
    </SectionCard>
  );
}

export default function SiteDetailPage() {
  return (
    <Suspense fallback={null}>
      <ScopedDetail />
    </Suspense>
  );
}

function ScopedDetail() {
  const params = useSearchParams();
  const { activeOrganization } = useAuth();
  // Discard the old site's forms and private context synchronously on navigation.
  return <DetailInner key={`${activeOrganization?.organizationId}:${params.get('id')}`} />;
}
