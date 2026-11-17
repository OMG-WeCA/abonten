'use client';

import type { ReactNode } from 'react';
import { ArrowRight, Layers, ListChecks, Minus, Plus, X } from 'lucide-react';
import { prettyFormat } from '../sites/sites-ui';
import { marketLabel } from '../../lib/markets';
import { displayUiText } from '../../lib/display-ui-text';
import { formatMoney } from '../../lib/number-format';
import { displayNumber, displayUtcTimestamp } from '../../lib/locale-format';
import type { AgencyMarketplaceSite } from '../../lib/agency-api';
import type { AgencyDraftFace } from '../../lib/agency-draft';
import type { FaceCostEstimate, PlanningAvailability } from '../../lib/agency-planning';
import type { SiteDetail, SiteFace } from '../../lib/sites-api';

export type JourneyLocale = 'en' | 'fr';
export type Translate = (en: string, fr: string) => string;
export interface JourneyFaceFacts {
  ref: AgencyDraftFace;
  site?: SiteDetail;
  face?: SiteFace;
  estimate?: FaceCostEstimate;
  availability: PlanningAvailability;
  error: boolean;
  availabilityFailed: boolean;
}

export function JourneyPanel({
  title,
  children,
  onClose,
  placement,
  icon,
  footer,
  label,
  t,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  placement: 'left' | 'right' | 'review';
  icon?: ReactNode;
  footer?: ReactNode;
  label?: string;
  t: Translate;
}) {
  return (
    <section
      className={`journey-panel journey-panel--${placement}`}
      aria-label={label ?? title}
      data-map-panel={placement}
    >
      <header className="journey-panel-head">
        <h2 tabIndex={placement === 'review' ? -1 : undefined}>
          {icon}
          {title}
        </h2>
        <button
          type="button"
          className="journey-icon"
          aria-label={t('Close panel', 'Fermer le panneau')}
          onClick={onClose}
        >
          {placement === 'right' ? <Minus size={18} /> : <X size={18} />}
        </button>
      </header>
      <div className="journey-panel-body">{children}</div>
      {footer && <footer className="journey-panel-foot">{footer}</footer>}
    </section>
  );
}

