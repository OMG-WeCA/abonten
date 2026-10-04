'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Building2,
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
import { AccountLoading, AccountRecovery } from '../account/WorkspaceFrame';
import { workspaceAccessState } from '../../lib/account-session-recovery';
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
  summarizeBudget,
  type FaceCostEstimate,
  type PlanningAvailability,
  type PlanningWindow,
} from '../../lib/agency-planning';
import type { SiteDetail } from '../../lib/sites-api';
import { buildPlannerSelection } from '../../lib/planner-selection';
import { AgencyMap } from './AgencyMap';
import { BoardDetail, money } from './BoardDetail';
import { AgencyPlanner } from './AgencyPlanner';
import { getSiteOptions } from '../../lib/agency-api';
import './agency.css';

export interface ShortlistFace {
  site: SiteDetail;
  faceId: string;
  pricingCurrency?: string;
}
interface OptionSnapshot {
  checkedAt: string;
  faces: Array<{ faceId: string; available: boolean }>;
  window: PlanningWindow;
}

export function AgencyDashboard() {
  const auth = useAuth();
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
        locale={auth.profile?.locale}
        onRetry={auth.refreshAccount}
        onSignOut={async () => {
          await auth.signOut();
          router.replace('/sign-in');
        }}
      />
    );
  if (access !== 'ready' || !auth.activeOrganization)
    return <AccountLoading locale={auth.profile?.locale} />;
  if (!auth.capabilities.includes('MARKETPLACE_VIEW'))
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6">
        <div>
          <h1 className="text-2xl font-bold">
            {auth.profile?.locale === 'fr'
              ? 'Accès au marché requis'
              : 'Marketplace access required'}
          </h1>
          <button className="agency-secondary-button mt-4" onClick={() => router.push('/settings')}>
            Settings
          </button>
        </div>
      </div>
    );
  return <AgencyWorkspace key={auth.activeOrganization.organizationId} />;
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
  const locale = profile?.locale === 'fr' ? 'fr' : 'en';
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const orgId = org!.organizationId;
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
  const [options, setOptions] = useState<Record<string, OptionSnapshot>>({});
  const [shortlist, setShortlist] = useState<ShortlistFace[]>([]);
  const shortlistSiteIds = [...new Set(shortlist.map((item) => item.site.id))].sort().join(',');
  const [panel, setPanel] = useState<'map' | 'inventory'>('map');
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
          setFaceId(site.faces.find((face) => face.bookable)?.id ?? '');
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
      if (event.key === 'Escape') {
        setSelectedId(null);
        setFilterOpen(false);
        setAccountOpen(false);
        setPanel('map');
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
        status: face ? (face.available ? 'available' : 'unavailable') : 'unknown',
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
  const budgetAmount = Number(budget);
  const validBudget =
    budget.trim() !== '' &&
    Number.isFinite(budgetAmount) &&
    budgetAmount > 0 &&
    budgetAmount <= 1e12;
  const summary = summarizeBudget(
    estimates,
    validBudget ? { amount: budgetAmount, currency } : undefined,
  );
  const selectedEstimate = detail && faceId ? estimateFor({ site: detail, faceId }) : null;
  const distances = useMemo(
    () => selectionDistances(shortlist.map((item) => item.site)),
    [shortlist],
  );
  const plannerSelection = useMemo(
    () => buildPlannerSelection(shortlist, selectedId),
    [shortlist, selectedId],
  );
  const select = (id: string) => {
    setSelectedId(id);
    setPanel('map');
  };
  const add = () => {
    if (
      !detail ||
      !faceId ||
      !canPlan ||
      selectedEstimate?.status !== 'ready' ||
      selectedEstimate.availability !== 'available'
    )
      return;
    setShortlist((items) =>
      items.some((item) => item.faceId === faceId)
        ? items
        : [...items, { site: detail, faceId, pricingCurrency: selectedEstimate.currency }],
    );
    setNotice(t('Face added to your draft shortlist.', 'Face ajoutée à votre sélection.'));
  };
  const recommend = async () => {
    if (!canPlan || !validBudget || !validWindow || loadState !== 'ready') return;
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
      setShortlist(proposal);
      setPlannerOpen(true);
      setNotice(
        proposal.length
          ? t(
              `Shortlisted ${proposal.length} boards by lowest published media cost. ${failed ? `${failed} boards could not be checked.` : ''}`,
              `${proposal.length} panneaux sélectionnés par coût média croissant.`,
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
    if (id === orgId) return;
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
    setRecommending(false);
    setShortlist([]);
    setNotice(t('Draft shortlist cleared.', 'Sélection effacée.'));
  };
  return (
    <div className="agency-workspace" data-selected={Boolean(selectedId)} data-panel={panel}>
      <header className="agency-toolbar">
        <Link className="agency-brand" href="/dashboard">
          <span>
            <Layers size={23} />
          </span>
          abonten
        </Link>
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
              'Nigeria',
              'Ghana',
              'Cameroon',
              ...(org?.country && !['Nigeria', 'Ghana', 'Cameroon'].includes(org.country)
                ? [org.country]
                : []),
            ].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <button
          className={`agency-toolbar-button ${filterOpen ? 'is-active' : ''}`}
          onClick={() => setFilterOpen(!filterOpen)}
          aria-expanded={filterOpen}
        >
          <SlidersHorizontal size={16} />
          <span>{t('Flight & filters', 'Dates et filtres')}</span>
          {format && <span className="agency-filter-count">1</span>}
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
            <button onClick={() => router.push('/settings')}>
              <Settings2 size={17} />
              {t('Settings', 'Réglages')}
            </button>
            <button onClick={toggle}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              {t('Switch theme', 'Changer de thème')}
            </button>
            <button onClick={() => void signOut().then(() => router.replace('/sign-in'))}>
              <LogOut size={17} />
              {t('Sign out', 'Déconnexion')}
            </button>
          </div>
        )}
      </header>
      <nav className="agency-rail" aria-label={t('Agency workspace', 'Espace agence')}>
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
            setPlannerOpen(!plannerOpen);
            setSelectedId(null);
          }}
        >
          <ClipboardList size={22} />
          <span>{t('Shortlist', 'Sélection')}</span>
          {shortlist.length > 0 && <b>{shortlist.length}</b>}
        </button>
        <span className="agency-rail-spacer" />
        <button onClick={() => router.push('/settings')}>
          <Settings2 size={21} />
          <span>{t('Settings', 'Réglages')}</span>
        </button>
        <button onClick={() => void signOut().then(() => router.replace('/sign-in'))}>
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
          <span className="agency-eyebrow">
            {t('LOCATION INTELLIGENCE', 'INTELLIGENCE GÉOGRAPHIQUE')}
          </span>
          <p>{t('Find your next vantage point.', 'Trouvez votre prochain point de vue.')}</p>
          <span>
            {loadState === 'loading'
              ? t('Loading listed boards…', 'Chargement des panneaux…')
              : `${boards.length}${total > boards.length ? ` / ${total}` : ''} ${t('listed boards', 'panneaux publiés')} · ${planningDays(window) ?? '—'} ${t('day flight', 'jours')}`}
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
                      {item.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {t(
                  'The final date is the first day outside the flight. Availability checks do not hold boards.',
                  'La date de fin est le premier jour hors campagne. Les contrôles ne réservent pas les panneaux.',
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
                    <strong>{board.name}</strong>
                    <small>
                      {board.code} · {board.city} · {board.faceCount} {t('faces', 'faces')}
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
              onClick={() => setSelectedId(null)}
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
            onFace={setFaceId}
            estimate={selectedEstimate}
            selected={shortlist.some((item) => item.faceId === faceId)}
            canPlan={canPlan}
            onAdd={add}
            onClose={() => setSelectedId(null)}
          />
        )}
        {!plannerOpen && (
          <button
            className="agency-planner-launch"
            onClick={() => {
              setPlannerOpen(true);
              setSelectedId(null);
            }}
          >
            <Sparkles size={20} />
            {t('Plan with Abonten', 'Planifier avec Abonten')}
          </button>
        )}
        <AgencyPlanner
          open={plannerOpen}
          orgId={orgId}
          locale={locale}
          canPlan={canPlan}
          window={window}
          budget={budget}
          onBudget={setBudget}
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
          onRemove={(id) => setShortlist((items) => items.filter((item) => item.faceId !== id))}
          onClear={clear}
          onClose={() => setPlannerOpen(false)}
          onRecommend={() => void recommend()}
          recommending={recommending}
          onCancelRecommendation={() => {
            recommendationRef.current?.abort();
            setRecommending(false);
          }}
          canRecommend={validBudget && validWindow && loadState === 'ready'}
          notice={notice}
        />
        <div className="agency-plan-bar">
          <ClipboardList size={21} />
          <strong>{t('Draft shortlist', 'Sélection provisoire')}</strong>
          <span>
            {shortlist.length} {t('faces', 'faces')}
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
            {summary.remaining != null
              ? `${money(Math.abs(summary.remaining), currency, locale)} ${summary.remaining < 0 ? t('over budget', 'de dépassement') : t('remaining', 'restants')}`
              : t('Published media estimates', 'Estimations média publiées')}
          </small>
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
            {actionError}
            <button
              onClick={() => setActionError('')}
              aria-label={t('Dismiss error', 'Fermer l’erreur')}
            >
              <X size={15} />
            </button>
          </p>
        )}
        <p className="sr-only" role="status" aria-live="polite">
          {notice}
        </p>
      </main>
    </div>
  );
}
