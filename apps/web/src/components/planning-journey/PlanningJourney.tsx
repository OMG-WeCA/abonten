'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftRight,
  Check,
  ClipboardList,
  Home,
  Layers,
  LogOut,
  Map as MapIcon,
  MapPin,
  Moon,
  Save,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  MessageSquare,
  Sun,
} from 'lucide-react';
import { AccountLoading, AccountRecovery } from '../account/WorkspaceFrame';
import { useAuth, type OrganizationSummary } from '../auth/AuthProvider';
import { useLocale } from '../LocaleProvider';
import { useTheme } from '../ThemeProvider';
import { AgencyMap, type AgencyMapSite } from '../agency/AgencyMap';
import { PlanningDraftDialog } from '../agency/PlanningDraftDialog';
import { PlanningReplacementDialog } from '../agency/PlanningReplacementDialog';
import { workspaceAccessState } from '../../lib/account-session-recovery';
import { hasRecoverableTabWork } from '../../lib/agency-home';
import {
  draftFaceEligibility,
  MAX_DRAFT_FACES,
  summarizeDraftBudget,
  type AgencyDraftFace,
} from '../../lib/agency-draft';
import {
  applicableFaceCurrencies,
  estimateFaceCost,
  planningCoordinate,
  planningDays,
  planningLastDay,
  planningExclusiveEnd,
} from '../../lib/agency-planning';
import { displayNumber } from '../../lib/locale-format';
import { displayUiText } from '../../lib/display-ui-text';
import { findMarket, marketLabel, SUPPORTED_MARKETS } from '../../lib/markets';
import { formatMoney, parseAmount } from '../../lib/number-format';
import { confirmUnsavedNavigation, useUnsavedNavigation } from '../../lib/unsaved-navigation';
import type { PlanningModelControls } from '@abonten/contracts/planning-draft';
import type { SiteDetail, SiteFace } from '../../lib/sites-api';
import { prettyFormat } from '../sites/sites-ui';
import {
  BoardInventory,
  JourneyPanel,
  RateFacts,
  SelectedBoard,
  ShortlistFaces,
  type JourneyFaceFacts,
  type JourneyLocale,
} from './JourneyPanels';
import {
  JourneyFaceEvidence,
  JourneyModel,
  JourneyDayparts,
  type JourneyDaypart,
  type JourneyRoute,
} from './JourneyModel';
import { DEFAULT_MODEL_CONTROLS, usePlanningStudy } from './usePlanningStudy';
import { STUDY_DAYPARTS } from './planningStudyBasis';
import { JourneyAlternatives } from './JourneyAlternatives';
import { JourneyBrief } from './JourneyBrief';
import { JourneyAssistant } from './JourneyAssistant';
import { useJourneyDraft } from './useJourneyDraft';
import { useJourneyBoardFacts, useJourneyInventory } from './useJourneyInventory';
import './planning-journey.css';

interface JourneyIntent {
  draftId: string | null;
  newPlan: boolean;
  view: string | null;
  focus: string | null;
}

type View = 'map' | 'boards' | 'face' | 'compare' | 'review';
const FORMATS = [
  'static',
  'digital_led',
  '3d',
  'tri_vision',
  'mural',
  'transit',
  'street_furniture',
];
const DEFAULT_AUDIENCE = {
  objective: 'reach' as const,
  targetAudience: '',
  minimumOpportunities: '4',
};

function coordinates(site?: { latitude: unknown; longitude: unknown } | null) {
  const latitude = planningCoordinate(site?.latitude, 'latitude');
  const longitude = planningCoordinate(site?.longitude, 'longitude');
  return latitude !== null && longitude !== null ? { latitude, longitude } : null;
}

function JourneyGate({ children }: { children: ReactNode }) {
  return (
    <div className="journey-gate">
      <section>{children}</section>
    </div>
  );
}

export function PlanningJourney({ intent }: { intent: JourneyIntent }) {
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
  if (access !== 'ready' || !auth.activeOrganization || !auth.profile)
    return <AccountLoading locale={locale} />;
  if (
    auth.activeOrganization.type !== 'agency' ||
    !auth.capabilities.includes('MARKETPLACE_VIEW')
  ) {
    return (
      <JourneyGate>
        <h1>{locale === 'fr' ? 'Accès agence requis' : 'Agency planning access required'}</h1>
        <Link className="journey-button" href="/dashboard">
          {locale === 'fr' ? 'Retour à l’accueil' : 'Back to workspace home'}
        </Link>
      </JourneyGate>
    );
  }
  return (
    <Workspace
      key={`${auth.profile.id}:${auth.activeOrganization.organizationId}`}
      org={auth.activeOrganization}
      userId={auth.profile.id}
      locale={locale}
      intent={intent}
    />
  );
}

