'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  PlanningStudyEvaluation,
  PlanningStudyResult,
} from '@abonten/contracts/planning-study';
import type { SavedAgencyPlanningDraft } from '@abonten/contracts/planning-draft';
import { apiJson } from '../../lib/api';
import type { AgencyDraft } from '../../lib/agency-draft';
import { displayNumber } from '../../lib/locale-format';
import { planningLastDay } from '../../lib/agency-planning';
import { formatMoney, parseAmount } from '../../lib/number-format';
import { listPlanningDrafts } from '../../lib/planning-drafts-api';
import { planningStudyBasis, STUDY_DAYPARTS } from './planningStudyBasis';
import { audienceLabels } from './audienceLabels';
import { findMarket } from '../../lib/markets';
import { DEFAULT_MODEL_CONTROLS, type JourneyStudy } from './usePlanningStudy';

type Locale = 'en' | 'fr';
function basis(draft: AgencyDraft) {
  const controls = draft.modelControls ?? DEFAULT_MODEL_CONTROLS;
  const market = findMarket(draft.country);
  return planningStudyBasis({
    countryCode: market?.code ?? draft.country,
    center: controls.center ?? {
      latitude: market?.center[1] ?? 0,
      longitude: market?.center[0] ?? 0,
    },
    radiusKm: controls.radiusKm,
    timeZone: market?.timezone ?? '',
    flight: draft.window,
    dayparts: draft.planning?.strategy.dayparts ?? STUDY_DAYPARTS,
    sampling: controls.sampling,
    target: draft.planning?.targetGroup.criteria ?? controls.target,
    secondaryTarget: draft.planning?.secondaryTargetGroup?.criteria,
  });
}
function metrics(
  result: Pick<PlanningStudyResult, 'faces' | 'audience' | 'secondary'> | undefined,
  faceIds: string[],
  currency: string,
) {
  const base =
    result?.audience.status === 'unavailable'
      ? undefined
      : result?.audience.scenarios.find((scenario) => scenario.id === 'base');
  const faces = result?.faces.filter((face) => faceIds.includes(face.faceId)) ?? [];
  const complete =
    faces.length === faceIds.length &&
    faces.every(
      (face) =>
        face.flightCost !== null && face.currency === currency && face.availability === 'available',
    );
  return {
    cost: complete && result ? faces.reduce((sum, face) => sum + face.flightCost!, 0) : null,
    reach: base?.reach1Plus,
    reachN: base?.reachNPlus,
    frequency: base?.averageOtsFrequency,
    secondaryReach:
      result?.secondary?.audience.status === 'unavailable'
        ? undefined
        : result?.secondary?.audience.scenarios.find((scenario) => scenario.id === 'base')
            ?.reach1Plus,
  };
}
function comparisonChoices(draft: AgencyDraft) {
  return [
    basis(draft),
    draft.faces,
    parseAmount(draft.budget),
    draft.currency,
    draft.audiencePlan?.objective ?? 'reach',
    draft.audiencePlan?.minimumOpportunities ?? '4',
    (draft.modelControls?.digitalAllocations ?? []).filter((row) =>
      draft.faces.some((face) => face.faceId === row.faceId),
    ),
  ];
}
export function JourneyAlternatives({
  orgId,
  locale,
  draft,
  currentName,
  study,
  savedVersion,
  onOpenPlan,
}: {
  orgId: string;
  locale: Locale;
  draft: AgencyDraft;
  currentName: string;
  study: JourneyStudy;
  savedVersion?: number;
  onOpenPlan: (id: string) => void;
}) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const [items, setItems] = useState<SavedAgencyPlanningDraft[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, PlanningStudyEvaluation>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resultIdentity, setResultIdentity] = useState('');
  const activeComparison = useRef<AbortController | null>(null);
  const identity = JSON.stringify([
    study.job?.id,
    study.result?.inputSignature,
    study.result?.generatedAt,
    comparisonChoices(draft),
    [...selected].sort().map((id) => {
      const item = items.find((item) => item.id === id);
      return item ? [id, item.revision, comparisonChoices(item.draft)] : [id];
    }),
  ]);
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const currentResults = resultIdentity === identity ? results : {};
  const currentErrors = resultIdentity === identity ? errors : {};
  useEffect(() => {
    activeComparison.current?.abort();
    activeComparison.current = null;
    setBusy(false);
    setResults({});
    setErrors({});
    setResultIdentity('');
  }, [identity]);
  useEffect(() => () => activeComparison.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    void listPlanningDrafts(orgId, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) {
          setItems(result.items);
          setStatus('ready');
        }
      },
      () => {
        if (!controller.signal.aborted) setStatus('error');
      },
    );
    return () => controller.abort();
  }, [orgId, savedVersion, reload]);
  async function compare() {
    if (!study.job || !study.result || busy) return;
    const controller = new AbortController();
    activeComparison.current?.abort();
    activeComparison.current = controller;
    const inputIdentity = identity;
    setBusy(true);
    setErrors({});
    const next: Record<string, PlanningStudyEvaluation> = {};
    const failures: Record<string, string> = {};
    for (const item of items.filter((item) => selected.includes(item.id))) {
      if (basis(item.draft) !== basis(draft)) {
        failures[item.id] = t(
          'The target group, area, campaign periods or flight differ. Open this plan to calculate its audience.',
          'La cible, la zone, les périodes ou les dates diffèrent. Ouvrez ce plan pour calculer son audience.',
        );
        continue;
      }
      const amount = parseAmount(item.draft.budget);
      if (amount === null || amount <= 0) {
        failures[item.id] = t(
          'This alternative needs a positive budget.',
          'Cette variante exige un budget positif.',
        );
        continue;
      }
      try {
        next[item.id] = await apiJson<PlanningStudyEvaluation>(
          `/api/planning/v1/studies/${study.job.id}/compare`,
          {
            method: 'POST',
            signal: controller.signal,
            headers: { 'X-Org-Id': orgId, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...(item.draft.faces.length
                ? {
                    faces: item.draft.faces.map((face) => ({
                      siteId: face.siteId,
                      faceId: face.faceId,
                    })),
                  }
                : {}),
              faceIds: item.draft.faces.map((face) => face.faceId),
              minimumOpportunities: Math.min(
                Number(item.draft.audiencePlan?.minimumOpportunities ?? '4'),
                Number.MAX_SAFE_INTEGER,
              ),
              objective: item.draft.audiencePlan?.objective ?? 'reach',
              budget: { amount, currency: item.draft.currency },
              digitalAllocations: (item.draft.modelControls?.digitalAllocations ?? []).filter(
                (allocation) => item.draft.faces.some((face) => face.faceId === allocation.faceId),
              ),
            }),
            timeoutMs: 60_000,
          },
        );
      } catch (error) {
        if (controller.signal.aborted || currentIdentity.current !== inputIdentity) return;
        failures[item.id] =
          error instanceof Error
            ? error.message
            : t(
                'Could not evaluate this alternative. Retry.',
                'Impossible d’évaluer cette variante. Réessayez.',
              );
      }
    }
    if (controller.signal.aborted || currentIdentity.current !== inputIdentity) return;
    setResults(next);
    setErrors(failures);
    setResultIdentity(inputIdentity);
    activeComparison.current = null;
    setBusy(false);
  }
  const rows = [
    {
      id: 'current',
      name: currentName,
      draft,
      result: study.selectionCurrent ? (study.result ?? undefined) : undefined,
    },
    ...items
      .filter((item) => selected.includes(item.id))
      .map((item) => ({ ...item, result: currentResults[item.id] })),
  ];
  return (
    <section className="space-y-3 border-b border-border pb-3 text-xs">
      <h3 className="text-sm font-bold">{t('Saved alternatives', 'Variantes enregistrées')}</h3>
      {status === 'loading' && (
        <p role="status">{t('Loading saved plans…', 'Chargement des plans…')}</p>
      )}
      {status === 'error' && (
        <div role="alert">
          <p>{t('Saved plans could not be loaded.', 'Impossible de charger les plans.')}</p>
          <button
            type="button"
            className="journey-button"
            onClick={() => setReload((value) => value + 1)}
          >
            {t('Retry', 'Réessayer')}
          </button>
        </div>
      )}
      {status === 'ready' && !items.length && (
        <p className="text-muted">
          {t(
            'Save a plan and an alternative from Review plan to compare them here.',
            'Enregistrez un plan et une variante depuis Examiner le plan pour les comparer ici.',
          )}
        </p>
      )}
      {items.length > 0 && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {items.map((item) => (
              <label key={item.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-primary"
                  checked={selected.includes(item.id)}
                  disabled={!selected.includes(item.id) && selected.length >= 3}
                  onChange={() => {
                    setSelected((values) =>
                      values.includes(item.id)
                        ? values.filter((id) => id !== item.id)
                        : [...values, item.id],
                    );
                    setResults({});
                  }}
                />
                <span>
                  {item.name} · {item.draft.faces.length} {t('faces', 'faces')}
                </span>
              </label>
            ))}
          </div>
          <button
            type="button"
            className="journey-button"
            disabled={!selected.length || !study.result || busy || study.pending}
            onClick={() => void compare()}
          >
            {busy
              ? t('Comparing…', 'Comparaison…')
              : t('Compare on the same population', 'Comparer sur la même population')}
          </button>
          {!study.result && (
            <p className="text-muted">
              {t(
                'Run the current study first to compare modeled audience on one population.',
                'Lancez d’abord l’étude actuelle pour comparer l’audience sur une même population.',
              )}
            </p>
          )}
        </>
      )}
      {selected.length > 0 && (
        <div className="overflow-x-auto">
          <table className="journey-model-table">
            <thead>
              <tr>
                <th>{t('Plan', 'Plan')}</th>
                {rows.map((row) => (
                  <th key={row.id}>
                    {row.name}
                    {row.result?.audience.status === 'partial'
                      ? ` · ${t('Partial', 'Partiel')}`
                      : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>{t('Primary audience', 'Cible principale')}</th>
                {rows.map((row) => (
                  <td key={row.id}>
                    <div className="journey-tags">
                      {audienceLabels(
                        row.draft.planning?.targetGroup.criteria ??
                          row.draft.modelControls?.target ??
                          {},
                        locale,
                      ).map((label) => (
                        <span key={label}>{label}</span>
                      ))}
                    </div>
                  </td>
                ))}
              </tr>
              <tr>
                <th>{t('Secondary audience', 'Cible secondaire')}</th>
                {rows.map((row) => (
                  <td key={row.id}>
                    {row.draft.planning?.secondaryTargetGroup ? (
                      <div className="journey-tags">
                        {audienceLabels(
                          row.draft.planning.secondaryTargetGroup.criteria,
                          locale,
                        ).map((label) => (
                          <span key={label}>{label}</span>
                        ))}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <th>{t('Strategy', 'Stratégie')}</th>
                {rows.map((row) => (
                  <td key={row.id}>{row.draft.planning?.strategy.summary || '—'}</td>
                ))}
              </tr>
              <tr>
                <th>{t('Flight', 'Campagne')}</th>
                {rows.map((row) => (
                  <td key={row.id}>
                    {row.draft.window.startDate} – {planningLastDay(row.draft.window.endDate)}
                  </td>
                ))}
              </tr>
              <tr>
                <th>{t('Faces', 'Faces')}</th>
                {rows.map((row) => (
                  <td key={row.id}>{row.draft.faces.length}</td>
                ))}
              </tr>
              <tr>
                <th>{t('Budget', 'Budget')}</th>
                {rows.map((row) => (
                  <td key={row.id}>
                    {formatMoney(parseAmount(row.draft.budget) ?? 0, row.draft.currency, locale)}
                  </td>
                ))}
              </tr>
              <tr>
                <th>{t('Objective / threshold', 'Objectif / seuil')}</th>
                {rows.map((row) => (
                  <td key={row.id}>
                    {row.draft.audiencePlan?.objective === 'frequency'
                      ? t('Frequency', 'Répétition')
                      : t('Reach', 'Portée')}{' '}
                    · {row.draft.audiencePlan?.minimumOpportunities ?? '4'}+
                  </td>
                ))}
              </tr>
              {(['cost', 'reach', 'reachN', 'secondaryReach', 'frequency'] as const).map((key) => (
                <tr key={key}>
                  <th>
                    {key === 'cost'
                      ? t('Comparable flight cost', 'Coût comparable')
                      : key === 'reach'
                        ? t('Primary reach · 1+', 'Couverture principale · 1+')
                        : key === 'reachN'
                          ? t('Reach at own threshold', 'Portée au seuil du plan')
                          : key === 'secondaryReach'
                            ? t('Secondary reach · 1+', 'Couverture secondaire · 1+')
                            : t('OTS frequency', 'Fréquence ODV')}
                  </th>
                  {rows.map((row) => {
                    const value = metrics(
                      row.result,
                      row.draft.faces.map((face) => face.faceId),
                      row.draft.currency,
                    )[key];
                    return (
                      <td key={row.id}>
                        {value == null
                          ? '—'
                          : key === 'cost'
                            ? formatMoney(value, row.draft.currency, locale)
                            : displayNumber(value, locale, {
                                maximumFractionDigits: key === 'frequency' ? 1 : 0,
                              })}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <th>{t('Resume', 'Reprendre')}</th>
                <td>—</td>
                {rows.slice(1).map((row) => (
                  <td key={row.id}>
                    <button
                      type="button"
                      className="journey-text-button"
                      onClick={() => onOpenPlan(row.id)}
                    >
                      {t('Open plan', 'Ouvrir le plan')}
                    </button>
                    {currentErrors[row.id] && (
                      <p className="mt-2 text-warning">{currentErrors[row.id]}</p>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {rows
        .filter((row) => row.result?.audience.status === 'partial')
        .map((row) => (
          <div key={row.id} className="space-y-1 text-warning">
            <p>
              {row.name} ·{' '}
              {t(
                'Partial audience subtotal. Missing face periods:',
                'Sous-total d’audience partiel. Périodes de face manquantes :',
              )}
            </p>
            {row.result?.audience.excludedFacePeriods?.map((item) => (
              <p key={`${item.faceId}:${item.daypartId}`}>
                {row.result?.faces.find((face) => face.faceId === item.faceId)?.faceLabel} ·{' '}
                {item.daypartId.replaceAll('_', ' ')} · {item.reasons.join(' ')}
              </p>
            ))}
          </div>
        ))}
    </section>
  );
}
