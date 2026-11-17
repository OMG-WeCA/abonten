'use client';

import type { PlanningModelControls } from '@abonten/contracts/planning-draft';
import type {
  PlanningStudyFace,
  PlanningStudyResult,
  PlanningStudySource,
} from '@abonten/contracts/planning-study';
import { displayNumber } from '../../lib/locale-format';
import { formatMoney } from '../../lib/number-format';
import { audienceLabels } from './audienceLabels';
import type { JourneyStudy } from './usePlanningStudy';

export type JourneyDaypart =
  `${'weekday' | 'weekend'}_${'morning' | 'afternoon' | 'evening' | 'night'}`;
export interface JourneyPoint {
  latitude: number;
  longitude: number;
}
export interface JourneyRoute {
  id: string;
  points: JourneyPoint[];
  weightShare?: number;
}
type Locale = 'en' | 'fr';
const inputStyle =
  'min-h-10 w-full min-w-0 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground';
const periods = [
  ['morning', 'Morning', 'Matin'],
  ['afternoon', 'Afternoon', 'Après-midi'],
  ['evening', 'Evening', 'Soir'],
  ['night', 'Night', 'Nuit'],
] as const;
const number = (value: number, locale: Locale, digits = 1) =>
  displayNumber(value, locale, { maximumFractionDigits: digits });
const percent = (value: number | null | undefined, locale: Locale, ratio = false) =>
  value == null ? '—' : `${number(value * (ratio ? 100 : 1), locale)}%`;
const countAt = (bins: { opportunities: number; people: number }[], n: number) =>
  bins.reduce((sum, bin) => sum + (bin.opportunities >= n ? bin.people : 0), 0);
const sourceRows = (sources: PlanningStudySource[]) => [
  ...new Map(
    sources.map((source) => [
      JSON.stringify([source.attribution, source.referenceYear, source.licenceUrl, source.version]),
      source,
    ]),
  ).values(),
];

export function JourneyDayparts({
  locale,
  daypart,
  includedPeriods,
  onChange,
}: {
  locale: Locale;
  daypart: JourneyDaypart;
  includedPeriods: string[];
  onChange: (value: JourneyDaypart) => void;
}) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  return (
    <div className="space-y-2">
      {(['weekday', 'weekend'] as const)
        .filter((week) => periods.some(([id]) => includedPeriods.includes(`${week}_${id}`)))
        .map((week) => (
          <div key={week} className="grid items-center gap-1 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
            <p className="text-xs font-semibold text-muted">
              {week === 'weekday' ? t('Weekday', 'Semaine') : t('Weekend', 'Week-end')}
            </p>
            <div
              className="grid grid-cols-2 gap-1"
              role="group"
              aria-label={week === 'weekday' ? t('Weekday', 'Semaine') : t('Weekend', 'Week-end')}
            >
              {periods
                .filter(([id]) => includedPeriods.includes(`${week}_${id}`))
                .map(([id, en, fr]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={daypart === `${week}_${id}`}
                    className={`min-h-9 rounded-md border px-1 text-xs font-semibold ${daypart === `${week}_${id}` ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground'}`}
                    onClick={() => onChange(`${week}_${id}`)}
                  >
                    {t(en, fr)}
                  </button>
                ))}
            </div>
          </div>
        ))}
    </div>
  );
}

