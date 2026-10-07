'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Building2,
  ArrowLeftRight,
  Home,
  Save,
  ChevronDown,
  ClipboardList,
  Layers,
  Loader2,
  LogOut,
  Map,
  MapPin,
  Moon,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useTheme } from '../ThemeProvider';
import { LanguageSwitcher, useLocale } from '../LocaleProvider';
import { AccountLoading, AccountRecovery } from '../account/WorkspaceFrame';
import { workspaceAccessState } from '../../lib/account-session-recovery';
import { SUPPORTED_MARKETS, findMarket, marketLabel } from '../../lib/markets';
import { ApiError } from '../../lib/api';
import {
  draftFaceEligibility,
  loadAgencyDraft,
  saveAgencyDraft,
  summarizeDraftBudget,
  MAX_DRAFT_FACES,
  type AgencyDraftFace,
  type AgencyDraft,
} from '../../lib/agency-draft';
import {
  getAgencySite as getBoard,
  searchAgencySites as searchBoards,
  type AgencyMarketplaceSite as MarketplaceBoard,
} from '../../lib/agency-api';
import {
  applicableFaceCurrencies,
  estimateFaceCost,
  planningDays,
  selectionDistances,
  type FaceCostEstimate,
  type PlanningAvailability,
  type PlanningWindow,
} from '../../lib/agency-planning';
import type { SiteDetail } from '../../lib/sites-api';
import { buildPlannerSelection } from '../../lib/planner-selection';
import { AgencyMap } from './AgencyMap';
import { BoardDetail, money } from './BoardDetail';
import { AgencyPlanner } from './AgencyPlanner';
import { prettyFormat } from '../sites/sites-ui';
import { getSiteOptions } from '../../lib/agency-api';
import { agencyEvidenceText } from '../../lib/agency-evidence-locale';
import { parseAmount } from '../../lib/number-format';
import { confirmUnsavedNavigation, useUnsavedNavigation } from '../../lib/unsaved-navigation';
import { displayNumber } from '../../lib/locale-format';
import { displayUiText } from '../../lib/display-ui-text';
import {
  getPlanningDraft,
  createPlanningDraft,
  updatePlanningDraft,
  type SavedAgencyPlanningDraft,
} from '../../lib/planning-drafts-api';
import {
  loadPlanningWorkSession,
  savePlanningWorkSession,
  planningDraftSignature,
  orderPlanningFaces,
  type PlanningWorkSession,
} from '../../lib/planning-work-session';
import { PlanningDraftDialog } from './PlanningDraftDialog';
import { PlanningReplacementDialog } from './PlanningReplacementDialog';
import { AgencyCompare } from './AgencyCompare';
import './agency-compare.css';
import './agency.css';

export interface ShortlistFace {
  site: SiteDetail;
  faceId: string;
  pricingCurrency?: string;
}
interface OptionSnapshot {
  checkedAt: string;
  faces: Array<{ faceId: string; available: boolean | null }>;
  window: PlanningWindow;
}

export function AgencyDashboard() {
  const auth = useAuth();
  const { locale } = useLocale();
  const router = useRouter();
  const access = workspaceAccessState({
    ready: auth.ready,
    hasProfile: Boolean(auth.profile),
    hasActiveOrganization: Boolean(auth.activeOrganization),
    hasOrganizations: auth.organizations.length > 0,
    hasRecoveryError: auth.sessionRecoveryError,
  });
  useEffect(() => {
    if (access === 'sign-in') router.replace('/sign-in');
    else if (access === 'onboarding') router.replace('/onboarding');
  }, [access, router]);
  if (access === 'recovery')
    return (
      <AccountRecovery
        locale={locale}
        onRetry={auth.refreshAccount}
        onSignOut={async () => {
          await auth.signOut();
          router.replace('/sign-in');
        }}
      />
    );
  if (access !== 'ready' || !auth.activeOrganization) return <AccountLoading locale={locale} />;
  if (auth.activeOrganization.type !== 'agency' || !auth.capabilities.includes('MARKETPLACE_VIEW'))
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6">
        <div>
          <h1 className="text-2xl font-bold">
            {auth.activeOrganization.type !== 'agency'
              ? locale === 'fr'
                ? 'Choisissez un espace agence pour planifier'
                : 'Choose an agency workspace to plan'
              : locale === 'fr'
                ? 'Accès au marché requis'
                : 'Marketplace access required'}
          </h1>
          <button
            className="agency-secondary-button mt-4"
            onClick={() => router.push('/dashboard')}
          >
            {locale === 'fr' ? 'Retour à l’accueil' : 'Back to workspace home'}
          </button>
        </div>
      </div>
    );
  return <AgencyWorkspace key={`${auth.profile?.id}:${auth.activeOrganization.organizationId}`} />;
}

