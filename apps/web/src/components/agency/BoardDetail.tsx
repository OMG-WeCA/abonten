'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, ImageOff, Loader2, Plus, X } from 'lucide-react';
import type { SiteGeographicContext } from '@abonten/contracts/enrichment';
import { agencyEvidenceText, agencyEvidenceUnit } from '../../lib/agency-evidence-locale';
import { displayDateOnly, displayNumber, displayUtcTimestamp } from '../../lib/locale-format';
import { apiFetch } from '../../lib/api';
import { assetDisplay, type SiteDetail, type SiteFace } from '../../lib/sites-api';
import { getGeographicContext, sourceWebUrl } from '../../lib/geographic-context';
import type {
  FaceCostEstimate,
  PlanningAvailability,
  PlanningWindow,
} from '../../lib/agency-planning';
import { draftFaceEligibility } from '../../lib/agency-draft';
import { projectPlanningEnrichment } from '../../lib/agency-enrichment';
import { AuthBoardVideo, MediaEvidence } from '../sites/BoardMedia';
import { GeographicContextContent } from '../sites/GeographicContextPanel';
import { prettyFormat, prettyIllumination } from '../sites/sites-ui';

export function BoardDetail({
  site,
  orgId,
  locale,
  faceId,
  onFace,
  estimate,
  selected,
  canPlan,
  window,
  availability,
  onRetryAvailability,
  onAdd,
  onClose,
}: {
  site: SiteDetail;
  orgId: string;
  locale: 'en' | 'fr';
  faceId: string;
  onFace: (id: string) => void;
  estimate: FaceCostEstimate | null;
  selected: boolean;
  canPlan: boolean;
  window: PlanningWindow;
  availability: PlanningAvailability;
  onRetryAvailability: () => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const [context, setContext] = useState<SiteGeographicContext | null>(null);
  const [contextState, setContextState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [contextAttempt, setContextAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setContextState('loading');
    void getGeographicContext(orgId, site.id, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) {
          setContext(value);
          setContextState('ready');
        }
      },
      () => {
        if (!controller.signal.aborted) setContextState('error');
      },
    );
    return () => controller.abort();
  }, [orgId, site.id, contextAttempt]);
  const face = site.faces.find((item) => item.id === faceId);
  const enrichment = projectPlanningEnrichment(site, context);
  const visibility = enrichment.visibility;
  const score = visibility.value;
  const angle = enrichment.structure.viewingAngle.value;
  const eligibility = draftFaceEligibility(site, face, window, availability);
  const availabilityKnown =
    availability.window?.startDate === window.startDate &&
    availability.window.endDate === window.endDate &&
    availability.status !== 'unknown';
  const population = context?.catchments.find((item) => item.radiusMetres === 1000)?.population;
  const people = population?.status !== 'unavailable' ? population?.value?.people : null;
  const observation =
    context?.traffic.status !== 'unavailable' ? context?.traffic.value?.[0] : null;
  const unknown = t('Not recorded', 'Non renseigné');
  const n = (value: number) => displayNumber(value, locale);
  const value = (input: number | null | undefined, suffix: string) =>
    typeof input === 'number' && Number.isFinite(input) ? `${n(input)}${suffix}` : unknown;
  return (
    <section
      className="agency-board agency-panel"
      aria-labelledby="board-heading"
      data-testid="board-detail"
    >
      <header className="agency-panel-heading">
        <div>
          <p className="agency-eyebrow">
            {site.code} · {site.city}
          </p>
          <h2 id="board-heading">{site.name}</h2>
        </div>
        <button
          className="agency-icon-button"
          onClick={onClose}
          aria-label={t('Close board details', 'Fermer les détails')}
        >
          <X size={18} />
        </button>
      </header>
      <div className="agency-board-scroll">
        <BoardPhoto site={site} locale={locale} />
        {site.format === 'digital_led' &&
          site.assets.some(
            (asset) => asset.kind === 'board_video' || asset.mediaType === 'video',
          ) && (
            <div className="px-4 py-3">
              <details className="agency-evidence">
                <summary>
                  {t('See the installed LED board', 'Voir le panneau LED installé')}
                </summary>
                <div className="mt-3 space-y-3">
                  {site.assets
                    .filter((asset) => asset.kind === 'board_video' || asset.mediaType === 'video')
                    .map((asset) => (
                      <div key={asset.id}>
                        <AuthBoardVideo asset={asset} locale={locale} />
                        <MediaEvidence asset={asset} locale={locale} />
                      </div>
                    ))}
                </div>
              </details>
            </div>
          )}
        <div className="agency-board-body">
          <p className="agency-spec-line">
            {prettyFormat(site.format, locale)} ·{' '}
            {face
              ? `${n(face.width)} × ${n(face.height)} ${agencyEvidenceUnit(face.units, locale)}`
              : unknown}{' '}
            · {prettyIllumination(site.illuminationType, locale)}
          </p>
          <label className="agency-field">
            <span>{t('Viewing face', 'Face')}</span>
            <select
              aria-label={t('Bookable face', 'Face réservable')}
              value={faceId}
              onChange={(event) => onFace(event.target.value)}
            >
              {site.faces
                .filter((item) => item.bookable)
                .map((item: SiteFace) => (
                  <option key={item.id} value={item.id}>
                    {item.faceLabel}
                  </option>
                ))}
            </select>
          </label>
          <div className="agency-price">
            <strong>
              {estimate?.status === 'ready'
                ? money(estimate.amount, estimate.currency, locale)
                : t('Quote unavailable', 'Devis indisponible')}
            </strong>
            <span>
              {estimate?.status === 'ready'
                ? `${n(estimate.days)} ${t('days · media estimate', 'jours · estimation média')}`
                : estimate?.reason && agencyEvidenceText(estimate.reason, locale)}
            </span>
          </div>
          {estimate?.status === 'ready' && (
            <p
              className={`agency-availability ${estimate.availability === 'available' ? 'text-success' : 'text-warning'}`}
            >
              <span className="agency-status-dot" />
              {estimate.availability === 'available'
                ? t(
                    'Available at last check · no reservation',
                    'Disponible au dernier contrôle · sans réservation',
                  )
                : t('Availability not confirmed', 'Disponibilité non confirmée')}
            </p>
          )}
          {!availabilityKnown && (
            <p role="status" className="text-warning">
              {t(
                'Availability could not be checked for this flight. Your draft can continue.',
                'La disponibilité n’a pas pu être vérifiée pour ces dates. Le brouillon peut continuer.',
              )}{' '}
              <button className="agency-text-button" onClick={onRetryAvailability}>
                {t('Retry availability check', 'Revérifier la disponibilité')}
              </button>
            </p>
          )}
          {estimate?.status !== 'ready' && (
            <details className="agency-evidence">
              <summary>
                {t(
                  'Published rate records · not a flight quote',
                  'Tarifs publiés · pas un devis de campagne',
                )}
              </summary>
              {site.rateCards
                .filter((card) => !card.faceId || card.faceId === faceId)
                .map((card) => (
                  <div className="agency-source" key={card.id}>
                    <strong>
                      {card.faceId
                        ? t('Face rate', 'Tarif de face')
                        : t('Site default', 'Tarif du site')}{' '}
                      · {card.currency}
                    </strong>
                    {(['perDay', 'perWeek', 'perMonth'] as const)
                      .flatMap((basis) => {
                        const amount = card.rates[basis];
                        return typeof amount === 'number' && Number.isFinite(amount) && amount > 0
                          ? [[basis, amount] as const]
                          : [];
                      })
                      .map(([basis, amount]) => (
                        <p key={basis}>
                          {n(amount!)} {card.currency} /{' '}
                          {basis === 'perDay'
                            ? t('day', 'jour')
                            : basis === 'perWeek'
                              ? t('week', 'semaine')
                              : t('month', 'mois')}
                        </p>
                      ))}
                    <p>
                      {t(
                        'Effective (UTC dates, end inclusive)',
                        'Applicable (dates UTC, fin inclusive)',
                      )}{' '}
                      : {displayDateOnly(card.effectiveFrom, locale)} –{' '}
                      {card.effectiveTo
                        ? displayDateOnly(card.effectiveTo, locale)
                        : t('no recorded end', 'fin non renseignée')}
                    </p>
                    <p>
                      {t('Source rate card', 'Grille tarifaire source')} : {card.id}
                    </p>
                  </div>
                ))}
              <p>
                {t(
                  'These records may not cover the entire flight. No monthly proration, rate combination or currency conversion is inferred.',
                  'Ces tarifs peuvent ne pas couvrir toute la campagne. Aucun prorata mensuel, combinaison de tarifs ou conversion de devises n’est déduit.',
                )}
              </p>
            </details>
          )}
          <dl className="agency-facts">
            <div>
              <dt>{t('Visibility', 'Visibilité')}</dt>
              <dd>
                {score !== null
                  ? `${n(score)} / 100${visibility.status === 'partial' ? ` · ${t('limited evidence', 'preuves limitées')}` : ''}`
                  : t('Unavailable', 'Indisponible')}
              </dd>
            </div>
            <div>
              <dt>{t('Elevation', 'Élévation')}</dt>
              <dd>{value(site.elevation, ' m')}</dd>
            </div>
            <div>
              <dt>{t('Facing', 'Orientation')}</dt>
              <dd>{value(site.orientationDeg, '°')}</dd>
            </div>
            <div>
              <dt>{t('Viewing angle', 'Angle de vue')}</dt>
              <dd>{typeof angle === 'number' ? `${n(angle)}°` : unknown}</dd>
            </div>
          </dl>
          <div className="agency-context-fact">
            <div>
              <span>{t('Observed traffic', 'Trafic observé')}</span>
              <strong>
                {observation?.count != null
                  ? `${n(observation.count)} ${agencyEvidenceUnit(observation.unit, locale)}`
                  : contextState === 'loading'
                    ? t('Loading…', 'Chargement…')
                    : contextState === 'error'
                      ? t('Traffic context not loaded', 'Contexte de trafic non chargé')
                      : t('No observation available', 'Aucune observation disponible')}
              </strong>
            </div>
            {observation && (
              <p>
                {displayUtcTimestamp(observation.observedFrom, locale)} –{' '}
                {displayUtcTimestamp(observation.observedTo, locale)} ·{' '}
                {n(observation.durationMinutes)} min ·{' '}
                {agencyEvidenceUnit(observation.direction, locale)}.{' '}
                {context?.traffic.provenance?.attribution}
              </p>
            )}
          </div>
          <div className="agency-context-fact">
            <div>
              <span>{t('Residential population', 'Population résidentielle')}</span>
              <strong>
                {people != null
                  ? `${n(people)} ${t('within 1 km', 'dans un rayon de 1 km')}`
                  : contextState === 'loading'
                    ? t('Loading…', 'Chargement…')
                    : contextState === 'error'
                      ? t('Population context not loaded', 'Contexte de population non chargé')
                      : t(
                          'No production layer available',
                          'Aucune couche de production disponible',
                        )}
              </strong>
            </div>
            <p>
              {people != null
                ? `${population?.provenance?.referenceYear} · ${population?.provenance?.attribution} · ${population?.status === 'partial' ? t('Partial coverage', 'Couverture partielle') : t('Modelled residents', 'Résidents modélisés')}`
                : t(
                    'Population is geographic context, not audience reach.',
                    'La population est un contexte géographique, pas une audience.',
                  )}
            </p>
          </div>
          <details className="agency-evidence">
            <summary>
              {t('Sources, quality & assumptions', 'Sources, qualité et hypothèses')}
              <ArrowUpRight size={14} />
            </summary>
            <p>
              {t(
                'Specifications are registered inventory values. Missing fields remain unknown.',
                'Les spécifications proviennent de l’inventaire enregistré. Les champs manquants restent inconnus.',
              )}
            </p>
            <div className="agency-source">
              <strong>{t('Visibility evidence', 'Preuves de visibilité')}</strong>
              {visibility.reason && <p>{agencyEvidenceText(visibility.reason, locale)}</p>}
              {visibility.warnings.map((warning) => (
                <p key={warning}>{agencyEvidenceText(warning, locale)}</p>
              ))}
              {visibility.provenance && 'recordId' in visibility.provenance && (
                <p>
                  {visibility.provenance.source || unknown} ·{' '}
                  {visibility.provenance.method
                    ? agencyEvidenceText(visibility.provenance.method, locale)
                    : unknown}{' '}
                  ·{' '}
                  {visibility.provenance.verification
                    ? agencyEvidenceUnit(visibility.provenance.verification, locale)
                    : unknown}{' '}
                  ·{' '}
                  {visibility.freshness.collectedAt
                    ? displayUtcTimestamp(visibility.freshness.collectedAt, locale)
                    : unknown}
                </p>
              )}
              <p>
                {enrichment.structure.viewingAngle.reason &&
                  agencyEvidenceText(enrichment.structure.viewingAngle.reason, locale)}
              </p>
            </div>
            {site.metadata
              .filter((record) => record.dataClass !== 'demo')
              .map((record) => (
                <div className="agency-source" key={record.id}>
                  <strong>
                    {agencyEvidenceUnit(record.dimension, locale)} ·{' '}
                    {record.verification
                      ? agencyEvidenceUnit(record.verification, locale)
                      : t('Unverified', 'Non vérifié')}
                  </strong>
                  <p>
                    {record.source || unknown} ·{' '}
                    {record.method ? agencyEvidenceText(record.method, locale) : unknown} ·{' '}
                    {record.collectedAt ? displayUtcTimestamp(record.collectedAt, locale) : unknown}
                  </p>
                  <p>
                    {t('Confidence', 'Confiance')}:{' '}
                    {record.confidence == null
                      ? unknown
                      : new Intl.NumberFormat(locale, {
                          style: 'percent',
                          maximumFractionDigits: 0,
                        }).format(record.confidence)}
                    .{' '}
                    {record.expiresAt
                      ? `${t('Expires', 'Expiration')}: ${displayUtcTimestamp(record.expiresAt, locale)}`
                      : ''}
                  </p>
                </div>
              ))}
            {estimate?.status === 'ready' && (
              <div className="agency-source">
                <p>{agencyEvidenceText(estimate.provenance, locale)}</p>
                {estimate.availabilityCheckedAt && (
                  <p>
                    {t('Availability checked', 'Disponibilité vérifiée')}:{' '}
                    {displayUtcTimestamp(estimate.availabilityCheckedAt, locale)}.
                  </p>
                )}
                {estimate.assumptions.map((assumption) => (
                  <p key={assumption}>{agencyEvidenceText(assumption, locale)}</p>
                ))}
              </div>
            )}
            {visibility.provenance &&
              'recordId' in visibility.provenance &&
              visibility.provenance.source &&
              sourceWebUrl(visibility.provenance.source) && (
                <a
                  href={sourceWebUrl(visibility.provenance.source)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('Visibility source', 'Source de visibilité')}
                </a>
              )}
            {context && <GeographicContextContent context={context} locale={locale} />}
            {contextState === 'loading' && (
              <p role="status">
                <Loader2 className="animate-spin" size={14} />{' '}
                {t('Loading geographic context', 'Chargement du contexte géographique')}
              </p>
            )}
            {contextState === 'error' && (
              <p role="alert">
                {t(
                  'Geographic context could not be loaded.',
                  'Le contexte géographique n’a pas pu être chargé.',
                )}{' '}
                <button
                  onClick={() => setContextAttempt((attempt) => attempt + 1)}
                  className="agency-text-button"
                >
                  {t('Retry', 'Réessayer')}
                </button>
              </p>
            )}
          </details>
        </div>
      </div>
      <footer className="agency-board-footer">
        {canPlan &&
          eligibility.eligible &&
          !selected &&
          (estimate?.status !== 'ready' || estimate.availability !== 'available') && (
            <p role="status" className="text-warning">
              {t(
                'Draft interest only. Price and availability need confirmation; budget fit is unconfirmed.',
                'Intérêt provisoire uniquement. Tarif et disponibilité à confirmer ; budget non confirmé.',
              )}
            </p>
          )}
        {canPlan && !eligibility.eligible && (
          <p role="status">{agencyEvidenceText(eligibility.reason, locale)}</p>
        )}
        <button
          className="agency-primary-button"
          onClick={onAdd}
          disabled={!canPlan || !eligibility.eligible || selected}
        >
          <Plus size={17} />
          {selected
            ? t('In shortlist', 'Dans la sélection')
            : t('Add face to shortlist', 'Ajouter à la sélection')}
        </button>
      </footer>
    </section>
  );
}

