import type { ResearchProvenance } from '../../../../api/src/common/research-inventory';
import { formatMoney } from '../../lib/number-format';
import { displayUtcTimestamp } from '../../lib/locale-format';
import { researchAskingPrice, researchSourceUrl } from '../../lib/research-reference';

export function ResearchBadge({ locale }: { locale: 'en' | 'fr' }) {
  return (
    <span className="agency-data-badge">{locale === 'fr' ? 'SOURCE PUBLIQUE' : 'RESEARCH'}</span>
  );
}

/** Keep essential price/availability qualifications beside the action, with sources on demand. */
export function ResearchReferenceFacts({
  provenance,
  locale,
  showPrice = true,
}: {
  provenance?: ResearchProvenance | null;
  locale: 'en' | 'fr';
  showPrice?: boolean;
}) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const price = researchAskingPrice(provenance, locale);
  const siteUrl = researchSourceUrl(provenance?.siteSourceUrl);
  const priceUrl = researchSourceUrl(provenance?.askingPrice?.sourceUrl);
  return (
    <div className="agency-source">
      {showPrice && (
        <>
          <strong>{price ?? t('Asking price unknown', 'Tarif public inconnu')}</strong>
          <p>
            {t(
              'Advertised rate · flight quote unconfirmed',
              'Tarif public · devis de campagne non confirmé',
            )}
          </p>
        </>
      )}
      <p>
        {t(
          'Availability and digital slots unconfirmed · no booking',
          'Disponibilité et créneaux numériques non confirmés · sans réservation',
        )}
      </p>
      <details className="agency-evidence">
        <summary>{t('Public sources', 'Sources publiques')}</summary>
        <p>
          {t('Agency-curated reference', 'Référence documentée par l’agence')} ·{' '}
          {provenance?.operatorName ?? t('Operator unknown', 'Opérateur inconnu')}
        </p>
        {siteUrl && (
          <p>
            <a href={siteUrl} target="_blank" rel="noreferrer">
              {provenance?.publisher || t('Listing source', 'Source du site')}
            </a>
          </p>
        )}
        {provenance?.accessedAt && (
          <p>
            {t('Retrieved', 'Consulté')} {displayUtcTimestamp(provenance.accessedAt, locale)}
          </p>
        )}
        {priceUrl && (
          <p>
            <a href={priceUrl} target="_blank" rel="noreferrer">
              {t('Price source', 'Source tarifaire')}
            </a>
            {provenance?.askingPrice?.accessedAt && (
              <> · {displayUtcTimestamp(provenance.askingPrice.accessedAt, locale)}</>
            )}
          </p>
        )}
        <p>
          {t(
            'Operator-published location · not field verified',
            'Position publiée par l’opérateur · non vérifiée sur place',
          )}
        </p>
        <p>
          {t(
            'Tax, fees, production and audience unknown. No monthly proration.',
            'Taxes, frais, production et audience inconnus. Aucun prorata mensuel.',
          )}
        </p>
      </details>
    </div>
  );
}

export function ResearchPriceBaseline({
  baseline,
  locale,
  currency,
}: {
  baseline: ReturnType<typeof import('../../lib/agency-planning').summarizeResearchPrices>;
  locale: 'en' | 'fr';
  currency: string;
}) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  if (!baseline.referenceCount) return null;
  return (
    <div className="agency-source" data-testid="research-price-baseline">
      <strong>{t('Advertised monthly media subtotal', 'Sous-total média mensuel publié')}</strong>
      {Object.entries(baseline.totals).map(([code, amount]) => (
        <p key={code}>
          {formatMoney(amount, code, locale)} / {t('month', 'mois')}
        </p>
      ))}
      {!baseline.pricedCount && <p>{t('Asking prices unknown', 'Tarifs publics inconnus')}</p>}
      <p>
        {t(
          'Preliminary · flight quote and budget fit unconfirmed',
          'Provisoire · devis et budget de campagne non confirmés',
        )}
      </p>
      {!baseline.windowComparable && (
        <p>
          {t(
            'Monthly rates cannot be prorated to these dates.',
            'Ces tarifs mensuels ne peuvent pas être calculés au prorata pour ces dates.',
          )}
        </p>
      )}
      {baseline.unquotedReserve !== null && (
        <p>
          {formatMoney(baseline.unquotedReserve, currency, locale)}{' '}
          {t('unquoted reserve', 'réserve sans devis')}
        </p>
      )}
      {baseline.unpricedCount > 0 && (
        <p>
          {baseline.unpricedCount} {t('reference prices unknown', 'tarifs de référence inconnus')}
        </p>
      )}
      <details className="agency-evidence">
        <summary>{t('Price sources', 'Sources tarifaires')}</summary>
        {baseline.sources.map((source) => {
          const url = researchSourceUrl(source.sourceUrl);
          return url ? (
            <p key={source.siteId}>
              <a href={url} target="_blank" rel="noreferrer">
                {formatMoney(source.amount, source.currency, locale)} / {t('month', 'mois')}
              </a>{' '}
              · {displayUtcTimestamp(source.accessedAt, locale)}
            </p>
          ) : null;
        })}
        <p>
          {t(
            'Tax, fees, production, availability and digital slots remain unknown.',
            'Taxes, frais, production, disponibilité et créneaux numériques restent inconnus.',
          )}
        </p>
      </details>
    </div>
  );
}