function AgencyWorkspace() {
  const {
    activeOrganization: org,
    profile,
    organizations,
    switchOrganization,
    signOut,
    capabilities,
  } = useAuth();
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const { locale } = useLocale();
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const orgId = org!.organizationId;
  const userId = profile!.id;
  const [window, setWindow] = useState<PlanningWindow>(() => {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 1);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 28);
    return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
  });
  const [country, setCountry] = useState(org?.country ?? '');
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState('');
  const [briefDerivedContext, setBriefDerivedContext] = useState(false);
  const [budget, setBudget] = useState('');
  const [currency, setCurrency] = useState(org?.defaultCurrency || 'NGN');
  const [boards, setBoards] = useState<MarketplaceBoard[]>([]);
  const [total, setTotal] = useState(0);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SiteDetail | null>(null);
  const [detailState, setDetailState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [faceId, setFaceId] = useState('');
  const preferredFaceRef = useRef<{ siteId: string; faceId: string } | null>(null);
  const [options, setOptions] = useState<Record<string, OptionSnapshot>>({});
  const [shortlist, setShortlist] = useState<ShortlistFace[]>([]);
  const shortlistSiteIds = [...new Set(shortlist.map((item) => item.site.id))].sort().join(',');
  const [panel, setPanel] = useState<'map' | 'inventory' | 'compare'>('map');
  const [plannerOpen, setPlannerOpen] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [actionError, setActionError] = useState('');
  const [recommending, setRecommending] = useState(false);
  const recommendationRef = useRef<AbortController | null>(null);
  const validWindow = planningDays(window) !== null;
  const canPlan = capabilities.includes('CAMPAIGN_CREATE');
  const [notice, setNotice] = useState('');
  const [draftReady, setDraftReady] = useState(false);
  const [restoringDraft, setRestoringDraft] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [unrestoredFaces, setUnrestoredFaces] = useState<AgencyDraftFace[]>([]);
  const [unavailableDraftFaces, setUnavailableDraftFaces] = useState<AgencyDraftFace[]>([]);
  const pendingDraftRef = useRef<AgencyDraftFace[]>([]);
  const draftFaceOrderRef = useRef<string[]>([]);
  const draftRestoreRef = useRef<AbortController | null>(null);
  const [draftNotice, setDraftNotice] = useState('');
  const [draftSaved, setDraftSaved] = useState(false);
  const initializedDraftRef = useRef(false);
  const lifecycleRef = useRef(true);
  useEffect(() => {
    lifecycleRef.current = true;
    return () => {
      lifecycleRef.current = false;
    };
  }, []);
  const initialSignatureRef = useRef(
    planningDraftSignature({
      version: 1,
      window,
      country,
      query,
      format,
      budget,
      currency,
      faces: [],
    }),
  );
  const [workMeta, setWorkMeta] = useState<PlanningWorkSession | null>(null);
  const [metaSaved, setMetaSaved] = useState(true);
  const [workEpoch, setWorkEpoch] = useState(0);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const savePendingRef = useRef(false);
  const saveSnapshotRef = useRef<{
    name: string;
    draft: AgencyDraft;
    clientRequestId: string;
  } | null>(null);
  const [planName, setPlanName] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveConflict, setSaveConflict] = useState(false);
  const [replayPending, setReplayPending] = useState(false);
  const [resumeState, setResumeState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [resumeRetry, setResumeRetry] = useState(0);
  const [replacement, setReplacement] = useState<{
    draft: AgencyDraft | null;
    record?: SavedAgencyPlanningDraft;
  } | null>(null);
  const comparisonReturnRef = useRef(false);
  const comparisonFocusRef = useRef<string | null>(null);
  const routeIntentRef = useRef<{ view: string; focus: string }>({ view: '', focus: '' });
  const setMeta = (meta: PlanningWorkSession) => {
    setWorkMeta(meta);
    setMetaSaved(savePlanningWorkSession(userId, orgId, meta));
  };
  const applyWork = (
    stored: AgencyDraft | null,
    record?: SavedAgencyPlanningDraft,
    newPlan = false,
  ) => {
    recommendationRef.current?.abort();
    draftRestoreRef.current?.abort();
    setRestoringDraft(false);
    setRecommending(false);
    pendingDraftRef.current = [];
    draftFaceOrderRef.current = [];
    setUnrestoredFaces([]);
    setUnavailableDraftFaces([]);
    saveSnapshotRef.current = null;
    setReplayPending(false);
    setShortlist([]);
    setOptions({});
    setSelectedId(null);
    setNotice('');
    setDraftNotice('');
    setWorkEpoch((epoch) => epoch + 1);
    if (stored) {
      setWindow(stored.window);
      setCountry(stored.country);
      setQuery(stored.query);
      setFormat(stored.format);
      setBudget(stored.budget);
      setBriefDerivedContext(stored.briefDerivedContext === true);
      setCurrency(stored.currency);
      pendingDraftRef.current = stored.faces;
      draftFaceOrderRef.current = stored.faces.map((ref) => ref.faceId);
      setUnrestoredFaces(stored.faces);
    }
    const meta: PlanningWorkSession = record
      ? {
          recordId: record.id,
          revision: record.revision,
          name: record.name,
          clientRequestId: crypto.randomUUID(),
          savedSignature: planningDraftSignature(record.draft),
        }
      : ((!newPlan ? loadPlanningWorkSession(userId, orgId) : null) ?? {
          name: '',
          clientRequestId: crypto.randomUUID(),
          initialSignature: initialSignatureRef.current,
        });
    setMeta(meta);
    setPlanName(meta.name);
    setDraftReady(true);
    setResumeState('ready');
    if (meta.pendingCreate) {
      saveSnapshotRef.current = { ...meta.pendingCreate, clientRequestId: meta.clientRequestId };
      setReplayPending(true);
      setPlanName(meta.pendingCreate.name);
    }
    if (stored && (stored.faces.length || stored.budget || stored.query || stored.format))
      setDraftNotice(
        'Draft restored. Board details are checked again; documents and chat are not saved.',
      );
  };

  useEffect(() => {
    if (initializedDraftRef.current) return;
    initializedDraftRef.current = true;
    const controller = new AbortController();
    const params = new URLSearchParams(globalThis.location.search);
    routeIntentRef.current = { view: params.get('view') ?? '', focus: params.get('focus') ?? '' };
    const stored = loadAgencyDraft(userId, orgId);
    const priorMeta = loadPlanningWorkSession(userId, orgId);
    const unsaved =
      !!stored &&
      (!!priorMeta?.pendingCreate ||
        planningDraftSignature(stored) !==
          (priorMeta?.savedSignature ?? priorMeta?.initialSignature));
    const target = params.get('draft');
    if (target) {
      setResumeState('loading');
      void getPlanningDraft(orgId, target, controller.signal).then(
        (record) => {
          if (controller.signal.aborted) return;
          if (
            unsaved &&
            (priorMeta?.recordId !== target ||
              planningDraftSignature(stored!) !== planningDraftSignature(record.draft))
          ) {
            setReplacement({ draft: record.draft, record });
            setResumeState('ready');
          } else applyWork(record.draft, record);
        },
        () => {
          if (!controller.signal.aborted) setResumeState('error');
        },
      );
    } else if (params.get('new') === '1') {
      if (unsaved) {
        setReplacement({ draft: null });
        setResumeState('ready');
      } else {
        setMeta({
          name: '',
          clientRequestId: crypto.randomUUID(),
          initialSignature: initialSignatureRef.current,
        });
        setDraftReady(true);
        setResumeState('ready');
      }
    } else applyWork(stored);
    return () => {
      controller.abort();
      initializedDraftRef.current = false;
    };
    // Route page keys this workspace by query; locale changes never reinitialize work.
  }, [orgId, userId, resumeRetry]);

  useEffect(() => {
    if (!draftReady) return;
    const intent = routeIntentRef.current;
    if (intent.view === 'compare') {
      setPanel('compare');
      setPlannerOpen(false);
    } else if (intent.view === 'inventory') {
      setPanel('inventory');
      setPlannerOpen(false);
    } else if (intent.view === 'shortlist') setPlannerOpen(true);
    if (intent.focus === 'flight') setFilterOpen(true);
    if (intent.focus === 'budget') setPlannerOpen(true);
    const timer = globalThis.setTimeout(() => {
      if (intent.focus === 'budget')
        document.querySelector<HTMLInputElement>('[data-testid="agency-planner"] input')?.focus();
      if (intent.focus === 'flight')
        document.querySelector<HTMLInputElement>('.agency-filters input[type="date"]')?.focus();
    }, 100);
    return () => globalThis.clearTimeout(timer);
  }, [draftReady]);

  useEffect(() => {
    if (!draftReady || !pendingDraftRef.current.length) return;
    const controller = new AbortController();
    draftRestoreRef.current = controller;
    const references = pendingDraftRef.current;
    const restoreWindow = { ...window };
    setRestoringDraft(true);
    void (async () => {
      const restored: ShortlistFace[] = [];
      const failed: AgencyDraftFace[] = [];
      const unavailable: AgencyDraftFace[] = [];
      const snapshots: Record<string, OptionSnapshot> = {};
      const sites = [...new Set(references.map((item) => item.siteId))];
      for (let start = 0; start < sites.length; start += 4) {
        if (controller.signal.aborted) return;
        await Promise.all(
          sites.slice(start, start + 4).map(async (id) => {
            const refs = references.filter((item) => item.siteId === id);
            try {
              // Stored IDs never restore cached rates, availability, names or coordinates.
              const [site, snapshot] = await Promise.all([
                getBoard(orgId, id, controller.signal),
                getSiteOptions(orgId, id, restoreWindow, controller.signal).catch(() => null),
              ]);
              if (controller.signal.aborted) return;
              if (snapshot) snapshots[id] = { ...snapshot, window: restoreWindow };
              for (const ref of refs) {
                const face = site.faces.find((item) => item.id === ref.faceId);
                if (!face || (!face.bookable && !site.isResearchReference)) {
                  unavailable.push(ref);
                  continue;
                }
                restored.push({ site, faceId: ref.faceId, pricingCurrency: ref.pricingCurrency });
              }
            } catch (error) {
              if (controller.signal.aborted) return;
              if (error instanceof ApiError && [403, 404].includes(error.status))
                unavailable.push(...refs);
              else failed.push(...refs);
            }
          }),
        );
      }
      if (controller.signal.aborted) return;
      const restoredById = new globalThis.Map(restored.map((item) => [item.faceId, item]));
      const ordered = references.flatMap((ref) => {
        const item = restoredById.get(ref.faceId);
        return item ? [item] : [];
      });
      setShortlist((current) =>
        orderPlanningFaces(
          [
            ...new globalThis.Map(
              [...current, ...ordered].map((item) => [item.faceId, item]),
            ).values(),
          ],
          draftFaceOrderRef.current,
        ),
      );
      setOptions((current) => ({ ...current, ...snapshots }));
      const unresolvedIds = new Set([...failed, ...unavailable].map((ref) => ref.faceId));
      const unresolved = references.filter((ref) => unresolvedIds.has(ref.faceId));
      pendingDraftRef.current = unresolved;
      setUnrestoredFaces(unresolved);
      setUnavailableDraftFaces(unavailable);
      setRestoringDraft(false);
    })();
    return () => controller.abort();
    // Retry loads unresolved identifiers using the current controls, while a
    // flight change is independently rechecked by the shortlist effect below.
  }, [draftReady, restoreAttempt, orgId, workEpoch]);

  useEffect(() => {
    if (!draftReady) return;
    setDraftSaved(
      saveAgencyDraft(userId, orgId, {
        version: 1,
        window,
        country,
        query,
        format,
        budget,
        currency,
        ...(briefDerivedContext ? { briefDerivedContext: true } : {}),
        faces: orderPlanningFaces(
          [
            ...shortlist.map((item) => ({
              siteId: item.site.id,
              faceId: item.faceId,
              ...(item.pricingCurrency ? { pricingCurrency: item.pricingCurrency } : {}),
            })),
            ...unrestoredFaces,
          ],
          draftFaceOrderRef.current,
        ),
      }),
    );
  }, [
    draftReady,
    userId,
    orgId,
    window,
    country,
    query,
    format,
    budget,
    currency,
    shortlist,
    unrestoredFaces,
    briefDerivedContext,
  ]);

  useEffect(() => {
    if (!validWindow) return;
    const controller = new AbortController();
    setLoadState('loading');
    const timer = globalThis.setTimeout(() => {
      void searchBoards(
        orgId,
        { country, search: query, format, ...window, page: 1, limit: 100 },
        controller.signal,
      ).then(
        (result) => {
          if (!controller.signal.aborted) {
            setBoards(result.items);
            setTotal(result.total);
            setLoadState('ready');
          }
        },
        () => {
          if (!controller.signal.aborted) setLoadState('error');
        },
      );
    }, 250);
    return () => {
      controller.abort();
      globalThis.clearTimeout(timer);
    };
  }, [orgId, country, query, format, window, validWindow, retry]);

  useEffect(() => {
    recommendationRef.current?.abort();
    setRecommending(false);
  }, [budget, currency, country, query, format]);

  // A new flight always rechecks availability and invalidates in-progress recommendations.
  useEffect(() => {
    recommendationRef.current?.abort();
    setRecommending(false);
    if (!validWindow || !shortlistSiteIds) return;
    const controller = new AbortController();
    for (const id of shortlistSiteIds.split(',')) {
      void Promise.all([
        getBoard(orgId, id, controller.signal),
        getSiteOptions(orgId, id, window, controller.signal),
      ]).then(
        ([site, snapshot]) => {
          if (!controller.signal.aborted) {
            setShortlist((current) =>
              current.map((item) => (item.site.id === id ? { ...item, site } : item)),
            );
            setOptions((current) => ({ ...current, [id]: { ...snapshot, window } }));
          }
        },
        () => {
          if (!controller.signal.aborted)
            setOptions((current) => {
              const next = { ...current };
              delete next[id];
              return next;
            });
        },
      );
    }
    return () => controller.abort();
  }, [orgId, window, validWindow, shortlistSiteIds]);

  useEffect(() => {
    if (!selectedId || !validWindow) return;
    const controller = new AbortController();
    setDetail(null);
    setDetailState('loading');
    setActionError('');
    void Promise.all([
      getBoard(orgId, selectedId, controller.signal),
      getSiteOptions(orgId, selectedId, window, controller.signal).catch(() => null),
    ]).then(
      ([site, snapshot]) => {
        if (!controller.signal.aborted) {
          setDetail(site);
          setShortlist((current) =>
            current.some((item) => item.site.id === site.id)
              ? current.map((item) => (item.site.id === site.id ? { ...item, site } : item))
              : current,
          );
          const preferred =
            preferredFaceRef.current?.siteId === site.id
              ? preferredFaceRef.current.faceId
              : undefined;
          setFaceId(
            site.faces.find(
              (face) => (face.bookable || site.isResearchReference) && face.id === preferred,
            )?.id ??
              site.faces.find((face) => face.bookable || site.isResearchReference)?.id ??
              '',
          );
          setDetailState('ready');
          setOptions((current) => {
            const next = { ...current };
            if (snapshot) next[selectedId] = { ...snapshot, window };
            else delete next[selectedId];
            return next;
          });
        }
      },
      () => {
        if (!controller.signal.aborted) {
          setDetailState('error');
          setOptions((current) => {
            const next = { ...current };
            delete next[selectedId];
            return next;
          });
        }
      },
    );
    return () => controller.abort();
  }, [orgId, selectedId, window, validWindow, retry]);

  useEffect(
    () => () => {
      recommendationRef.current?.abort();
    },
    [],
  );
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !document.querySelector('dialog[open]')
      ) {
        setSelectedId(null);
        setFilterOpen(false);
        setAccountOpen(false);
        if (comparisonReturnRef.current) {
          setPanel('compare');
          setPlannerOpen(false);
          comparisonReturnRef.current = false;
          globalThis.requestAnimationFrame(() => {
            if (comparisonFocusRef.current)
              document
                .querySelector<HTMLButtonElement>(
                  `[data-face-id="${comparisonFocusRef.current}"] button`,
                )
                ?.focus();
          });
        }
      }
    };
    globalThis.addEventListener('keydown', handle);
    return () => globalThis.removeEventListener('keydown', handle);
  }, []);

  const availability = useCallback(
    (siteId: string, id: string): PlanningAvailability => {
      const snapshot = options[siteId];
      const face = snapshot?.faces.find((item) => item.faceId === id);
      return {
        status:
          face?.available === true
            ? 'available'
            : face?.available === false
              ? 'unavailable'
              : 'unknown',
        window: snapshot?.window,
        checkedAt: snapshot?.checkedAt,
      };
    },
    [options],
  );
  const estimateFor = useCallback(
    (item: ShortlistFace): FaceCostEstimate => {
      const face = item.site.faces.find((candidate) => candidate.id === item.faceId);
      const currencies = face ? applicableFaceCurrencies(item.site, face, window) : [];
      return face
        ? estimateFaceCost(
            item.site,
            face,
            window,
            item.pricingCurrency ?? (currencies.length === 1 ? currencies[0] : currency),
            availability(item.site.id, face.id),
          )
        : {
            status: 'unavailable',
            siteId: item.site.id,
            faceId: item.faceId,
            reason: 'Face no longer available.',
          };
    },
    [window, availability, currency],
  );
  const estimates = useMemo(() => shortlist.map(estimateFor), [shortlist, estimateFor]);
  const budgetAmount = parseAmount(budget) ?? NaN;
  const validBudget =
    budget.trim() !== '' &&
    Number.isFinite(budgetAmount) &&
    budgetAmount > 0 &&
    budgetAmount <= 1e12;
  const summary = summarizeDraftBudget(
    estimates,
    unrestoredFaces,
    validBudget ? { amount: budgetAmount, currency } : undefined,
  );
  const selectedEstimate = detail && faceId ? estimateFor({ site: detail, faceId }) : null;
  const distances = useMemo(
    () => selectionDistances(shortlist.map((item) => item.site)),
    [shortlist],
  );
  const plannerSelection = useMemo(() => {
    const selection = buildPlannerSelection(shortlist, selectedId);
    return {
      ...selection,
      selectionTruncated: selection.selectionTruncated || unrestoredFaces.length > 0,
      omittedFaces: selection.omittedFaces + unrestoredFaces.length,
    };
  }, [shortlist, selectedId, unrestoredFaces]);
  const select = (id: string, preferredFaceId?: string) => {
    preferredFaceRef.current = preferredFaceId ? { siteId: id, faceId: preferredFaceId } : null;
    if (detail?.id === id) {
      setFaceId(
        detail.faces.find(
          (face) => (face.bookable || detail.isResearchReference) && face.id === preferredFaceId,
        )?.id ??
          detail.faces.find((face) => face.bookable || detail.isResearchReference)?.id ??
          '',
      );
    }
    setSelectedId(id);
    setPanel('map');
  };
  const add = () => {
    const face = detail?.faces.find((item) => item.id === faceId);
    if (
      !detail ||
      !faceId ||
      !canPlan ||
      restoringDraft ||
      !draftFaceEligibility(detail, face, window, availability(detail.id, faceId)).eligible
    )
      return;
    if (
      shortlist.length + unrestoredFaces.length >= MAX_DRAFT_FACES &&
      !unrestoredFaces.some((ref) => ref.faceId === faceId)
    ) {
      setNotice(
        t(
          'This draft holds up to 100 faces. Remove a face before adding another.',
          'Ce brouillon contient au maximum 100 faces. Retirez une face avant d’en ajouter une.',
        ),
      );
      return;
    }
    if (!draftFaceOrderRef.current.includes(faceId)) draftFaceOrderRef.current.push(faceId);
    pendingDraftRef.current = pendingDraftRef.current.filter((ref) => ref.faceId !== faceId);
    setUnrestoredFaces((refs) => refs.filter((ref) => ref.faceId !== faceId));
    setUnavailableDraftFaces((refs) => refs.filter((ref) => ref.faceId !== faceId));
    setShortlist((items) =>
      items.some((item) => item.faceId === faceId)
        ? items
        : orderPlanningFaces(
            [
              ...items,
              {
                site: detail,
                faceId,
                ...(selectedEstimate?.status === 'ready'
                  ? { pricingCurrency: selectedEstimate.currency }
                  : {}),
              },
            ],
            draftFaceOrderRef.current,
          ),
    );
    setNotice(t('Face added to your draft shortlist.', 'Face ajoutée à votre sélection.'));
  };
  const recommend = async () => {
    if (!canPlan || !validBudget || !validWindow || loadState !== 'ready' || restoringDraft) return;
    recommendationRef.current?.abort();
    const controller = new AbortController();
    recommendationRef.current = controller;
    setRecommending(true);
    setActionError('');
    const candidates: Array<{ item: ShortlistFace; cost: number }> = [];
    let failed = 0;
    try {
      // Bounded requests for the visible marketplace results; no private inventory or model output.
      for (let start = 0; start < boards.length; start += 4) {
        if (controller.signal.aborted) return;
        await Promise.all(
          boards.slice(start, start + 4).map(async (board) => {
            try {
              const [site, snapshot] = await Promise.all([
                getBoard(orgId, board.id, controller.signal),
                getSiteOptions(orgId, board.id, window, controller.signal),
              ]);
              if (controller.signal.aborted) return;
              setShortlist((current) =>
                current.some((item) => item.site.id === site.id)
                  ? current.map((item) => (item.site.id === site.id ? { ...item, site } : item))
                  : current,
              );
              setOptions((current) => ({ ...current, [site.id]: { ...snapshot, window } }));
              const priced = site.faces
                .filter(
                  (face) =>
                    face.bookable &&
                    snapshot.faces.some((option) => option.faceId === face.id && option.available),
                )
                .map((face) => ({
                  face,
                  estimate: estimateFaceCost(site, face, window, currency, {
                    status: 'available',
                    window,
                    checkedAt: snapshot.checkedAt,
                  }),
                }))
                .filter(
                  (
                    item,
                  ): item is typeof item & {
                    estimate: Extract<FaceCostEstimate, { status: 'ready' }>;
                  } => item.estimate.status === 'ready',
                )
                .sort((a, b) => a.estimate.amount - b.estimate.amount);
              if (priced[0])
                candidates.push({
                  item: { site, faceId: priced[0].face.id, pricingCurrency: currency },
                  cost: priced[0].estimate.amount,
                });
            } catch {
              if (!controller.signal.aborted) failed += 1;
            }
          }),
        );
      }
      if (controller.signal.aborted) return;
      if (boards.length > 0 && failed === boards.length) {
        setActionError(
          t(
            'Boards could not be checked. Your draft shortlist is preserved; retry when the connection recovers.',
            'Les panneaux n’ont pas pu être vérifiés. Votre sélection est conservée ; réessayez après reconnexion.',
          ),
        );
        return;
      }
      candidates.sort(
        (a, b) => a.cost - b.cost || a.item.site.name.localeCompare(b.item.site.name),
      );
      let remaining = budgetAmount;
      const proposal: ShortlistFace[] = [];
      for (const candidate of candidates)
        if (candidate.cost <= remaining) {
          proposal.push(candidate.item);
          remaining -= candidate.cost;
        }
      // Explicit action replaces the draft; a cancelled or stale request never does.
      draftFaceOrderRef.current = proposal.map((item) => item.faceId);
      setShortlist(proposal);
      pendingDraftRef.current = [];
      setUnrestoredFaces([]);
      setUnavailableDraftFaces([]);
      setPlannerOpen(true);
      setNotice(
        proposal.length
          ? t(
              `Shortlisted ${proposal.length} boards by lowest published media cost. ${failed ? `${failed} boards could not be checked.` : ''}`,
              `${displayNumber(proposal.length, locale, { maximumFractionDigits: 0 })} panneaux sélectionnés par coût média croissant.${failed ? ` ${displayNumber(failed, locale, { maximumFractionDigits: 0 })} panneaux n’ont pas pu être vérifiés.` : ''}`,
            )
          : t(
              'No checked faces fit this budget, currency and flight. Adjust the constraints.',
              'Aucune face vérifiée ne correspond au budget, à la devise et aux dates.',
            ),
      );
    } finally {
      if (!controller.signal.aborted) setRecommending(false);
    }
  };

  const switchTo = async (id: string) => {
    if (id === orgId || !confirmUnsavedNavigation()) return;
    setSwitching(true);
    setActionError('');
    try {
      await switchOrganization(id);
      router.replace('/dashboard');
    } catch {
      setActionError(
        t('Could not switch workspace. Try again.', 'Impossible de changer d’espace. Réessayez.'),
      );
    } finally {
      setSwitching(false);
    }
  };
  const clear = () => {
    recommendationRef.current?.abort();
    draftRestoreRef.current?.abort();
    setRestoringDraft(false);
    setRecommending(false);
    setShortlist([]);
    pendingDraftRef.current = [];
    draftFaceOrderRef.current = [];
    setUnrestoredFaces([]);
    setUnavailableDraftFaces([]);
    setDraftNotice('');
    setNotice(t('Draft shortlist cleared.', 'Sélection effacée.'));
  };
  const removeUnavailableSelections = () => {
    const missing = new Set(unavailableDraftFaces.map((ref) => ref.faceId));
    draftFaceOrderRef.current = draftFaceOrderRef.current.filter((id) => !missing.has(id));
    pendingDraftRef.current = pendingDraftRef.current.filter((ref) => !missing.has(ref.faceId));
    setUnrestoredFaces((refs) => refs.filter((ref) => !missing.has(ref.faceId)));
    setUnavailableDraftFaces([]);
  };
  const removeSelection = (id: string) => {
    draftFaceOrderRef.current = draftFaceOrderRef.current.filter((face) => face !== id);
    pendingDraftRef.current = pendingDraftRef.current.filter((ref) => ref.faceId !== id);
    setShortlist((items) => items.filter((item) => item.faceId !== id));
    setUnrestoredFaces((refs) => refs.filter((ref) => ref.faceId !== id));
    setUnavailableDraftFaces((refs) => refs.filter((ref) => ref.faceId !== id));
  };
  const currentDraft: AgencyDraft = {
    version: 1,
    window,
    country,
    query,
    format,
    budget,
    currency,
    ...(briefDerivedContext ? { briefDerivedContext: true } : {}),
    faces: orderPlanningFaces(
      [
        ...shortlist.map((item) => ({
          siteId: item.site.id,
          faceId: item.faceId,
          ...(item.pricingCurrency ? { pricingCurrency: item.pricingCurrency } : {}),
        })),
        ...unrestoredFaces,
      ],
      draftFaceOrderRef.current,
    ),
  };
  const currentSignature = planningDraftSignature(currentDraft);
  const hasAccountSave = !!workMeta?.recordId;
  const hasSavedChanges =
    hasAccountSave &&
    (currentSignature !== workMeta?.savedSignature || planName.trim() !== workMeta?.name);
  useUnsavedNavigation(
    saveBusy,
    t(
      'A plan save is still pending. Leave this page? You can retry the same save from this tab.',
      'L’enregistrement est encore en cours. Quitter cette page ? Vous pouvez réessayer ce même enregistrement depuis cet onglet.',
    ),
  );
  const saveWork = async (asNew = false) => {
    if (savePendingRef.current || !canPlan || !draftReady) return;
    if (!planName.trim() || planName.trim().length > 80) {
      setSaveError('name');
      return;
    }
    if (!validWindow) {
      setSaveError('dates');
      return;
    }
    savePendingRef.current = true;
    setSaveBusy(true);
    setSaveError('');
    setSaveConflict(false);
    const meta: PlanningWorkSession = asNew
      ? {
          name: planName.trim(),
          clientRequestId: crypto.randomUUID(),
          initialSignature: initialSignatureRef.current,
        }
      : (workMeta ?? {
          name: planName.trim(),
          clientRequestId: crypto.randomUUID(),
          initialSignature: initialSignatureRef.current,
        });
    if (asNew) {
      saveSnapshotRef.current = null;
      setReplayPending(false);
    }
    const snapshot = !meta.recordId
      ? (saveSnapshotRef.current ?? {
          name: planName.trim(),
          draft: currentDraft,
          clientRequestId: meta.clientRequestId,
        })
      : { name: planName.trim(), draft: currentDraft, clientRequestId: meta.clientRequestId };
    if (!meta.recordId) {
      saveSnapshotRef.current = snapshot;
      setMeta({
        ...meta,
        name: snapshot.name,
        pendingCreate: { name: snapshot.name, draft: snapshot.draft },
      });
    }
    try {
      const record = meta.recordId
        ? await updatePlanningDraft(orgId, meta.recordId, {
            name: snapshot.name,
            draft: snapshot.draft,
            revision: meta.revision!,
          })
        : await createPlanningDraft(orgId, {
            name: snapshot.name,
            draft: snapshot.draft,
            clientRequestId: snapshot.clientRequestId,
          });
      if (!lifecycleRef.current) return;
      const latest = loadPlanningWorkSession(userId, orgId);
      if (latest && latest.clientRequestId !== meta.clientRequestId) return;
      setMeta({
        recordId: record.id,
        revision: record.revision,
        name: record.name,
        clientRequestId: meta.clientRequestId,
        savedSignature: planningDraftSignature(record.draft),
      });
      setPlanName(record.name);
      saveSnapshotRef.current = null;
      setReplayPending(false);
      setSaveOpen(false);
      setNotice(
        t(
          'Planning draft saved to your account. Prices and availability will be checked when you resume.',
          'Brouillon de plan enregistré dans votre compte. Les prix et la disponibilité seront revérifiés à la reprise.',
        ),
      );
    } catch (error) {
      if (!lifecycleRef.current) return;
      if (error instanceof ApiError) {
        setSaveError(error.message);
        setSaveConflict(error.status === 409 && !!meta.recordId);
      } else setSaveError('connection');
      if (!meta.recordId) setReplayPending(!(error instanceof ApiError && error.status < 500));
      if (!meta.recordId && error instanceof ApiError && error.status < 500) {
        saveSnapshotRef.current = null;
        setMeta(meta);
      }
    } finally {
      savePendingRef.current = false;
      if (lifecycleRef.current) setSaveBusy(false);
    }
  };
  const openLatest = async () => {
    if (!workMeta?.recordId) return;
    setSaveBusy(true);
    try {
      const record = await getPlanningDraft(orgId, workMeta.recordId);
      if (lifecycleRef.current) {
        setReplacement({ draft: record.draft, record });
        setSaveOpen(false);
      }
    } catch (error) {
      if (lifecycleRef.current)
        setSaveError(error instanceof ApiError ? error.message : 'connection');
    } finally {
      if (lifecycleRef.current) setSaveBusy(false);
    }
  };
  const closeDetail = () => {
    setSelectedId(null);
    if (comparisonReturnRef.current) {
      setPanel('compare');
      setPlannerOpen(false);
      comparisonReturnRef.current = false;
      globalThis.requestAnimationFrame(() => {
        if (comparisonFocusRef.current)
          document
            .querySelector<HTMLButtonElement>(
              `[data-face-id="${comparisonFocusRef.current}"] button`,
            )
            ?.focus();
      });
    }
  };
  const saveProblem =
    saveError === 'name'
      ? t(
          'Choose a plan name of up to 80 characters.',
          'Choisissez un nom de plan de 80 caractères maximum.',
        )
      : saveError === 'dates'
        ? t(
            'Choose a valid flight before saving.',
            'Choisissez des dates valides avant d’enregistrer.',
          )
        : saveError === 'connection'
          ? t(
              'The save response did not arrive. Your work remains here; retry the same save.',
              'La réponse n’est pas arrivée. Votre travail reste ici ; réessayez ce même enregistrement.',
            )
          : displayUiText(saveError, locale);
  if (!draftReady && replacement)
    return (
      <div className="agency-work-loading">
        <h1>{t('Open planning workspace', 'Ouvrir le planificateur')}</h1>
        <PlanningReplacementDialog
          locale={locale}
          onContinue={() => {
            applyWork(replacement.draft, replacement.record, !replacement.record);
            setReplacement(null);
          }}
          onCancel={() => {
            setReplacement(null);
            router.replace('/dashboard');
          }}
        />
      </div>
    );
  if (!draftReady)
    return (
      <div className="agency-work-loading">
        <h1>{t('Open planning workspace', 'Ouvrir le planificateur')}</h1>
        {resumeState === 'loading' ? (
          <p role="status">
            <Loader2 className="animate-spin" />
            {t('Loading your saved controls…', 'Chargement de vos paramètres…')}
          </p>
        ) : (
          <div role="alert">
            <p>
              {t(
                'The saved plan could not be opened. Your existing tab work is untouched.',
                'Le plan enregistré n’a pas pu être ouvert. Votre travail dans cet onglet est conservé.',
              )}
            </p>
            <button
              className="agency-secondary-button"
              onClick={() => {
                initializedDraftRef.current = false;
                setResumeState('loading');
                setResumeRetry((value) => value + 1);
              }}
            >
              {t('Retry', 'Réessayer')}
            </button>
          </div>
        )}
        <button className="agency-secondary-button" onClick={() => router.push('/dashboard')}>
          {t('Back to workspace home', 'Retour à l’accueil')}
        </button>
      </div>
    );
  return (
    <div className="agency-workspace" data-selected={Boolean(selectedId)} data-panel={panel}>
      <header className="agency-toolbar">
        <Link className="agency-brand" href="/dashboard">
          <span>
            <Layers size={23} />
          </span>
          abonten
        </Link>
        <button
          className="agency-icon-button agency-home-link"
          onClick={() => {
            if (confirmUnsavedNavigation()) router.push('/dashboard');
          }}
          aria-label={t('Workspace home', 'Accueil agence')}
        >
          <Home size={18} />
        </button>
        <label className="agency-org">
          <span className="sr-only">{t('Active organization', 'Organisation active')}</span>
          <Building2 size={16} />
          <select
            value={orgId}
            disabled={switching || organizations.length < 2}
            onChange={(event) => void switchTo(event.target.value)}
          >
            {organizations.map((organization) => (
              <option value={organization.organizationId} key={organization.organizationId}>
                {organization.name}
              </option>
            ))}
          </select>
          <ChevronDown size={13} />
        </label>
        <label className="agency-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('Search locations or boards', 'Rechercher un lieu ou un panneau')}
            aria-label={t('Search locations or boards', 'Rechercher un lieu ou un panneau')}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label={t('Clear search', 'Effacer la recherche')}
            >
              <X size={14} />
            </button>
          )}
        </label>
        <label className="agency-market">
          <MapPin size={16} />
          <select
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            aria-label={t('Country', 'Pays')}
          >
            <option value="">{t('All markets', 'Tous les marchés')}</option>
            {[
              ...SUPPORTED_MARKETS.map((market) => market.name),
              ...(org?.country && !findMarket(org.country) ? [org.country] : []),
            ].map((item) => (
              <option key={item} value={item}>
                {marketLabel(item, locale)}
              </option>
            ))}
          </select>
        </label>
        <button
          className={`agency-toolbar-button ${filterOpen ? 'is-active' : ''}`}
          onClick={() => setFilterOpen(!filterOpen)}
          aria-label={t('Flight & filters', 'Dates et filtres')}
          aria-expanded={filterOpen}
        >
          <SlidersHorizontal size={16} />
          <span>{t('Flight & filters', 'Dates et filtres')}</span>
          {format && <span className="agency-filter-count">1</span>}
        </button>
        <div className="agency-desktop-language">
          <LanguageSwitcher />
        </div>
        <button
          className="agency-toolbar-button agency-save-control"
          disabled={!canPlan || !draftReady || saveBusy}
          onClick={() => {
            setSaveError('');
            setSaveConflict(false);
            setSaveOpen(true);
          }}
        >
          <Save size={17} />
          <span>{t('Save plan', 'Enregistrer')}</span>
        </button>
        <button
          className="agency-icon-button agency-theme-toggle"
          onClick={toggle}
          aria-label={t('Switch theme', 'Changer de thème')}
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button
          className="agency-icon-button agency-account-toggle"
          aria-label={t('Workspace options', 'Options de l’espace')}
          aria-expanded={accountOpen}
          onClick={() => setAccountOpen(!accountOpen)}
        >
          <Settings2 size={18} />
        </button>
        {accountOpen && (
          <div
            className="agency-account-menu agency-panel"
            aria-label={t('Workspace options', 'Options de l’espace')}
          >
            <div className="agency-menu-language">
              <LanguageSwitcher />
            </div>
            <button
              onClick={() => {
                if (confirmUnsavedNavigation()) router.push('/dashboard');
              }}
            >
              <Home size={17} />
              {t('Workspace home', 'Accueil agence')}
            </button>
            <button
              disabled={!canPlan || !draftReady || saveBusy}
              onClick={() => {
                setSaveError('');
                setSaveConflict(false);
                setSaveOpen(true);
                setAccountOpen(false);
              }}
            >
              <Save size={17} />
              {t('Save plan', 'Enregistrer le plan')}
            </button>
            <button
              onClick={() => {
                setPanel('compare');
                setPlannerOpen(false);
                setSelectedId(null);
                setAccountOpen(false);
              }}
            >
              <ArrowLeftRight size={17} />
              {t('Compare shortlist', 'Comparer la sélection')}
            </button>
            <button
              onClick={() => {
                if (confirmUnsavedNavigation()) router.push('/settings');
              }}
            >
              <Settings2 size={17} />
              {t('Settings', 'Réglages')}
            </button>
            <button onClick={toggle}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              {t('Switch theme', 'Changer de thème')}
            </button>
            <button
              onClick={() => {
                if (confirmUnsavedNavigation())
                  void signOut().then(() => router.replace('/sign-in'));
              }}
            >
              <LogOut size={17} />
              {t('Sign out', 'Déconnexion')}
            </button>
          </div>
        )}
      </header>
      <nav className="agency-rail" aria-label={t('Agency workspace', 'Espace agence')}>
        <button
          onClick={() => {
            if (confirmUnsavedNavigation()) router.push('/dashboard');
          }}
        >
          <Home size={21} />
          <span>{t('Home', 'Accueil')}</span>
        </button>
        <button className={panel === 'map' ? 'is-active' : ''} onClick={() => setPanel('map')}>
          <Map size={22} />
          <span>{t('Map', 'Carte')}</span>
        </button>
        <button
          className={panel === 'inventory' ? 'is-active' : ''}
          onClick={() => {
            setPanel(panel === 'inventory' ? 'map' : 'inventory');
            setSelectedId(null);
          }}
        >
          <Layers size={22} />
          <span>{t('Boards', 'Panneaux')}</span>
        </button>
        <button
          className={plannerOpen ? 'is-active' : ''}
          onClick={() => {
            setPlannerOpen(panel === 'compare' || !plannerOpen);
            setPanel('map');
            setSelectedId(null);
          }}
        >
          <ClipboardList size={22} />
          <span>{t('Shortlist', 'Sélection')}</span>
          {shortlist.length > 0 && (
            <b>{displayNumber(shortlist.length, locale, { maximumFractionDigits: 0 })}</b>
          )}
        </button>
        <span className="agency-rail-spacer" />
        <button
          className={panel === 'compare' ? 'is-active' : ''}
          onClick={() => {
            setPanel('compare');
            setPlannerOpen(false);
            setSelectedId(null);
          }}
        >
          <ArrowLeftRight size={21} />
          <span>{t('Compare', 'Comparer')}</span>
        </button>
        <button
          onClick={() => {
            if (confirmUnsavedNavigation()) router.push('/settings');
          }}
        >
          <Settings2 size={21} />
          <span>{t('Settings', 'Réglages')}</span>
        </button>
        <button
          onClick={() => {
            if (confirmUnsavedNavigation()) void signOut().then(() => router.replace('/sign-in'));
          }}
        >
          <LogOut size={21} />
          <span>{t('Sign out', 'Déconnexion')}</span>
        </button>
      </nav>
      <main className="agency-map-stage">
        <h1 className="sr-only">
          {t('Agency location intelligence', 'Intelligence géographique pour les agences')}
        </h1>
        <AgencyMap
          sites={validWindow ? boards : []}
          selectedId={selectedId}
          shortlistIds={[...new Set(shortlist.map((item) => item.site.id))]}
          onSelect={select}
          locale={locale}
        />
        <div className="agency-map-heading">
          <span>
            {loadState === 'loading'
              ? t('Loading listed boards…', 'Chargement des panneaux…')
              : `${displayNumber(boards.length, locale, { maximumFractionDigits: 0 })}${total > boards.length ? ` / ${displayNumber(total, locale, { maximumFractionDigits: 0 })}` : ''} ${t('listed boards', 'panneaux publiés')} · ${planningDays(window) == null ? '—' : displayNumber(planningDays(window)!, locale, { maximumFractionDigits: 0 })} ${t('day flight', 'jours')}`}
          </span>
        </div>
        {filterOpen && (
          <section
            className="agency-filters agency-panel"
            aria-label={t('Flight and filters', 'Dates et filtres')}
          >
            <div className="agency-panel-heading">
              <h2>{t('Flight & filters', 'Dates et filtres')}</h2>
              <button
                className="agency-icon-button"
                onClick={() => setFilterOpen(false)}
                aria-label={t('Close filters', 'Fermer les filtres')}
              >
                <X size={17} />
              </button>
            </div>
            <div className="agency-filter-fields">
              <label className="agency-field">
                <span>{t('Start date', 'Date de début')}</span>
                <input
                  type="date"
                  value={window.startDate}
                  onChange={(event) =>
                    setWindow((current) => ({ ...current, startDate: event.target.value }))
                  }
                />
              </label>
              <label className="agency-field">
                <span>{t('End date (exclusive)', 'Date de fin (exclusive)')}</span>
                <input
                  type="date"
                  value={window.endDate}
                  onChange={(event) =>
                    setWindow((current) => ({ ...current, endDate: event.target.value }))
                  }
                />
              </label>
              <label className="agency-field">
                <span>{t('Format', 'Format')}</span>
                <select value={format} onChange={(event) => setFormat(event.target.value)}>
                  <option value="">{t('All formats', 'Tous les formats')}</option>
                  {[
                    'static',
                    'digital_led',
                    '3d',
                    'tri_vision',
                    'mural',
                    'transit',
                    'street_furniture',
                  ].map((item) => (
                    <option key={item} value={item}>
                      {prettyFormat(item, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {t(
                  'End date excluded · no reservation.',
                  'Date de fin exclue · aucune réservation.',
                )}
              </p>
            </div>
          </section>
        )}
        {(!validWindow ||
          loadState === 'error' ||
          (loadState === 'ready' && boards.length === 0)) && (
          <div
            className="agency-map-notice agency-panel"
            role={!validWindow || loadState === 'error' ? 'alert' : 'status'}
          >
            <MapPin size={22} />
            <h2>
              {!validWindow
                ? t('Choose a valid flight', 'Choisissez des dates valides')
                : loadState === 'error'
                  ? t('Inventory could not be loaded', 'L’inventaire n’a pas pu être chargé')
                  : t('No matching listed boards', 'Aucun panneau correspondant')}
            </h2>
            <p>
              {!validWindow
                ? t(
                    'End date must be after the start date.',
                    'La date de fin doit être après le début.',
                  )
                : t(
                    'Adjust the market, search, format or flight window.',
                    'Modifiez le marché, la recherche, le format ou les dates.',
                  )}
            </p>
            <button
              className="agency-secondary-button"
              onClick={() => {
                if (loadState === 'error') setRetry((attempt) => attempt + 1);
                else {
                  setCountry('');
                  setQuery('');
                  setFormat('');
                  setFilterOpen(true);
                }
              }}
            >
              {loadState === 'error'
                ? t('Retry', 'Réessayer')
                : t('Adjust filters', 'Modifier les filtres')}
            </button>
          </div>
        )}
        {panel === 'inventory' && (
          <section className="agency-inventory agency-panel" aria-labelledby="inventory-heading">
            <div className="agency-panel-heading">
              <h2 id="inventory-heading">{t('Listed boards', 'Panneaux publiés')}</h2>
              <button
                className="agency-icon-button"
                onClick={() => setPanel('map')}
                aria-label={t('Close board list', 'Fermer la liste')}
              >
                <X size={18} />
              </button>
            </div>
            <div className="agency-inventory-list">
              {boards.map((board) => (
                <button key={board.id} onClick={() => select(board.id)}>
                  <span className="agency-board-symbol">
                    <MapPin size={19} />
                  </span>
                  <span>
                    <strong>
                      {board.name} {board.isDemo && <span className="agency-data-badge">DEMO</span>}
                    </strong>
                    <small>
                      {board.code} · {board.city} ·{' '}
                      {displayNumber(Number(board.faceCount), locale, { maximumFractionDigits: 0 })}{' '}
                      {t('faces', 'faces')}
                    </small>
                  </span>
                  <ChevronDown size={14} className="-rotate-90" />
                </button>
              ))}
              {total > boards.length && (
                <p>
                  {t(
                    'First 100 results shown. Narrow the filters to explore other boards.',
                    'Les 100 premiers résultats sont affichés. Affinez les filtres.',
                  )}
                </p>
              )}
            </div>
          </section>
        )}
        {selectedId && (detailState !== 'ready' || !detail) && (
          <section className="agency-board agency-panel agency-detail-state">
            <button
              className="agency-icon-button"
              onClick={closeDetail}
              aria-label={t('Close board details', 'Fermer les détails')}
            >
              <X size={18} />
            </button>
            {detailState === 'loading' ? (
              <p role="status">
                <Loader2 size={18} className="animate-spin" />
                {t('Loading board details…', 'Chargement des détails…')}
              </p>
            ) : (
              <div role="alert">
                <p>
                  {t(
                    'Board details unavailable. Your shortlist is preserved.',
                    'Détails indisponibles. Votre sélection est conservée.',
                  )}
                </p>
                <button
                  className="agency-secondary-button"
                  onClick={() => setRetry((attempt) => attempt + 1)}
                >
                  {t('Retry', 'Réessayer')}
                </button>
              </div>
            )}
          </section>
        )}
        {selectedId && detail && detailState === 'ready' && (
          <BoardDetail
            key={`${orgId}:${selectedId}:${window.startDate}:${window.endDate}`}
            site={detail}
            orgId={orgId}
            locale={locale}
            faceId={faceId}
            onFace={(id) => {
              preferredFaceRef.current = { siteId: detail.id, faceId: id };
              setFaceId(id);
            }}
            estimate={selectedEstimate}
            selected={shortlist.some((item) => item.faceId === faceId)}
            canPlan={canPlan && !restoringDraft}
            window={window}
            availability={availability(detail.id, faceId)}
            onRetryAvailability={() => setRetry((attempt) => attempt + 1)}
            onAdd={add}
            onClose={closeDetail}
          />
        )}
        {panel === 'compare' && (
          <div className="agency-comparison-container">
            {unrestoredFaces.length > 0 && (
              <div className="agency-compare-unresolved" role="status">
                <p>
                  {t(
                    'Some selected faces could not be loaded. This comparison is incomplete.',
                    'Certaines faces n’ont pas pu être chargées. Cette comparaison est incomplète.',
                  )}
                </p>
                <button
                  className="agency-secondary-button"
                  disabled={restoringDraft}
                  onClick={() => setRestoreAttempt((attempt) => attempt + 1)}
                >
                  {t('Retry selected faces', 'Recharger les faces choisies')}
                </button>
                {unavailableDraftFaces.length > 0 && (
                  <button
                    className="agency-secondary-button"
                    disabled={restoringDraft}
                    onClick={removeUnavailableSelections}
                  >
                    {t('Remove unavailable selections', 'Retirer les sélections indisponibles')}
                  </button>
                )}
              </div>
            )}
            <AgencyCompare
              unresolvedCount={unrestoredFaces.length}
              shortlist={shortlist}
              estimates={estimates}
              availabilityFor={availability}
              window={window}
              locale={locale}
              onOpen={(siteId, id) => {
                select(siteId, id);
                comparisonReturnRef.current = true;
                comparisonFocusRef.current = id;
              }}
              onRemove={removeSelection}
              onBrowse={() => {
                setPanel('inventory');
                setPlannerOpen(false);
              }}
              onBack={() => {
                setPanel('map');
                setPlannerOpen(true);
              }}
            />
          </div>
        )}
        {!plannerOpen && panel !== 'compare' && (
          <button
            className="agency-planner-launch"
            onClick={() => {
              setPlannerOpen(true);
              setPanel('map');
              setSelectedId(null);
            }}
          >
            <Sparkles size={20} />
            {t('Open planning assistant', 'Ouvrir l’assistant')}
          </button>
        )}
        <AgencyPlanner
          key={workEpoch}
          open={plannerOpen && panel !== 'compare'}
          orgId={orgId}
          locale={locale}
          canPlan={canPlan}
          window={window}
          budget={budget}
          onBudget={setBudget}
          contextMayContainBrief={briefDerivedContext}
          onBriefContext={() => setBriefDerivedContext(true)}
          currency={currency}
          onCurrency={setCurrency}
          shortlist={shortlist}
          plannerSelectionOmittedFaces={plannerSelection.omittedFaces}
          plannerContext={{
            filters: { country, search: query, format },
            selectedSiteIds: plannerSelection.selectedSiteIds,
            selectedFaceIds: plannerSelection.selectedFaceIds,
            faceCurrencies: plannerSelection.faceCurrencies,
            selectionTruncated: plannerSelection.selectionTruncated,
          }}
          estimates={estimates}
          summary={summary}
          distances={distances}
          onSelect={select}
          onRemove={removeSelection}
          onClear={clear}
          onClose={() => setPlannerOpen(false)}
          onRecommend={() => void recommend()}
          recommending={recommending}
          onCancelRecommendation={() => {
            recommendationRef.current?.abort();
            setRecommending(false);
          }}
          canRecommend={validBudget && validWindow && loadState === 'ready' && !restoringDraft}
          notice={[
            notice,
            draftNotice,
            unrestoredFaces.length > 0
              ? t(
                  `${unrestoredFaces.length} selected faces remain unresolved, including ${unavailableDraftFaces.length} unavailable selections. The full draft’s budget fit is unknown. Retry loading, or explicitly remove unavailable selections in Compare.`,
                  `${unrestoredFaces.length} faces choisies restent à vérifier, dont ${unavailableDraftFaces.length} sélections indisponibles. Le respect du budget global reste inconnu. Rechargez-les ou retirez explicitement les sélections indisponibles dans Comparer.`,
                )
              : '',
          ]
            .filter(Boolean)
            .map((value) => agencyEvidenceText(value, locale))
            .join(' ')}
        />
        <div className="agency-plan-bar">
          <ClipboardList size={21} />
          <strong>{t('Draft shortlist', 'Sélection provisoire')}</strong>
          <span>
            {shortlist.length + unrestoredFaces.length} {t('faces', 'faces')}
          </span>
          <span className="agency-bar-divider" />
          <b>
            {Object.entries(summary.totals).length
              ? Object.entries(summary.totals)
                  .map(([code, amount]) => money(amount, code, locale))
                  .join(' + ')
              : '—'}
          </b>
          <small>
            {shortlist.some(({ site }) => site.isDemo) && (
              <>{t('Includes DEMO costs', 'Comprend des coûts DEMO')} · </>
            )}
            {hasAccountSave
              ? hasSavedChanges
                ? t('Changes kept in this tab · ', 'Changements conservés dans cet onglet · ')
                : t('Saved to your account · ', 'Enregistré dans votre compte · ')
              : draftSaved
                ? t('Saved in this tab · ', 'Enregistré dans cet onglet · ')
                : t(
                    'Draft not saved in this tab · ',
                    'Brouillon non enregistré dans cet onglet · ',
                  )}
            {summary.remaining != null
              ? `${money(Math.abs(summary.remaining), currency, locale)} ${summary.remaining < 0 ? t('over budget', 'de dépassement') : t('remaining', 'restants')}`
              : t('Published media estimates', 'Estimations média publiées')}
          </small>
          <button
            className="agency-secondary-button"
            onClick={() => {
              setPanel('compare');
              setPlannerOpen(false);
              setSelectedId(null);
            }}
          >
            {t('Compare', 'Comparer')}
          </button>
          {unrestoredFaces.length > 0 && (
            <button
              className="agency-secondary-button"
              disabled={restoringDraft}
              onClick={() => setRestoreAttempt((attempt) => attempt + 1)}
            >
              {restoringDraft
                ? t('Checking draft…', 'Vérification…')
                : t('Retry draft loading', 'Recharger le brouillon')}
            </button>
          )}
          <button
            className="agency-secondary-button"
            onClick={() => {
              setPlannerOpen(true);
              setSelectedId(null);
            }}
          >
            {t('Review shortlist', 'Voir la sélection')}
          </button>
        </div>
        <div className="agency-mobile-tabs">
          <button
            onClick={() => {
              setPlannerOpen(false);
              setSelectedId(null);
              setPanel('map');
            }}
          >
            <Map size={18} />
            {t('Map', 'Carte')}
          </button>
          <button
            onClick={() => {
              setPanel('inventory');
              setPlannerOpen(false);
              setSelectedId(null);
            }}
          >
            <Layers size={18} />
            {t('Boards', 'Panneaux')}
          </button>
          <button
            onClick={() => {
              setPlannerOpen(true);
              setSelectedId(null);
              setPanel('map');
            }}
          >
            <Sparkles size={18} />
            {t('Planner', 'Planifier')}
          </button>
        </div>
        {actionError && (
          <p className="agency-toast" role="alert">
            {agencyEvidenceText(actionError, locale)}
            <button
              onClick={() => setActionError('')}
              aria-label={t('Dismiss error', 'Fermer l’erreur')}
            >
              <X size={15} />
            </button>
          </p>
        )}
        {hasAccountSave && (
          <div className="agency-working-title" title={planName}>
            {planName}
            {hasSavedChanges && (
              <span> · {t('Unsaved changes', 'Changements non enregistrés')}</span>
            )}
          </div>
        )}
        {!metaSaved && (
          <div className="agency-storage-warning" role="alert">
            {t(
              'This browser cannot preserve save retries across reloads. Keep this page open until saving completes; your account’s saved plans remain available.',
              'Ce navigateur ne peut pas conserver les nouvelles tentatives après rechargement. Gardez cette page ouverte jusqu’à la fin ; les plans enregistrés dans votre compte restent disponibles.',
            )}
          </div>
        )}
        {saveOpen && (
          <PlanningDraftDialog
            name={planName}
            onName={setPlanName}
            onSubmit={() => void saveWork()}
            onClose={() => setSaveOpen(false)}
            busy={saveBusy}
            error={saveProblem}
            conflict={saveConflict}
            replayPending={replayPending}
            onSaveAsNew={() => void saveWork(true)}
            onOpenLatest={() => void openLatest()}
            locale={locale}
          />
        )}
        {replacement && (
          <PlanningReplacementDialog
            locale={locale}
            onContinue={() => {
              applyWork(replacement.draft, replacement.record, !replacement.record);
              setReplacement(null);
            }}
            onCancel={() => {
              setReplacement(null);
              if (!draftReady) router.replace('/dashboard');
            }}
          />
        )}
        <p className="sr-only" role="status" aria-live="polite">
          {agencyEvidenceText(notice, locale)}
        </p>
      </main>
    </div>
  );
}
