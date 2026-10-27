'use client';

import { flushSync } from 'react-dom';
import { Camera, Loader2, PlusCircle, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { SiteCaptureGuide } from './SiteCaptureGuide';
import type { SiteAsset } from '../../lib/sites-api';
import { Field, inputClass } from './sites-ui';
import { displayNumber } from '../../lib/locale-format';
import { agencyEvidenceText } from '../../lib/agency-evidence-locale';

export interface PendingSiteMedia {
  id: string;
  kind:
    | 'wide'
    | 'close_up'
    | 'panorama'
    | 'site_video'
    | 'front'
    | 'context'
    | 'night'
    | 'diagram'
    | 'board_video';
  file: File;
  capturedAt: string;
  captureMethod: 'uploaded' | 'device_camera';
  deviceLatitude?: number;
  deviceLongitude?: number;
  deviceAccuracyMeters?: number;
  deviceCapturedAt?: string;
  deviceLocationRecordedAt?: string;
  missingMetadataReason: string;
}

export function MediaCapturePicker({
  value,
  onChange,
  locale,
  existing = [],
  allowBoardVideo = false,
  disabled = false,
  errors = {},
}: {
  value: PendingSiteMedia[];
  onChange: (value: PendingSiteMedia[]) => void;
  locale?: string;
  existing?: SiteAsset[];
  allowBoardVideo?: boolean;
  disabled?: boolean;
  errors?: Record<string, string>;
}) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedKind, setKind] = useState<PendingSiteMedia['kind']>('wide');
  const kind = selectedKind === 'board_video' && !allowBoardVideo ? 'wide' : selectedKind;
  const videoKind = kind === 'site_video' || kind === 'board_video';
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const [camera, setCamera] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraSession = useRef(0);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeCamera = () => {
    cameraSession.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCamera(false);
    setOpening(false);
    setCapturing(false);
    returnFocusRef.current?.focus();
  };
  useEffect(
    () => () => {
      cameraSession.current += 1;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  useEffect(() => {
    if (camera && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => undefined);
      closeButtonRef.current?.focus();
    }
  }, [camera]);
  const add = (file: File, extra: Partial<PendingSiteMedia> = {}) => {
    onChange([
      ...value,
      {
        id: crypto.randomUUID(),
        kind,
        file,
        capturedAt: '',
        captureMethod: 'uploaded',
        missingMetadataReason: '',
        ...extra,
      },
    ]);
  };
  const startCamera = async () => {
    setError('');
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError(
        t(
          'Camera capture needs a secure connection and a supported browser. You can upload a photo instead.',
          'La prise de photo nécessite une connexion sécurisée et un navigateur compatible. Vous pouvez importer une photo.',
        ),
      );
      return;
    }
    const session = ++cameraSession.current;
    setOpening(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (cameraSession.current !== session) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      setCamera(true);
    } catch {
      setError(
        t(
          'Camera access was unavailable. Check permission or upload a photo.',
          'Accès à la caméra indisponible. Vérifiez les autorisations ou importez une photo.',
        ),
      );
    } finally {
      if (cameraSession.current === session) setOpening(false);
    }
  };
  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || capturing) return;
    const session = cameraSession.current;
    setCapturing(true);
    const capturedAt = new Date().toISOString();
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1920 / video.videoWidth, 1920 / video.videoHeight);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) {
      setCapturing(false);
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9),
    );
    if (cameraSession.current !== session) return;
    if (!blob) {
      setCapturing(false);
      setError(
        t(
          'The photo could not be saved. Try capturing again or upload a photo.',
          'La photo n’a pas pu être enregistrée. Réessayez ou importez une photo.',
        ),
      );
      return;
    }
    const location = await new Promise<GeolocationPosition | null>((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      });
    });
    if (cameraSession.current !== session) return;
    add(new File([blob], `board-${capturedAt.replace(/[:.]/g, '-')}.jpg`, { type: 'image/jpeg' }), {
      captureMethod: 'device_camera',
      capturedAt: capturedAt.slice(0, 10),
      deviceCapturedAt: capturedAt,
      ...(location
        ? {
            deviceLatitude: location.coords.latitude,
            deviceLongitude: location.coords.longitude,
            deviceAccuracyMeters: location.coords.accuracy,
            deviceLocationRecordedAt: new Date(location.timestamp).toISOString(),
            deviceCapturedAt: capturedAt,
          }
        : {
            // Persist canonical controlled evidence; localize only its display.
            missingMetadataReason: 'Device location was unavailable during camera capture.',
          }),
    });
    closeCamera();
  };
  const update = (mediaId: string, patch: Partial<PendingSiteMedia>) =>
    onChange(value.map((media) => (media.id === mediaId ? { ...media, ...patch } : media)));
  return (
    <div className="space-y-3">
      <SiteCaptureGuide
        value={value}
        existing={existing}
        locale={locale}
        onChoose={(next) => {
          if (disabled) return;
          flushSync(() => setKind(next));
          fileInput.current?.click();
        }}
      />
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('Media type', 'Type de média')} htmlFor={`${id}-kind`}>
          <select
            id={`${id}-kind`}
            value={kind}
            disabled={disabled}
            onChange={(event) => setKind(event.target.value as PendingSiteMedia['kind'])}
            className={inputClass}
          >
            <option value="wide">{t('Wide / long-view photo', 'Photo en vue large')}</option>
            <option value="close_up">
              {t('Close-up / short-view photo', 'Photo en vue rapprochée')}
            </option>
            {allowBoardVideo && (
              <option value="board_video">
                {t('LED board recording (optional)', 'Enregistrement du panneau LED (facultatif)')}
              </option>
            )}
            <option value="site_video">{t('Site video', 'Vidéo du site')}</option>
            <option value="panorama">{t('360° panorama', 'Panorama 360°')}</option>
            <option value="front">{t('Front photo', 'Photo de face')}</option>
            <option value="context">{t('Street context', 'Environnement')}</option>
            <option value="night">{t('Night photo', 'Photo de nuit')}</option>
            <option value="diagram">{t('Diagram', 'Schéma')}</option>
          </select>
        </Field>
        <label
          className={`inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold ${disabled ? 'opacity-50' : 'cursor-pointer hover:bg-surface-2'}`}
        >
          <PlusCircle className="h-4 w-4 text-primary" />
          {t('Choose file', 'Choisir un fichier')}
          <input
            ref={fileInput}
            type="file"
            disabled={disabled}
            aria-label={t('Choose board media', 'Choisir un média du panneau')}
            className="sr-only"
            accept={videoKind ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp'}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              setError('');
              if (!file) return;
              const video = videoKind;
              if (
                !(
                  video ? ['video/mp4', 'video/webm'] : ['image/jpeg', 'image/png', 'image/webp']
                ).includes(file.type) ||
                file.size > (video ? 50 : 10) * 1024 * 1024
              ) {
                setError(
                  video
                    ? t(
                        'Choose MP4 or WebM up to 50 MB.',
                        'Choisissez un MP4 ou WebM de 50 Mo maximum.',
                      )
                    : t(
                        'Choose JPEG, PNG or WebP up to 10 MB.',
                        'Choisissez un JPEG, PNG ou WebP de 10 Mo maximum.',
                      ),
                );
                return;
              }
              if (
                value.some(
                  (media) =>
                    media.kind === kind &&
                    media.file.name === file.name &&
                    media.file.size === file.size &&
                    media.file.lastModified === file.lastModified,
                )
              )
                return;
              add(file);
            }}
          />
        </label>
        {opening && (
          <button
            type="button"
            onClick={closeCamera}
            className="min-h-10 px-3 text-sm font-semibold text-muted"
          >
            {t('Cancel camera request', 'Annuler la demande de caméra')}
          </button>
        )}
        {!videoKind && kind !== 'panorama' && (
          <button
            type="button"
            disabled={disabled || opening}
            onClick={() => void startCamera()}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-50"
          >
            {opening ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            {t('Take on-site photo', 'Prendre une photo sur place')}
          </button>
        )}
      </div>
      {videoKind && (
        <p className="text-xs leading-5 text-muted">
          {t(
            'Film the site and its surroundings, not an ad creative. MP4 (H.264) or WebM, up to 60 seconds, 50 MB and 1920 × 1080 pixels. Audio is not required.',
            'Filmez le site et ses alentours, pas un fichier publicitaire. MP4 (H.264) ou WebM, 60 secondes, 50 Mo et 1920 × 1080 pixels maximum. Le son n’est pas nécessaire.',
          )}
        </p>
      )}
      {kind === 'panorama' && (
        <p className="text-sm leading-6 text-muted">
          {t(
            'Use a full 360° photo exported as a 2:1 equirectangular JPEG, PNG or WebP (up to 10 MB). A regular phone panorama is not a full 360° image; choose a site video if you do not have one.',
            'Utilisez une photo 360° complète exportée en image équirectangulaire 2:1 JPEG, PNG ou WebP (10 Mo maximum). Un panorama classique de téléphone n’est pas une image 360° complète ; choisissez une vidéo du site si nécessaire.',
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-error">
          {agencyEvidenceText(error, locale === 'fr' ? 'fr' : 'en')}
        </p>
      )}
      <ul className="space-y-3">
        {value.map((media) => (
          <li key={media.id} className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="flex items-start gap-3">
              <PendingPreview media={media} />
              <div className="min-w-0 flex-1">
                <p className="break-all text-sm font-semibold">{media.file.name}</p>
                <p className="mt-1 text-xs text-muted">
                  {displayNumber(media.file.size / 1024 / 1024, locale, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}{' '}
                  {t('MB', 'Mo')} ·{' '}
                  {media.captureMethod === 'device_camera'
                    ? t(
                        'Camera capture · device evidence, unverified',
                        'Prise de photo · preuve de l’appareil, non vérifiée',
                      )
                    : t(
                        'Upload · metadata checked after save',
                        'Import · métadonnées vérifiées après enregistrement',
                      )}
                </p>
                {media.deviceLatitude !== undefined && (
                  <p className="mt-1 text-xs text-muted">
                    GPS{' '}
                    {displayNumber(media.deviceLatitude, locale, {
                      minimumFractionDigits: 5,
                      maximumFractionDigits: 5,
                    })}{' '}
                    ;{' '}
                    {media.deviceLongitude !== undefined
                      ? displayNumber(media.deviceLongitude, locale, {
                          minimumFractionDigits: 5,
                          maximumFractionDigits: 5,
                        })
                      : '—'}{' '}
                    · ±{displayNumber(Math.round(media.deviceAccuracyMeters ?? 0), locale)} m
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(value.filter((item) => item.id !== media.id))}
                aria-label={`${t('Remove', 'Retirer')} ${media.file.name}`}
                className="grid min-h-9 min-w-9 place-items-center rounded-lg text-error hover:bg-error/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {errors[media.id] && (
              <p role="alert" className="mt-2 text-sm text-error">
                {agencyEvidenceText(errors[media.id], locale === 'fr' ? 'fr' : 'en')}{' '}
                <span>
                  {t(
                    'Remove and choose a replacement file, or retry after correcting the issue.',
                    'Retirez le fichier et choisissez un remplacement, ou réessayez après correction.',
                  )}
                </span>
              </p>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-muted">
                {t('Capture details (optional)', 'Détails de prise de vue (facultatifs)')}
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field
                  label={t('Declared capture date', 'Date de prise de vue déclarée')}
                  htmlFor={`${id}-${media.id}-date`}
                  hint={t(
                    'Leave blank if unknown. Embedded metadata takes precedence.',
                    'Laissez vide si inconnue. Les métadonnées intégrées sont prioritaires.',
                  )}
                >
                  <input
                    id={`${id}-${media.id}-date`}
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    disabled={disabled}
                    value={media.capturedAt}
                    onChange={(event) => update(media.id, { capturedAt: event.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field
                  label={t(
                    'Missing metadata explanation',
                    'Explication des métadonnées manquantes',
                  )}
                  htmlFor={`${id}-${media.id}-reason`}
                >
                  <input
                    id={`${id}-${media.id}-reason`}
                    value={agencyEvidenceText(
                      media.missingMetadataReason,
                      locale === 'fr' ? 'fr' : 'en',
                    )}
                    disabled={disabled}
                    maxLength={500}
                    onChange={(event) =>
                      update(media.id, { missingMetadataReason: event.target.value })
                    }
                    className={inputClass}
                  />
                </Field>
              </div>
            </details>
          </li>
        ))}
      </ul>
      {camera && (
        <div
          className="fixed inset-0 z-[1100] flex items-center justify-center bg-background/95 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${id}-camera-title`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') closeCamera();
            if (event.key === 'Tab') {
              const focusable = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(
                  'button:not([disabled]), [tabindex="0"]',
                ),
              );
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }
          }}
        >
          <div className="w-full max-w-xl rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <h3 id={`${id}-camera-title`} className="font-bold">
                {t('Capture the board on site', 'Photographier le panneau sur place')}
              </h3>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeCamera}
                aria-label={t('Close camera', 'Fermer la caméra')}
                className="grid min-h-10 min-w-10 place-items-center"
              >
                <X />
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-2 text-sm text-error">
                {agencyEvidenceText(error, locale === 'fr' ? 'fr' : 'en')}
              </p>
            )}
            <video
              ref={videoRef}
              muted
              playsInline
              tabIndex={-1}
              className="mt-3 max-h-[55vh] w-full rounded-lg bg-background"
            />
            <p className="mt-3 text-xs leading-5 text-muted">
              {t(
                'When you capture, your browser asks for location. Location and accuracy are saved with this photo as unverified device evidence. If unavailable, the photo can still be saved.',
                'Lors de la prise de photo, le navigateur demande votre position. La position et sa précision sont enregistrées comme preuves non vérifiées de l’appareil. Sans position, la photo peut être enregistrée.',
              )}
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeCamera}
                className="min-h-11 rounded-lg border border-border px-4"
              >
                {t('Cancel', 'Annuler')}
              </button>
              <button
                type="button"
                disabled={capturing}
                onClick={() => void capture()}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-bold text-white disabled:opacity-60"
              >
                {capturing && <Loader2 className="h-4 w-4 animate-spin" />}
                {capturing
                  ? t('Saving photo and checking GPS…', 'Enregistrement et recherche GPS…')
                  : t('Capture photo', 'Prendre la photo')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PendingPreview({ media }: { media: PendingSiteMedia }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(media.file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [media.file]);
  if (!src) return null;
  return media.kind === 'site_video' || media.kind === 'board_video' ? (
    <video
      src={src}
      controls
      preload="metadata"
      playsInline
      className="h-20 w-28 shrink-0 rounded-md bg-background object-contain"
      aria-label={media.file.name}
    />
  ) : (
    <img src={src} alt={media.file.name} className="h-20 w-24 shrink-0 rounded-md object-cover" />
  );
}
