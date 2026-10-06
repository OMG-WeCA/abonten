'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiJson } from '../lib/api';
import { useAuth } from './auth/AuthProvider';
export type Locale = 'en' | 'fr';
export const LOCALE_STORAGE_KEY = 'abonten-locale';
const LocaleContext = createContext<{
  locale: Locale;
  saveError: boolean;
  setLocale: (locale: Locale) => Promise<void>;
}>({ locale: 'en', saveError: false, setLocale: async () => undefined });
/** Guests choose a persistent language. Signed-in workspace language follows the profile. */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const { profile, refreshAccount } = useAuth();
  const [guestLocale, setGuestLocale] = useState<Locale>('en');
  const [selectedLocale, setSelectedLocale] = useState<Locale | null>(null);
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    setSaveError(false);
  }, [profile?.id]);
  useEffect(() => {
    try {
      setGuestLocale(localStorage.getItem(LOCALE_STORAGE_KEY) === 'fr' ? 'fr' : 'en');
    } catch {
      /* Private browsing can disable persistence. */
    }
  }, []);
  const locale = selectedLocale ?? profile?.locale ?? guestLocale;
  useEffect(() => {
    setSelectedLocale(null);
  }, [profile?.locale]);
  useEffect(() => {
    document.documentElement.lang = locale;
    const title =
      locale === 'fr'
        ? 'Abonten — Sites publicitaires et intelligence géographique'
        : 'Abonten — Outdoor inventory & location intelligence';
    document.title = title;
    const description =
      locale === 'fr'
        ? 'Découvrez les sites publicitaires extérieurs, comparez les emplacements et préparez vos sélections de campagne en Afrique de l’Ouest et centrale.'
        : 'Discover outdoor inventory, compare locations and prepare campaign shortlists across West & Central Africa.';
    const socialDescription =
      locale === 'fr'
        ? 'Présentez les sites publicitaires extérieurs, consultez les médias de référence et planifiez vos campagnes avec les emplacements, les coûts et les sources clairement indiqués.'
        : 'Present outdoor inventory, inspect reference media and plan campaigns with clear location, cost and source context.';
    for (const [selector, content] of [
      ['meta[name="description"]', description],
      ['meta[property="og:title"]', title],
      ['meta[property="og:description"]', socialDescription],
    ])
      document.querySelector(selector)?.setAttribute('content', content);
  }, [locale]);
  const setLocale = async (value: Locale) => {
    setSaveError(false);
    setSelectedLocale(value);
    setGuestLocale(value);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, value);
    } catch {
      /* Language remains usable for this visit. */
    }
    if (profile) {
      try {
        await apiJson('/api/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale: value }),
        });
        await refreshAccount();
      } catch (error) {
        setSaveError(true);
        throw error;
      }
    }
  };
  return (
    <LocaleContext.Provider value={{ locale, saveError, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}
export const useLocale = () => useContext(LocaleContext);
export function LanguageSwitcher() {
  const { locale, setLocale, saveError: error } = useLocale();
  const [saving, setSaving] = useState(false);
  const change = async (value: Locale) => {
    setSaving(true);
    try {
      await setLocale(value);
    } catch {
      // The provider retains failure state across interrupted menus/navigation.
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <label className="inline-flex items-center gap-2 text-xs font-semibold text-muted">
        <span className="sr-only">{locale === 'fr' ? 'Langue' : 'Language'}</span>
        <select
          aria-label={locale === 'fr' ? 'Langue' : 'Language'}
          aria-busy={saving}
          disabled={saving}
          value={locale}
          onChange={(event) => void change(event.target.value as Locale)}
          className="min-h-11 rounded-lg border border-border bg-background px-2 text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        >
          <option value="en">English</option>
          <option value="fr">Français</option>
        </select>
      </label>
      {error && (
        <div className="language-switcher-error flex flex-col items-end gap-1">
          <span role="alert" className="max-w-48 text-xs text-error">
            {locale === 'fr'
              ? 'Langue changée ici, mais non enregistrée dans le compte. Sélectionnez à nouveau pour réessayer.'
              : 'Language changed here, but not saved to your account. Select it again to retry.'}
          </span>
          <button
            type="button"
            onClick={() => void change(locale)}
            disabled={saving}
            className="min-h-9 text-xs font-semibold text-primary"
          >
            {locale === 'fr' ? 'Réessayer' : 'Retry'}
          </button>
        </div>
      )}
    </div>
  );
}
