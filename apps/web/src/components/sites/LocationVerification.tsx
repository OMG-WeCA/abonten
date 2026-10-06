'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, MapPin, ShieldAlert } from 'lucide-react';
import { verifySiteLocation, type SiteDetail } from '../../lib/sites-api';
import { locationVerificationMessage } from '../../lib/location-verification-locale';
import { displayNumber, displayUtcTimestamp } from '../../lib/locale-format';

export function LocationVerification({
  site,
  orgId,
  locale,
  editable,
  onUpdated,
}: {
  site: SiteDetail;
  orgId?: string;
  locale?: string;
  editable: boolean;
  onUpdated: () => Promise<void>;
}) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(false);
  const result = site.locationVerification;
  const mismatch = result?.status === 'mismatch';
  const matched = result?.status === 'matched';
  return (
    <section
      aria-label={t('Address and pin check', 'Vérification de l’adresse et du repère')}
      className={`rounded-xl border px-4 py-3 ${mismatch ? 'border-error/30 bg-error/10' : matched ? 'border-success/30 bg-success/10' : 'border-border bg-surface'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            {mismatch ? (
              <ShieldAlert className="h-4 w-4 text-error" />
            ) : matched ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : (
              <MapPin className="h-4 w-4 text-primary" />
            )}
            {mismatch
              ? t('Address and pin do not match', 'L’adresse et le repère ne correspondent pas')
              : matched
                ? t('Address and pin are consistent', 'L’adresse et le repère sont cohérents')
                : result
                  ? t('Address could not be verified', 'L’adresse n’a pas pu être vérifiée')
                  : t(
                      'Check the address and board pin',
                      'Vérifiez l’adresse et le repère du panneau',
                    )}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            {mismatch
              ? t(
                  'Correct the street address or move the pin to the actual board location, save, then check again and resubmit. A confirmed mismatch is automatically rejected when submitted.',
                  'Corrigez l’adresse ou déplacez le repère vers le panneau réel, enregistrez, puis revérifiez et renvoyez. Une différence confirmée entraîne un rejet automatique à l’envoi.',
                )
              : matched
                ? t(
                    'This checks geographic consistency, not ownership or availability. Listing still needs review.',
                    'Ce contrôle vérifie la cohérence géographique, pas la propriété ni la disponibilité. La publication reste soumise à vérification.',
                  )
                : result
                  ? t(
                      'The lookup was unavailable, ambiguous or insufficiently precise. This is not a confirmed mismatch. Improve the address or retry; submission stays unpublished for review.',
                      'La recherche était indisponible, ambiguë ou trop imprécise. Ce n’est pas une différence confirmée. Précisez l’adresse ou réessayez ; l’envoi reste non publié pour vérification.',
                    )
                  : t(
                      'Use a specific street address, city and country. Only a sufficiently precise, unambiguous lookup can confirm a mismatch.',
                      'Indiquez une adresse précise, la ville et le pays. Seule une recherche suffisamment précise et sans ambiguïté peut confirmer une différence.',
                    )}
          </p>
          {result?.lastAttempt && (
            <p role="status" className="mt-2 text-xs leading-5 text-warning">
              {t(
                'The latest check was inconclusive. The confirmed mismatch remains until you correct the location or a precise check resolves it.',
                'Le dernier contrôle n’a pas abouti. La différence confirmée reste valable jusqu’à la correction de l’emplacement ou à un contrôle précis qui la résout.',
              )}
            </p>
          )}
        </div>
        {editable && (
          <button
            type="button"
            disabled={checking || !orgId}
            onClick={async () => {
              if (checking || !orgId) return;
              setChecking(true);
              setError(false);
              try {
                await verifySiteLocation(orgId, site.id, locale === 'fr' ? 'fr' : 'en');
                await onUpdated();
              } catch {
                setError(true);
              } finally {
                setChecking(false);
              }
            }}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-xs font-bold disabled:opacity-60"
          >
            {checking && <Loader2 className="h-4 w-4 animate-spin" />}
            {checking
              ? t('Checking…', 'Vérification…')
              : result
                ? t('Check again', 'Revérifier')
                : t('Check address and pin', 'Vérifier l’adresse et le repère')}
          </button>
        )}
      </div>
      {checking && (
        <p role="status" className="mt-2 text-xs text-muted">
          {t(
            'Checking the saved address. Your draft remains saved.',
            'Vérification de l’adresse enregistrée. Votre brouillon est conservé.',
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-error">
          {mismatch
            ? t(
                'The latest check could not finish. The earlier confirmed mismatch remains. Retry when connected or correct the location.',
                'Le dernier contrôle n’a pas pu aboutir. La différence confirmée précédemment reste valable. Réessayez une fois connecté ou corrigez l’emplacement.',
              )
            : t(
                'The check could not finish. No mismatch was confirmed. Retry when connected.',
                'Le contrôle n’a pas pu aboutir. Aucune différence n’a été confirmée. Réessayez une fois connecté.',
              )}
        </p>
      )}
      {result && (
        <details className="mt-2 text-xs text-muted">
          <summary className="cursor-pointer font-semibold">
            {t('Check details', 'Détails du contrôle')}
          </summary>
          <p className="mt-1">{locationVerificationMessage(result, locale)}</p>
          <p>
            {t('Tolerance', 'Tolérance')} : {displayNumber(result.toleranceMeters, locale)} m
            {result.distanceMeters !== null
              ? ` · ${t('Distance', 'Distance')} : ${displayNumber(Math.round(result.distanceMeters), locale)} m`
              : ''}{' '}
            · {t('Checked', 'Contrôlé')} : {displayUtcTimestamp(result.checkedAt, locale)}
          </p>
          <p>
            {t('Policy', 'Règle')} : {result.policyVersion}
            {result.provider ? ` · ${result.provider}` : ''}
          </p>
          {result.lastAttempt && (
            <p className="mt-2">
              {t('Latest attempt', 'Dernière tentative')} :{' '}
              {locationVerificationMessage(
                { ...result.lastAttempt, policyVersion: result.policyVersion },
                locale,
                true,
              )}{' '}
              · {displayUtcTimestamp(result.lastAttempt.checkedAt, locale)}
            </p>
          )}
        </details>
      )}
    </section>
  );
}
