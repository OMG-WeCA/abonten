'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronDown, Loader2, MapPin, RefreshCw, Route, Store, Users } from 'lucide-react';
import type { ContextMetric, SiteGeographicContext } from '@abonten/contracts/enrichment';
import {
  availableContextValue,
  beginGeographicContextLoad,
  sourceWebUrl,
  type GeographicContextState,
} from '../../lib/geographic-context';
import { agencyEvidenceText, agencyEvidenceUnit } from '../../lib/agency-evidence-locale';
import { displayDateOnly, displayUtcTimestamp } from '../../lib/locale-format';
import { getGeographicContextCopy } from '../../lib/geographic-context-locale';
import type { SiteLocale } from '../../lib/sites-locale';
import { SectionCard } from './sites-ui';

type Copy = ReturnType<typeof getGeographicContextCopy>;
type Locale = SiteLocale | undefined;

export function GeographicContextPanel({
  orgId,
  siteId,
  revision,
  locale,
  onViewMap,
}: {
  orgId: string | undefined;
  siteId: string;
  revision: string;
  locale: Locale;
  onViewMap?: () => void;
}) {
  const copy = getGeographicContextCopy(locale);
  return (
    <SectionCard
      title={copy.title}
      className="lg:col-span-2"
      action={
        <span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-bold text-warning">
          {copy.alpha}
        </span>
      }
    >
      <p className="text-sm text-muted">{copy.intro}</p>
      {/* Remount before paint when the site, organization or saved coordinates change. */}
      <GeographicContextRequest
        key={`${orgId}:${siteId}:${revision}`}
        orgId={orgId}
        siteId={siteId}
        locale={locale}
        onViewMap={onViewMap}
      />
    </SectionCard>
  );
}

function GeographicContextRequest({
  orgId,
  siteId,
  locale,
  onViewMap,
}: {
  orgId: string | undefined;
  siteId: string;
  locale: Locale;
  onViewMap?: () => void;
}) {
  const copy = getGeographicContextCopy(locale);
  const [state, setState] = useState<GeographicContextState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!orgId || !siteId) {
      setState({ status: 'error', inaccessible: true });
      return;
    }
    return beginGeographicContextLoad(orgId, siteId, setState);
  }, [orgId, siteId, attempt]);

  if (state.status === 'loading') {
    return (
      <p role="status" className="mt-6 flex items-center gap-2 text-sm text-muted">
        <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        {copy.loading}
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="mt-5 rounded-lg border border-error/30 bg-error/10 p-4">
        <p role="alert" className="text-sm text-error">
          {state.inaccessible ? copy.inaccessible : copy.error}
        </p>
        <button
          type="button"
          onClick={() => {
            setState({ status: 'loading' });
            setAttempt((value) => value + 1);
          }}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 text-sm font-semibold text-foreground transition hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <RefreshCw aria-hidden className="h-4 w-4" />
          {copy.retry}
        </button>
      </div>
    );
  }
  return (
    <GeographicContextContent
      key={`${state.context.siteId}:${state.context.generatedAt}`}
      context={state.context}
      locale={locale}
      onViewMap={onViewMap}
    />
  );
}

export type ContextRadius = 250 | 500 | 1000;

/** Selection is local to one site/revision; transport remounts it on navigation. */
export function GeographicContextContent({
  context,
  locale,
  onViewMap,
}: {
  context: SiteGeographicContext;
  locale: Locale;
  onViewMap?: () => void;
}) {
  const [radius, setRadius] = useState<ContextRadius>(500);
  return (
    <GeographicContextSnapshot
      context={context}
      locale={locale}
      radius={radius}
      onRadiusChange={setRadius}
      onViewMap={onViewMap}
    />
  );
}

