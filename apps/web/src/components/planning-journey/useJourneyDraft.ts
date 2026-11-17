'use client';

import { useEffect, useRef, useState } from 'react';
import { loadAgencyDraft, saveAgencyDraft, type AgencyDraft } from '../../lib/agency-draft';
import { hasRecoverableTabWork } from '../../lib/agency-home';
import { planningDays, PLANNING_CURRENCIES } from '../../lib/agency-planning';
import { ApiError } from '../../lib/api';
import type { PlanningAgentTurnResult } from '@abonten/contracts/planning-agent';
import { findMarket } from '../../lib/markets';
import {
  createPlanningDraft,
  getPlanningDraft,
  updatePlanningDraft,
  type SavedAgencyPlanningDraft,
} from '../../lib/planning-drafts-api';
import {
  loadPlanningWorkSession,
  planningDraftSignature,
  savePlanningWorkSession,
  type PlanningWorkSession,
} from '../../lib/planning-work-session';

function blankDraft(country: string, currency: string): AgencyDraft {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 1);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 28);
  return {
    version: 1,
    window: {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    },
    country: findMarket(country)?.code ?? '',
    query: '',
    format: '',
    budget: '',
    currency: PLANNING_CURRENCIES.some((code) => code === currency) ? currency : 'NGN',
    faces: [],
  };
}