function Workspace({
  org,
  userId,
  locale,
  intent,
}: {
  org: OrganizationSummary;
  userId: string;
  locale: JourneyLocale;
  intent: JourneyIntent;
}) {
  const router = useRouter();
  const auth = useAuth();
  const { theme, toggle } = useTheme();
  const language = useLocale();
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const orgId = org.organizationId;
  const canPlan = auth.capabilities.includes('CAMPAIGN_CREATE');
  const work = useJourneyDraft({
    orgId,
    userId,
    country: org.country,
    currency: org.defaultCurrency,
    draftId: intent.draftId,
    newPlan: intent.newPlan,
  });
  const { draft, setDraft } = work;
  const [view, setView] = useState<View>(
    intent.view === 'inventory'
      ? 'boards'
      : intent.view === 'compare'
        ? 'compare'
        : intent.view === 'review'
          ? 'review'
          : 'map',
  );
  const stageRef = useRef<HTMLElement>(null);
  const [reviewFocus, setReviewFocus] = useState(0);
  const [assistant, setAssistant] = useState(
    intent.newPlan || intent.focus === 'budget' || intent.view === 'shortlist',
  );
  const [chatOpen, setChatOpen] = useState(intent.view === 'assistant');
  const [campaignFocus, setCampaignFocus] = useState(0);
  const [filters, setFilters] = useState(intent.focus === 'flight');
  const [selection, setSelection] = useState<{ siteId: string; faceId?: string } | null>(null);
  const [studySiteId, setStudySiteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [focusVersion, setFocusVersion] = useState(0);
  const [savingDialog, setSavingDialog] = useState(false);
  const [planName, setPlanName] = useState('');
  const [saveAsNew, setSaveAsNew] = useState(false);
  const [actionError, setActionError] = useState('');
  const [switching, setSwitching] = useState(false);
  const [priceChoices, setPriceChoices] = useState<Record<string, string>>({});
  const [thresholdEdit, setThresholdEdit] = useState<string | null>(null);
  const country = findMarket(draft.country)?.code ?? draft.country;
  const market = findMarket(country);
  const inventory = useJourneyInventory(orgId, country, draft.query, draft.format, page);
  const facts = useJourneyBoardFacts(
    orgId,
    [...(selection ? [selection.siteId] : []), ...draft.faces.map((face) => face.siteId)],
    draft.window,
  );
  const site = selection ? facts.details[selection.siteId]?.value : undefined;
  const studySite = studySiteId ? facts.details[studySiteId]?.value : undefined;
  const analysis = Boolean(studySiteId && selection?.siteId === studySiteId);
  const face =
    site?.faces.find((item) => item.id === selection?.faceId) ??
    site?.faces.find((item) => item.bookable) ??
    site?.faces[0];
  const flightDays = planningDays(draft.window);
  const audience = draft.audiencePlan ?? DEFAULT_AUDIENCE;
  const threshold = thresholdEdit ?? audience.minimumOpportunities;

  function currencyFor(site: SiteDetail, face: SiteFace, requested?: string) {
    const currencies = applicableFaceCurrencies(site, face, draft.window);
    return (
      requested ??
      (currencies.includes(draft.currency) || currencies.length !== 1
        ? draft.currency
        : currencies[0])
    );
  }
  function factsFor(ref: AgencyDraftFace): JourneyFaceFacts {
    const detail = facts.details[ref.siteId]?.value;
    const item = detail?.faces.find((candidate) => candidate.id === ref.faceId);
    const available = facts.availability(ref.siteId, ref.faceId);
    const estimate =
      detail && item
        ? estimateFaceCost(
            detail,
            item,
            draft.window,
            currencyFor(detail, item, ref.pricingCurrency),
            available,
          )
        : undefined;
    return {
      ref,
      site: detail,
      face: item,
      estimate,
      availability: available,
      error: Boolean(facts.details[ref.siteId]?.error),
      availabilityFailed: facts.availabilityFailed(ref.siteId),
    };
  }
  const shortlist = draft.faces.map(factsFor);
  const digitalRefs = shortlist
    .filter((item) => item.site?.format === 'digital_led' && item.face?.spotsPerLoop)
    .map((item) => item.ref.faceId)
    .join(',');
  const selectedRef = face ? draft.faces.find((ref) => ref.faceId === face.id) : undefined;
  const selectedFacts =
    site && face
      ? factsFor({
          siteId: site.id,
          faceId: face.id,
          pricingCurrency: priceChoices[face.id] ?? selectedRef?.pricingCurrency,
        })
      : undefined;
  const selectedAvailability = selectedFacts?.availability ?? { status: 'unknown' };
  const eligibility = site
    ? draftFaceEligibility(site, face, draft.window, selectedAvailability)
    : null;
  const budgetAmount = parseAmount(draft.budget);
  const validBudget = budgetAmount !== null && budgetAmount > 0 && budgetAmount <= 1e12;
  const budgetSummary = summarizeDraftBudget(
    shortlist.flatMap(({ estimate, site }) =>
      estimate && !site?.isDemo && !site?.isResearchReference ? [estimate] : [],
    ),
    shortlist.flatMap(({ estimate, site, ref }) =>
      !estimate || site?.isDemo || site?.isResearchReference ? [ref] : [],
    ),
    validBudget ? { amount: budgetAmount, currency: draft.currency } : undefined,
  );
  const totals = Object.entries(budgetSummary.totals).map(([currency, total]) =>
    formatMoney(total, currency, locale),
  );
  const fullyChecked =
    budgetSummary.selectedCount > 0 &&
    budgetSummary.unpricedCount === 0 &&
    budgetSummary.uncheckedCount === 0;
  const modelControls = draft.modelControls ?? DEFAULT_MODEL_CONTROLS;
  const includedPeriods = (draft.planning?.strategy.dayparts ?? STUDY_DAYPARTS).map(
    (period) => period.id,
  );
  const savedDaypart = modelControls.daypart ?? 'weekday_morning';
  const daypart = includedPeriods.includes(savedDaypart)
    ? savedDaypart
    : ((STUDY_DAYPARTS.find((period) => includedPeriods.includes(period.id))?.id as
        JourneyDaypart | undefined) ?? savedDaypart);
  function setDaypart(value: JourneyDaypart) {
    setDraft((current) => ({
      ...current,
      modelControls: { ...(current.modelControls ?? DEFAULT_MODEL_CONTROLS), daypart: value },
    }));
  }
  const allCandidates = [
    ...new Map(
      [
        ...draft.faces,
        ...Object.values(facts.details).flatMap(({ value }) => {
          if (!value || findMarket(value.country)?.code !== country) return [];
          const point = coordinates(value);
          const center =
            modelControls.center ??
            (market ? { latitude: market.center[1], longitude: market.center[0] } : null);
          if (
            !point ||
            !center ||
            Math.abs(point.latitude - center.latitude) * 111.195 >
              (modelControls.radiusKm * 5) / 3 ||
            Math.abs(point.longitude - center.longitude) *
              111.195 *
              Math.cos((point.latitude * Math.PI) / 180) >
              (modelControls.radiusKm * 5) / 3
          )
            return [];
          return value.faces
            .filter((face) => face.bookable)
            .map((face) => ({ siteId: value.id, faceId: face.id }));
        }),
      ].map((face) => [face.faceId, { siteId: face.siteId, faceId: face.faceId }]),
    ).values(),
  ];
  const candidates = allCandidates.slice(0, MAX_DRAFT_FACES);
  const allocationScope = JSON.stringify([
    candidates.map((face) => face.faceId).sort(),
    digitalRefs,
  ]);
  useEffect(() => {
    const ids = new Set(candidates.map((face) => face.faceId));
    const digitalIds = digitalRefs ? digitalRefs.split(',') : [];
    setDraft((current) => {
      const controls = current.modelControls ?? DEFAULT_MODEL_CONTROLS;
      const existing = controls.digitalAllocations ?? [];
      const retained = existing.filter((row) => ids.has(row.faceId));
      const missing = digitalIds.filter((faceId) => !retained.some((row) => row.faceId === faceId));
      if (retained.length === existing.length && !missing.length) return current;
      return {
        ...current,
        modelControls: {
          ...controls,
          digitalAllocations: [
            ...retained,
            ...missing.map((faceId) => ({ faceId, advertiserSpotsPerLoop: 1 })),
          ],
        },
      };
    });
  }, [allocationScope]);
  const study = usePlanningStudy({
    orgId,
    draft,
    candidates,
    minimumOpportunities: threshold,
    onStudyId: (studyId) => {
      setDraft((current) => ({
        ...current,
        modelControls: { ...(current.modelControls ?? DEFAULT_MODEL_CONTROLS), studyId },
      }));
    },
  });
  const routes = useMemo<JourneyRoute[]>(() => {
    const records = study.result?.routes.filter((route) => route.daypartId === daypart) ?? [];
    const total = records.reduce((sum, route) => sum + route.demandWeight, 0);
    return records.map((route) => ({
      id: route.id,
      points: route.points,
      weightShare: total ? route.demandWeight / total : 0,
    }));
  }, [study.result?.routes, daypart]);
  function setModelControls(next: PlanningModelControls) {
    const center =
      next.center ??
      (market ? { latitude: market.center[1], longitude: market.center[0] } : undefined);
    setDraft((current) => ({
      ...current,
      modelControls: next,
      ...(current.planning
        ? {
            planning: {
              ...current.planning,
              targetGroup: { ...current.planning.targetGroup, criteria: next.target },
              strategy: {
                ...current.planning.strategy,
                geography: center ? { center, radiusKm: next.radiusKm } : undefined,
              },
            },
          }
        : {}),
    }));
  }
  function analyzeBoard() {
    if (!selection || !canPlan) return;
    setStudySiteId(selection.siteId);
    if (!draft.planning && !modelControls.center && site && !study.job) {
      const center = coordinates(site);
      if (center) setModelControls({ ...modelControls, center });
    }
  }
  function applyRecommendation(ids: string[]) {
    const records = study.result?.faces.filter((face) => ids.includes(face.faceId)) ?? [];
    setDraft((current) => ({
      ...current,
      faces: records.map((face) => ({
        siteId: face.siteId,
        faceId: face.faceId,
        pricingCurrency: face.currency,
      })),
    }));
  }
  const mapSites = useMemo(() => {
    const records = new Map<string, AgencyMapSite>();
    for (const record of [
      ...inventory.boards,
      ...Object.values(facts.details).flatMap(({ value }) =>
        value &&
        (value.id === selection?.siteId || draft.faces.some((ref) => ref.siteId === value.id)) &&
        (!country || findMarket(value.country)?.code === country)
          ? [value]
          : [],
      ),
    ]) {
      const point = coordinates(record);
      if (point)
        records.set(record.id, {
          id: record.id,
          name: record.name,
          ...point,
          isDemo: record.isDemo,
          isResearchReference: record.isResearchReference,
        });
    }
    return [...records.values()];
  }, [inventory.boards, facts.details, selection?.siteId, country, draft.faces]);
  const shortlistIds = useMemo(
    () => [...new Set(draft.faces.map((item) => item.siteId))],
    [draft.faces],
  );
  const selectionTitle =
    site?.name ??
    inventory.boards.find((board) => board.id === selection?.siteId)?.name ??
    t('Selected board', 'Panneau sélectionné');
  const status = selection
    ? facts.details[selection.siteId]?.error
      ? 'error'
      : site
        ? 'ready'
        : 'loading'
    : 'loading';
  const runStudy = Boolean(canPlan && studySite);
  const showStudyControls = view === 'face' && analysis;
  const unresolvedShortlist = shortlist.some((item) => !item.site || !item.face);
  const selectedCountLabel = `${displayNumber(draft.faces.length, locale)} ${draft.faces.length === 1 ? 'face' : 'faces'}`;
  const modelProps = {
    locale,
    study,
    omittedCandidates: allCandidates.length - candidates.length,
    controls: modelControls,
    onControls: setModelControls,
    daypart,
    minimumOpportunities: threshold,
    selectedFaceIds: draft.faces.map((face) => face.faceId),
    onApplyRecommendation: applyRecommendation,
    onEditBrief: openAudiences,
  };

  useUnsavedNavigation(
    work.saveState === 'saving' ||
      (work.status === 'ready' && !work.tabSaved && hasRecoverableTabWork(draft, work.meta)),
    work.saveState === 'saving'
      ? t(
          'A plan save is pending. Leave this page?',
          'Un enregistrement est en cours. Quitter cette page ?',
        )
      : t(
          'This tab could not keep your draft. Leave and lose your unsaved changes?',
          'Cet onglet n’a pas pu conserver votre brouillon. Quitter et perdre les modifications ?',
        ),
  );

  useEffect(() => {
    if (!reviewFocus || !window.matchMedia('(max-width: 899px)').matches) return;
    const heading = stageRef.current?.querySelector<HTMLElement>('[data-map-panel="review"] h2');
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }, [reviewFocus]);

  useEffect(() => {
    if (!assistant) return;
    const panel = stageRef.current?.querySelector('[data-map-panel="review"]');
    const field = panel?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      campaignFocus ? '[data-campaign-audiences] input' : 'textarea',
    );
    field?.focus({ preventScroll: true });
    if (campaignFocus)
      panel?.querySelector('[data-campaign-audiences]')?.scrollIntoView({ block: 'start' });
    else panel?.querySelector('.journey-panel-body')?.scrollTo({ top: 0 });
  }, [assistant, campaignFocus]);

  function select(siteId: string, faceId?: string) {
    setSelection({ siteId, faceId });
    if (studySiteId !== siteId) {
      setStudySiteId(null);
    }
    setFilters(false);
    setView('face');
    setActionError('');
  }
  function remove(faceId: string) {
    setDraft((current) => ({
      ...current,
      faces: current.faces.filter((item) => item.faceId !== faceId),
    }));
  }
  function addOrRemove() {
    if (!face || !site || !canPlan) return;
    if (selectedRef) {
      remove(face.id);
      return;
    }
    if (!eligibility?.eligible || draft.faces.length >= MAX_DRAFT_FACES) return;
    const pricingCurrency = currencyFor(site, face, priceChoices[face.id]);
    setDraft((current) => ({
      ...current,
      faces: [...current.faces, { siteId: site.id, faceId: face.id, pricingCurrency }],
      ...(site.format === 'digital_led'
        ? {
            modelControls: {
              ...(current.modelControls ?? DEFAULT_MODEL_CONTROLS),
              digitalAllocations: [
                ...(
                  (current.modelControls ?? DEFAULT_MODEL_CONTROLS).digitalAllocations ?? []
                ).filter((row) => row.faceId !== face.id),
                { faceId: face.id, advertiserSpotsPerLoop: 1 },
              ],
            },
          }
        : {}),
    }));
  }
  function switchView(next: View) {
    setView(next);
    if (next === 'review') setReviewFocus((version) => version + 1);
    setFilters(false);
    if (next === 'review' || next === 'compare') setAssistant(false);
    if (next !== 'face') setSelection(null);
  }
  function openCampaign() {
    switchView('map');
    setChatOpen(false);
    setCampaignFocus(0);
    setAssistant(true);
  }
  function openAudiences() {
    openCampaign();
    setCampaignFocus((version) => version + 1);
  }
  function openSavedPlan(id: string) {
    if (id === work.meta?.recordId) void work.openLatest();
    else if (confirmUnsavedNavigation()) router.push(`/planner?draft=${encodeURIComponent(id)}`);
  }
  function openSave(asNew = false) {
    setSaveAsNew(asNew);
    if (!canPlan) return;
    if (flightDays === null) {
      setFilters(true);
      setActionError(
        t(
          'Set valid flight dates before saving the draft.',
          'Choisissez des dates de campagne valides avant d’enregistrer le brouillon.',
        ),
      );
      return;
    }
    if (thresholdEdit !== null) {
      switchView('review');
      setActionError(
        t(
          'Enter a positive whole-number frequency goal before saving.',
          'Saisissez un objectif de répétition entier positif avant d’enregistrer.',
        ),
      );
      return;
    }
    setPlanName(
      asNew
        ? `${work.meta?.name || t('Plan', 'Plan')} · ${t('alternative', 'variante')}`
        : (work.meta?.pendingCreate?.name ?? work.meta?.name ?? ''),
    );
    if (work.saveState !== 'conflict') work.dismissSave();
    setSavingDialog(true);
  }
  async function switchOrg(value: string) {
    if (value === orgId || !confirmUnsavedNavigation()) return;
    setSwitching(true);
    try {
      await auth.switchOrganization(value);
      router.replace('/dashboard');
    } catch {
      setActionError(
        t('Could not switch workspace. Try again.', 'Impossible de changer d’espace. Réessayez.'),
      );
    } finally {
      setSwitching(false);
    }
  }
  function setAudience(change: Partial<typeof audience>) {
    setDraft((current) => ({
      ...current,
      audiencePlan: { ...DEFAULT_AUDIENCE, ...current.audiencePlan, ...change },
      ...(current.planning
        ? {
            planning: {
              ...current.planning,
              strategy: {
                ...current.planning.strategy,
                ...(change.objective ? { objective: change.objective } : {}),
                ...(change.minimumOpportunities
                  ? {
                      minimumOpportunities: Math.min(
                        Number(change.minimumOpportunities),
                        Number.MAX_SAFE_INTEGER,
                      ),
                    }
                  : {}),
              },
            },
          }
        : {}),
    }));
  }
  function setThreshold(value: string) {
    const normalized = value.trim().replace(/^0+/, '');
    if (/^[1-9][0-9]*$/.test(normalized) && normalized.length <= 1000) {
      setThresholdEdit(null);
      setAudience({ minimumOpportunities: normalized });
    } else setThresholdEdit(value);
  }
  function setMarket(value: string) {
    setDraft((current) => {
      const controls = current.modelControls ?? DEFAULT_MODEL_CONTROLS;
      const resetTarget = (valueTarget: PlanningModelControls['target']) => {
        const parent = valueTarget.household?.parentsOfSchoolChildren;
        return {
          ...valueTarget,
          locations: [],
          ...(valueTarget.household
            ? {
                household: {
                  ...valueTarget.household,
                  ...(parent
                    ? {
                        parentsOfSchoolChildren: {
                          ...parent,
                          ...(parent.schoolLocation
                            ? { schoolLocation: { scope: 'study_area' as const } }
                            : {}),
                        },
                      }
                    : {}),
                },
              }
            : {}),
        };
      };
      const target = resetTarget(current.planning?.targetGroup.criteria ?? controls.target);
      return {
        ...current,
        country: value,
        ...(current.planning
          ? {
              planning: {
                ...current.planning,
                targetGroup: { ...current.planning.targetGroup, criteria: target },
                ...(current.planning.secondaryTargetGroup
                  ? {
                      secondaryTargetGroup: {
                        ...current.planning.secondaryTargetGroup,
                        criteria: resetTarget(current.planning.secondaryTargetGroup.criteria),
                      },
                    }
                  : {}),
                strategy: { ...current.planning.strategy, geography: undefined },
              },
            }
          : {}),
        modelControls: {
          ...controls,
          center: undefined,
          studyId: undefined,
          target,
          secondaryTarget: current.planning?.secondaryTargetGroup
            ? resetTarget(current.planning.secondaryTargetGroup.criteria)
            : undefined,
        },
        currency: !current.budget
          ? (findMarket(value)?.currency ?? current.currency)
          : current.currency,
      };
    });
    setSelection(null);
    setStudySiteId(null);
    setPage(1);
    if (view === 'face') setView('map');
  }

  if (work.status === 'loading') return <AccountLoading locale={locale} />;
  if (work.status === 'error')
    return (
      <JourneyGate>
        <h1>{t('This draft could not be opened', 'Impossible d’ouvrir ce brouillon')}</h1>
        <button type="button" className="journey-button" onClick={work.retry}>
          {t('Try again', 'Réessayer')}
        </button>
        <Link className="journey-button" href="/dashboard">
          {t('Back to workspace home', 'Retour à l’accueil')}
        </Link>
      </JourneyGate>
    );

  const nav = (
    label: string,
    icon: ReactNode,
    action: () => void,
    active = false,
    count?: number,
  ) => (
    <button
      type="button"
      className={`journey-nav-button${active ? ' is-active' : ''}`}
      aria-pressed={active || undefined}
      onClick={action}
    >
      {icon}
      <span>{label}</span>
      {Boolean(count) && <small>{count}</small>}
    </button>
  );
  const shortlistProps = {
    faces: shortlist,
    locale,
    t,
    onSelect: select,
    onRemove: remove,
    onRetry: facts.retry,
  };
  const briefInput = (
    <>
      <JourneyBrief
        key={work.replacementVersion}
        orgId={orgId}
        locale={locale}
        draft={draft}
        onChange={setDraft}
        onMarket={setMarket}
        minimumOpportunities={threshold}
        onMinimumOpportunities={setThreshold}
      />
    </>
  );
  return (
    <main className="planning-journey">
      <header className="journey-toolbar">
        <Link href="/dashboard" className="journey-logo" aria-label="Abonten">
          <Layers size={22} />
          abonten
        </Link>
        <Link
          href="/dashboard"
          className="journey-icon journey-toolbar-home"
          aria-label={t('Workspace home', 'Accueil')}
        >
          <Home size={17} />
        </Link>
        <label className="journey-organization">
          <span className="sr-only">{t('Active workspace', 'Espace actif')}</span>
          <select
            value={orgId}
            disabled={switching || auth.organizations.length < 2}
            onChange={(event) => void switchOrg(event.target.value)}
          >
            {auth.organizations.map((item) => (
              <option key={item.organizationId} value={item.organizationId}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="journey-search">
          <Search size={17} />
          <span className="sr-only">
            {t('Search locations or boards', 'Rechercher un lieu ou un panneau')}
          </span>
          <input
            type="search"
            maxLength={200}
            value={draft.query}
            placeholder={t('Search locations or boards', 'Rechercher un lieu ou un panneau')}
            onChange={(event) => {
              setDraft((current) => ({ ...current, query: event.target.value }));
              setPage(1);
              if (view !== 'boards') switchView('boards');
            }}
          />
        </label>
        <label className="journey-market">
          <MapPin size={17} />
          <span className="sr-only">{t('Market', 'Marché')}</span>
          <select value={country} onChange={(event) => setMarket(event.target.value)}>
            <option value="">{t('All markets', 'Tous les marchés')}</option>
            {country && !market && <option value={country}>{country}</option>}
            {SUPPORTED_MARKETS.map((item) => (
              <option key={item.code} value={item.code}>
                {item.labels[locale]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="journey-button journey-filter-button"
          aria-expanded={filters}
          onClick={() => setFilters((open) => !open)}
        >
          <SlidersHorizontal size={16} />
          <span>{t('Flight & filters', 'Dates et filtres')}</span>
        </button>
        <label className="journey-language journey-button">
          <span className="sr-only">{t('Language', 'Langue')}</span>
          <select
            value={locale}
            disabled={language.saving}
            onChange={(event) => {
              void language
                .setLocale(event.target.value === 'fr' ? 'fr' : 'en')
                .catch(() =>
                  setActionError(
                    t(
                      'Language changed here. Saving it to your account failed.',
                      'La langue a changé ici. L’enregistrement sur votre compte a échoué.',
                    ),
                  ),
                );
            }}
          >
            <option value="en">English</option>
            <option value="fr">Français</option>
          </select>
        </label>
        <button
          type="button"
          className="journey-button journey-toolbar-save"
          disabled={!canPlan}
          onClick={() => openSave()}
        >
          <Save size={16} />
          <span>{t('Save plan', 'Enregistrer')}</span>
        </button>
        <button
          type="button"
          className="journey-icon journey-theme"
          aria-label={
            theme === 'dark'
              ? t('Switch to light mode', 'Activer le thème clair')
              : t('Switch to dark mode', 'Activer le thème sombre')
          }
          onClick={toggle}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>
      <div className="journey-workspace">
        <nav
          className="journey-rail"
          aria-label={t('Planning workspace', 'Espace de planification')}
        >
          <div>
            {nav(t('Home', 'Accueil'), <Home size={20} />, () => {
              if (confirmUnsavedNavigation()) router.push('/dashboard');
            })}
            {nav(
              t('Map', 'Carte'),
              <MapIcon size={20} />,
              () => {
                switchView('map');
                setFocusVersion((version) => version + 1);
              },
              view === 'map' || view === 'face',
            )}
            {nav(
              t('Boards', 'Panneaux'),
              <Layers size={20} />,
              () => switchView(view === 'boards' ? 'map' : 'boards'),
              view === 'boards',
            )}
            {nav(
              t('Shortlist', 'Sélection'),
              <ClipboardList size={20} />,
              () => {
                switchView('map');
                setAssistant((open) => !open);
              },
              view === 'review' || assistant,
              draft.faces.length,
            )}
          </div>
          <div>
            {nav(
              t('Compare', 'Comparer'),
              <ArrowLeftRight size={20} />,
              () => switchView(view === 'compare' ? 'map' : 'compare'),
              view === 'compare',
            )}
            {nav(t('Settings', 'Paramètres'), <Settings2 size={20} />, () => {
              if (confirmUnsavedNavigation()) router.push('/settings');
            })}
            {nav(t('Sign out', 'Se déconnecter'), <LogOut size={20} />, () => {
              if (confirmUnsavedNavigation())
                void auth.signOut().then(() => router.replace('/sign-in'));
            })}
          </div>
        </nav>
        <section
          ref={stageRef}
          className={`journey-stage agency-map-stage${view === 'face' ? ' has-board-panel' : ''}${assistant || chatOpen ? ' has-assistant' : ''}${assistant ? ' has-campaign' : ''}${chatOpen ? ' has-chat' : ''}`}
          aria-label={t('Map workspace', 'Espace cartographique')}
        >
          <div className="journey-map">
            <AgencyMap
              sites={mapSites}
              selectedId={view === 'face' ? (selection?.siteId ?? null) : null}
              shortlistIds={shortlistIds}
              onSelect={select}
              locale={locale}
              focusVersion={focusVersion}
              center={market ? [market.center[1], market.center[0]] : undefined}
              routes={routes}
              showUntiled
              panelLayout={`${view}:${showStudyControls}:${assistant}:${routes.length}`}
            />
          </div>
          <div className="journey-map-meta" role="status">
            {inventory.status === 'loading'
              ? t('Loading inventory…', 'Chargement de l’inventaire…')
              : inventory.status === 'error'
                ? t('Inventory unavailable', 'Inventaire indisponible')
                : `${displayNumber(inventory.total, locale)} ${inventory.total === 1 ? t('listed board', 'panneau publié') : t('listed boards', 'panneaux publiés')}`}
            {flightDays !== null &&
              ` · ${t(`${flightDays}-day flight`, `Campagne de ${flightDays} j`)}`}
          </div>
          <div className="journey-open-actions">
            {!assistant && view !== 'review' && (
              <button type="button" className="journey-button" onClick={openCampaign}>
                <ClipboardList size={17} />
                {t('Campaign setup', 'Configuration de campagne')}
              </button>
            )}
            {!chatOpen && (
              <button
                type="button"
                className="journey-button"
                onClick={() => {
                  setAssistant(false);
                  setChatOpen(true);
                }}
              >
                <MessageSquare size={17} />
                {t('Assistant', 'Assistant')}
              </button>
            )}
          </div>
          {filters && (
            <div className="journey-filter-popover">
              <JourneyPanel
                title={t('Flight & filters', 'Dates et filtres')}
                placement="left"
                t={t}
                onClose={() => setFilters(false)}
              >
                <div className="journey-flight-fields">
                  <label className="journey-field">
                    <span>{t('First day', 'Premier jour')}</span>
                    <input
                      autoFocus={intent.focus === 'flight'}
                      type="date"
                      value={draft.window.startDate}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          window: { ...current.window, startDate: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="journey-field">
                    <span>{t('Last day', 'Dernier jour')}</span>
                    <input
                      type="date"
                      value={planningLastDay(draft.window.endDate)}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          window: {
                            ...current.window,
                            endDate: planningExclusiveEnd(event.target.value),
                          },
                        }))
                      }
                    />
                  </label>
                </div>
                {flightDays === null && (
                  <p className="journey-warning">
                    {t(
                      'Last day must be on or after the first day.',
                      'Le dernier jour doit suivre ou être le premier jour.',
                    )}
                  </p>
                )}
                <label className="journey-field">
                  <span>{t('Board format', 'Format du panneau')}</span>
                  <select
                    value={draft.format}
                    onChange={(event) => {
                      setDraft((current) => ({ ...current, format: event.target.value }));
                      setPage(1);
                    }}
                  >
                    <option value="">{t('All formats', 'Tous les formats')}</option>
                    {draft.format && !FORMATS.includes(draft.format) && (
                      <option value={draft.format}>{prettyFormat(draft.format, locale)}</option>
                    )}
                    {FORMATS.map((format) => (
                      <option key={format} value={format}>
                        {prettyFormat(format, locale)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="journey-primary journey-wide"
                  onClick={() => setFilters(false)}
                >
                  {t('Done', 'Terminé')}
                </button>
              </JourneyPanel>
            </div>
          )}
          {view === 'boards' && (
            <JourneyPanel
              title={t('Listed boards', 'Panneaux publiés')}
              placement="left"
              t={t}
              onClose={() => switchView('map')}
            >
              <BoardInventory
                boards={inventory.boards}
                locale={locale}
                status={inventory.status}
                page={page}
                pages={Math.ceil(inventory.total / inventory.pageSize)}
                onPage={setPage}
                onSelect={select}
                onRetry={inventory.retry}
                t={t}
              />
            </JourneyPanel>
          )}
          {view === 'face' && selection && (
            <JourneyPanel
              title={selectionTitle}
              placement="left"
              t={t}
              onClose={() => switchView('map')}
            >
              <SelectedBoard
                site={site}
                face={face}
                status={status}
                estimate={selectedFacts?.estimate}
                availability={selectedAvailability}
                selected={Boolean(selectedRef)}
                canAdd={Boolean(
                  canPlan && eligibility?.eligible && draft.faces.length < MAX_DRAFT_FACES,
                )}
                addReason={
                  !canPlan
                    ? t(
                        'Campaign planning access is required.',
                        'Un accès à la planification est requis.',
                      )
                    : draft.faces.length >= MAX_DRAFT_FACES
                      ? t(
                          'The shortlist has reached its face limit.',
                          'La sélection a atteint sa limite.',
                        )
                      : eligibility?.reason
                        ? displayUiText(eligibility.reason, locale)
                        : undefined
                }
                onFace={(faceId) => setSelection({ siteId: selection.siteId, faceId })}
                onToggle={addOrRemove}
                onRetry={() => facts.retry(selection.siteId)}
                availabilityFailed={facts.availabilityFailed(selection.siteId)}
                score={
                  <>
                    <JourneyDayparts
                      locale={locale}
                      daypart={daypart}
                      includedPeriods={includedPeriods}
                      onChange={setDaypart}
                    />
                    <JourneyFaceEvidence
                      locale={locale}
                      faceId={face?.id}
                      daypart={daypart}
                      result={study.result}
                    />
                    <button
                      type="button"
                      className="journey-button"
                      disabled={!canPlan}
                      onClick={analyzeBoard}
                    >
                      {t('Open analysis', 'Ouvrir l’analyse')}
                    </button>
                  </>
                }
                priceCurrencies={
                  site && face ? applicableFaceCurrencies(site, face, draft.window) : []
                }
                priceCurrency={
                  site && face
                    ? currencyFor(site, face, priceChoices[face.id] ?? selectedRef?.pricingCurrency)
                    : draft.currency
                }
                onPriceCurrency={(value) => {
                  if (face) {
                    setPriceChoices((current) => ({ ...current, [face.id]: value }));
                    if (selectedRef)
                      setDraft((current) => ({
                        ...current,
                        faces: current.faces.map((item) =>
                          item.faceId === face.id ? { ...item, pricingCurrency: value } : item,
                        ),
                      }));
                  }
                }}
                locale={locale}
                t={t}
              />
            </JourneyPanel>
          )}
          {runStudy && (
            <div className="journey-analysis" data-map-panel="analysis" hidden={!showStudyControls}>
              <JourneyModel
                {...modelProps}
                stage="map"
                boardId={studySite?.id}
                boardCenter={coordinates(studySite)}
              />
            </div>
          )}
          {assistant && (
            <JourneyPanel
              title={t('Campaign setup', 'Configuration de campagne')}
              icon={<Sparkles size={19} />}
              placement="review"
              t={t}
              onClose={() => setAssistant(false)}
            >
              {briefInput}
              <button
                type="button"
                className="journey-button journey-wide"
                onClick={() => switchView('review')}
              >
                {t('Review plan', 'Examiner le plan')}
              </button>
            </JourneyPanel>
          )}
          <div className="journey-chat-shell" hidden={!chatOpen}>
            <JourneyPanel
              title={t('Assistant', 'Assistant')}
              placement="right"
              t={t}
              onClose={() => setChatOpen(false)}
            >
              <JourneyAssistant
                orgId={orgId}
                locale={locale}
                draft={draft}
                draftName={work.meta?.name ?? ''}
                savedDraft={
                  work.meta?.recordId && work.meta.revision
                    ? { id: work.meta.recordId, revision: work.meta.revision }
                    : undefined
                }
                replacementVersion={work.replacementVersion}
                visible={chatOpen}
                savePending={work.saveState === 'saving' || Boolean(work.meta?.pendingCreate)}
                onApply={(result) => {
                  work.acceptAgent(result);
                  setThresholdEdit(null);
                }}
                minimumOpportunities={threshold}
                onOpenPlan={openSavedPlan}
                onEditCampaign={openCampaign}
                onRecoverSave={() => openSave()}
              />
            </JourneyPanel>
          </div>
          {view === 'compare' && (
            <JourneyPanel
              title={t('Compare shortlisted faces', 'Comparer les faces sélectionnées')}
              placement="review"
              t={t}
              onClose={() => switchView('map')}
            >
              <JourneyDayparts
                locale={locale}
                daypart={daypart}
                includedPeriods={includedPeriods}
                onChange={setDaypart}
              />
              <JourneyAlternatives
                orgId={orgId}
                locale={locale}
                draft={draft}
                currentName={work.meta?.name || t('Current plan', 'Plan actuel')}
                study={study}
                onOpenPlan={openSavedPlan}
                savedVersion={work.saveState === 'saved' ? work.meta?.revision : undefined}
              />
              {shortlist.length < 2 ? (
                <p className="journey-muted">
                  {t('Add two faces to compare them.', 'Ajoutez deux faces pour les comparer.')}
                </p>
              ) : (
                <div className="journey-compare-grid">
                  {shortlist.map((item) =>
                    item.site && item.face ? (
                      <article key={item.ref.faceId}>
                        <h3>
                          {item.site.name} · {item.face.faceLabel}
                        </h3>
                        <p className="journey-muted">
                          {prettyFormat(item.site.format, locale)} · {item.face.width} ×{' '}
                          {item.face.height} {item.face.units}
                        </p>
                        <JourneyFaceEvidence
                          locale={locale}
                          faceId={item.ref.faceId}
                          daypart={daypart}
                          result={study.result}
                        />
                        <RateFacts
                          estimate={item.estimate}
                          availability={item.availability}
                          onRetry={
                            item.availabilityFailed ? () => facts.retry(item.ref.siteId) : undefined
                          }
                          site={item.site}
                          locale={locale}
                          t={t}
                        />
                        <button
                          type="button"
                          className="journey-button"
                          onClick={() => select(item.ref.siteId, item.ref.faceId)}
                        >
                          {t('View board', 'Voir le panneau')}
                        </button>
                      </article>
                    ) : (
                      <article key={item.ref.faceId}>
                        <h3>{t('Saved face', 'Face enregistrée')}</h3>
                        <p className="journey-muted">
                          {item.error || item.site
                            ? t('Board facts unavailable.', 'Données du panneau indisponibles.')
                            : t('Loading board facts…', 'Chargement des données du panneau…')}
                        </p>
                      </article>
                    ),
                  )}
                </div>
              )}
            </JourneyPanel>
          )}
          {view === 'review' && (
            <JourneyPanel
              title={t('Review plan', 'Examiner le plan')}
              placement="review"
              t={t}
              onClose={() => switchView('map')}
              footer={
                <button
                  type="button"
                  className="journey-primary"
                  disabled={!canPlan}
                  onClick={() => openSave()}
                >
                  <Save size={16} />
                  {t('Save draft plan', 'Enregistrer le brouillon')}
                </button>
              }
            >
              <p className="journey-muted">
                {country ? `${marketLabel(country, locale)} · ` : ''}
                {selectedCountLabel}
                {flightDays !== null
                  ? ` · ${t(`${flightDays}-day flight`, `Campagne de ${flightDays} j`)}`
                  : ''}
              </p>
              <details className="journey-disclosure">
                <summary>{t('Campaign setup', 'Configuration de campagne')}</summary>
                {briefInput}
              </details>
              {draft.faces.length > 0 && (
                <p className="journey-muted">
                  {budgetSummary.fit === 'within'
                    ? t(
                        'Published flight estimates fit the budget.',
                        'Les estimations publiées respectent le budget.',
                      )
                    : budgetSummary.fit === 'over'
                      ? t(
                          'Published flight estimates exceed the budget.',
                          'Les estimations publiées dépassent le budget.',
                        )
                      : t(
                          'Budget fit remains unknown until all costs and availability are comparable.',
                          'Le respect du budget reste inconnu tant que les coûts et disponibilités ne sont pas comparables.',
                        )}
                </p>
              )}
              <ShortlistFaces {...shortlistProps} />
              {shortlist.some((item) => item.site?.format === 'digital_led') && (
                <fieldset className="space-y-3 text-xs">
                  <legend className="mb-2 font-semibold">
                    {t('Planned digital display', 'Diffusion numérique prévue')}
                  </legend>
                  {shortlist
                    .filter((item) => item.site?.format === 'digital_led' && item.face)
                    .map((item) => (
                      <label className="journey-field" key={item.ref.faceId}>
                        <span>
                          {item.site?.name} · {item.face?.faceLabel} ·{' '}
                          {t('Advertiser spots per loop', 'Spots de l’annonceur par boucle')}
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={item.face?.spotsPerLoop ?? 1000}
                          step={1}
                          disabled={!item.face?.spotsPerLoop}
                          value={
                            modelControls.digitalAllocations?.find(
                              (row) => row.faceId === item.ref.faceId,
                            )?.advertiserSpotsPerLoop ?? 1
                          }
                          onChange={(event) => {
                            const count = Number(event.target.value);
                            if (
                              Number.isInteger(count) &&
                              count >= 1 &&
                              count <= (item.face?.spotsPerLoop ?? 1000)
                            )
                              setModelControls({
                                ...modelControls,
                                digitalAllocations: [
                                  ...(modelControls.digitalAllocations ?? []).filter(
                                    (row) => row.faceId !== item.ref.faceId,
                                  ),
                                  { faceId: item.ref.faceId, advertiserSpotsPerLoop: count },
                                ],
                              });
                          }}
                        />
                        <small className="text-muted">
                          {item.face?.spotLengthSeconds} s / {item.face?.loopLengthSeconds} s ·{' '}
                          {t(
                            'Planned evenly spaced plays',
                            'Diffusions prévues à intervalles réguliers',
                          )}
                        </small>
                      </label>
                    ))}
                </fieldset>
              )}
              <div className="journey-review-model">
                {canPlan && !unresolvedShortlist ? (
                  <JourneyModel {...modelProps} stage="review" />
                ) : (
                  <>
                    <h3 className="journey-model-heading">Abonten Audience Model</h3>
                    <p className="journey-muted">
                      {canPlan
                        ? t(
                            'Check or remove unresolved faces before running audience analysis.',
                            'Vérifiez ou retirez les faces non résolues avant de lancer l’analyse d’audience.',
                          )
                        : t(
                            'Campaign planning access is required to run audience analysis.',
                            'Un accès à la planification est requis pour analyser l’audience.',
                          )}
                    </p>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="journey-button"
                  disabled={!canPlan}
                  onClick={() => openSave(true)}
                >
                  {t('Save as an alternative', 'Enregistrer une variante')}
                </button>
                <button
                  type="button"
                  className="journey-button"
                  onClick={() => switchView('compare')}
                >
                  {t('Compare saved alternatives', 'Comparer les variantes enregistrées')}
                </button>
              </div>
            </JourneyPanel>
          )}
          {work.saveState === 'saved' && (
            <div className="journey-save-toast" role="status">
              <Check size={18} />
              <div>
                <strong>{t('Draft saved', 'Brouillon enregistré')}</strong>
              </div>
              <button type="button" className="journey-text-button" onClick={work.dismissSave}>
                {t('Dismiss', 'Fermer')}
              </button>
            </div>
          )}
          {actionError && (
            <div className="journey-save-toast" role="alert">
              <p>{actionError}</p>
              <button
                type="button"
                className="journey-text-button"
                onClick={() => setActionError('')}
              >
                {t('Dismiss', 'Fermer')}
              </button>
            </div>
          )}
          <div
            className="journey-bottom"
            aria-label={t('Draft shortlist', 'Brouillon de sélection')}
          >
            <ClipboardList size={18} aria-hidden="true" />
            <strong>{t('Draft shortlist', 'Brouillon de sélection')}</strong>
            <span>{selectedCountLabel}</span>
            <span className="journey-bottom-cost">{totals.length ? totals.join(' · ') : '—'}</span>
            <small>
              {work.tabSaved
                ? t('Saved in this tab', 'Enregistré dans cet onglet')
                : t('Tab save unavailable', 'Enregistrement local indisponible')}
              {totals.length
                ? ` · ${fullyChecked ? t('Published media estimates', 'Estimations média publiées') : t('Partial media estimates', 'Estimations média partielles')}`
                : ''}
            </small>
            {study.pending && (
              <small role="status">
                {t('Study running', 'Étude en cours')} · {study.job?.progress.completed ?? 0}/
                {study.job?.progress.total ?? '…'}
              </small>
            )}
            <div className="journey-bottom-actions">
              {study.pending && (
                <button
                  type="button"
                  className="journey-button"
                  onClick={() => void study.cancel()}
                >
                  {t('Cancel study', 'Annuler l’étude')}
                </button>
              )}
              <button
                type="button"
                className="journey-button"
                disabled={draft.faces.length < 2}
                onClick={() => switchView('compare')}
              >
                {t('Compare', 'Comparer')}
              </button>
              <button type="button" className="journey-button" onClick={() => switchView('review')}>
                {t('Review shortlist', 'Examiner la sélection')}
              </button>
            </div>
          </div>
        </section>
      </div>
      {savingDialog && (
        <PlanningDraftDialog
          name={planName}
          onName={setPlanName}
          onSubmit={() => {
            void work.save(planName, saveAsNew).then((saved) => {
              if (saved) setSavingDialog(false);
            });
          }}
          onClose={() => setSavingDialog(false)}
          busy={work.saveState === 'saving'}
          error={
            work.saveState === 'error'
              ? t(
                  'The draft could not be saved. Try again.',
                  'Impossible d’enregistrer le brouillon. Réessayez.',
                )
              : ''
          }
          conflict={work.saveState === 'conflict'}
          onSaveAsNew={() => {
            void work.save(planName, true).then((saved) => {
              if (saved) setSavingDialog(false);
            });
          }}
          onOpenLatest={() => void work.openLatest()}
          locale={locale}
          replayPending={Boolean(work.meta?.pendingCreate)}
        />
      )}
      {work.replacement && (
        <PlanningReplacementDialog
          locale={locale}
          onContinue={() => {
            work.resolveReplacement(true);
            setSavingDialog(false);
            setSelection(null);
            setThresholdEdit(null);
            setStudySiteId(null);
            setPage(1);
          }}
          onCancel={() => work.resolveReplacement(false)}
        />
      )}
    </main>
  );
}
