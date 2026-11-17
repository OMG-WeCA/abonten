'use client';

import { useEffect, useRef, useState } from 'react';
import type { PlanningModelControls } from '@abonten/contracts/planning-draft';
import type {
  PlanningStudyJob,
  PlanningStudyInput,
  PlanningStudyResult,
  PlanningStudyEvaluation,
  PlanningStudyReadiness,
} from '@abonten/contracts/planning-study';
import type { AgencyDraft } from '../../lib/agency-draft';
import { apiJson, ApiError } from '../../lib/api';
import { findMarket } from '../../lib/markets';
import { planningDays } from '../../lib/agency-planning';
import { parseAmount } from '../../lib/number-format';
import { planningStudyBasis, STUDY_DAYPARTS } from './planningStudyBasis';

export const DEFAULT_MODEL_CONTROLS: PlanningModelControls = {
  version: 1,
  radiusKm: 2,
  sampling: { mode: 'recommended', referencePairs: 72 },
  target: {},
};
const path = '/api/planning/v1/studies';
const headers = (orgId: string) => ({ 'X-Org-Id': orgId, 'Content-Type': 'application/json' });
const thresholdNumber = (value: string) =>
  /^[1-9]\d*$/.test(value) ? Math.min(Number(value), Number.MAX_SAFE_INTEGER) : null;

