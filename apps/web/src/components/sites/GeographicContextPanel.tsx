'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import type { ContextMetric, SiteGeographicContext } from '@abonten/contracts/enrichment';
import {
  availableContextValue,
  beginGeographicContextLoad,
  sourceWebUrl,
  type GeographicContextState,
} from '../../lib/geographic-context';
import { getGeographicContextCopy } from '../../lib/geographic-context-locale';
import type { SiteLocale } from '../../lib/sites-locale';
import { SectionCard } from './sites-ui';

type Copy = ReturnType<typeof getGeographicContextCopy>;
type Locale = SiteLocale | undefined;

export function GeographicContextPanel({ orgId, siteId, revision, locale }: {
  orgId: string | undefined;
  siteId: string;
  revision: string;
  locale: Locale;
}) {
  const copy = getGeographicContextCopy(locale);
  return (
    <SectionCard
      title={copy.title}
      className="lg:col-span-2"
      action={<span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-bold text-warning">{copy.alpha}</span>}
    >
      <p className="max-w-4xl text-sm leading-6 text-foreground">{copy.intro}</p>
      <p className="mt-2 max-w-4xl text-xs leading-5 text-muted">{copy.alphaHint}</p>
      {/* Remount before paint when the site, organization or saved coordinates change. */}
      <GeographicContextRequest key={`${orgId}:${siteId}:${revision}`} orgId={orgId} siteId={siteId} locale={locale} />
    </SectionCard>
  );
}

function GeographicContextRequest({ orgId, siteId, locale }: {
  orgId: string | undefined;
  siteId: string;
  locale: Locale;
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
    return <p role="status" className="mt-6 flex items-center gap-2 text-sm text-muted"><Loader2 aria-hidden className="h-4 w-4 animate-spin" />{copy.loading}</p>;
  }
  if (state.status === 'error') {
    return (
      <div className="mt-5 rounded-lg border border-error/30 bg-error/10 p-4">
        <p role="alert" className="text-sm text-error">{state.inaccessible ? copy.inaccessible : copy.error}</p>
        <button type="button" onClick={() => { setState({ status: 'loading' }); setAttempt((value) => value + 1); }} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 text-sm font-semibold text-foreground transition hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <RefreshCw aria-hidden className="h-4 w-4" />{copy.retry}
        </button>
      </div>
    );
  }
  return <GeographicContextContent context={state.context} locale={locale} />;
}

/** Kept separate from transport so the evidence and empty states are render-testable. */
export function GeographicContextContent({ context, locale }: { context: SiteGeographicContext; locale: Locale }) {
  const copy = getGeographicContextCopy(locale);
  if (context.dataClass !== 'production') return <p role="alert" className="mt-5 text-sm text-error">{copy.error}</p>;
  const road = availableContextValue(context.nearestRoad);
  const traffic = context.traffic.provenance?.quality === 'observed' ? availableContextValue(context.traffic) : null;
  const number = (value: number) => formatNumber(value, locale);
  return (
    <div className="mt-5 space-y-5">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <p><span className="text-muted">{copy.country}: </span><strong>{countryName(context.countryCode, locale) ?? copy.unavailable}</strong></p>
        <p className="text-muted">{copy.generated}: {formatDate(context.generatedAt, locale)}</p>
      </div>
      {!context.supported && <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">{copy.unsupported}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <h3 className="text-sm font-bold">{copy.administrative}</h3>
          <div className="mt-3 space-y-4">
            {[0, 1].map((index) => {
              const metric = context.administrative[index];
              const areas = availableContextValue(metric);
              return <div key={index}>
                <h4 className="text-xs font-semibold text-muted">{index === 0 ? copy.admin1 : copy.admin2}</h4>
                <p className="mt-1 text-sm font-medium">{areas?.length ? areas.map((area) => area.name).join(', ') : copy.unavailable}</p>
                <MetricEvidence metric={metric} copy={copy} locale={locale} />
              </div>;
            })}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <h3 className="text-sm font-bold">{copy.nearestRoad}</h3>
          {road ? <>
            <p className="mt-3 text-lg font-bold">{road.name || copy.unnamedRoad}</p>
            <dl className="mt-2 space-y-1 text-sm">
              <DataRow label={copy.distance}>{number(road.distanceMetres)} m</DataRow>
              <DataRow label={copy.roadClass}>{road.roadClass}</DataRow>
            </dl>
          </> : <p className="mt-3 text-sm text-muted">{copy.unavailable}</p>}
          <MetricEvidence metric={context.nearestRoad} copy={copy} locale={locale} />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold">{copy.catchments}</h3>
        <p className="mt-1 text-xs leading-5 text-muted">{copy.catchmentHint}</p>
        <div className="mt-3 grid gap-4 xl:grid-cols-3">
          {([250, 500, 1000] as const).map((radius) => {
            const catchment = context.catchments.find((item) => item.radiusMetres === radius);
            const pois = availableContextValue(catchment?.pois);
            const population = availableContextValue(catchment?.population);
            // Coverage can still be known when every raster cell is NoData.
            const coverage = catchment?.population.value;
            return <section key={radius} className="min-w-0 rounded-lg border border-border bg-surface-2 p-4">
              <h4 className="border-b border-border pb-3 text-base font-bold">{copy.radius} · {number(radius)} m</h4>
              <div className="mt-4">
                <h5 className="text-sm font-semibold">{copy.pois}</h5>
                <p className="mt-1 text-2xl font-bold tabular-nums">{pois ? number(pois.mappedCount) : <span className="text-sm font-medium text-muted">{copy.unavailable}</span>}</p>
                {pois?.mappedCount === 0 && <p className="mt-1 text-xs text-muted">{copy.noPois}</p>}
                {pois && Object.keys(pois.byCategory).length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(pois.byCategory).map(([category, count]) => <li key={category} className="rounded bg-muted/10 px-2 py-1 text-xs">{category}: {number(count)}</li>)}
                </ul>}
                <p className="mt-2 text-xs leading-5 text-muted">{copy.poiCaution}</p>
                {Boolean(pois?.nearest.length) && <details className="mt-2 text-xs">
                  <summary className="min-h-8 cursor-pointer py-1.5 font-semibold text-foreground">{copy.nearestPois}</summary>
                  <ul className="space-y-2 py-1">
                    {pois!.nearest.map((poi) => <li key={poi.sourceId} className="flex justify-between gap-3"><span>{poi.name || copy.unnamedPoi}<span className="block text-muted">{poi.category}</span></span><span className="shrink-0 tabular-nums text-muted">{number(poi.distanceMetres)} m</span></li>)}
                  </ul>
                </details>}
                <MetricEvidence metric={catchment?.pois} copy={copy} locale={locale} />
              </div>
              <div className="mt-5 border-t border-border pt-4">
                <h5 className="text-sm font-semibold">{copy.population}</h5>
                <p className="mt-1 text-2xl font-bold tabular-nums">{population?.people != null ? <>{number(population.people)} <span className="text-xs font-medium text-muted">{copy.people}</span></> : <span className="text-sm font-medium text-muted">{copy.unavailable}</span>}</p>
                {catchment?.population.status === 'partial' && <p className="mt-2 text-xs font-semibold text-warning">{copy.partialPopulation}</p>}
                {coverage && <dl className="mt-2 space-y-1 text-xs">
                  <DataRow label={copy.validCoverage}>{formatPercent(coverage.validCoverageFraction, locale)}</DataRow>
                  <DataRow label={copy.rasterCoverage}>{formatPercent(coverage.rasterCoverageFraction, locale)}</DataRow>
                </dl>}
                <p className="mt-2 text-xs leading-5 text-muted">{copy.populationCaution}</p>
                <MetricEvidence metric={catchment?.population} copy={copy} locale={locale} />
              </div>
            </section>;
          })}
        </div>
      </div>

      <section className="rounded-lg border border-border bg-surface-2 p-4">
        <h3 className="text-sm font-bold">{copy.traffic}</h3>
        {traffic?.length ? <ul className="mt-3 grid gap-3 lg:grid-cols-2">
          {traffic.map((observation) => <li key={observation.sourceId} className="rounded-lg border border-border p-3 text-sm">
            <p className="font-bold">{observation.count == null ? copy.unavailable : `${number(observation.count)} ${copy[observation.unit]}`}</p>
            <dl className="mt-2 space-y-1 text-xs">
              <DataRow label={copy.observation}>{formatDate(observation.observedFrom, locale, true)} – {formatDate(observation.observedTo, locale, true)}</DataRow>
              <DataRow label={copy.duration}>{number(observation.durationMinutes)}</DataRow>
              <DataRow label={copy.direction}>{observation.direction}</DataRow>
              <DataRow label={copy.vehicleClasses}>{observation.vehicleClasses.length ? observation.vehicleClasses.join(', ') : copy.unavailable}</DataRow>
              <DataRow label={copy.distance}>{number(observation.distanceMetres)} m</DataRow>
              <DataRow label={copy.method}>{observation.method}</DataRow>
            </dl>
          </li>)}
        </ul> : <p className="mt-2 text-sm text-muted">{copy.trafficUnavailable}</p>}
        <p className="mt-3 text-xs leading-5 text-muted">{copy.trafficCaution}</p>
        <MetricEvidence metric={context.traffic} copy={copy} locale={locale} />
      </section>
    </div>
  );
}

function DataRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-muted">{label}</dt><dd className="min-w-0 break-words text-foreground">{children}</dd></div>;
}

