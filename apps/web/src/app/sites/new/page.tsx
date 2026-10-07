'use client';

import { displayUiText } from '../../../lib/display-ui-text';

import {
  ArrowLeft,
  Camera,
  Loader2,
  MapPin,
  PlusCircle,
  Ruler,
  SunMedium,
  Type as TypeIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

/** Replace a single {{label}} placeholder in upload progress copy. */
const withLabel = (template: string, label: string): string => template.replace('{{label}}', label);

import { WorkspaceFrame } from '../../../components/account/WorkspaceFrame';
import { useAuth } from '../../../components/auth/AuthProvider';
import { useLocale } from '../../../components/LocaleProvider';
import { Field, inputClass } from '../../../components/sites/sites-ui';
import {
  createSite,
  updateSite,
  listMarkets,
  uploadAsset,
  uploadBoardVideo,
  type Market,
} from '../../../lib/sites-api';
import { getSitesCopy } from '../../../lib/sites-locale';
import { canManageSites } from '../../../lib/sites-access';
import { parseDecimal } from '../../../lib/number-format';
import {
  plausibilityErrors,
  structureValuesEntered,
  optionalStructureNumberErrors,
} from '../../../lib/sites-plausibility';
import { useUnsavedNavigation, confirmUnsavedNavigation } from '../../../lib/unsaved-navigation';
import { ApiError } from '../../../lib/api';
import { SUPPORTED_MARKETS } from '../../../lib/markets';
import { RegistrationMap } from '../../../components/sites/RegistrationMap';
import {
  MediaCapturePicker,
  type PendingSiteMedia,
} from '../../../components/sites/MediaCapturePicker';

interface FormState {
  name: string;
  siteCode: string;
  type: string;
  format: string;
  subFormat: string;
  latitude: string;
  longitude: string;
  address: string;
  city: string;
  region: string;
  country: string;
  marketId: string;
  width: string;
  height: string;
  units: string;
  orientationDeg: string;
  viewingDistance: string;
  elevation: string;
  illuminationType: string;
  illuminationHours: string;
  description: string;
  permitRef: string;
  permitExpiresAt: string;
  provSource: string;
  provMethod: string;
  provDate: string;
}

const INITIAL: FormState = {
  name: '',
  siteCode: '',
  type: 'billboard',
  format: 'static',
  subFormat: '',
  latitude: '',
  longitude: '',
  address: '',
  city: '',
  region: '',
  country: '',
  marketId: '',
  width: '',
  height: '',
  units: 'm',
  orientationDeg: '',
  viewingDistance: '',
  elevation: '',
  illuminationType: 'none',
  illuminationHours: '',
  description: '',
  permitRef: '',
  permitExpiresAt: '',
  provSource: '',
  provMethod: '',
  provDate: '',
};

export default function RegisterSitePage() {
  const router = useRouter();
  const { activeOrganization, capabilities } = useAuth();
  const { locale } = useLocale();
  const copy = getSitesCopy(locale);
  const orgId = activeOrganization?.organizationId;
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  // Server rule: site registration is a media-partner capability. Without the
  // org-type match the save would 403 after the form is filled in.
  const canManage = canManageSites({ capabilities, orgType: activeOrganization?.type });

  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [errorSummary, setErrorSummary] = useState('');
  const [photos, setPhotos] = useState<PendingSiteMedia[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const [uploadCancelled, setUploadCancelled] = useState<string | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const uploadCancelledRef = useRef(false);
  const marketsRef = useRef<Market[] | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const kindToUpload = (kind: PendingSiteMedia['kind']) =>
    kind === 'board_video'
      ? locale === 'fr'
        ? 'Vidéo du panneau LED'
        : 'LED board video'
      : copy.register[
          kind === 'front'
            ? 'photoFront'
            : kind === 'context'
              ? 'photoContext'
              : kind === 'night'
                ? 'photoNight'
                : 'photoDiagram'
        ];
  const [mediaErrors, setMediaErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  // Idempotent create (ambiguous-network retry): one stable operation id per
  // submission chain. A repeat POST after a lost response replays the original
  // draft instead of creating a duplicate; the key regenerates only when the
  // user edits the form after a failure.
  const clientRequestRef = useRef<string | null>(null);
  const submitFailedRef = useRef(false);
  const [completed, setCompleted] = useState(false);
  const savedSiteRef = useRef<{ id: string } | null>(null);
  const persistedFormRef = useRef<string | null>(null);

  // Markets load lazily once the org context resolves (reference data,
  // cached in a ref so re-renders and org switches do not refetch). A
  // render-time fetch would race AuthProvider hydration: the first paint
  // often has canManage false and orgId undefined, so retry on [canManage,
  // orgId] instead and swallow transient failures until the context is ready.
  useEffect(() => {
    if (!canManage || !orgId || (marketsRef.current && marketsRef.current.length > 0)) return;
    marketsRef.current = [];
    void listMarkets(orgId)
      .then((response) => {
        marketsRef.current = response.items;
        setMarkets(response.items);
      })
      .catch(() => {
        marketsRef.current = null;
      });
  }, [canManage, orgId]);

  const hasUnsavedWork =
    photos.length > 0 ||
    (persistedFormRef.current !== null
      ? JSON.stringify(form) !== persistedFormRef.current
      : Object.keys(INITIAL).some(
          (key) => form[key as keyof FormState] !== INITIAL[key as keyof FormState],
        ));
  useUnsavedNavigation(
    hasUnsavedWork && !completed,
    t(
      'Leave this page? Unsaved fields and media will be discarded. Choose Cancel to keep editing.',
      'Quitter cette page ? Les champs et médias non enregistrés seront perdus. Choisissez Annuler pour continuer.',
    ),
  );

  const set = (key: keyof FormState) => (value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
    setErrorSummary('');
    if (submitFailedRef.current) {
      // Deliberate edit after a failed save: this is a new logical attempt.
      submitFailedRef.current = false;
      clientRequestRef.current = null;
    }
  };

  if (!canManage) {
    const capabilitiesHeld =
      capabilities.includes('INVENTORY_CREATE') && capabilities.includes('INVENTORY_EDIT');
    return (
      <WorkspaceFrame current="sites">
        <h1 className="text-3xl font-extrabold tracking-[-0.045em]">{copy.register.title}</h1>
        <p className="mt-3 rounded-xl border border-border bg-surface px-5 py-6 text-sm leading-6 text-muted">
          {capabilitiesHeld ? copy.list.notPartnerNotice : copy.detail.noAccess}
        </p>
      </WorkspaceFrame>
    );
  }

  /** Maps field keys to input ids so submit failure focuses the first error. */
  const inputIdFor = (key: keyof FormState): string => {
    const map: Partial<Record<keyof FormState, string>> = {
      name: 'siteName',
      siteCode: 'siteCode',
      type: 'siteType',
      format: 'siteFormat',
      subFormat: 'siteSubFormat',
      latitude: 'siteLat',
      longitude: 'siteLng',
      address: 'siteAddress',
      city: 'siteCity',
      region: 'siteRegion',
      country: 'siteCountry',
      marketId: 'siteMarket',
      width: 'siteWidth',
      height: 'siteHeight',
      units: 'siteUnits',
      orientationDeg: 'siteOrientation',
      viewingDistance: 'siteViewingDistance',
      elevation: 'siteElevation',
      illuminationType: 'siteIllum',
      illuminationHours: 'siteIllumHours',
      description: 'siteDesc',
      permitRef: 'sitePermitRef',
      permitExpiresAt: 'sitePermitExpiry',
      provSource: 'siteProvSource',
      provMethod: 'siteProvMethod',
      provDate: 'siteProvDate',
    };
    return map[key] ?? `field-${key}`;
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    const lat = parseDecimal(form.latitude);
    const lon = parseDecimal(form.longitude);
    const width = parseDecimal(form.width);
    const height = parseDecimal(form.height);
    const orientation = parseDecimal(form.orientationDeg);
    const viewingDistance = parseDecimal(form.viewingDistance);
    const elevation = parseDecimal(form.elevation);
    if (!form.name.trim()) next.name = copy.register.requiredFields;
    if (lat === null) next.latitude = copy.register.requiredFields;
    else if (Math.abs(lat) > 90) next.latitude = copy.register.requiredFields;
    if (lon === null) next.longitude = copy.register.requiredFields;
    else if (Math.abs(lon) > 180) next.longitude = copy.register.requiredFields;
    if (!form.city.trim()) next.city = copy.register.requiredFields;
    if (!form.country.trim()) next.country = copy.register.requiredFields;
    if (width === null || width <= 0) next.width = copy.register.requiredFields;
    if (height === null || height <= 0) next.height = copy.register.requiredFields;
    if (form.illuminationType !== 'none' && !form.illuminationHours.trim())
      next.illuminationHours = copy.register.requiredFields;
    for (const [field, messageKey] of Object.entries(optionalStructureNumberErrors(form))) {
      next[field as keyof FormState] = copy.register[messageKey];
    }
    // Plausibility (SPEC §5.1 trust contract 6) — same rules as the API.
    const plausibility = plausibilityErrors({
      latitude: lat ?? undefined,
      longitude: lon ?? undefined,
      country: form.country,
      orientationDeg: orientation ?? undefined,
      viewingDistance: viewingDistance ?? undefined,
      elevation: elevation ?? undefined,
      illuminationHours: form.illuminationHours.trim() || undefined,
    });
    for (const [field, messageKey] of Object.entries(plausibility)) {
      if (!next[field as keyof FormState]) {
        next[field as keyof FormState] = copy.register[
          messageKey as keyof typeof copy.register
        ] as string;
      }
    }
    // Provenance contract (SPEC §5.1 trust contract 3): hand-entered structure
    // values must say how they are known.
    const structureEntered = structureValuesEntered({
      orientationDeg: form.orientationDeg,
      viewingDistance: form.viewingDistance,
      elevation: form.elevation,
    });
    if (structureEntered && (!form.provSource.trim() || !form.provMethod.trim())) {
      next.provSource = next.provSource ?? copy.register.provenanceRequired;
      next.provMethod = next.provMethod ?? copy.register.provenanceRequired;
    }
    setErrors(next);
    const errored = (Object.entries(next) as Array<[keyof FormState, string]>).filter(([, v]) => v);
    setErrorSummary(
      errored.length > 1 ? `${errored.length} ${copy.register.errorSummarySuffix}` : '',
    );
    if (errored.length > 0) {
      // First errored field receives focus (execution plan §1.5.3).
      const el = document.getElementById(inputIdFor(errored[0][0]));
      el?.focus?.();
      return false;
    }
    return true;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError('');
    setMediaErrors({});
    if (!validate() || !orgId || saving) return;
    if (form.format !== 'digital_led' && photos.some((media) => media.kind === 'board_video')) {
      setSubmitError(
        t(
          'A board video is still selected. Restore LED format or remove the video before saving.',
          'Une vidéo du panneau est toujours sélectionnée. Rétablissez le format LED ou retirez la vidéo avant l’enregistrement.',
        ),
      );
      return;
    }
    setSaving(true);
    const lat = parseDecimal(form.latitude) as number;
    const lon = parseDecimal(form.longitude) as number;
    const width = parseDecimal(form.width) as number;
    const height = parseDecimal(form.height) as number;
    const orientation = parseDecimal(form.orientationDeg);
    const viewingDistance = parseDecimal(form.viewingDistance);
    const elevation = parseDecimal(form.elevation);
    const structureEntered = structureValuesEntered({
      orientationDeg: form.orientationDeg,
      viewingDistance: form.viewingDistance,
      elevation: form.elevation,
    });
    if (!clientRequestRef.current) {
      clientRequestRef.current =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `cr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
    try {
      const draftInput = {
        name: form.name.trim(),
        ...(form.siteCode.trim() ? { code: form.siteCode.trim() } : {}),
        type: form.type,
        format: form.format,
        ...(form.subFormat.trim() ? { subFormat: form.subFormat.trim() } : {}),
        latitude: lat,
        longitude: lon,
        ...(form.address.trim() ? { address: form.address.trim() } : {}),
        city: form.city.trim(),
        ...(form.region.trim() ? { region: form.region.trim() } : {}),
        country: form.country.trim(),
        ...(form.marketId ? { marketId: form.marketId } : {}),
        width,
        height,
        units: form.units,
        ...(orientation !== null ? { orientationDeg: orientation } : {}),
        ...(viewingDistance !== null ? { viewingDistance } : {}),
        ...(elevation !== null ? { elevation } : {}),
        illuminationType: form.illuminationType,
        ...(form.illuminationType !== 'none' && form.illuminationHours.trim()
          ? { illuminationHours: form.illuminationHours.trim() }
          : {}),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        ...(form.permitRef.trim() ? { permitRef: form.permitRef.trim() } : {}),
        ...(form.permitExpiresAt ? { permitExpiresAt: form.permitExpiresAt } : {}),
        ...(structureEntered
          ? {
              structureProvenance: {
                source: form.provSource.trim(),
                method: form.provMethod.trim(),
                ...(form.provDate ? { collectedAt: form.provDate } : {}),
              },
            }
          : {}),
      };
      const site = savedSiteRef.current
        ? await updateSite(orgId, savedSiteRef.current.id, {
            ...draftInput,
            address: form.address.trim() || null,
            region: form.region.trim() || null,
            subFormat: form.subFormat.trim() || null,
            description: form.description.trim() || null,
            permitRef: form.permitRef.trim() || null,
            permitExpiresAt: form.permitExpiresAt || null,
            illuminationHours:
              form.illuminationType === 'none' ? null : form.illuminationHours.trim(),
          })
        : await createSite(orgId, { ...draftInput, clientRequestId: clientRequestRef.current });
      savedSiteRef.current = site;
      persistedFormRef.current = JSON.stringify(form);
      // Upload reference photos against the new draft; a failed upload is not
      // fatal, but the partner is told so they can retry on the site page.
      // Each transfer gets a live "Uploading <photo>…" lead and the partner can
      // cancel — the draft keeps whatever arrived before the cancel.
      let uploadFailed = false;
      for (const photo of photos) {
        setUploadingPhoto(kindToUpload(photo.kind));
        const controller = new AbortController();
        uploadAbortRef.current = controller;
        try {
          if (photo.kind === 'board_video') {
            await uploadBoardVideo(
              orgId,
              site.id,
              photo.file,
              controller.signal,
              photo.capturedAt || undefined,
              photo.id,
            );
          } else {
            await uploadAsset(
              orgId,
              site.id,
              photo.kind,
              photo.file,
              controller.signal,
              photo.capturedAt || undefined,
              {
                captureMethod: photo.captureMethod,
                deviceLatitude: photo.deviceLatitude,
                deviceLongitude: photo.deviceLongitude,
                deviceAccuracyMeters: photo.deviceAccuracyMeters,
                deviceCapturedAt: photo.deviceCapturedAt,
                deviceLocationRecordedAt: photo.deviceLocationRecordedAt,
                missingMetadataReason: photo.missingMetadataReason || undefined,
                clientRequestId: photo.id,
              },
            );
          }
          setPhotos((previous) => previous.filter((item) => item.id !== photo.id));
        } catch (error) {
          if (uploadCancelledRef.current) {
            uploadCancelledRef.current = false;
            uploadAbortRef.current = null;
            setUploadingPhoto(null);
            setUploadCancelled(site.id);
            setSaving(false);
            return;
          }
          uploadFailed = true;
          setMediaErrors((previous) => ({
            ...previous,
            [photo.id]:
              error instanceof ApiError && error.status < 500
                ? error.message
                : t(
                    'Upload could not finish. Check your connection and retry.',
                    'Le transfert n’a pas abouti. Vérifiez la connexion et réessayez.',
                  ),
          }));
        }
      }
      uploadAbortRef.current = null;
      setUploadingPhoto(null);
      if (uploadFailed) {
        setUploadCancelled(site.id);
        setSubmitError(
          locale === 'fr'
            ? 'Le brouillon est enregistré. Certains médias n’ont pas été transférés ; vos fichiers restent ici. Réessayez ou ouvrez le brouillon.'
            : 'Draft saved. Some media did not upload; your files remain here. Retry or open the draft.',
        );
        setSaving(false);
        return;
      }
      setCompleted(true);
      router.replace(`/sites/detail/?id=${site.id}`);
    } catch (error) {
      const message =
        error instanceof ApiError && error.status < 500 ? error.message : copy.register.saveFailed;
      setSubmitError(message || copy.register.saveFailed);
      submitFailedRef.current = true;
      setSaving(false);
    }
  };

  const sectionHeading = (icon: React.ReactNode, label: string) => (
    <h2 className="flex items-center gap-2 text-base font-bold">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      {label}
    </h2>
  );

  const structureEntered = structureValuesEntered({
    orientationDeg: form.orientationDeg,
    viewingDistance: form.viewingDistance,
    elevation: form.elevation,
  });

  return (
    <WorkspaceFrame current="sites">
      <button
        type="button"
        onClick={() => {
          if (confirmUnsavedNavigation()) router.push('/sites');
        }}
        className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-muted transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {copy.detail.back}
      </button>
      <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.045em]">{copy.register.title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{copy.register.intro}</p>

      <form
        data-unsaved={hasUnsavedWork && !completed ? 'true' : 'false'}
        onSubmit={onSubmit}
        noValidate
        className="mt-8 max-w-6xl space-y-5 pb-16"
      >
        <fieldset disabled={saving} className="space-y-5">
          <section className="max-w-3xl rounded-xl border border-border bg-surface px-5 py-5">
            {sectionHeading(<TypeIcon className="h-4 w-4" />, copy.register.sectionIdentity)}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field
                label={copy.register.name}
                htmlFor="siteName"
                error={errors.name}
                className="sm:col-span-2"
              >
                <input
                  id="siteName"
                  value={form.name}
                  onChange={(event) => set('name')(event.target.value)}
                  maxLength={120}
                  aria-invalid={Boolean(errors.name)}
                  placeholder={copy.register.namePlaceholder}
                  className={inputClass}
                />
              </Field>
              <Field
                label={copy.register.siteCode}
                htmlFor="siteCode"
                hint={copy.register.siteCodeHint}
              >
                <input
                  id="siteCode"
                  value={form.siteCode}
                  onChange={(event) => set('siteCode')(event.target.value)}
                  maxLength={40}
                  className={inputClass}
                />
              </Field>
              <Field label={copy.register.siteType} htmlFor="siteType">
                <select
                  id="siteType"
                  value={form.type}
                  onChange={(event) => set('type')(event.target.value)}
                  className={inputClass}
                >
                  <option value="billboard">{copy.register.typeBillboard}</option>
                  <option value="unipole">{copy.register.typeUnipole}</option>
                  <option value="gantry">{copy.register.typeGantry}</option>
                  <option value="building_wrap">{copy.register.typeBuildingWrap}</option>
                  <option value="spectacular">{copy.register.typeSpectacular}</option>
                  <option value="other">{copy.register.typeOther}</option>
                </select>
              </Field>
              <Field label={copy.register.format} htmlFor="siteFormat">
                <select
                  id="siteFormat"
                  value={form.format}
                  onChange={(event) => set('format')(event.target.value)}
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
                label={copy.register.subFormat}
                htmlFor="siteSubFormat"
                hint={copy.register.subFormatHint}
              >
                <input
                  id="siteSubFormat"
                  value={form.subFormat}
                  onChange={(event) => set('subFormat')(event.target.value)}
                  maxLength={60}
                  placeholder={copy.register.subFormatPlaceholder}
                  className={inputClass}
                />
              </Field>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface px-5 py-5">
            {sectionHeading(<MapPin className="h-4 w-4" />, copy.register.sectionLocation)}
            <p className="mt-3 text-xs leading-5 text-muted">
              {locale === 'fr'
                ? 'Le panneau et l’adresse doivent désigner le même lieu. Après l’enregistrement, vérifiez l’adresse et le repère avant l’envoi. Une différence confirmée entraîne un rejet automatique ; une recherche incertaine nécessite une vérification.'
                : 'The board pin and address must describe the same place. After saving, check the address and pin before submitting. A confirmed mismatch is automatically rejected; an uncertain lookup needs review.'}
            </p>
            <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              <div className="grid content-start gap-4 sm:grid-cols-2">
                <Field
                  label={copy.register.latitude}
                  htmlFor="siteLat"
                  error={errors.latitude}
                  hint={errors.latitude ? undefined : copy.register.coordsHint}
                >
                  <input
                    id="siteLat"
                    type="text"
                    step="any"
                    inputMode="decimal"
                    value={form.latitude}
                    onChange={(event) => set('latitude')(event.target.value)}
                    aria-invalid={Boolean(errors.latitude)}
                    className={inputClass}
                  />
                </Field>
                <Field label={copy.register.longitude} htmlFor="siteLng" error={errors.longitude}>
                  <input
                    id="siteLng"
                    type="text"
                    step="any"
                    inputMode="decimal"
                    value={form.longitude}
                    onChange={(event) => set('longitude')(event.target.value)}
                    aria-invalid={Boolean(errors.longitude)}
                    className={inputClass}
                  />
                </Field>
                <Field label={copy.register.address} htmlFor="siteAddress">
                  <input
                    id="siteAddress"
                    value={form.address}
                    onChange={(event) => set('address')(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label={copy.register.city} htmlFor="siteCity" error={errors.city}>
                  <input
                    id="siteCity"
                    value={form.city}
                    onChange={(event) => set('city')(event.target.value)}
                    aria-invalid={Boolean(errors.city)}
                    className={inputClass}
                  />
                </Field>
                <Field label={copy.register.region} htmlFor="siteRegion">
                  <input
                    id="siteRegion"
                    value={form.region}
                    onChange={(event) => set('region')(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label={copy.register.country} htmlFor="siteCountry" error={errors.country}>
                  <select
                    id="siteCountry"
                    value={form.country}
                    onChange={(event) => set('country')(event.target.value)}
                    aria-invalid={Boolean(errors.country)}
                    className={inputClass}
                  >
                    <option value="">
                      {locale === 'fr' ? 'Choisir le pays' : 'Choose country'}
                    </option>
                    {SUPPORTED_MARKETS.map((market) => (
                      <option key={market.code} value={market.name}>
                        {market.labels[locale === 'fr' ? 'fr' : 'en']}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label={copy.register.market}
                  htmlFor="siteMarket"
                  hint={copy.register.marketHint}
                  className="sm:col-span-2"
                >
                  <select
                    id="siteMarket"
                    value={form.marketId}
                    onChange={(event) => set('marketId')(event.target.value)}
                    className={inputClass}
                  >
                    <option value="">{copy.detail.permitNone}</option>
                    {markets.map((market) => (
                      <option key={market.id} value={market.id}>
                        {market.name} ({market.country})
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <RegistrationMap
                latitude={form.latitude}
                longitude={form.longitude}
                country={form.country}
                locale={locale === 'fr' ? 'fr' : 'en'}
                onPick={(latitude, longitude) => {
                  set('latitude')(latitude);
                  set('longitude')(longitude);
                }}
              />
            </div>
          </section>

          <section className="max-w-3xl rounded-xl border border-border bg-surface px-5 py-5">
            {sectionHeading(<Ruler className="h-4 w-4" />, copy.register.sectionPhysical)}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={copy.register.width} htmlFor="siteWidth" error={errors.width}>
                <span className="flex gap-2">
                  <input
                    id="siteWidth"
                    type="text"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    value={form.width}
                    onChange={(event) => set('width')(event.target.value)}
                    aria-invalid={Boolean(errors.width)}
                    className={inputClass}
                  />
                  <select
                    id="siteUnits"
                    value={form.units}
                    onChange={(event) => set('units')(event.target.value)}
                    aria-label={copy.register.units}
                    className="w-20 shrink-0 rounded-lg border border-border bg-surface-2 px-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
                  >
                    <option value="m">m</option>
                    <option value="ft">ft</option>
                  </select>
                </span>
              </Field>
              <Field label={copy.register.height} htmlFor="siteHeight" error={errors.height}>
                <input
                  id="siteHeight"
                  type="text"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  value={form.height}
                  onChange={(event) => set('height')(event.target.value)}
                  aria-invalid={Boolean(errors.height)}
                  className={inputClass}
                />
              </Field>
              <Field
                label={copy.register.orientation}
                htmlFor="siteOrientation"
                hint={copy.register.orientationHint}
                error={errors.orientationDeg}
              >
                <input
                  id="siteOrientation"
                  type="text"
                  step="any"
                  min="0"
                  max="359"
                  inputMode="numeric"
                  value={form.orientationDeg}
                  onChange={(event) => set('orientationDeg')(event.target.value)}
                  aria-invalid={Boolean(errors.orientationDeg)}
                  className={inputClass}
                />
              </Field>
              <Field
                label={copy.register.viewingDistance}
                htmlFor="siteViewingDistance"
                hint={copy.register.viewingDistanceHint}
                error={errors.viewingDistance}
              >
                <input
                  id="siteViewingDistance"
                  type="text"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  value={form.viewingDistance}
                  onChange={(event) => set('viewingDistance')(event.target.value)}
                  aria-invalid={Boolean(errors.viewingDistance)}
                  className={inputClass}
                />
              </Field>
              <Field
                label={copy.register.elevation}
                htmlFor="siteElevation"
                hint={copy.register.elevationHint}
                error={errors.elevation}
              >
                <input
                  id="siteElevation"
                  type="text"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  value={form.elevation}
                  onChange={(event) => set('elevation')(event.target.value)}
                  aria-invalid={Boolean(errors.elevation)}
                  className={inputClass}
                />
              </Field>
              <p className="text-xs leading-5 text-muted sm:col-span-2">{copy.register.areaNote}</p>
            </div>
            {structureEntered && (
              <div className="mt-4 rounded-lg border border-border bg-surface-2 px-4 py-4">
                <h3 className="text-sm font-bold">{copy.register.provenanceHeading}</h3>
                <p className="mt-1 text-xs leading-5 text-muted">{copy.register.provenanceHint}</p>
                <div className="mt-3 grid gap-4 sm:grid-cols-3">
                  <Field
                    label={copy.register.provenanceSource}
                    htmlFor="siteProvSource"
                    error={errors.provSource}
                  >
                    <input
                      id="siteProvSource"
                      value={form.provSource}
                      onChange={(event) => set('provSource')(event.target.value)}
                      maxLength={80}
                      list="provenanceSources"
                      placeholder={copy.register.provenanceSourcePlaceholder}
                      aria-invalid={Boolean(errors.provSource)}
                      className={inputClass}
                    />
                    <datalist id="provenanceSources">
                      <option value={t('Google Maps street view', 'Vue de rue Google Maps')} />
                      <option value={t('Site visit', 'Visite du site')} />
                      <option value={t('Survey plan', 'Plan de relevé')} />
                    </datalist>
                  </Field>
                  <Field
                    label={copy.register.provenanceMethod}
                    htmlFor="siteProvMethod"
                    error={errors.provMethod}
                  >
                    <input
                      id="siteProvMethod"
                      value={form.provMethod}
                      onChange={(event) => set('provMethod')(event.target.value)}
                      maxLength={80}
                      placeholder={copy.register.provenanceMethodPlaceholder}
                      aria-invalid={Boolean(errors.provMethod)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label={copy.register.provenanceDate} htmlFor="siteProvDate">
                    <input
                      id="siteProvDate"
                      type="date"
                      value={form.provDate}
                      onChange={(event) => set('provDate')(event.target.value)}
                      max={new Date().toISOString().slice(0, 10)}
                      className={inputClass}
                    />
                  </Field>
                </div>
              </div>
            )}
          </section>

          <section className="max-w-3xl rounded-xl border border-border bg-surface px-5 py-5">
            {sectionHeading(<SunMedium className="h-4 w-4" />, copy.register.sectionIllumination)}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={copy.register.illuminationType} htmlFor="siteIllum">
                <select
                  id="siteIllum"
                  value={form.illuminationType}
                  onChange={(event) => set('illuminationType')(event.target.value)}
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
                  htmlFor="siteIllumHours"
                  hint={copy.register.illuminationHoursHint}
                  error={errors.illuminationHours}
                >
                  <input
                    id="siteIllumHours"
                    value={form.illuminationHours}
                    onChange={(event) => set('illuminationHours')(event.target.value)}
                    aria-invalid={Boolean(errors.illuminationHours)}
                    className={inputClass}
                  />
                </Field>
              )}
              <Field
                label={copy.register.permitRef}
                htmlFor="sitePermitRef"
                hint={copy.register.permitRefHint}
              >
                <input
                  id="sitePermitRef"
                  value={form.permitRef}
                  onChange={(event) => set('permitRef')(event.target.value)}
                  maxLength={120}
                  className={inputClass}
                />
              </Field>
              <Field label={copy.register.permitExpiry} htmlFor="sitePermitExpiry">
                <input
                  id="sitePermitExpiry"
                  type="date"
                  value={form.permitExpiresAt}
                  onChange={(event) => set('permitExpiresAt')(event.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label={copy.register.description} htmlFor="siteDesc" className="sm:col-span-2">
                <textarea
                  id="siteDesc"
                  rows={3}
                  value={form.description}
                  onChange={(event) => set('description')(event.target.value)}
                  placeholder={copy.register.descriptionPlaceholder}
                  className={inputClass}
                />
              </Field>
            </div>
          </section>
        </fieldset>
        <section className="max-w-3xl rounded-xl border border-border bg-surface px-5 py-5">
          {sectionHeading(<Camera className="h-4 w-4" />, copy.register.sectionPhotos)}
          <div className="mt-3">
            <MediaCapturePicker
              value={photos}
              onChange={setPhotos}
              locale={locale}
              allowVideo={form.format === 'digital_led'}
              disabled={saving}
              errors={mediaErrors}
            />
          </div>
        </section>

        {uploadingPhoto && (
          <div className="flex items-center gap-2 rounded-lg bg-surface-2 border border-border px-4 py-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="font-medium">
              {withLabel(copy.register.uploadingPhoto, displayUiText(uploadingPhoto, locale))}
            </span>
            <button
              type="button"
              onClick={() => {
                uploadCancelledRef.current = true;
                uploadAbortRef.current?.abort();
              }}
              className="ml-auto font-bold text-error underline underline-offset-2 transition hover:text-error/80"
            >
              {copy.detail.cancel}
            </button>
          </div>
        )}

        {uploadCancelled && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-warning/10 border border-warning/30 px-4 py-3 text-sm text-foreground">
            <span>
              {submitError
                ? locale === 'fr'
                  ? 'Vos fichiers restants sont conservés.'
                  : 'Remaining files are preserved.'
                : copy.register.cancelledUploads}
            </span>
            <Link
              href={`/sites/detail/?id=${uploadCancelled}`}
              className="font-bold text-primary underline underline-offset-2"
            >
              {copy.admin.viewSite}
            </Link>
          </div>
        )}

        {errorSummary && (
          <p
            role="alert"
            className="rounded-lg bg-error/10 px-4 py-3 text-sm font-medium text-error"
          >
            {displayUiText(errorSummary, locale)}
          </p>
        )}
        {submitError && (
          <p
            role="alert"
            className="rounded-lg bg-error/10 px-4 py-3 text-sm font-medium text-error"
          >
            {displayUiText(submitError, locale)}
          </p>
        )}

        {uploadCancelled && photos.length === 0 ? (
          <div className="sticky bottom-4 flex justify-end">
            <Link
              href={`/sites/detail/?id=${uploadCancelled}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-white shadow-lg shadow-primary/25 transition hover:bg-primary-hover"
            >
              {copy.admin.viewSite}
            </Link>
          </div>
        ) : (
          <div className="sticky bottom-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-white shadow-lg shadow-primary/25 transition hover:bg-primary-hover disabled:opacity-70"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlusCircle className="h-4 w-4" />
              )}
              {saving
                ? copy.register.saving
                : uploadCancelled
                  ? locale === 'fr'
                    ? 'Réessayer les médias restants'
                    : 'Retry remaining media'
                  : copy.register.saveDraft}
            </button>
          </div>
        )}
      </form>
    </WorkspaceFrame>
  );
}
