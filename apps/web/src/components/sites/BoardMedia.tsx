'use client';

import { useEffect, useState } from 'react';
import { Loader2, PlayCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { assetDisplay, type SiteAsset } from '../../lib/sites-api';

export function AuthBoardVideo({ asset, locale }: { asset: SiteAsset; locale?: string }) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const [requested, setRequested] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setError(false);
    setSrc(null);
    const display = assetDisplay(asset);
    if (display.plain) {
      setSrc(display.plain);
      return;
    }
    void apiFetch(
      `/api/inventory/sites/${encodeURIComponent(asset.siteId)}/assets/${encodeURIComponent(asset.id)}/file`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error('Video unavailable');
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset, requested, attempt]);
  return (
    <figure className="overflow-hidden rounded-lg border border-border bg-surface-2">
      {src && !error ? (
        <video
          src={src}
          controls
          playsInline
          preload="metadata"
          onError={() => setError(true)}
          className="max-h-80 w-full bg-background"
          aria-label={t('Video of the installed LED board', 'Vidéo du panneau LED installé')}
        />
      ) : (
        <div className="flex min-h-28 flex-col items-center justify-center gap-2 p-4 text-center">
          {requested && !error ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p role="status" className="text-xs text-muted">
                {t('Loading board video…', 'Chargement de la vidéo…')}
              </p>
              <button
                type="button"
                onClick={() => {
                  setRequested(false);
                  setSrc(null);
                }}
                className="min-h-9 text-xs font-semibold text-muted"
              >
                {t('Cancel loading', 'Annuler le chargement')}
              </button>
            </>
          ) : (
            <>
              <PlayCircle className="h-6 w-6 text-primary" />
              {error && (
                <p role="alert" className="text-xs text-error">
                  {t('The video could not be loaded.', 'La vidéo n’a pas pu être chargée.')}
                </p>
              )}
              <button
                type="button"
                className="min-h-10 rounded-lg border border-border px-3 text-sm font-semibold"
                onClick={() => {
                  setRequested(true);
                  setAttempt((value) => value + 1);
                }}
              >
                {error
                  ? t('Retry video', 'Réessayer la vidéo')
                  : t('Load board video', 'Charger la vidéo du panneau')}
              </button>
            </>
          )}
        </div>
      )}
      <figcaption className="px-3 py-2 text-xs text-muted">
        {t(
          'Installed LED board · partner-supplied reference media',
          'Panneau LED installé · média de référence fourni par le partenaire',
        )}
        {asset.durationSeconds != null && ` · ${Math.round(asset.durationSeconds)} s`}
        {asset.byteSize != null && ` · ${(asset.byteSize / 1024 / 1024).toFixed(1)} MB`}
      </figcaption>
    </figure>
  );
}

export function MediaEvidence({ asset, locale }: { asset: SiteAsset; locale?: string }) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const metadata = asset.metadata;
  const warnings: Record<string, [string, string]> = {
    exif_timezone_missing: [
      'Embedded capture time has no timezone; its UTC time is unknown.',
      'La date intégrée n’a pas de fuseau horaire ; son heure UTC est inconnue.',
    ],
    exif_time_future: [
      'Embedded capture time is in the future and was not accepted.',
      'La date intégrée est dans le futur et n’a pas été retenue.',
    ],
    exif_unreadable: [
      'Embedded metadata could not be read.',
      'Les métadonnées intégrées n’ont pas pu être lues.',
    ],
    photo_pin_distance: [
      'The photo GPS differs from the board pin. Check that this is the correct board.',
      'Le GPS de la photo diffère du repère du panneau. Vérifiez qu’il s’agit du bon panneau.',
    ],
    photo_device_distance: [
      'Embedded photo GPS and declared device GPS differ.',
      'Le GPS intégré et le GPS déclaré de l’appareil diffèrent.',
    ],
    gps_missing: [
      'No GPS location was found in this media.',
      'Aucune position GPS n’a été trouvée dans ce média.',
    ],
    capture_time_missing: ['Capture time is unknown.', 'La date de prise de vue est inconnue.'],
  };
  const warningMessages = metadata?.warningCodes?.length
    ? metadata.warningCodes.flatMap((code) => (warnings[code] ? [t(...warnings[code])] : []))
    : locale === 'fr'
      ? []
      : (metadata?.warnings ?? []);
  return (
    <details className="mt-2 text-xs leading-5 text-muted">
      <summary className="cursor-pointer font-semibold">
        {t('Capture evidence', 'Preuves de prise de vue')}
      </summary>
      <dl className="mt-2 space-y-1">
        <div>
          <dt className="inline font-semibold">{t('Location', 'Position')} : </dt>
          <dd className="inline">
            {metadata?.location?.latitude != null && metadata.location.longitude != null
              ? `${metadata.location.latitude.toFixed(5)}, ${metadata.location.longitude.toFixed(5)} · ${metadata.location.source === 'exif' ? t('embedded EXIF', 'EXIF intégré') : t('device GPS', 'GPS de l’appareil')}${metadata.location.accuracyMeters != null ? ` · ±${Math.round(metadata.location.accuracyMeters)} m` : ''}`
              : t('GPS not recorded', 'GPS non renseigné')}
          </dd>
        </div>
        <div>
          <dt className="inline font-semibold">{t('Capture time', 'Date de prise de vue')} : </dt>
          <dd className="inline">
            {(metadata?.time?.precision === 'day' ||
              (metadata?.time?.source === 'partner_declared' && !metadata.time.precision)) &&
            (metadata.time.declaredDate || metadata.time.value)
              ? `${metadata.time.declaredDate || metadata.time.value?.slice(0, 10)} · ${t('time unknown', 'heure inconnue')}`
              : metadata?.time?.value
                ? `${new Date(metadata.time.value).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en', { timeZone: 'UTC' })} UTC`
                : metadata?.time?.localValue
                  ? `${metadata.time.localValue} · ${t('timezone unknown', 'fuseau horaire inconnu')}`
                  : asset.capturedAt
                    ? `${asset.capturedAt.slice(0, 10)} · ${t('declared date', 'date déclarée')}`
                    : t('Unknown', 'Inconnue')}
            {metadata?.time?.source && metadata.time.source !== 'missing'
              ? ` · ${metadata.time.source === 'partner_declared' ? t('partner declared', 'déclarée par le partenaire') : metadata.time.source === 'exif' ? 'EXIF' : t('device capture', 'capture de l’appareil')}`
              : ''}
          </dd>
        </div>
        {metadata?.evidenceDistanceMeters != null && (
          <div>
            <dt className="inline font-semibold">
              {t('Distance from board pin', 'Distance du repère du panneau')} :{' '}
            </dt>
            <dd className="inline">{Math.round(metadata.evidenceDistanceMeters)} m</dd>
          </div>
        )}
      </dl>
      <p className="mt-1">
        {t(
          'Metadata is unverified evidence and does not prove authenticity.',
          'Les métadonnées sont des preuves non vérifiées et ne prouvent pas l’authenticité.',
        )}
      </p>
      {metadata?.missingMetadataReason && <p>{metadata.missingMetadataReason}</p>}
      {warningMessages.map((warning: string) => (
        <p key={warning}>{warning}</p>
      ))}
    </details>
  );
}