export function JourneyFaceEvidence({
  locale,
  faceId,
  daypart,
  result,
}: {
  locale: Locale;
  faceId?: string;
  daypart: JourneyDaypart;
  result: PlanningStudyResult | null;
}) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const face = result?.faces.find((face) => face.faceId === faceId);
  const period = face?.periods.find((period) => period.daypartId === daypart);
  const benchmark = result?.benchmarks?.periods.find((item) => item.daypartId === daypart);
  return (
    <section className="space-y-2 text-xs">
      <h3 className="font-bold">Abonten Score</h3>
      {period ? (
        <>
          <dl className="grid grid-cols-2 gap-2">
            <div>
              <dt className="text-muted">{t('Directional Demand', 'Demande directionnelle')}</dt>
              <dd className="text-lg font-bold">
                {period.directionalDemand == null
                  ? '—'
                  : `${number(period.directionalDemand, locale)} / 100`}
              </dd>
            </div>
            <div>
              <dt className="text-muted">{t('Viewability Fit', 'Visibilité')}</dt>
              <dd className="text-lg font-bold">{percent(period.viewabilityFit, locale)}</dd>
            </div>
          </dl>
          <p className="text-muted">
            {t('Passing demand in this direction', 'Demande dans ce sens')} ·{' '}
            {percent(period.directionShare, locale, true)} · {t('Assessed', 'Évaluée')}{' '}
            {percent(period.assessmentCoverage, locale, true)}
          </p>
          {benchmark && (
            <p className="text-muted">
              {t('Comparison roads with matched demand', 'Routes de comparaison avec demande')} ·{' '}
              {benchmark.matchedApproachCount} / {benchmark.approachCount}
            </p>
          )}
          <FaceDrivers face={face!} daypart={daypart} locale={locale} />
        </>
      ) : (
        <>
          <p className="text-muted">
            {t(
              'Compare this face and its opposite face across local dayparts.',
              'Comparez cette face et la face opposée par période locale.',
            )}
          </p>
        </>
      )}
    </section>
  );
}

function FaceDrivers({
  face,
  daypart,
  locale,
}: {
  face: PlanningStudyFace;
  daypart: JourneyDaypart;
  locale: Locale;
}) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const period = face.periods.find((item) => item.daypartId === daypart);
  if (!period) return null;
  return (
    <details className="rounded-lg border border-border p-2">
      <summary className="cursor-pointer font-semibold">
        {t('What drives this score', 'Origine du score')}
      </summary>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-muted">
        <div>
          <dt>{t('Time in view', 'Temps de visibilité')}</dt>
          <dd>
            {period.timeInViewSeconds == null
              ? '—'
              : `${number(period.timeInViewSeconds, locale)} s`}
          </dd>
        </div>
        <div>
          <dt>{t('Visible road length', 'Longueur visible')}</dt>
          <dd>
            {period.visibleDistanceMetres == null
              ? '—'
              : `${number(period.visibleDistanceMetres, locale)} m`}
          </dd>
        </div>
        <div>
          <dt>{t('Segment speed', 'Vitesse du tronçon')}</dt>
          <dd>{period.speedKph == null ? '—' : `${number(period.speedKph, locale)} km/h`}</dd>
        </div>
        <div>
          <dt>{t('Passing weight', 'Poids passant')}</dt>
          <dd>{number(period.passingWeight, locale)}</dd>
        </div>
      </dl>
      {face.approach && (
        <p className="mt-2 text-muted">
          {t('Road approach', 'Approche routière')} · {number(face.approach.bearingDeg, locale, 0)}°
          · {face.approach.source}
        </p>
      )}
      <p className="mt-2 text-muted">
        {period.trafficEvidence === 'indicated'
          ? t(
              'Routing response indicates traffic coverage.',
              'La réponse de routage indique une couverture du trafic.',
            )
          : t(
              'Segment speeds are routing estimates; traffic coverage is unconfirmed.',
              'Les vitesses sont estimées par le routage ; couverture du trafic non confirmée.',
            )}
      </p>
      {period.unavailableReasons.map((reason) => (
        <p key={reason} className="mt-2 text-warning">
          {reason}
        </p>
      ))}
    </details>
  );
}