/** One study survives panel changes. Selection evaluates retained journeys; it never requests routes. */
export function usePlanningStudy({
  orgId,
  draft,
  candidates,
  onStudyId,
  minimumOpportunities,
}: {
  orgId: string;
  draft: AgencyDraft;
  candidates: { siteId: string; faceId: string }[];
  onStudyId: (id: string) => void;
  minimumOpportunities: string;
}) {
  const controls = draft.modelControls ?? DEFAULT_MODEL_CONTROLS;
  const market = findMarket(draft.country);
  const digitalAllocations = (controls.digitalAllocations ?? []).filter((allocation) =>
    candidates.some((face) => face.faceId === allocation.faceId),
  );
  const amount = parseAmount(draft.budget);
  const threshold = thresholdNumber(minimumOpportunities);
  const audiences = [draft.planning?.targetGroup.criteria ?? controls.target];
  const completeAudiences = audiences.every((target) => {
    const parent = target?.household?.parentsOfSchoolChildren;
    return (
      !parent ||
      (Number.isInteger(parent.childAgeMin) &&
        Number.isInteger(parent.childAgeMax) &&
        Number(parent.childAgeMin) >= 0 &&
        Number(parent.childAgeMax) <= 24 &&
        Number(parent.childAgeMin) <= Number(parent.childAgeMax))
    );
  });
  const request: PlanningStudyInput | null =
    market &&
    amount !== null &&
    amount > 0 &&
    amount <= 1e12 &&
    threshold !== null &&
    completeAudiences &&
    planningDays(draft.window) !== null &&
    !draft.audiencePlan?.targetAudience.trim()
      ? {
          countryCode: market.code,
          ...(draft.planning ? { planning: draft.planning } : {}),
          center: controls.center ?? { latitude: market.center[1], longitude: market.center[0] },
          radiusKm: controls.radiusKm,
          timeZone: market.timezone,
          flight: draft.window,
          budget: { amount, currency: draft.currency },
          objective: draft.audiencePlan?.objective ?? 'reach',
          minimumOpportunities: threshold,
          faces: candidates,
          selectedFaceIds: draft.faces.map((face) => face.faceId),
          dayparts: draft.planning?.strategy.dayparts ?? STUDY_DAYPARTS,
          sampling: {
            mode: controls.sampling.mode,
            directedPairs:
              controls.sampling.mode === 'recommended'
                ? Math.min(
                    controls.sampling.directedPairs ?? 34,
                    controls.sampling.referencePairs ?? 72,
                  )
                : (controls.sampling.directedPairs ?? 34),
            referencePairs: controls.sampling.referencePairs ?? 72,
          },
          target: draft.planning?.targetGroup.criteria ?? controls.target,
          ...(draft.planning?.secondaryTargetGroup
            ? { secondaryTarget: draft.planning.secondaryTargetGroup.criteria }
            : {}),
          digitalAllocations,
          confirmPublicRoadTransfer: true,
        }
      : null;
  const [job, setJob] = useState<PlanningStudyJob | null>(null);
  const [readiness, setReadiness] = useState<PlanningStudyReadiness | null>(null);
  const [readinessError, setReadinessError] = useState('');
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const readinessKey = request ? JSON.stringify([planningStudyBasis(request), candidates]) : '';
  const [result, setResult] = useState<PlanningStudyResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluationKey, setEvaluationKey] = useState('');
  const active = useRef<AbortController | null>(null);
  const cancelRequested = useRef(false);
  const callback = useRef(onStudyId);
  callback.current = onStudyId;
  const currentRequest = useRef(request);
  currentRequest.current = request;
  const [resumeVersion, setResumeVersion] = useState(0);
  useEffect(() => {
    const input = currentRequest.current;
    setReadiness(null);
    setReadinessError('');
    if (!input) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCheckingReadiness(true);
      void apiJson<PlanningStudyReadiness>(`${path}/preflight`, {
        method: 'POST',
        headers: headers(orgId),
        body: JSON.stringify(input),
        signal: controller.signal,
        timeoutMs: 30_000,
      })
        .then(
          (value) => {
            if (!controller.signal.aborted) setReadiness(value);
          },
          (error) => {
            if (!controller.signal.aborted)
              setReadinessError(
                error instanceof Error
                  ? error.message
                  : 'Could not check audience coverage. Retry.',
              );
          },
        )
        .finally(() => {
          if (!controller.signal.aborted) setCheckingReadiness(false);
        });
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
      setCheckingReadiness(false);
    };
  }, [orgId, readinessKey, resumeVersion]);
  const compatible = Boolean(
    request && job && planningStudyBasis(request) === planningStudyBasis(job.request),
  );
  const pending = busy || job?.status === 'running' || job?.status === 'queued';
  const candidateKey = JSON.stringify(candidates);
  const selectionKey = JSON.stringify([
    draft.faces.map((face) => face.faceId),
    threshold,
    draft.audiencePlan?.objective ?? 'reach',
    amount,
    draft.currency,
    candidateKey,
    digitalAllocations,
  ]);

  function accept(next: PlanningStudyJob) {
    setJob(next);
    setResult(next.result);
    if (next.status === 'failed')
      setError(next.error?.message ?? 'The study failed. Retry to keep the same controls.');
  }
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (!controls.studyId || job?.id === controls.studyId) return;
    const controller = new AbortController();
    setError('');
    setBusy(true);
    void apiJson<PlanningStudyJob>(`${path}/${encodeURIComponent(controls.studyId)}`, {
      headers: headers(orgId),
      signal: controller.signal,
    })
      .then(
        (next) => {
          if (!controller.signal.aborted) accept(next);
        },
        (error) => {
          if (!controller.signal.aborted)
            setError(
              error instanceof ApiError && error.status === 404
                ? 'This study has expired. Run it again with your saved controls.'
                : error instanceof Error
                  ? error.message
                  : 'Could not reopen the study. Retry.',
            );
        },
      )
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [orgId, controls.studyId, resumeVersion]);

  useEffect(() => {
    if (!job || (job.status !== 'running' && job.status !== 'queued')) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void apiJson<PlanningStudyJob>(`${path}/${job.id}`, {
        headers: headers(orgId),
        signal: controller.signal,
      }).then(
        (next) => {
          if (!controller.signal.aborted) {
            setError('');
            accept(next);
          }
        },
        (error) => {
          if (!controller.signal.aborted)
            setError(
              error instanceof Error ? error.message : 'Progress could not be loaded. Retry.',
            );
        },
      );
    }, 1500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [job, orgId, resumeVersion]);

  useEffect(() => {
    if (!compatible || !job || job.status !== 'ready' || !request || selectionKey === evaluationKey)
      return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setEvaluating(true);
      void apiJson<PlanningStudyEvaluation>(`${path}/${job.id}/evaluate`, {
        method: 'POST',
        headers: headers(orgId),
        signal: controller.signal,
        body: JSON.stringify({
          faceIds: draft.faces.map((face) => face.faceId),
          minimumOpportunities: request.minimumOpportunities,
          ...(candidates.length ? { faces: candidates } : {}),
          objective: request.objective,
          budget: request.budget,
          digitalAllocations,
        }),
        timeoutMs: 60_000,
      })
        .then(
          (next) => {
            if (!controller.signal.aborted) {
              setResult((current) => {
                if (!current) return current;
                const { routeFaceMatches, ...result } = next;
                const matches = new Map(routeFaceMatches.map((route) => [route.id, route.faceIds]));
                let changed = false;
                const routes = current.routes.map((route) => {
                  const faceIds = matches.get(route.id) ?? [];
                  if (
                    route.faceIds.length === faceIds.length &&
                    route.faceIds.every((id, index) => id === faceIds[index])
                  )
                    return route;
                  changed = true;
                  return { ...route, faceIds };
                });
                return { ...result, routes: changed ? routes : current.routes };
              });
              setEvaluationKey(selectionKey);
              setError('');
            }
          },
          (error) => {
            if (!controller.signal.aborted) {
              setError(error instanceof Error ? error.message : 'Plan evaluation failed. Retry.');
              if (error instanceof ApiError && error.status === 409) {
                setResult(null);
                void apiJson<PlanningStudyJob>(`${path}/${job.id}`, {
                  headers: headers(orgId),
                  signal: controller.signal,
                }).then(
                  (next) => {
                    if (!controller.signal.aborted) accept(next);
                  },
                  () => undefined,
                );
              }
            }
          },
        )
        .finally(() => {
          if (!controller.signal.aborted) setEvaluating(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
      setEvaluating(false);
    };
  }, [compatible, job?.id, job?.status, selectionKey, resumeVersion]);

  async function run() {
    const input = currentRequest.current;
    if (!input || !input.faces.length || pending) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    cancelRequested.current = false;
    try {
      const next = await apiJson<PlanningStudyJob>(path, {
        method: 'POST',
        headers: headers(orgId),
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        accept(next);
        setEvaluationKey('');
        callback.current(next.id);
        if (cancelRequested.current)
          accept(
            await apiJson<PlanningStudyJob>(`${path}/${next.id}`, {
              method: 'DELETE',
              headers: headers(orgId),
            }),
          );
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setError(error instanceof Error ? error.message : 'The study could not start. Try again.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function cancel() {
    if (busy) {
      cancelRequested.current = true;
      return;
    }
    if (!job || (job.status !== 'queued' && job.status !== 'running')) return;
    try {
      accept(
        await apiJson<PlanningStudyJob>(`${path}/${job.id}`, {
          method: 'DELETE',
          headers: headers(orgId),
        }),
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not cancel. Retry.');
    }
  }
  async function retry() {
    if (job && !compatible) {
      await run();
      return;
    }
    if (!job) {
      if (controls.studyId) setResumeVersion((n) => n + 1);
      else await run();
      return;
    }
    if (job.status === 'failed' || job.status === 'cancelled') {
      setBusy(true);
      setError('');
      try {
        const next = await apiJson<PlanningStudyJob>(`${path}/${job.id}/retry`, {
          method: 'POST',
          headers: headers(orgId),
        });
        accept(next);
        callback.current(next.id);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Could not retry the study.');
      } finally {
        setBusy(false);
      }
    } else setResumeVersion((n) => n + 1);
  }
  return {
    readiness,
    readinessError,
    checkingReadiness,
    retryReadiness: () => setResumeVersion((n) => n + 1),
    job,
    result: compatible ? result : null,
    stale: Boolean(job && !compatible),
    pending,
    evaluating,
    error,
    run,
    cancel,
    retry,
    canRun: Boolean(request?.faces.length),
    selectionCurrent: selectionKey === evaluationKey,
  };
}
export type JourneyStudy = ReturnType<typeof usePlanningStudy>;