function MetricEvidence({ metric, copy, locale }: { metric: ContextMetric<unknown> | undefined; copy: Copy; locale: Locale }) {
  const provenance = metric?.provenance;
  const status = metric?.status ?? 'unavailable';
  const warnings = Array.from(new Set([...(metric?.warnings ?? []), ...(provenance?.warnings ?? [])]));
  return <div className="mt-3 space-y-2 text-xs">
    <div className="flex flex-wrap items-center gap-2">
      <span className={`rounded-full px-2 py-0.5 font-semibold ${status === 'partial' ? 'bg-warning/15 text-warning' : status === 'available' ? 'bg-info/10 text-info' : 'bg-muted/10 text-muted'}`}>{copy[status]}</span>
      {provenance && <span className="text-muted">{copy[provenance.quality]} · {copy.year}: {provenance.referenceYear}</span>}
    </div>
    {provenance ? <>
      <p className="break-words leading-5 text-muted">{copy.source}: <SourceLink url={provenance.sourceUrl}>{provenance.sourceKey}</SourceLink> · {copy.licence}: <SourceLink url={provenance.licenceUrl}>{provenance.licence}</SourceLink></p>
      <p className="break-words leading-5 text-muted">{provenance.attribution}</p>
    </> : <p className="text-muted">{copy.noSource}</p>}
    {warnings.length > 0 && <div className="rounded-md bg-warning/10 px-2.5 py-2">
      <p className="font-semibold text-warning">{copy.warnings}</p>
      <ul className="mt-1 list-inside list-disc space-y-1 break-words leading-5 text-muted">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
    </div>}
    {metric && <details>
      <summary className="min-h-8 cursor-pointer py-1.5 font-semibold text-foreground">{copy.provenance}</summary>
      <dl className="space-y-2 py-2">
        <DataRow label={copy.method}>{metric.method}</DataRow>
        {provenance && <>
          <DataRow label={copy.version}>{provenance.version}</DataRow>
          <DataRow label={copy.importId}>{provenance.importId}</DataRow>
          <DataRow label={copy.checksum}><span className="break-all">{provenance.checksum}</span></DataRow>
          <DataRow label={copy.published}>{provenance.publishedAt ? formatDate(provenance.publishedAt, locale) : copy.unavailable}</DataRow>
          <DataRow label={copy.fetched}>{formatDate(provenance.fetchedAt, locale)}</DataRow>
        </>}
      </dl>
    </details>}
  </div>;
}

function SourceLink({ url, children }: { url: string; children: ReactNode }) {
  const href = sourceWebUrl(url);
  return href ? <a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-muted/50 underline-offset-2 hover:text-foreground">{children}</a> : <span>{children}</span>;
}

function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { style: 'percent', maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string, locale: Locale, withTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return getGeographicContextCopy(locale).unavailable;
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle: 'medium', ...(withTime ? { timeStyle: 'short' as const } : {}),
  }).format(date);
}

function countryName(code: string | null, locale: Locale) {
  if (!code) return null;
  try { return new Intl.DisplayNames([locale === 'fr' ? 'fr' : 'en'], { type: 'region' }).of(code); }
  catch { return code; }
}