function BoardPhoto({ site, locale }: { site: SiteDetail; locale: 'en' | 'fr' }) {
  // The seeded Picsum assets are unrelated placeholder photographs, not board evidence.
  const placeholder = (ref: string) => /^https?:\/\/(?:www\.)?picsum\.photos(?:\/|$)/i.test(ref);
  const asset = site.assets.find((item) => item.kind === 'front' && !placeholder(item.storageRef));
  const excludedPlaceholder = site.assets.some(
    (item) => item.kind === 'front' && placeholder(item.storageRef),
  );
  const display = asset ? assetDisplay(asset) : { plain: null, authUrl: null };
  const [src, setSrc] = useState<string | null>(display.plain);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!asset || !display.authUrl) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    // apiFetch supplies the current token, refreshes expiry, and keeps asset access scoped.
    const path = `/api/inventory/sites/${encodeURIComponent(site.id)}/assets/${encodeURIComponent(asset.id)}/file`;
    void apiFetch(path, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Photo unavailable');
        const blob = await response.blob();
        if (!controller.signal.aborted) {
          objectUrl = URL.createObjectURL(blob);
          setSrc(objectUrl);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset, display.authUrl, site.id]);
  return (
    <figure className="agency-board-photo">
      {src && !failed ? (
        <img
          src={src}
          alt={`${site.name} · ${locale === 'fr' ? 'photo de référence' : 'reference photo'}`}
          onError={() => setFailed(true)}
        />
      ) : (
        <div>
          <ImageOff size={25} />
          <span>{locale === 'fr' ? 'Photo indisponible' : 'Board photo unavailable'}</span>
          {excludedPlaceholder && (
            <small>
              {locale === 'fr' ? 'Image de démonstration exclue' : 'Placeholder image excluded'}
            </small>
          )}
        </div>
      )}
      {src && !failed && (
        <figcaption>
          {locale === 'fr' ? 'Photo de référence' : 'Reference photo'} ·{' '}
          {asset?.capturedAt
            ? displayDateOnly(asset.metadata?.time?.declaredDate || asset.capturedAt, locale)
            : locale === 'fr'
              ? 'date inconnue'
              : 'capture date unknown'}
        </figcaption>
      )}
    </figure>
  );
}

export function money(amount: number, currency: string, locale: 'en' | 'fr') {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}