/** A single selected neighbourhood, with evidence available on demand. */
export function GeographicContextSnapshot({
  context,
  locale,
  radius,
  onRadiusChange,
  onViewMap,
}: {
  context: SiteGeographicContext;
  locale: Locale;
  radius: ContextRadius;
  onRadiusChange: (radius: ContextRadius) => void;
  onViewMap?: () => void;
}) {
  const controlId = useId();
  const copy = getGeographicContextCopy(locale);
  if (context.dataClass !== 'production')
    return (
      <p role="alert" className="mt-5 text-sm text-error">
        {copy.error}
      </p>
    );
  const catchment = context.catchments.find((item) => item.radiusMetres === radius);
  const population = availableContextValue(catchment?.population);
  const coverage = catchment?.population.value;
  const pois = availableContextValue(catchment?.pois);
  const road = availableContextValue(context.nearestRoad);
  // An older API can establish the nearest named road only when its absolute nearest is named.
  const namedMetric =
    context.nearestNamedRoad ?? (road?.name?.trim() ? context.nearestRoad : undefined);
  const namedRoad = availableContextValue(namedMetric);
  const named = namedRoad?.name?.trim() ? namedRoad : null;
  const searchHasSource =
    Boolean(namedMetric?.provenance) && context.nearestNamedRoad?.searchCoverage !== 'outside';
  const differentSegment = road && road.sourceId !== named?.sourceId;
  const traffic =
    context.traffic.provenance?.quality === 'observed'
      ? availableContextValue(context.traffic)
      : null;
  const areas = context.administrative
    .slice()
    .reverse()
    .flatMap((metric) => availableContextValue(metric)?.map((area) => area.name) ?? []);
  const location = Array.from(
    new Set([...areas, countryName(context.countryCode, locale)].filter(Boolean)),
  ).join(' · ');
  const categories = Object.entries(pois?.byCategory ?? {}).sort((a, b) => b[1] - a[1]);
  const bars =
    categories.length > 5
      ? [
          ...categories.slice(0, 4),
          ['other', categories.slice(4).reduce((total, item) => total + item[1], 0)] as [
            string,
            number,
          ],
        ]
      : categories;
  const namedPlaces = (pois?.nearest ?? [])
    .filter((poi) => poi.name?.trim())
    .slice()
    .sort((a, b) => a.distanceMetres - b.distanceMetres)
    .slice(0, 3);
  const number = (value: number) => formatNumber(value, locale);
  const whole = (value: number) =>
    new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits: 0 }).format(
      value,
    );
  return (
    <div className="mt-5 space-y-5" data-testid="geographic-snapshot">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <MapPin aria-hidden className="h-4 w-4 shrink-0 text-primary" />
          <span>{location || copy.locationUnknown}</span>
        </p>
        {onViewMap && (
          <button
            type="button"
            onClick={onViewMap}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <MapPin aria-hidden className="h-4 w-4" />
            {copy.viewMap}
          </button>
        )}
      </div>
      {!context.supported && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          {copy.unsupported}
        </p>
      )}
      <fieldset className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <legend className="mb-2 text-xs font-semibold text-muted">{copy.radiusChoice}</legend>
        <div className="inline-flex rounded-xl border border-border bg-surface-2 p-1">
          {([250, 500, 1000] as const).map((value) => (
            <label key={value} className="cursor-pointer">
              <input
                type="radio"
                name={controlId}
                value={value}
                checked={radius === value}
                onChange={() => onRadiusChange(value)}
                className="peer sr-only"
              />
              <span className="inline-flex min-h-11 min-w-20 items-center justify-center rounded-lg px-4 text-sm font-semibold text-muted transition peer-checked:bg-primary peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary">
                {value === 1000 ? '1 km' : `${value} m`}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div
        className="grid gap-3 sm:grid-cols-3"
        aria-live="polite"
        aria-atomic="true"
        data-testid="context-number-cards"
      >
        <section className="min-w-0 rounded-xl border border-border bg-surface-2 p-4">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-muted">
            <Users aria-hidden className="h-4 w-4 text-info" />
            {copy.residentCard}
          </h3>
          <p className="mt-3 text-3xl font-bold tabular-nums" data-testid="context-resident-value">
            {population?.people != null
              ? population.people > 0 && population.people < 1
                ? '<1'
                : whole(population.people)
              : '—'}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted">
            {population?.people != null ? copy.populationLimit : copy.populationMissing}
          </p>
          {catchment?.population.status === 'partial' && (
            <p className="mt-2 text-xs font-semibold leading-5 text-warning">
              {copy.partialShort}
              {coverage
                ? ` · ${formatPercent(coverage.validCoverageFraction, locale)} ${copy.covered}`
                : ''}
            </p>
          )}
        </section>
        <section className="min-w-0 rounded-xl border border-border bg-surface-2 p-4">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-muted">
            <Store aria-hidden className="h-4 w-4 text-info" />
            {copy.placeCard}
          </h3>
          <p className="mt-3 text-3xl font-bold tabular-nums" data-testid="context-place-value">
            {pois ? whole(pois.mappedCount) : '—'}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted">
            {pois
              ? pois.mappedCount === 0
                ? copy.zeroPlaces
                : copy.placesLimit
              : copy.placesMissing}
          </p>
          {catchment?.pois.status === 'partial' && (
            <p className="mt-2 text-xs font-semibold text-warning">{copy.partial}</p>
          )}
        </section>
        <section className="min-w-0 rounded-xl border border-border bg-surface-2 p-4">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-muted">
            <Route aria-hidden className="h-4 w-4 text-info" />
            {copy.roadCard}
          </h3>
          <p
            className="mt-3 break-words text-lg font-bold leading-6"
            data-testid="context-named-road"
          >
            {named ? named.name : searchHasSource ? copy.noNamedRoad : copy.unavailable}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted">
            {named
              ? `${whole(named.distanceMetres)} m ${copy.fromLocation} · ${roadClassLabel(named.roadClass, locale)}${named.ref ? ` · ${copy.routeRef}: ${named.ref}` : ''}`
              : searchHasSource
                ? copy.noNamedRoadHint
                : copy.namedRoadMissing}
          </p>
          {namedMetric &&
            (namedMetric.status === 'partial' ||
              context.nearestNamedRoad?.searchCoverage === 'partial') && (
              <p className="mt-2 text-xs font-semibold text-warning">{copy.partial}</p>
            )}
          {differentSegment && (
            <p
              className="mt-3 border-t border-border pt-2 text-xs leading-5 text-muted"
              data-testid="context-closest-segment"
            >
              {copy.closestSegment}:{' '}
              {road.name ||
                `${copy.unnamedSegment} ${roadClassLabel(road.roadClass, locale).toLocaleLowerCase(locale === 'fr' ? 'fr-FR' : 'en-GB')}`}{' '}
              · {whole(road.distanceMetres)} m{road.ref ? ` · ${copy.routeRef}: ${road.ref}` : ''}
              {context.nearestRoad.status === 'partial' ? ` · ${copy.partial}` : ''}
            </p>
          )}
        </section>
      </div>
      {pois && pois.mappedCount > 0 && (
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold">{copy.placeMix}</h3>
            <ul className="mt-3 space-y-2.5">
              {bars.map(([category, count]) => (
                <li key={category}>
                  <div className="mb-1 flex justify-between gap-3 text-xs">
                    <span>{categoryLabel(category, locale)}</span>
                    <span className="font-semibold tabular-nums">{whole(count)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted/10" aria-hidden>
                    <div
                      className="h-full rounded-full bg-info/70"
                      style={{ width: `${Math.min(100, (count / pois.mappedCount) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold">{copy.namedPlaces}</h3>
            {namedPlaces.length ? (
              <ul className="mt-2 divide-y divide-border">
                {namedPlaces.map((poi) => (
                  <li
                    key={poi.sourceId}
                    className="flex items-start justify-between gap-3 py-2.5 text-sm"
                  >
                    <span className="min-w-0 break-words font-medium">
                      {poi.name}
                      <span className="mt-0.5 block text-xs font-normal text-muted">
                        {categoryLabel(poi.category, locale)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {whole(poi.distanceMetres)} m
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-muted">{copy.noNames}</p>
            )}
          </div>
        </div>
      )}
      <p className="text-xs leading-5 text-muted">
        {copy.radiusLimit} · {traffic?.length ? copy.trafficAvailableShort : copy.noTrafficShort}
      </p>
      <details className="group rounded-xl border border-border" data-testid="context-sources">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
          {copy.viewSources}
          <ChevronDown
            aria-hidden
            className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-180"
          />
        </summary>
        <div className="space-y-5 border-t border-border px-4 py-4">
          <p className="text-xs leading-5 text-muted">
            {copy.alphaHint} {copy.generated}: {formatDate(context.generatedAt, locale, true)}
          </p>
          <div className="grid gap-5 md:grid-cols-2">
            {context.administrative.map((metric, index) => (
              <section key={index}>
                <h3 className="text-sm font-bold">{index === 0 ? copy.admin1 : copy.admin2}</h3>
                <MetricEvidence metric={metric} copy={copy} locale={locale} />
              </section>
            ))}
          </div>
          <section>
            <h3 className="text-sm font-bold">{copy.roadCard}</h3>
            {named && (
              <p className="mt-2 text-xs">
                {named.name} · {number(named.distanceMetres)} m · {named.sourceId}
                {named.ref ? ` · ${copy.routeRef}: ${named.ref}` : ''}
              </p>
            )}
            <MetricEvidence metric={namedMetric} copy={copy} locale={locale} />
          </section>
          <section>
            <h3 className="text-sm font-bold">{copy.nearestRoad}</h3>
            {road && (
              <p className="mt-2 text-xs">
                {road.name || copy.unnamedRoad} · {number(road.distanceMetres)} m · {road.sourceId}
                {road.ref ? ` · ${copy.routeRef}: ${road.ref}` : ''}
              </p>
            )}
            <MetricEvidence metric={context.nearestRoad} copy={copy} locale={locale} />
          </section>
          <section>
            <h3 className="text-sm font-bold">
              {copy.pois} · {radius === 1000 ? '1 km' : `${radius} m`}
            </h3>
            {categories.length > 0 && (
              <p className="mt-2 text-xs">
                {categories
                  .map(
                    ([category, count]) => `${categoryLabel(category, locale)}: ${number(count)}`,
                  )
                  .join(' · ')}
              </p>
            )}
            <p className="mt-2 text-xs leading-5 text-muted">{copy.poiCaution}</p>
            {pois?.nearest.length ? (
              <details className="mt-2 text-xs">
                <summary className="min-h-11 cursor-pointer py-2 font-semibold">
                  {copy.nearestPois}
                </summary>
                <ul className="space-y-2">
                  {pois.nearest.map((poi) => (
                    <li key={poi.sourceId} className="flex justify-between gap-3">
                      <span>
                        {poi.name || copy.unnamedPoi} · {categoryLabel(poi.category, locale)}
                      </span>
                      <span className="shrink-0">{number(poi.distanceMetres)} m</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <MetricEvidence metric={catchment?.pois} copy={copy} locale={locale} />
          </section>
          <section>
            <h3 className="text-sm font-bold">{copy.population}</h3>
            {coverage && (
              <dl className="mt-2 space-y-1 text-xs">
                <DataRow label={copy.residentCard}>
                  {population?.people != null
                    ? `${number(population.people)} ${copy.people}`
                    : copy.unavailable}
                </DataRow>
                <DataRow label={copy.validCoverage}>
                  {formatPercent(coverage.validCoverageFraction, locale)}
                </DataRow>
                <DataRow label={copy.rasterCoverage}>
                  {formatPercent(coverage.rasterCoverageFraction, locale)}
                </DataRow>
              </dl>
            )}
            <p className="mt-2 text-xs leading-5 text-muted">{copy.populationCaution}</p>
            {catchment?.population.status === 'partial' && (
              <p className="mt-2 text-xs text-warning">{copy.partialPopulation}</p>
            )}
            <MetricEvidence metric={catchment?.population} copy={copy} locale={locale} />
          </section>
          <section>
            <h3 className="text-sm font-bold">{copy.traffic}</h3>
            {traffic?.length ? (
              <ul className="mt-3 space-y-3">
                {traffic.map((observation) => (
                  <li
                    key={observation.sourceId}
                    className="rounded-lg border border-border p-3 text-sm"
                  >
                    <p className="font-bold">
                      {observation.count == null
                        ? copy.unavailable
                        : `${number(observation.count)} ${copy[observation.unit]}`}
                    </p>
                    <dl className="mt-2 space-y-1 text-xs">
                      <DataRow label={copy.observation}>
                        {formatDate(observation.observedFrom, locale, true)} –{' '}
                        {formatDate(observation.observedTo, locale, true)}
                      </DataRow>
                      <DataRow label={copy.duration}>{number(observation.durationMinutes)}</DataRow>
                      <DataRow label={copy.direction}>
                        {agencyEvidenceUnit(observation.direction, locale === 'fr' ? 'fr' : 'en')}
                      </DataRow>
                      <DataRow label={copy.vehicleClasses}>
                        {observation.vehicleClasses
                          .map((value) => agencyEvidenceUnit(value, locale === 'fr' ? 'fr' : 'en'))
                          .join(', ') || copy.unavailable}
                      </DataRow>
                      <DataRow label={copy.distance}>
                        {number(observation.distanceMetres)} m
                      </DataRow>
                      <DataRow label={copy.method}>
                        {agencyEvidenceText(observation.method, locale === 'fr' ? 'fr' : 'en')}
                      </DataRow>
                    </dl>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted">{copy.trafficUnavailable}</p>
            )}
            <p className="mt-2 text-xs leading-5 text-muted">{copy.trafficCaution}</p>
            <MetricEvidence metric={context.traffic} copy={copy} locale={locale} />
          </section>
        </div>
      </details>
    </div>
  );
}

function categoryLabel(category: string, locale: Locale): string {
  const labels: Record<string, [string, string]> = {
    food_and_drink: ['Food & drink', 'Restaurants et cafés'],
    healthcare: ['Healthcare', 'Santé'],
    transport: ['Transport', 'Transport'],
    shopping: ['Shops', 'Commerces'],
    bank: ['Banks', 'Banques'],
    education: ['Education', 'Éducation'],
    leisure: ['Leisure', 'Loisirs'],
    tourism: ['Hotels & tourism', 'Hôtels et tourisme'],
    business: ['Businesses', 'Entreprises'],
    nightclub: ['Nightlife', 'Vie nocturne'],
    cinema: ['Cinemas', 'Cinémas'],
    vending_machine: ['Vending machines', 'Distributeurs'],
    ice_cream: ['Ice cream', 'Glaciers'],
    other: ['Other mapped places', 'Autres lieux cartographiés'],
  };
  return labels[category]?.[locale === 'fr' ? 1 : 0] ?? category.replace(/_/g, ' ');
}

function roadClassLabel(roadClass: string, locale: Locale): string {
  const labels: Record<string, [string, string]> = {
    motorway: ['Motorway', 'Autoroute'],
    trunk: ['Main road', 'Route principale'],
    primary: ['Main road', 'Route principale'],
    secondary: ['Connecting road', 'Route de liaison'],
    tertiary: ['Connecting road', 'Route de liaison'],
    motorway_link: ['Interchange link', 'Bretelle'],
    trunk_link: ['Road link', 'Bretelle'],
    primary_link: ['Road link', 'Bretelle'],
    secondary_link: ['Road link', 'Bretelle'],
    tertiary_link: ['Road link', 'Bretelle'],
    residential: ['Residential street', 'Rue résidentielle'],
    service: ['Service road', 'Voie de service'],
    unclassified: ['Local road', 'Route locale'],
  };
  return labels[roadClass]?.[locale === 'fr' ? 1 : 0] ?? roadClass.replace(/_/g, ' ');
}

function DataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

function MetricEvidence({
  metric,
  copy,
  locale,
}: {
  metric: ContextMetric<unknown> | undefined;
  copy: Copy;
  locale: Locale;
}) {
  const provenance = metric?.provenance;
  const status = metric?.status ?? 'unavailable';
  const warnings = Array.from(
    new Set([...(metric?.warnings ?? []), ...(provenance?.warnings ?? [])]),
  );
  return (
    <div className="mt-3 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 font-semibold ${status === 'partial' ? 'bg-warning/15 text-warning' : status === 'available' ? 'bg-info/10 text-info' : 'bg-muted/10 text-muted'}`}
        >
          {copy[status]}
        </span>
        {provenance && (
          <span className="text-muted">
            {copy[provenance.quality]} · {copy.year}: {provenance.referenceYear}
          </span>
        )}
      </div>
      {provenance ? (
        <>
          <p className="break-words leading-5 text-muted">
            {copy.source}:{' '}
            <SourceLink url={provenance.sourceUrl}>{provenance.sourceKey}</SourceLink> ·{' '}
            {copy.licence}:{' '}
            <SourceLink url={provenance.licenceUrl}>{provenance.licence}</SourceLink>
          </p>
          <p className="break-words leading-5 text-muted">{provenance.attribution}</p>
        </>
      ) : (
        <p className="text-muted">{copy.noSource}</p>
      )}
      {warnings.length > 0 && (
        <div className="rounded-md bg-warning/10 px-2.5 py-2">
          <p className="font-semibold text-warning">{copy.warnings}</p>
          <ul className="mt-1 list-inside list-disc space-y-1 break-words leading-5 text-muted">
            {warnings.map((warning) => (
              <li key={warning}>{agencyEvidenceText(warning, locale === 'fr' ? 'fr' : 'en')}</li>
            ))}
          </ul>
        </div>
      )}
      {metric && (
        <details>
          <summary className="min-h-8 cursor-pointer py-1.5 font-semibold text-foreground">
            {copy.provenance}
          </summary>
          <dl className="space-y-2 py-2">
            <DataRow label={copy.method}>
              {agencyEvidenceText(metric.method, locale === 'fr' ? 'fr' : 'en')}
            </DataRow>
            {provenance && (
              <>
                <DataRow label={copy.version}>{provenance.version}</DataRow>
                <DataRow label={copy.importId}>{provenance.importId}</DataRow>
                <DataRow label={copy.checksum}>
                  <span className="break-all">{provenance.checksum}</span>
                </DataRow>
                <DataRow label={copy.published}>
                  {provenance.publishedAt
                    ? formatDate(provenance.publishedAt, locale, true)
                    : copy.unavailable}
                </DataRow>
                <DataRow label={copy.fetched}>
                  {formatDate(provenance.fetchedAt, locale, true)}
                </DataRow>
              </>
            )}
          </dl>
        </details>
      )}
    </div>
  );
}

function SourceLink({ url, children }: { url: string; children: ReactNode }) {
  const href = sourceWebUrl(url);
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-muted/50 underline-offset-2 hover:text-foreground"
    >
      {children}
    </a>
  ) : (
    <span>{children}</span>
  );
}

function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPercent(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value: string, locale: Locale, withTime = false) {
  const language = locale === 'fr' ? 'fr' : 'en';
  return withTime ? displayUtcTimestamp(value, language) : displayDateOnly(value, language);
}

function countryName(code: string | null, locale: Locale) {
  if (!code) return null;
  try {
    return new Intl.DisplayNames([locale === 'fr' ? 'fr' : 'en'], { type: 'region' }).of(code);
  } catch {
    return code;
  }
}
