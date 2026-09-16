'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, RotateCcw } from 'lucide-react';
import { getExchangeRates, listSiteRateCards, type ExchangeSnapshot, type SiteSummary } from '../../lib/sites-api';
import { selectMonthlyQuote, convertPortfolio } from '../../lib/portfolio-value';

type Value = { totals: Record<string, number>; priced: number; missing: SiteSummary[]; unavailable: SiteSummary[]; eligible: number; total: number | null; fx: ExchangeSnapshot | null; fxFailed: boolean };
export function PortfolioValue({ sites, orgId, locale, currency }: { sites: SiteSummary[]; orgId: string; currency: string; locale?: 'en' | 'fr' }) {
  const [value, setValue] = useState<Value | null>(null);
  const [attempt, setAttempt] = useState(0);
  const fr = locale === 'fr';
  const t = (en: string, french: string) => fr ? french : en;
  useEffect(() => {
    let cancelled = false;
    const eligible = sites.filter(s => s.status !== 'decommissioned');
    const next: Value = { totals: {}, priced: 0, missing: [], unavailable: [], eligible: eligible.length, total: null, fx: null, fxFailed: false };
    let cursor = 0;
    const now = Date.now();
    async function load() {
      // Bounded parallelism: don't delay the dashboard or fan out hundreds of requests.
      await Promise.all(Array.from({ length: Math.min(4, eligible.length) }, async () => {
        while (cursor < eligible.length && !cancelled) {
          const site = eligible[cursor++];
          try {
            const quote = selectMonthlyQuote(await listSiteRateCards(orgId, site.id), currency, now);
            if (cancelled) return;
            if (quote) {
              next.priced++;
              next.totals[quote.currency] = (next.totals[quote.currency] ?? 0) + quote.amount;
            } else next.missing.push(site);
          } catch { if (!cancelled) next.unavailable.push(site); }
        }
      }));
      if (cancelled) return;
      try {
        if (Object.keys(next.totals).some(c => c !== currency)) next.fx = await getExchangeRates(orgId);
        if (next.priced) next.total = convertPortfolio(next.totals, currency, next.fx?.rates ?? {});
      } catch { next.fxFailed = true; }
      if (!cancelled) setValue(next);
    }
    void load();
    return () => { cancelled = true; };
  }, [sites, orgId, currency, attempt]);
  return <section aria-busy={!value} className="portfolio-value rounded-2xl border border-success/25 bg-success/5 px-6 py-6 sm:px-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><h2 className="text-sm font-semibold">{t('Monthly earning potential', 'Potentiel de revenus mensuels')}</h2><span className="text-xs text-muted">{t('At full occupancy · not actual revenue', 'À pleine occupation · pas les revenus réels')}</span></div>
    <div className="portfolio-amounts my-5 flex flex-wrap gap-x-10 gap-y-4">
      {value?.total !== null && value?.total !== undefined ? <p className="flex flex-wrap items-baseline gap-2"><span className="text-sm font-medium text-muted">{currency}</span><span className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{new Intl.NumberFormat(fr ? 'fr-FR' : 'en-US', {maximumFractionDigits:2}).format(value.total)}</span><span className="text-xs text-muted">{t('/ month', '/ mois')}</span></p> : <p className="text-lg font-semibold text-muted">{!value ? t('Calculating…', 'Calcul en cours…') : value.fxFailed ? t('Conversion unavailable', 'Conversion indisponible') : value.unavailable.length ? t('Rates unavailable', 'Tarifs indisponibles') : t('No monthly rates yet', 'Aucun tarif mensuel')}</p>}

    </div>
    {value?.fx && <p className="mb-3 text-xs leading-5 text-muted">{t('Estimated · FX', 'Estimation · Change')} {new Date(value.fx.asOf).toLocaleDateString(fr ? 'fr-FR' : 'en-GB', {timeZone:'UTC'})} · <a className="underline underline-offset-2" href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">{value.fx.source}</a></p>}
    {value?.fxFailed && <button onClick={() => { setValue(null); setAttempt(a => a + 1); }} className="mb-2 inline-flex min-h-11 items-center gap-2 text-xs font-medium text-error"><RotateCcw size={13}/>{t('Exchange rates couldn’t load · Retry', 'Taux de change indisponibles · Réessayer')}</button>}
    {value && <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs"><span className="text-muted">{value.priced} / {value.eligible} {t('non-retired sites priced', 'sites non retirés tarifés')}{value.unavailable.length > 0 && ` · ${t('Partial total', 'Total partiel')}`}</span>
      {value.unavailable.length > 0 && <button onClick={() => { setValue(null); setAttempt(a => a + 1); }} className="inline-flex min-h-11 items-center gap-2 font-medium text-error"><RotateCcw size={13}/>{value.unavailable.length} {t('couldn’t load · Retry', 'non chargés · Réessayer')}</button>}
    </div>}
    {value && value.missing.length > 0 && <details className="mt-2 text-sm"><summary className="w-fit cursor-pointer py-2 font-medium text-warning">{value.missing.length} {t('sites need a monthly rate', 'sites sans tarif mensuel')}</summary><div className="mt-2 grid gap-1 sm:grid-cols-2">{value.missing.map(site => <Link key={site.id} href={`/sites/detail/?id=${encodeURIComponent(site.id)}`} className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 text-xs hover:bg-success/10"><span className="truncate">{site.name}</span><ArrowUpRight size={14} className="shrink-0"/></Link>)}</div></details>}
    <details className="mt-2 text-xs text-muted"><summary className="w-fit cursor-pointer py-2">{t('How this is calculated', 'Méthode de calcul')}</summary><p className="mt-1 max-w-3xl leading-6">{t('One current monthly quote per site: your organization’s currency first, otherwise the newest effective quote converted at the displayed exchange rate. Alternative currencies for the same site are never counted twice. Includes drafts and suspended sites; excludes retired sites. No conversion from daily or weekly prices. Missing or unavailable rates are excluded, never treated as zero. This is standard-rate potential before discounts, costs and seasonal adjustments—not a forecast of bookings or income.', 'Un tarif mensuel actuel par site : priorité à la devise de votre organisation, sinon le tarif en vigueur le plus récent est converti au taux affiché. Les devises alternatives d’un même site ne sont jamais comptées deux fois. Inclut les brouillons et sites suspendus ; exclut les sites retirés. Aucune conversion des tarifs journaliers ou hebdomadaires. Les tarifs manquants ou indisponibles sont exclus, jamais considérés comme nuls. Potentiel au tarif standard avant remises, charges et ajustements saisonniers, pas une prévision de réservations ou de revenus.')}</p></details>
  </section>;
}