export function BoardInventory({
  boards,
  locale,
  status,
  page,
  pages,
  onPage,
  onSelect,
  onRetry,
  t,
}: {
  boards: AgencyMarketplaceSite[];
  locale: JourneyLocale;
  status: 'ready' | 'loading' | 'error';
  page: number;
  pages: number;
  onPage: (page: number) => void;
  onSelect: (id: string) => void;
  onRetry: () => void;
  t: Translate;
}) {
  if (status === 'loading')
    return (
      <p role="status" className="journey-muted">
        {t('Loading boards…', 'Chargement des panneaux…')}
      </p>
    );
  if (status === 'error')
    return (
      <div role="alert" className="journey-empty">
        <p>{t('Boards could not be loaded.', 'Impossible de charger les panneaux.')}</p>
        <button type="button" className="journey-button" onClick={onRetry}>
          {t('Try again', 'Réessayer')}
        </button>
      </div>
    );
  if (!boards.length)
    return (
      <p className="journey-muted">
        {t(
          'No listed boards match this search. Try another market or change the filters.',
          'Aucun panneau publié ne correspond à cette recherche. Changez de marché ou de filtres.',
        )}
      </p>
    );
  return (
    <>
      <ul className="journey-board-list">
        {boards.map((board) => (
          <li key={board.id}>
            <button type="button" onClick={() => onSelect(board.id)}>
              <Layers size={16} aria-hidden="true" />
              <span>
                <strong>{board.name}</strong>
                <small>
                  {[
                    board.city || marketLabel(board.country, locale),
                    `${board.faceCount} ${Number(board.faceCount) === 1 ? 'face' : 'faces'}`,
                    board.isDemo
                      ? t('Demo', 'Démo')
                      : board.isResearchReference
                        ? t('Research', 'Recherche')
                        : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </span>
              <ArrowRight className="journey-list-arrow" size={15} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div
          className="journey-page-controls"
          aria-label={t('Inventory pages', 'Pages de l’inventaire')}
        >
          <button
            className="journey-button"
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
          >
            {t('Previous', 'Précédent')}
          </button>
          <span>
            {page} / {pages}
          </span>
          <button
            className="journey-button"
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={page >= pages}
          >
            {t('Next', 'Suivant')}
          </button>
        </div>
      )}
    </>
  );
}

export function RateFacts({
  estimate,
  availability,
  onRetry,
  site,
  locale,
  t,
}: {
  estimate?: FaceCostEstimate;
  availability: PlanningAvailability;
  onRetry?: () => void;
  site: SiteDetail;
  locale: JourneyLocale;
  t: Translate;
}) {
  const demo = site.isDemo === true;
  return (
    <div className="journey-rate-facts">
      <strong>{t('Price and availability', 'Prix et disponibilité')}</strong>
      <p className="journey-muted">
        {estimate?.status === 'ready' ? (
          <>
            {formatMoney(estimate.amount, estimate.currency, locale)} ·{' '}
            {demo
              ? t('Sample flight cost', 'Exemple de coût de campagne')
              : t('Published flight estimate', 'Estimation publiée pour la campagne')}
          </>
        ) : estimate?.status === 'unavailable' ? (
          displayUiText(estimate.reason, locale)
        ) : (
          t('Choose a viewing face.', 'Choisissez une face.')
        )}
      </p>
      {estimate?.status === 'ready' && (
        <p className="journey-muted">
          {formatMoney(estimate.unitRate, estimate.currency, locale)}{' '}
          {estimate.basis === 'perDay' ? t('per day', 'par jour') : t('per week', 'par semaine')} ×{' '}
          {displayNumber(estimate.quantity, locale)}
        </p>
      )}
      <p className="journey-muted">
        {demo
          ? t(
              'Demo inventory · sample availability',
              'Inventaire de démonstration · disponibilité indicative',
            )
          : availability.status === 'available'
            ? t(
                'Available for this flight · draft only',
                'Disponible pour cette campagne · brouillon',
              )
            : availability.status === 'unavailable'
              ? t('Unavailable for this flight', 'Indisponible pour cette campagne')
              : t('Availability needs checking.', 'La disponibilité reste à vérifier.')}
        {!demo &&
          availability.checkedAt &&
          ` · ${displayUtcTimestamp(availability.checkedAt, locale)}`}
      </p>
      {onRetry && (
        <button type="button" className="journey-text-button" onClick={onRetry}>
          {t('Retry availability', 'Revérifier la disponibilité')}
        </button>
      )}
    </div>
  );
}

export function SelectedBoard({
  site,
  face,
  status,
  estimate,
  availability,
  selected,
  canAdd,
  addReason,
  onFace,
  onToggle,
  onRetry,
  availabilityFailed,
  score,
  priceCurrencies,
  priceCurrency,
  onPriceCurrency,
  locale,
  t,
}: {
  site?: SiteDetail;
  face?: SiteFace;
  status: 'ready' | 'loading' | 'error';
  estimate?: FaceCostEstimate;
  availability: PlanningAvailability;
  selected: boolean;
  canAdd: boolean;
  addReason?: string;
  onFace: (id: string) => void;
  onToggle: () => void;
  onRetry: () => void;
  availabilityFailed: boolean;
  score: ReactNode;
  priceCurrencies: string[];
  priceCurrency: string;
  onPriceCurrency: (value: string) => void;
  locale: JourneyLocale;
  t: Translate;
}) {
  if (status === 'loading')
    return (
      <p role="status" className="journey-muted">
        {t('Loading board details…', 'Chargement du panneau…')}
      </p>
    );
  if (status === 'error' || !site)
    return (
      <div role="alert" className="journey-empty">
        <p>{t('Board details could not be loaded.', 'Impossible de charger le panneau.')}</p>
        <button type="button" className="journey-button" onClick={onRetry}>
          {t('Try again', 'Réessayer')}
        </button>
      </div>
    );
  return (
    <div className="journey-board-detail">
      <div className="journey-site-context">
        <small>{[site.code, site.city].filter(Boolean).join(' · ')}</small>
        {site.isDemo && <span className="journey-badge">{t('Demo', 'Démo')}</span>}
        {site.isResearchReference && (
          <span className="journey-badge">{t('Research reference', 'Référence de recherche')}</span>
        )}
      </div>
      <div className="journey-score-box">{score}</div>
      <p className="journey-muted">
        {prettyFormat(site.format, locale)} · {site.faces.length}{' '}
        {site.faces.length === 1 ? 'face' : 'faces'}
      </p>
      <label className="journey-field">
        <span>{t('Viewing face', 'Face affichée')}</span>
        <select
          value={face?.id ?? ''}
          onChange={(event) => onFace(event.target.value)}
          disabled={!site.faces.length}
        >
          {!site.faces.length && <option value="">{t('No viewing faces', 'Aucune face')}</option>}
          {site.faces.map((item) => (
            <option key={item.id} value={item.id}>
              {item.faceLabel}
            </option>
          ))}
        </select>
      </label>
      {(priceCurrencies.length > 1 ||
        (priceCurrencies.length > 0 && !priceCurrencies.includes(priceCurrency))) && (
        <label className="journey-field">
          <span>{t('Rate currency', 'Devise du tarif')}</span>
          <select value={priceCurrency} onChange={(event) => onPriceCurrency(event.target.value)}>
            {!priceCurrencies.includes(priceCurrency) && (
              <option value={priceCurrency} disabled>
                {t('Choose an available currency', 'Choisissez une devise disponible')}
              </option>
            )}
            {priceCurrencies.map((currency) => (
              <option key={currency}>{currency}</option>
            ))}
          </select>
        </label>
      )}
      <RateFacts
        estimate={estimate}
        availability={availability}
        onRetry={availabilityFailed ? onRetry : undefined}
        site={site}
        locale={locale}
        t={t}
      />
      {!canAdd && !selected && addReason && <p className="journey-muted">{addReason}</p>}
      <button
        type="button"
        className={selected ? 'journey-button journey-wide' : 'journey-primary journey-wide'}
        disabled={!selected && !canAdd}
        onClick={onToggle}
      >
        {selected ? <Minus size={17} /> : <Plus size={17} />}
        {selected
          ? t('Remove face from shortlist', 'Retirer la face de la sélection')
          : t('Add face to shortlist', 'Ajouter la face à la sélection')}
      </button>
    </div>
  );
}

export function ShortlistFaces({
  faces,
  locale,
  t,
  onSelect,
  onRemove,
  onRetry,
}: {
  faces: JourneyFaceFacts[];
  locale: JourneyLocale;
  t: Translate;
  onSelect: (id: string, faceId: string) => void;
  onRemove: (faceId: string) => void;
  onRetry: (id: string) => void;
}) {
  if (!faces.length)
    return (
      <div className="journey-empty">
        <ListChecks size={21} />
        <strong>{t('No faces selected', 'Aucune face sélectionnée')}</strong>
        <p className="journey-muted">
          {t(
            'Open a board on the map or in Boards, then add a face to your shortlist.',
            'Ouvrez un panneau sur la carte ou dans la liste, puis ajoutez une face à votre sélection.',
          )}
        </p>
      </div>
    );
  return (
    <ul className="journey-shortlist-list">
      {faces.map(({ ref, site, face, estimate, availability, error, availabilityFailed }) => (
        <li key={ref.faceId}>
          <div>
            {site && face ? (
              <>
                <button
                  type="button"
                  className="journey-text-button"
                  onClick={() => onSelect(site.id, face.id)}
                >
                  {site.name} · {face.faceLabel}
                </button>
                <p>
                  {[
                    site.city || marketLabel(site.country, locale),
                    prettyFormat(site.format, locale),
                    site.isDemo
                      ? t('Demo', 'Démo')
                      : site.isResearchReference
                        ? t('Research', 'Recherche')
                        : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p>
                  {estimate?.status === 'ready'
                    ? formatMoney(estimate.amount, estimate.currency, locale)
                    : t('Flight price unavailable', 'Prix de campagne indisponible')}{' '}
                  ·{' '}
                  {availability.status === 'available'
                    ? t('Available', 'Disponible')
                    : availability.status === 'unavailable'
                      ? t('Unavailable', 'Indisponible')
                      : t('Availability unknown', 'Disponibilité inconnue')}
                </p>
                {availabilityFailed && (
                  <button
                    type="button"
                    className="journey-text-button"
                    onClick={() => onRetry(ref.siteId)}
                  >
                    {t('Retry availability', 'Revérifier la disponibilité')}
                  </button>
                )}
              </>
            ) : (
              <>
                <strong>
                  {error || site
                    ? t('Saved face unavailable', 'Face enregistrée indisponible')
                    : t('Checking saved face…', 'Vérification de la face…')}
                </strong>
                {error && (
                  <button
                    type="button"
                    className="journey-text-button"
                    onClick={() => onRetry(ref.siteId)}
                  >
                    {t('Retry board', 'Réessayer le panneau')}
                  </button>
                )}
              </>
            )}
          </div>
          <button
            type="button"
            className="journey-icon"
            aria-label={
              face
                ? `${t('Remove', 'Retirer')} ${face.faceLabel}`
                : t('Remove saved face', 'Retirer la face enregistrée')
            }
            onClick={() => onRemove(ref.faceId)}
          >
            <X size={17} />
          </button>
        </li>
      ))}
    </ul>
  );
}
