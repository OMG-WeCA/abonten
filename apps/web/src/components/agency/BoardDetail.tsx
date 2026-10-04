'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, ImageOff, Loader2, Plus, X } from 'lucide-react';
import type { SiteGeographicContext } from '@abonten/contracts/enrichment';
import { apiFetch } from '../../lib/api';
import { assetDisplay, type SiteDetail, type SiteFace } from '../../lib/sites-api';
import { getGeographicContext, sourceWebUrl } from '../../lib/geographic-context';
import type { FaceCostEstimate } from '../../lib/agency-planning';
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
  const visibility = site.metadata
    .filter((record) => record.dataClass !== 'demo' && record.dimension === 'visibility')
    .sort((a, b) => (b.collectedAt ?? '').localeCompare(a.collectedAt ?? ''))[0];
  const score = visibility?.payload.score;
  const validScore =
    typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100;
  const stale = visibility?.expiresAt && Date.parse(visibility.expiresAt) < Date.now();
  const angle = site.metadata
    .filter((record) => record.dataClass !== 'demo' && record.dimension === 'structure')
    .map((record) => record.payload.viewingAngle)
    .find((value) => typeof value === 'number' && Number.isFinite(value));
  const population = context?.catchments.find((item) => item.radiusMetres === 1000)?.population;
  const people = population?.status !== 'unavailable' ? population?.value?.people : null;
  const observation =
    context?.traffic.status !== 'unavailable' ? context?.traffic.value?.[0] : null;
  const unknown = t('Not recorded', 'Non renseigné');
  const n = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
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
        <div className="agency-board-body">
          <p className="agency-spec-line">
            {prettyFormat(site.format, locale)} ·{' '}
            {face ? `${face.width} × ${face.height} ${face.units}` : unknown} ·{' '}
            {prettyIllumination(site.illuminationType, locale)}
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
                ? `${estimate.days} ${t('days · media estimate', 'jours · estimation média')}`
                : estimate?.reason}
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
                : t('Availability check pending', 'Disponibilité en cours de contrôle')}
            </p>
          )}
          <dl className="agency-facts">
            <div>
              <dt>{t('Visibility', 'Visibilité')}</dt>
              <dd>
                {validScore
                  ? `${n(score)} / 100${stale ? ` · ${t('expired', 'expiré')}` : ''}`
                  : unknown}
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
                  ? `${n(observation.count)} ${observation.unit}`
                  : contextState === 'loading'
                    ? t('Loading…', 'Chargement…')
                    : t('No observation available', 'Aucune observation disponible')}
              </strong>
            </div>
            {observation && (
              <p>
                {observation.observedFrom} – {observation.observedTo} ·{' '}
                {n(observation.durationMinutes)} min · {observation.direction}.{' '}
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
                    : t('No production layer available', 'Aucune couche de production disponible')}
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
            {site.metadata
              .filter((record) => record.dataClass !== 'demo')
              .map((record) => (
                <div className="agency-source" key={record.id}>
                  <strong>
                    {record.dimension} · {record.verification || t('Unverified', 'Non vérifié')}
                  </strong>
                  <p>
                    {record.source || unknown} · {record.method || unknown} ·{' '}
                    {record.collectedAt?.slice(0, 10) || unknown}
                  </p>
                  <p>
                    {t('Confidence', 'Confiance')}:{' '}
                    {record.confidence == null
                      ? unknown
                      : `${Math.round(record.confidence * 100)}%`}
                    .{' '}
                    {record.expiresAt
                      ? `${t('Expires', 'Expiration')}: ${record.expiresAt.slice(0, 10)}`
                      : ''}
                  </p>
                </div>
              ))}
            {estimate?.status === 'ready' && (
              <div className="agency-source">
                <p>{estimate.provenance}</p>
                {estimate.availabilityCheckedAt && (
                  <p>
                    {t('Availability checked', 'Disponibilité vérifiée')}:{' '}
                    {new Date(estimate.availabilityCheckedAt).toLocaleString(locale, {
                      timeZone: 'UTC',
                    })}{' '}
                    UTC.
                  </p>
                )}
                {estimate.assumptions.map((assumption) => (
                  <p key={assumption}>{assumption}</p>
                ))}
              </div>
            )}
            {visibility?.source && sourceWebUrl(visibility.source) && (
              <a href={sourceWebUrl(visibility.source)} target="_blank" rel="noreferrer">
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
        <button
          className="agency-primary-button"
          onClick={onAdd}
          disabled={
            !canPlan ||
            estimate?.status !== 'ready' ||
            estimate.availability !== 'available' ||
            selected
          }
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
          {asset?.capturedAt?.slice(0, 10) ||
            (locale === 'fr' ? 'date inconnue' : 'capture date unknown')}
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