export function useJourneyDraft({
  orgId,
  userId,
  country,
  currency,
  draftId,
  newPlan,
}: {
  orgId: string;
  userId: string;
  country: string;
  currency: string;
  draftId: string | null;
  newPlan: boolean;
}) {
  const [initial] = useState(() => blankDraft(country, currency));
  const [draft, setDraft] = useState(initial);
  const [replacementVersion, setReplacementVersion] = useState(0);
  const [meta, setMeta] = useState<PlanningWorkSession | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [resumeAttempt, setResumeAttempt] = useState(0);
  const [replacement, setReplacement] = useState<{ record?: SavedAgencyPlanningDraft } | null>(
    null,
  );
  const [tabSaved, setTabSaved] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>(
    'idle',
  );
  const saving = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function applyDraft(
    record?: SavedAgencyPlanningDraft,
    local?: AgencyDraft | null,
    session?: PlanningWorkSession | null,
  ) {
    const next = record?.draft ?? local ?? initial;
    setReplacementVersion((version) => version + 1);
    setDraft(next);
    setMeta(
      record
        ? {
            recordId: record.id,
            revision: record.revision,
            clientRequestId: crypto.randomUUID(),
            name: record.name,
            savedSignature: planningDraftSignature(record.draft),
          }
        : (session ?? {
            clientRequestId: crypto.randomUUID(),
            name: '',
            initialSignature: planningDraftSignature(initial),
          }),
    );
    setStatus('ready');
    setSaveState('idle');
  }

  useEffect(() => {
    const controller = new AbortController();
    const local = loadAgencyDraft(userId, orgId);
    const session = loadPlanningWorkSession(userId, orgId);
    const recoverable = hasRecoverableTabWork(local, session);
    setStatus('loading');
    if (draftId) {
      void getPlanningDraft(orgId, draftId, controller.signal).then(
        (record) => {
          if (controller.signal.aborted) return;
          if (
            recoverable &&
            local &&
            (session?.pendingCreate ||
              session?.recordId !== draftId ||
              planningDraftSignature(local) !== planningDraftSignature(record.draft))
          ) {
            applyDraft(undefined, local, session);
            setReplacement({ record });
          } else applyDraft(record);
        },
        () => {
          if (!controller.signal.aborted) setStatus('error');
        },
      );
    } else if (newPlan && recoverable) {
      applyDraft(undefined, local, session);
      setReplacement({});
    } else applyDraft(undefined, newPlan ? null : local, newPlan ? null : session);
    return () => controller.abort();
    // The route remounts the workspace when the draft target changes.
  }, [orgId, userId, draftId, newPlan, resumeAttempt]);

  useEffect(() => {
    if (status !== 'ready' || !meta) return;
    const localSaved = saveAgencyDraft(userId, orgId, draft);
    const sessionSaved = savePlanningWorkSession(userId, orgId, meta);
    setTabSaved(localSaved && sessionSaved);
  }, [draft, meta, status, userId, orgId]);

  async function save(name: string, asNew = false) {
    if (
      saving.current ||
      !meta ||
      status !== 'ready' ||
      !name.trim() ||
      planningDays(draft.window) === null
    )
      return false;
    saving.current = true;
    setSaveState('saving');
    const pending = meta.pendingCreate;
    const requestId = pending
      ? meta.clientRequestId
      : asNew
        ? crypto.randomUUID()
        : meta.clientRequestId;
    const existing = !pending && !asNew && meta.recordId && meta.revision;
    const desired = { name: name.trim(), draft };
    const snapshot = (!existing && meta.pendingCreate) || desired;
    let resolvedCreate: SavedAgencyPlanningDraft | null = null;
    if (!existing) {
      const pending = {
        ...meta,
        clientRequestId: requestId,
        name: meta.recordId ? meta.name : snapshot.name,
        pendingCreate: snapshot,
      };
      savePlanningWorkSession(userId, orgId, pending);
      setMeta(pending);
    }
    try {
      let record = existing
        ? await updatePlanningDraft(orgId, meta.recordId!, { ...snapshot, revision: existing })
        : await createPlanningDraft(orgId, { ...snapshot, clientRequestId: requestId });
      if (!mounted.current) return false;
      if (!existing) {
        resolvedCreate = record;
        const resolved = {
          recordId: record.id,
          revision: record.revision,
          clientRequestId: requestId,
          name: record.name,
          savedSignature: planningDraftSignature(record.draft),
        };
        // A lost create response is resolved before any later edits are patched.
        // Keep the resolved association even if that patch fails or the tab closes.
        savePlanningWorkSession(userId, orgId, resolved);
        setMeta(resolved);
        if (
          record.name !== desired.name ||
          planningDraftSignature(record.draft) !== planningDraftSignature(desired.draft)
        ) {
          record = await updatePlanningDraft(orgId, record.id, {
            ...desired,
            revision: record.revision,
          });
          if (!mounted.current) return false;
        }
      }
      setMeta({
        recordId: record.id,
        revision: record.revision,
        clientRequestId: requestId,
        name: record.name,
        savedSignature: planningDraftSignature(record.draft),
      });
      setSaveState('saved');
      return true;
    } catch (error) {
      if (!mounted.current) return false;
      if (
        !existing &&
        !resolvedCreate &&
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        setMeta((current) =>
          current
            ? {
                ...current,
                pendingCreate: undefined,
                clientRequestId: crypto.randomUUID(),
              }
            : current,
        );
      }
      setSaveState(
        (existing || resolvedCreate) && error instanceof ApiError && error.status === 409
          ? 'conflict'
          : 'error',
      );
      return false;
    } finally {
      saving.current = false;
    }
  }

  async function openLatest() {
    if (!meta?.recordId || saving.current) return;
    saving.current = true;
    setSaveState('saving');
    try {
      const record = await getPlanningDraft(orgId, meta.recordId);
      if (mounted.current) {
        setReplacement({ record });
        setSaveState('conflict');
      }
    } catch {
      if (mounted.current) setSaveState('error');
    } finally {
      saving.current = false;
    }
  }

  return {
    draft,
    replacementVersion,
    setDraft,
    meta,
    status,
    tabSaved,
    saveState,
    replacement,
    retry: () => setResumeAttempt((attempt) => attempt + 1),
    save,
    openLatest,
    acceptAgent: (result: PlanningAgentTurnResult) => {
      setDraft(result.draft);
      if (result.savedDraft) {
        const record = result.savedDraft;
        setMeta({
          recordId: record.id,
          revision: record.revision,
          name: result.draftName,
          clientRequestId: crypto.randomUUID(),
          savedSignature: planningDraftSignature(record.draft),
        });
        setSaveState(
          planningDraftSignature(result.draft) === planningDraftSignature(record.draft)
            ? 'saved'
            : 'idle',
        );
      } else if (result.draftName) {
        setMeta((current) => (current ? { ...current, name: result.draftName } : current));
      }
    },
    dismissSave: () => setSaveState('idle'),
    resolveReplacement: (replace: boolean) => {
      if (replace && replacement) applyDraft(replacement.record);
      setReplacement(null);
    },
  };
}