export function JourneyModel({
  locale,
  stage,
  study,
  omittedCandidates,
  controls,
  onControls,
  daypart,
  minimumOpportunities,
  boardId,
  boardCenter,
  selectedFaceIds,
  onApplyRecommendation,
  onEditBrief,
}: {
  locale: Locale;
  stage: 'map' | 'review';
  study: JourneyStudy;
  omittedCandidates: number;
  controls: PlanningModelControls;
  onControls: (next: PlanningModelControls) => void;
  daypart: JourneyDaypart;
  minimumOpportunities: string;
  boardId?: string;
  boardCenter?: JourneyPoint | null;
  selectedFaceIds: string[];
  onApplyRecommendation: (ids: string[]) => void;
  onEditBrief: () => void;
}) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const data = study.result;
  const target = controls.target;
  const audienceSummary = audienceLabels(target, locale);
  const faces = data?.faces.filter((face) => !boardId || face.siteId === boardId) ?? [];
  const progress = study.job?.progress;
  const set = (change: Partial<PlanningModelControls>) => onControls({ ...controls, ...change });
  return (
    <section
      className="min-w-0 space-y-3 text-xs"
      aria-label={t('Planning study', 'Étude de planification')}
    >
      <h3 className="text-sm font-bold">
        {stage === 'map'
          ? t('Board and daypart analysis', 'Analyse du panneau par période')
          : 'Abonten Audience Model'}
      </h3>
      {stage === 'map' && (
        <div className="space-y-3 rounded-lg border border-border p-2.5">
          <label className="grid gap-1 font-semibold">
            {t('Target area radius', 'Rayon de la zone ciblée')}
            <select
              className={inputStyle}
              value={controls.radiusKm}
              onChange={(event) => set({ radiusKm: Number(event.target.value) })}
            >
              {[0.5, 1, 2, 3, 4, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n} km
                </option>
              ))}
            </select>
          </label>
          <p className="text-muted">
            {controls.center
              ? t('Area centered on your chosen location.', 'Zone centrée sur votre lieu choisi.')
              : t('Area centered on the selected market.', 'Zone centrée sur le marché choisi.')}
          </p>
          {boardCenter &&
            (!controls.center ||
              controls.center.latitude !== boardCenter.latitude ||
              controls.center.longitude !== boardCenter.longitude) && (
              <button
                type="button"
                className="journey-button"
                onClick={() =>
                  set({ center: boardCenter, target: { ...controls.target, locations: [] } })
                }
              >
                {t('Center target area on this board', 'Centrer la zone sur ce panneau')}
              </button>
            )}
        </div>
      )}
      {study.stale && (
        <p className="text-warning" role="status">
          {t(
            'Campaign changed. Update the plan to refresh results.',
            'Campagne modifiée. Mettez le plan à jour.',
          )}
        </p>
      )}
      {!study.canRun && (
        <p className="text-muted">
          {t(
            'Choose a market, budget, complete primary audience and a board.',
            'Choisissez le marché, le budget, une cible principale complète et un panneau.',
          )}
        </p>
      )}
      {omittedCandidates > 0 && (
        <p className="text-warning">
          {t(
            `This calculation includes 100 faces, keeping your selection first. ${omittedCandidates} additional faces are omitted. Narrow the area or change your selection to assess them.`,
            `Ce calcul couvre 100 faces, en conservant votre sélection en priorité. ${omittedCandidates} autres faces sont exclues. Réduisez la zone ou modifiez votre sélection pour les évaluer.`,
          )}
        </p>
      )}
      <div className="space-y-1 rounded-lg border border-border p-2.5">
        <p className="font-semibold">{t('Primary audience', 'Cible principale')}</p>
        <div className="journey-tags">
          <span>{controls.radiusKm} km</span>
          {audienceSummary.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        {study.readiness?.secondary && (
          <p>
            {t('Secondary audience reported separately', 'Cible secondaire présentée séparément')}
          </p>
        )}
        <button type="button" className="journey-text-button" onClick={onEditBrief}>
          {t('Edit audiences', 'Modifier les cibles')}
        </button>
      </div>
      {study.checkingReadiness && (
        <p role="status">
          {t('Checking audience and face coverage…', 'Vérification de la couverture…')}
        </p>
      )}
      {study.readiness && (
        <section
          className="space-y-2 rounded-lg border border-border p-3"
          aria-label={t('Planning readiness', 'Préparation du plan')}
        >
          <dl className="journey-metric-grid">
            {[
              [t('Primary estimate', 'Estimation principale'), study.readiness.targeting],
              ...(study.readiness.secondary
                ? [
                    [
                      t('Secondary estimate', 'Estimation secondaire'),
                      study.readiness.secondary.targeting,
                    ],
                  ]
                : []),
            ].map(([label, value]) => {
              const evidence = value as PlanningStudyResult['targeting'];
              const range = evidence.sec?.range ?? evidence.household?.range;
              const publishable = evidence.status === 'supported';
              return (
                <div key={String(label)}>
                  <dt>{String(label)}</dt>
                  <dd>
                    {!publishable || evidence.population === null
                      ? '—'
                      : number(evidence.population, locale, 0)}
                  </dd>
                  {!publishable && (
                    <small className="text-warning">
                      {evidence.sec?.publication?.status === 'withheld'
                        ? t(
                            'SEC estimate unavailable · low reliability',
                            'Estimation SEC indisponible · faible fiabilité',
                          )
                        : evidence.sec?.status === 'unavailable'
                          ? t('SEC estimate unavailable', 'Estimation SEC indisponible')
                          : t('Audience needs details', 'Cible à compléter')}
                    </small>
                  )}
                  {publishable &&
                    evidence.population !== null &&
                    range?.lower !== null &&
                    range?.lower !== undefined &&
                    range.higher !== null && (
                      <small>
                        {number(range.lower, locale, 0)}–{number(range.higher, locale, 0)}
                      </small>
                    )}
                </div>
              );
            })}
          </dl>
          <div className="journey-tags">
            <span>
              {t('Viewing inputs', 'Données de visibilité')}{' '}
              {study.readiness.faces.withViewingProfile} / {study.readiness.faces.total}
            </span>
            <span>
              {t('Population area', 'Zone de population')}{' '}
              {percent(study.readiness.population.coverage, locale, true)}
            </span>
            {study.readiness.targeting.household && (
              <span>
                {t(
                  'Parents living with biological children',
                  'Parents vivant avec leurs enfants biologiques',
                )}
              </span>
            )}
          </div>
          <details>
            <summary className="cursor-pointer font-semibold">
              {t('Sources & scope', 'Sources et périmètre')}
            </summary>
            <div className="mt-2 space-y-2 text-muted">
              {study.readiness.targeting.household && (
                <p>{study.readiness.targeting.household.geographicGrain}</p>
              )}
              {[
                ...new Set([
                  ...study.readiness.targeting.reasons,
                  ...(study.readiness.secondary?.targeting.reasons ?? []),
                  ...study.readiness.issues,
                ]),
              ].map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
              {[
                [t('Primary SEC', 'SEC principale'), study.readiness.targeting.sec],
                [t('Secondary SEC', 'SEC secondaire'), study.readiness.secondary?.targeting.sec],
              ].map(([label, value]) => {
                const sec = value as PlanningStudyResult['targeting']['sec'];
                return sec ? (
                  <div key={String(label)}>
                    <strong>{String(label)}</strong>
                    <div className="journey-tags">
                      <span>
                        {sec.status === 'modeled'
                          ? t('Modeled', 'Modélisée')
                          : t('Unavailable', 'Indisponible')}
                      </span>
                      <span>
                        {t('Classified', 'Classifiée')} {percent(sec.classifiedShare, locale, true)}
                      </span>
                      <span>
                        {t('Unclassified adults', 'Adultes non classifiés')}{' '}
                        {percent(sec.unknownPotentialShare, locale, true)}
                      </span>
                    </div>
                    <p>{sec.geographicGrain}</p>
                    <p>
                      {t(
                        'Occupation, education, household assets and living conditions.',
                        'Profession, éducation, biens du ménage et conditions de vie.',
                      )}
                    </p>
                  </div>
                ) : null;
              })}
              {sourceRows(study.readiness.sources).map((source) => (
                <p key={source.layer + source.sourceKey}>
                  <a
                    href={source.licenceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {source.attribution}
                  </a>{' '}
                  · {source.referenceYear}
                </p>
              ))}
            </div>
          </details>
        </section>
      )}
      {study.readinessError && (
        <div role="alert">
          <p className="text-error">{study.readinessError}</p>
          <button type="button" className="journey-button" onClick={study.retryReadiness}>
            {t('Retry coverage check', 'Réessayer la vérification')}
          </button>
        </div>
      )}
      {stage === 'map' && !study.canRun && (
        <button type="button" className="journey-button" onClick={onEditBrief}>
          {t('Set campaign brief', 'Définir le brief')}
        </button>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="journey-primary"
          disabled={!study.canRun || study.pending}
          onClick={() => {
            void study.run();
          }}
        >
          {study.pending
            ? t('Building plan…', 'Création du plan…')
            : study.job
              ? t('Update plan', 'Mettre à jour le plan')
              : t('Build plan', 'Créer le plan')}
        </button>
        {study.pending && (
          <button type="button" className="journey-button" onClick={() => void study.cancel()}>
            {t('Cancel', 'Annuler')}
          </button>
        )}
      </div>
      {study.pending && progress && (
        <div role="status" className="space-y-1">
          <progress
            className="w-full accent-primary"
            max={Math.max(1, progress.total)}
            value={progress.completed}
          />
          <p>
            {progress.stage} · {progress.completed}/{progress.total}
          </p>
        </div>
      )}
      {study.job?.status === 'cancelled' && (
        <p role="status">
          {t(
            'Plan calculation cancelled. Your brief and shortlist are kept.',
            'Calcul annulé. Votre brief et votre sélection sont conservés.',
          )}
        </p>
      )}
      {(study.error || study.job?.status === 'cancelled') && (
        <div role={study.error ? 'alert' : undefined} className="space-y-2">
          <p className="text-error">{study.error}</p>
          <button
            type="button"
            className="journey-button"
            onClick={() => {
              void study.retry();
            }}
          >
            {t('Retry', 'Réessayer')}
          </button>
        </div>
      )}
      {data && (
        <>
          {stage === 'map' && (
            <>
              <div className="space-y-3">
                {faces.map((face) => (
                  <article key={face.faceId} className="rounded-lg border border-border p-2.5">
                    <h4 className="mb-2 font-bold">
                      {face.siteName} · {face.faceLabel}
                    </h4>
                    <JourneyFaceEvidence
                      faceId={face.faceId}
                      daypart={daypart}
                      locale={locale}
                      result={data}
                    />
                  </article>
                ))}
              </div>
            </>
          )}

          {stage === 'review' && (
            <>
              <AudienceResult
                data={data}
                locale={locale}
                thresholdInput={minimumOpportunities}
                selectedFaceIds={selectedFaceIds}
                updating={study.evaluating || !study.selectionCurrent}
              />
              <CompositeResult
                data={data}
                locale={locale}
                updating={study.evaluating || !study.selectionCurrent}
                onApply={onApplyRecommendation}
              />
            </>
          )}
          <StudyEvidence data={data} locale={locale} />
        </>
      )}
    </section>
  );
}

function AudienceResult({
  data,
  locale,
  thresholdInput,
  selectedFaceIds,
  updating,
}: {
  data: PlanningStudyResult;
  locale: Locale;
  thresholdInput: string;
  selectedFaceIds: string[];
  updating: boolean;
}) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const base =
    data.audience.status === 'unavailable'
      ? undefined
      : data.audience.scenarios.find((item) => item.id === 'base');
  const valid = /^[1-9]\d*$/.test(thresholdInput);
  const n = valid ? Number(thresholdInput) : Infinity;
  const selectionMatches =
    data.faces
      .filter((face) => face.selected)
      .map((face) => face.faceId)
      .sort()
      .join() === [...selectedFaceIds].sort().join();
  const secondary =
    data.secondary?.audience.status === 'unavailable'
      ? undefined
      : data.secondary?.audience.scenarios.find((item) => item.id === 'base');
  const audienceMetrics = (
    <dl className="journey-metric-grid">
      {[
        [
          t('Primary reach · 1+', 'Couverture principale · 1+'),
          base ? countAt(base.distribution, 1) : null,
        ],
        [
          t(
            `Primary reach · ${valid ? thresholdInput : 'N'}+`,
            `Couverture principale · ${valid ? thresholdInput : 'N'}+`,
          ),
          base && valid ? countAt(base.distribution, n) : null,
        ],
        ...(data.secondary
          ? [
              [
                t('Secondary reach · 1+', 'Couverture secondaire · 1+'),
                secondary ? countAt(secondary.distribution, 1) : null,
              ],
              [
                t(
                  `Secondary reach · ${valid ? thresholdInput : 'N'}+`,
                  `Couverture secondaire · ${valid ? thresholdInput : 'N'}+`,
                ),
                secondary && valid ? countAt(secondary.distribution, n) : null,
              ],
            ]
          : []),
      ].map(([label, value]) => (
        <div key={String(label)}>
          <dt>{String(label)}</dt>
          <dd>{value === null || !selectionMatches ? '—' : number(Number(value), locale, 0)}</dd>
        </div>
      ))}
    </dl>
  );
  if (!base || !selectionMatches)
    return (
      <div className="space-y-3">
        {audienceMetrics}
        <span className="journey-role-tag">
          {selectionMatches
            ? t(
                'Reach unavailable · missing audience inputs',
                'Couverture indisponible · données manquantes',
              )
            : t('Updating audience…', 'Actualisation…')}
        </span>
      </div>
    );
  const scenarios = data.audience.scenarios;
  return (
    <div className="space-y-3" aria-busy={updating}>
      {data.audience.status === 'partial' && (
        <div className="space-y-2 rounded-lg border border-warning p-2.5" role="status">
          <p>
            {t(
              'This subtotal covers the assessed faces and periods. Complete the missing inputs to estimate the whole plan.',
              'Ce sous-total couvre les faces et périodes évaluées. Complétez les données manquantes pour estimer le plan complet.',
            )}
          </p>
          {data.audience.excludedFacePeriods?.map((item) => (
            <p key={`${item.faceId}:${item.daypartId}`} className="text-muted">
              {data.faces.find((face) => face.faceId === item.faceId)?.faceLabel} ·{' '}
              {item.daypartId.replaceAll('_', ' ')} · {item.reasons.join(' ')}
            </p>
          ))}
        </div>
      )}

      <p className="font-bold">
        {data.audience.status === 'partial'
          ? t('Modeled OTS · partial selected plan', 'ODV modélisées · plan sélectionné partiel')
          : t('Modeled OTS · whole selected plan', 'ODV modélisées · plan sélectionné complet')}
      </p>
      {audienceMetrics}
      <div className="journey-tags">
        <span>
          {t('OTS frequency', 'Fréquence ODV')}{' '}
          {base.averageOtsFrequency === null ? '—' : number(base.averageOtsFrequency, locale)}
        </span>
        <span>
          {t('OTS impressions', 'Impressions ODV')} {number(base.modeledOtsImpressions, locale, 0)}
        </span>
      </div>
      <p className="text-muted">
        {t('Population', 'Population')} · {number(base.population, locale, 0)} ·{' '}
        {data.population.geographicBasis}.{' '}
        {t('Uncalibrated planning estimate.', 'Estimation de planification non calibrée.')}
      </p>
      <details>
        <summary>{t('Estimate range', 'Fourchette estimée')}</summary>
        <div className="overflow-x-auto">
          <table className="journey-model-table">
            <thead>
              <tr>
                <th>{t('Scenario', 'Scénario')}</th>
                <th>{t('1+ reach', 'Portée 1+')}</th>
                <th>{valid && thresholdInput.length < 10 ? `${thresholdInput}+` : 'N+'}</th>
                <th>{t('OTS impressions', 'Impressions ODV')}</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((scenario) => (
                <tr key={scenario.id}>
                  <th>
                    {scenario.id === 'lower'
                      ? t('Lower', 'Bas')
                      : scenario.id === 'higher'
                        ? t('Higher', 'Haut')
                        : t('Base', 'Central')}
                  </th>
                  <td>{number(countAt(scenario.distribution, 1), locale, 0)}</td>
                  <td>{valid ? number(countAt(scenario.distribution, n), locale, 0) : '—'}</td>
                  <td>{number(scenario.modeledOtsImpressions, locale, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details>
        <summary className="cursor-pointer font-semibold">
          {t('Frequency distribution', 'Distribution des fréquences')}
        </summary>
        <div className="mt-2 max-h-52 overflow-auto">
          <table className="journey-model-table">
            <thead>
              <tr>
                <th>{t('Opportunities', 'Occasions')}</th>
                <th>{t('People', 'Personnes')}</th>
              </tr>
            </thead>
            <tbody>
              {base.distribution.map((bin) => (
                <tr key={bin.opportunities}>
                  <td>{bin.opportunities}</td>
                  <td>{number(bin.people, locale, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function CompositeResult({
  data,
  locale,
  updating,
  onApply,
}: {
  data: PlanningStudyResult;
  locale: Locale;
  updating: boolean;
  onApply: (ids: string[]) => void;
}) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const composite = data.composite;
  return (
    <section className="space-y-3 border-t border-border pt-3" aria-busy={updating}>
      <h3 className="text-sm font-bold">Composite Abonten Score</h3>
      {updating ? (
        <p role="status">
          {t(
            'Updating the recommendation on the same study…',
            'Actualisation de la recommandation sur la même étude…',
          )}
        </p>
      ) : (
        <>
          {composite.rows.length > 0 && (
            <>
              <p>
                {t('Recommended mix', 'Sélection recommandée')} ·{' '}
                {formatMoney(composite.totalCost, composite.currency, locale)} ·{' '}
                {number(composite.objectivePeople, locale, 0)}{' '}
                {composite.objective === 'reach'
                  ? t('people with 1+', 'personnes avec 1+')
                  : t(
                      `people with ${data.minimumOpportunities}+`,
                      `personnes avec ${data.minimumOpportunities}+`,
                    )}
              </p>
              <button
                type="button"
                className="journey-button"
                onClick={() => onApply(composite.selectedFaceIds)}
              >
                {t('Use recommended faces', 'Utiliser les faces recommandées')}
              </button>
              <ol className="space-y-2">
                {composite.rows.map((row) => {
                  const face = data.faces.find((face) => face.faceId === row.faceId);
                  return (
                    <li key={row.faceId} className="rounded-lg border border-border p-2.5">
                      <strong>
                        {row.order}. {face ? `${face.siteName} · ${face.faceLabel}` : row.faceId}
                      </strong>
                      <p className="mt-1">
                        +{number(row.incrementalPeople, locale, 0)}{' '}
                        {composite.objective === 'reach'
                          ? t('new people', 'nouvelles personnes')
                          : t('people above the threshold', 'personnes au-dessus du seuil')}{' '}
                        · {formatMoney(row.flightCost, composite.currency, locale)}
                      </p>
                      <p className="mt-1 text-muted">{row.reason}</p>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
          {!composite.rows.length && (
            <p className="text-muted">
              {t(
                'No eligible face mix meets this brief with the current cost, availability and audience inputs.',
                'Aucune sélection admissible ne répond au brief avec les données actuelles de coût, disponibilité et audience.',
              )}
            </p>
          )}
          {composite.excluded.length > 0 && (
            <details>
              <summary className="cursor-pointer font-semibold">
                {t('Faces excluded from the recommendation', 'Faces exclues de la recommandation')}
              </summary>
              {composite.excluded.map((row) => (
                <p key={row.faceId} className="mt-2 text-muted">
                  {data.faces.find((face) => face.faceId === row.faceId)?.faceLabel} · {row.reason}
                </p>
              ))}
            </details>
          )}
        </>
      )}
    </section>
  );
}

function StudyEvidence({ data, locale }: { data: PlanningStudyResult; locale: Locale }) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  return (
    <details className="rounded-lg border border-border p-2.5">
      <summary className="cursor-pointer font-semibold">
        {t('Sources, coverage and missing inputs', 'Sources, couverture et données manquantes')}
      </summary>
      <div className="mt-2 space-y-2 text-muted">
        <p>
          {t('Area with population data', 'Zone couverte par les données de population')} ·{' '}
          {percent(data.population.coverage, locale, true)}
        </p>
        {data.benchmarks && (
          <details>
            <summary className="cursor-pointer font-semibold">
              {t('Directional comparison roads', 'Routes de comparaison directionnelle')}
            </summary>
            <p>{data.benchmarks.method}</p>
            <ul className="mt-2 space-y-1">
              {data.benchmarks.approaches.map((approach) => (
                <li key={approach.id}>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${approach.latitude}&mlon=${approach.longitude}#map=17/${approach.latitude}/${approach.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {number(approach.latitude, locale, 5)}, {number(approach.longitude, locale, 5)}
                    {' · '}
                    {number(approach.bearingDeg, locale, 0)}°
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
        {data.targeting.reasons.map((item) => (
          <p key={item}>{item}</p>
        ))}
        {sourceRows(data.sources).map((source) => (
          <p key={`${source.layer}:${source.sourceKey}`}>
            <a href={source.licenceUrl} target="_blank" rel="noreferrer" className="underline">
              {source.attribution}
            </a>{' '}
            · {source.referenceYear} · {source.version}
          </p>
        ))}
        {data.issues.map((issue, i) => (
          <p key={`${issue.code}:${i}`}>
            <strong>{issue.message}</strong> {issue.action}
          </p>
        ))}
      </div>
    </details>
  );
}
