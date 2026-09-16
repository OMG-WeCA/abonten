'use client';

import Link from 'next/link';
import { PortfolioValue } from './PortfolioValue';
import { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowRight, Plus, MapPin, Building2, CircleCheck, RotateCcw, ChartNoAxesCombined } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { listSites, type SiteSummary } from '../../lib/sites-api';
import { getSitesCopy } from '../../lib/sites-locale';
import { canManageSites, canSeeSitesArea } from '../../lib/sites-access';
import { displayStatus, prettyFormat, StatusBadge } from '../sites/sites-ui';

export function PartnerDashboard() {
  const { activeOrganization: org, capabilities, profile } = useAuth();
  const fr = profile?.locale === 'fr';
  const t = (en: string, french: string) => fr ? french : en;
  const access = { capabilities, orgType: org?.type };
  const canView = canSeeSitesArea(access);
  const canEdit = canManageSites(access);
  const orgId = org?.organizationId;
  const [result, setResult] = useState<{ orgId: string; sites: SiteSummary[] } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState<'attention' | 'recent'>('attention');
  useEffect(() => {
    if (!orgId || !canView) return;
    let cancelled = false;
    async function load() {
      try {
        const sites: SiteSummary[] = [];
        for (let page = 1; ; page++) {
          const data = await listSites(orgId, { page, limit: 100 });
          if (cancelled) return;
          sites.push(...data.items);
          if (data.items.length < 100 || sites.length >= data.total) break;
        }
        setResult({ orgId: orgId!, sites });
      } catch { if (!cancelled) setFailed(orgId!); }
    }
    void load();
    return () => { cancelled = true; };
  }, [orgId, canView, retry]);
  const sites = result && result.orgId === orgId ? result.sites : null;
  const loading = canView && !sites && failed !== orgId;
  const listed = sites?.filter(s => ['listed', 'approved'].includes(s.status)).length ?? 0;
  const pending = sites?.filter(s => s.status === 'pending_review').length ?? 0;
  const drafts = sites?.filter(s => displayStatus(s) === 'draft').length ?? 0;
  const rejected = sites?.filter(s => displayStatus(s) === 'rejected').length ?? 0;
  const paused = (sites?.length ?? 0) - listed - pending - drafts - rejected;
  const groups = [
    { label: t('Published', 'Publiés'), count: listed, color: 'bg-success', text: 'text-success' },
    { label: t('In review', 'En cours de validation'), count: pending, color: 'bg-info', text: 'text-info' },
    { label: t('Drafts', 'Brouillons'), count: drafts, color: 'bg-warning', text: 'text-warning' },
    { label: t('Rejected', 'Rejetés'), count: rejected, color: 'bg-primary', text: 'text-primary' },
    { label: t('Suspended / retired', 'Suspendus / retirés'), count: paused, color: 'bg-muted', text: 'text-muted' },
  ];
  const cities = Object.entries((sites ?? []).reduce<Record<string, number>>((all, s) => {
    const city = s.city || t('Unspecified', 'Non précisé');
    all[city] = (all[city] || 0) + 1; return all;
  }, {})).sort((a, b) => b[1] - a[1]);
  const formats = Object.entries((sites ?? []).reduce<Record<string, number>>((all, site) => {
    all[site.format] = (all[site.format] || 0) + 1; return all;
  }, {})).sort((a, b) => b[1] - a[1]);
  const visualSites = [...(sites ?? [])].sort((a, b) => {
    const order = ['listed', 'approved', 'pending_review', 'draft', 'rejected', 'suspended', 'decommissioned'];
    return order.indexOf(displayStatus(a)) - order.indexOf(displayStatus(b));
  }).slice(0, 36);
  const compactPortfolio = (sites?.length ?? 0) > 36;
  const prettyStatus = (site: SiteSummary) => getSitesCopy(profile?.locale).status[displayStatus(site)];
  const siteColor = (site: SiteSummary) => {
    const status = displayStatus(site);
    return status === 'listed' || status === 'approved' ? 'text-success' : status === 'pending_review' ? 'text-info' : status === 'draft' ? 'text-warning' : status === 'rejected' ? 'text-primary' : 'text-muted';
  };
  const attention = (sites ?? []).filter(s => ['draft', 'rejected', 'suspended'].includes(displayStatus(s)))
    .sort((a, b) => Number(displayStatus(b) === 'rejected') - Number(displayStatus(a) === 'rejected') || b.updatedAt.localeCompare(a.updatedAt));
  const recent = [...(sites ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const rows = (tab === 'attention' ? attention : recent).slice(0, 5);
  const count = (n: number) => sites ? n.toLocaleString(fr ? 'fr' : 'en') : '—';
  const linkStyle = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-primary';

  return <div className="partner-dashboard space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-5">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('Your outdoor portfolio.', 'Votre portefeuille outdoor.')}</h1>
      {canEdit && <Link href="/sites/new" className={`${linkStyle} bg-primary text-white hover:bg-primary-hover`}><Plus size={17}/>{t('Register a site', 'Ajouter un site')}</Link>}
    </div>

    {!canView ? <section className="rounded-xl border border-border p-8"><h2 className="font-semibold">{t('Your partner workspace', 'Votre espace partenaire')}</h2><p className="mt-2 text-muted">{t('Ask your organization administrator for inventory access to see your sites here.', 'Demandez l’accès à l’inventaire à votre administrateur pour voir vos sites ici.')}</p></section> : <>
    {failed === orgId && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error/30 bg-error/5 p-4 text-sm"><span>{t('We couldn’t load your inventory. Your sites are safe.', 'Impossible de charger votre inventaire. Vos sites sont conservés.')}</span><button className={linkStyle} onClick={() => { setFailed(null); setRetry(r => r + 1); }}><RotateCcw size={16}/>{t('Try again', 'Réessayer')}</button></div>}
    <div className="portfolio-overview">
    {sites && orgId && <PortfolioValue key={`${orgId}:${org.defaultCurrency}`} currency={org.defaultCurrency} sites={sites} orgId={orgId} locale={profile?.locale} />}
    <section aria-busy={loading} className="inventory-overview overflow-hidden rounded-2xl border border-border bg-surface-2">
      <div className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[.8fr_1.8fr] lg:gap-12">
        <div className="flex flex-col justify-center">
          <div className="flex items-baseline gap-3"><span className={`text-7xl font-semibold tracking-[-.07em] tabular-nums sm:text-8xl ${loading ? 'animate-pulse' : ''}`}>{count(sites?.length ?? 0)}</span><h2 className="text-lg text-muted">{t('sites', 'sites')}</h2></div>
          <Link href="/sites" className="mt-4 inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-muted transition hover:text-foreground">{t('Explore inventory', 'Explorer l’inventaire')}<ArrowUpRight size={16}/></Link>
        </div>
        <div className="flex flex-col justify-center">
          {compactPortfolio ? <div>
            <p className="mb-4 text-sm text-muted">{t('Portfolio by status', 'Portefeuille par statut')}</p>
            <div className="flex h-20 overflow-hidden rounded-xl bg-surface sm:h-24" role="img" aria-label={groups.map(g => `${g.label}: ${g.count}`).join(', ')}>
              {groups.filter(g => g.count > 0).map(g => <div key={g.label} title={`${g.label}: ${g.count}`} className={`${g.color} relative border-r-2 border-surface-2 last:border-r-0`} style={{ width: `${g.count / (sites?.length || 1) * 100}%` }} />)}
            </div>
            <p className="mt-4 text-xs text-muted">{t('All sites included · proportions by status', 'Tous les sites inclus · répartition par statut')}</p>
          </div> : visualSites.length > 0 ? <>
            <div className="grid grid-cols-6 gap-x-2 gap-y-3 sm:grid-cols-9 sm:gap-x-3" aria-label={t('Your sites by status', 'Vos sites par statut')}>
              {visualSites.map(site => <Link key={site.id} href={`/sites/detail/?id=${encodeURIComponent(site.id)}`} title={`${site.name} · ${prettyStatus(site)}`} aria-label={`${site.name} · ${prettyStatus(site)}`} className={`group flex min-h-11 items-center justify-center rounded-md transition hover:bg-surface focus-visible:outline-2 focus-visible:outline-current ${siteColor(site)}`}>
                <svg viewBox="0 0 56 44" className="w-full max-w-14 transition-transform duration-200 group-hover:-translate-y-1 motion-reduce:transform-none" aria-hidden="true"><rect x="3" y="3" width="50" height="28" rx="3" fill="currentColor" opacity=".13"/><rect x="3" y="3" width="50" height="28" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M23 32v8m10-8v8M19 41h18" stroke="currentColor" strokeWidth="1.5"/><rect x="8" y="8" width="40" height="18" rx="1" fill="currentColor" opacity=".75"/></svg>
              </Link>)}
            </div>
            <p className="mt-4 text-xs text-muted">{t('One billboard, one site. Select to explore.', 'Un panneau, un site. Sélectionnez pour explorer.')}</p>
          </> : <div className="flex min-h-36 items-center gap-5 rounded-xl border border-dashed border-border p-6 text-muted"><Building2 size={40} strokeWidth={1}/><p className="text-sm">{loading ? t('Loading your portfolio…', 'Chargement du portefeuille…') : sites ? t('Your first site belongs here.', 'Votre premier site a sa place ici.') : t('Inventory unavailable', 'Inventaire indisponible')}</p></div>}
        </div>
      </div>
      <dl className="grid grid-cols-2 border-t border-border sm:grid-cols-3 lg:grid-cols-5">
        {groups.map(g => <div key={g.label} className="flex items-center gap-3 px-6 py-5"><span className={`h-2 w-2 shrink-0 rounded-full ${g.color}`}/><div><dd className="text-2xl font-semibold tabular-nums">{count(g.count)}</dd><dt className="mt-1 text-xs text-muted">{g.label}</dt></div></div>)}
      </dl>
    </section>
    </div>

    <div className="portfolio-breakdown grid gap-6 lg:grid-cols-[1.65fr_1fr]">
      <section className="rounded-xl border border-border bg-surface-2 p-6">
        <h2 className="font-semibold">{t('The media mix', 'Vos formats média')}</h2>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {formats.map(([format, n], i) => <div key={format} className="overflow-hidden rounded-xl border border-border bg-background/50 p-4">
            <div className={`flex h-24 items-center justify-center ${['text-info', 'text-success', 'text-warning'][i % 3]}`}><FormatDrawing format={format}/></div>
            <div className="mt-3 flex items-baseline justify-between gap-2"><h3 className="text-xs text-muted">{prettyFormat(format, profile?.locale)}</h3><span className="text-xl font-semibold tabular-nums">{n}</span></div>
          </div>)}
          {!formats.length && <p className="col-span-full py-8 text-sm text-muted">{t('Your formats will appear here.', 'Vos formats apparaîtront ici.')}</p>}
        </div>
      </section>
      <section className="rounded-xl border border-border bg-surface-2 p-6"><div className="flex items-center justify-between"><h2 className="font-semibold">{t('Across your cities', 'Dans vos villes')}</h2><MapPin size={18} className="text-muted"/></div>
        <div className="mt-6 space-y-5">{cities.slice(0, 4).map(([city, n]) => <div key={city}><div className="mb-2 flex justify-between gap-2 text-sm"><span>{city}</span><span className="font-semibold tabular-nums">{n}</span></div><div className="h-1.5 rounded-full bg-surface"><div className="h-full rounded-full bg-info/80" style={{width: `${n / (sites?.length || 1) * 100}%`}}/></div></div>)}{!cities.length && <p className="py-5 text-sm text-muted">{loading ? t('Loading your cities…', 'Chargement de vos villes…') : t('Your locations will appear as you register sites.', 'Vos emplacements apparaîtront après l’ajout de sites.')}</p>}</div>
        {cities.length > 4 && <p className="mt-4 text-xs text-muted">+{cities.length - 4} {t('more cities', 'autres villes')}</p>}
      </section>
    </div>

    <section className="overflow-hidden rounded-xl border border-border bg-surface-2">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 sm:px-6"><div className="flex gap-5" role="tablist" aria-label={t('Inventory view', 'Vue de l’inventaire')}>{(['attention', 'recent'] as const).map(key => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`min-h-16 border-b-2 text-sm font-semibold ${tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted'}`}>{key === 'attention' ? t('Needs attention', 'À traiter') : t('Recently updated', 'Modifiés récemment')}{key === 'attention' && sites && <span className="ml-2 rounded-md bg-surface px-2 py-0.5 text-xs text-muted">{attention.length}</span>}</button>)}</div><Link href="/sites" className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-muted hover:text-foreground">{t('View all sites', 'Voir tous les sites')}<ArrowUpRight size={15}/></Link></div>
      <div role="tabpanel">{rows.map(s => <Link key={s.id} href={`/sites/detail/?id=${encodeURIComponent(s.id)}`} className="group flex items-center gap-4 border-b border-border px-5 py-4 transition last:border-0 hover:bg-surface sm:px-6"><span className="hidden h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-surface text-muted sm:grid"><Building2 size={21}/></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold group-hover:text-primary">{s.name}</p><p className="mt-1 text-xs text-muted">{s.city} · {prettyFormat(s.format, profile?.locale)}</p></div><div className="shrink-0 text-right"><StatusBadge status={displayStatus(s)} locale={profile?.locale}/><p className="mt-1 hidden text-xs text-muted sm:block">{displayStatus(s) === 'rejected' ? t('Review feedback', 'Voir les commentaires') : s.status === 'draft' ? t('Complete site details', 'Compléter les détails') : t('View site', 'Voir le site')}</p></div><ArrowRight size={16} className="shrink-0 text-muted"/></Link>)}
      {!rows.length && <div className="px-6 py-10 text-center"><CircleCheck className="mx-auto mb-3 text-success" size={25}/><h3 className="text-sm font-semibold">{loading ? t('Loading your inventory…', 'Chargement de votre inventaire…') : !sites ? t('Inventory unavailable', 'Inventaire indisponible') : !sites.length ? t('Your next great location starts here.', 'Votre prochain emplacement commence ici.') : t('You’re all caught up.', 'Tout est à jour.')}</h3><p className="mt-2 text-sm text-muted">{sites && !sites.length ? t('Register your first site to start building your portfolio.', 'Ajoutez votre premier site pour créer votre portefeuille.') : sites ? t('Switch to recently updated to explore your inventory.', 'Consultez les sites modifiés récemment pour explorer votre inventaire.') : t('Your sites will appear when the data is available.', 'Vos sites apparaîtront lorsque les données seront disponibles.')}</p></div>}
      {rows.length > 0 && <div className="border-t border-border px-6 py-3 text-xs text-muted">{t('Showing', 'Affichage :')} {rows.length} / {tab === 'attention' ? attention.length : recent.length} {t('sites', 'sites')}</div>}</div>
    </section>
    </>}
    <section className="flex flex-wrap items-center gap-5 rounded-xl border border-border bg-surface/60 p-6"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-border bg-background text-muted"><ChartNoAxesCombined size={24}/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h2 className="text-sm font-semibold">{t('Bookings, occupancy & revenue', 'Réservations, occupation et revenus')}</h2><span className="rounded border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">{t('Coming soon', 'À venir')}</span></div></div><Link href="/settings" className={`${linkStyle} border border-border hover:bg-background`}>{t('Workspace settings', 'Paramètres')}<ArrowUpRight size={15}/></Link></section>
  </div>;
}


/** Schematic media-format silhouettes, not reference photographs. */
function FormatDrawing({ format }: { format: string }) {
  const screen = format === 'digital_led';
  const tall = ['mural', 'street_furniture'].includes(format);
  return <svg viewBox="0 0 160 100" className="h-full w-full max-w-40" fill="none" aria-hidden="true">
    <path d="M12 93h136" stroke="currentColor" opacity=".18"/>
    {format === 'transit' ? <><rect x="15" y="25" width="130" height="55" rx="10" stroke="currentColor" strokeWidth="2"/><path d="M27 34h31v17H27zm39 0h31v17H66zm40 0h27v17h-27z" fill="currentColor" opacity=".25"/><path d="M23 58h111v12H23z" fill="currentColor" opacity=".5"/><circle cx="41" cy="81" r="8" fill="var(--color-surface-2)" stroke="currentColor" strokeWidth="2"/><circle cx="120" cy="81" r="8" fill="var(--color-surface-2)" stroke="currentColor" strokeWidth="2"/></> : <>
      <path d={tall ? 'M58 84v9m44-9v9' : 'M68 70v22m24-22v22M57 93h46'} stroke="currentColor" strokeWidth="3"/>
      <rect x={tall ? 49 : 14} y="12" width={tall ? 62 : 132} height={tall ? 72 : 58} rx="3" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity=".08"/>
      {screen ? <>{Array.from({length: 36}, (_, i) => <circle key={i} cx={26 + i % 9 * 13.5} cy={24 + Math.floor(i / 9) * 11} r="2" fill="currentColor" opacity={.25 + (i % 4) * .2}/>)}</> : <>
        <path d={tall ? 'M56 64l20-25 28 32H56z' : 'M21 55l31-30 28 29 23-21 35 30H21z'} fill="currentColor" opacity=".28"/>
        <circle cx={tall ? 95 : 116} cy="27" r="6" fill="currentColor" opacity=".65"/>
      </>}
      {format === 'tri_vision' && <path d="M47 15v52m33-52v52m33-52v52" stroke="currentColor" opacity=".65"/>}
      {format === '3d' && <path d="M99 12V5l54 7v51l-7 7V12H99z" fill="currentColor" opacity=".5"/>}
    </>}
  </svg>;
}
