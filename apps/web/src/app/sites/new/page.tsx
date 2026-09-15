'use client';

import { ArrowLeft, Camera, Loader2, MapPin, PlusCircle, Ruler, SunMedium, Type as TypeIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';

/** Replace a single {{label}} placeholder in upload progress copy. */
const withLabel = (template: string, label: string): string =>
  template.replace('{{label}}', label);
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { WorkspaceFrame } from '../../../components/account/WorkspaceFrame';
import { useAuth } from '../../../components/auth/AuthProvider';
import { Field, PendingUploadChip, inputClass } from '../../../components/sites/sites-ui';
import { createSite, uploadAsset } from '../../../lib/sites-api';
import { getSitesCopy } from '../../../lib/sites-locale';
import { canManageSites } from '../../../lib/sites-access';
import { parseDecimal } from '../../../lib/number-format';
import { ApiError } from '../../../lib/api';

interface PendingPhoto {
  id: string;
  kind: 'front' | 'context' | 'night';
  file: File;
}

const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

interface FormState {
  name: string;
  format: string;
  latitude: string;
  longitude: string;
  address: string;
  city: string;
  region: string;
  country: string;
  width: string;
  height: string;
  units: string;
  orientationDeg: string;
  illuminationType: string;
  illuminationHours: string;
  description: string;
}

const INITIAL: FormState = {
  name: '',
  format: 'static',
  latitude: '',
  longitude: '',
  address: '',
  city: '',
  region: '',
  country: '',
  width: '',
  height: '',
  units: 'm',
  orientationDeg: '',
  illuminationType: 'none',
  illuminationHours: '',
  description: '',
};

export default function RegisterSitePage() {
  const router = useRouter();
  const { activeOrganization, capabilities, profile } = useAuth();
  const copy = getSitesCopy(profile?.locale);
  const orgId = activeOrganization?.organizationId;
  // Server rule: site registration is a media-partner capability. Without the
  // org-type match the save would 403 after the form is filled in.
  const canManage = canManageSites({ capabilities, orgType: activeOrganization?.type });

  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const [uploadCancelled, setUploadCancelled] = useState<string | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const uploadCancelledRef = useRef(false);
  const kindToUpload = (kind: PendingPhoto['kind']) =>
    copy.register[kind === 'front' ? 'photoFront' : kind === 'context' ? 'photoContext' : 'photoNight'];
  const [photoError, setPhotoError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  // Idempotent create (ambiguous-network retry): one stable operation id per
  // submission chain. A repeat POST after a lost response replays the original
  // draft instead of creating a duplicate; the key regenerates only when the
  // user edits the form after a failure.
  const clientRequestRef = useRef<string | null>(null);
  const submitFailedRef = useRef(false);

  const set = (key: keyof FormState) => (value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
    if (submitFailedRef.current) {
      // Deliberate edit after a failed save: this is a new logical attempt.
      submitFailedRef.current = false;
      clientRequestRef.current = null;
    }
  };

  if (!canManage) {
    const capabilitiesHeld = capabilities.includes('INVENTORY_CREATE') && capabilities.includes('INVENTORY_EDIT');
    return (
      <WorkspaceFrame current="sites">
        <h1 className="text-3xl font-extrabold tracking-[-0.045em]">{copy.register.title}</h1>
        <p className="mt-3 rounded-xl border border-border bg-surface px-5 py-6 text-sm leading-6 text-muted">
          {capabilitiesHeld ? copy.list.notPartnerNotice : copy.detail.noAccess}
        </p>
      </WorkspaceFrame>
    );
  }

  const addPhotos = (event: ChangeEvent<HTMLInputElement>, kind: PendingPhoto['kind']) => {
    setPhotoError('');
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    const accepted: PendingPhoto[] = [];
    for (const file of files) {
      if (!PHOTO_ACCEPT.split(',').includes(file.type) || file.size > PHOTO_MAX_BYTES) {
        setPhotoError(copy.register.photoError);
        continue;
      }
      accepted.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, kind, file });
    }
    if (accepted.length > 0) setPhotos((previous) => [...previous, ...accepted]);
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    const lat = parseDecimal(form.latitude);
    const lon = parseDecimal(form.longitude);
    const width = parseDecimal(form.width);
    const height = parseDecimal(form.height);
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
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError('');
    if (!validate() || !orgId || saving) return;
    setSaving(true);
    const lat = parseDecimal(form.latitude) as number;
    const lon = parseDecimal(form.longitude) as number;
    const width = parseDecimal(form.width) as number;
    const height = parseDecimal(form.height) as number;
    const orientation = parseDecimal(form.orientationDeg);
    if (!clientRequestRef.current) {
      clientRequestRef.current =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `cr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
    try {
      const site = await createSite(orgId, {
        clientRequestId: clientRequestRef.current,
        name: form.name.trim(),
        format: form.format,
        latitude: lat,
        longitude: lon,
        ...(form.address.trim() ? { address: form.address.trim() } : {}),
        city: form.city.trim(),
        ...(form.region.trim() ? { region: form.region.trim() } : {}),
        country: form.country.trim(),
        width,
        height,
        units: form.units,
        ...(orientation !== null ? { orientationDeg: orientation } : {}),
        illuminationType: form.illuminationType,
        ...(form.illuminationType !== 'none' && form.illuminationHours.trim()
          ? { illuminationHours: form.illuminationHours.trim() }
          : {}),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
      });
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
          await uploadAsset(orgId, site.id, photo.kind, photo.file, controller.signal);
        } catch {
          if (uploadCancelledRef.current) {
            uploadCancelledRef.current = false;
            uploadAbortRef.current = null;
            setUploadingPhoto(null);
            setUploadCancelled(site.id);
            setSaving(false);
            return;
          }
          uploadFailed = true;
        }
      }
      uploadAbortRef.current = null;
      setUploadingPhoto(null);
      router.replace(`/sites/detail/?id=${site.id}${uploadFailed ? '&photoError=1' : ''}`);
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
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      {label}
    </h2>
  );

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
      <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.045em]">{copy.register.title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{copy.register.intro}</p>

      <form onSubmit={onSubmit} noValidate className="mt-8 max-w-3xl space-y-5 pb-16">
        <section className="rounded-xl border border-border bg-surface px-5 py-5">
          {sectionHeading(<TypeIcon className="h-4 w-4" />, copy.register.sectionIdentity)}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={copy.register.name} htmlFor="siteName" error={errors.name} className="sm:col-span-2">
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
              </select>
            </Field>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface px-5 py-5">
          {sectionHeading(<MapPin className="h-4 w-4" />, copy.register.sectionLocation)}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
              <input
                id="siteCountry"
                list="siteCountries"
                value={form.country}
                onChange={(event) => set('country')(event.target.value)}
                aria-invalid={Boolean(errors.country)}
                className={inputClass}
              />
              <datalist id="siteCountries">
                <option value="Nigeria" />
                <option value="Ghana" />
                <option value="Cameroon" />
              </datalist>
            </Field>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface px-5 py-5">
          {sectionHeading(<Ruler className="h-4 w-4" />, copy.register.sectionPhysical)}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={copy.register.width} htmlFor="siteWidth" error={errors.width}>
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
            <Field label={copy.register.units} htmlFor="siteUnits">
              <select
                id="siteUnits"
                value={form.units}
                onChange={(event) => set('units')(event.target.value)}
                className={inputClass}
              >
                <option value="m">m</option>
                <option value="ft">ft</option>
              </select>
            </Field>
            <Field
              label={copy.register.orientation}
              htmlFor="siteOrientation"
              hint={copy.register.orientationHint}
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
                className={inputClass}
              />
            </Field>
            <p className="text-xs leading-5 text-muted sm:col-span-2">{copy.register.areaNote}</p>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface px-5 py-5">
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

        <section className="rounded-xl border border-border bg-surface px-5 py-5">
          {sectionHeading(<Camera className="h-4 w-4" />, copy.register.sectionPhotos)}
          <p className="mt-3 text-sm leading-6 text-muted">{copy.register.photoHint}</p>
          {photoError && (
            <p role="alert" className="mt-2 text-xs font-medium text-error">
              {photoError}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            {(['front', 'context', 'night'] as const).map((kind) => (
              <label
                key={kind}
                className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold transition hover:bg-surface-2"
              >
                <PlusCircle className="h-4 w-4 text-primary" />
                {copy.register[
                  kind === 'front' ? 'photoFront' : kind === 'context' ? 'photoContext' : 'photoNight'
                ]}
                <input
                  type="file"
                  accept={PHOTO_ACCEPT}
                  multiple={kind !== 'front'}
                  className="sr-only"
                  onChange={(event) => addPhotos(event, kind)}
                />
              </label>
            ))}
          </div>
          {photos.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted">
                {photos.length} {copy.register.photosReady}
              </span>
              {photos.map((photo) => (
                <PendingUploadChip
                  key={photo.id}
                  label={photo.file.name}
                  removeLabel={copy.register.photoRemove}
                  onRemove={() => setPhotos((previous) => previous.filter((p) => p.id !== photo.id))}
                />
              ))}
            </div>
          )}
        </section>

        {uploadingPhoto && (
          <div className="flex items-center gap-2 rounded-lg bg-surface-2 border border-border px-4 py-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="font-medium">{withLabel(copy.register.uploadingPhoto, uploadingPhoto)}</span>
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
            <span>{copy.register.cancelledUploads}</span>
            <Link
              href={`/sites/detail/?id=${uploadCancelled}`}
              className="font-bold text-primary underline underline-offset-2"
            >
              {copy.admin.viewSite}
            </Link>
          </div>
        )}

        {submitError && (
          <p role="alert" className="rounded-lg bg-error/10 px-4 py-3 text-sm font-medium text-error">
            {submitError}
          </p>
        )}

        {uploadCancelled ? (
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
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
              {saving ? copy.register.saving : copy.register.saveDraft}
            </button>
          </div>
        )}
      </form>
    </WorkspaceFrame>
  );
}
