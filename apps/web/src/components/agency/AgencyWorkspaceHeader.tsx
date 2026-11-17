'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  CircleUserRound,
  Home,
  Layers,
  Map,
  MessageSquare,
  Moon,
  Sun,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { LanguageSwitcher, useLocale } from '../LocaleProvider';
import { useTheme } from '../ThemeProvider';
import { confirmUnsavedNavigation } from '../../lib/unsaved-navigation';
import './agency-home.css';

/** Agency dashboard chrome follows the full-screen planner's existing controls. */
export function AgencyWorkspaceHeader({
  switching,
  onSwitch,
}: {
  switching: boolean;
  onSwitch: (id: string) => Promise<void>;
}) {
  const router = useRouter();
  const { activeOrganization: org, organizations, capabilities, signOut } = useAuth();
  const { locale } = useLocale();
  const { theme, toggle } = useTheme();
  const menu = useRef<HTMLDetailsElement>(null);
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const navigate = (path: string) => {
    if (!confirmUnsavedNavigation()) return;
    if (menu.current) menu.current.open = false;
    router.push(path);
  };
  const canBrowse = capabilities.includes('MARKETPLACE_VIEW');
  return (
    <header className="agency-workspace-header">
      <div className="agency-workspace-toolbar">
        <button
          type="button"
          className="agency-workspace-brand"
          onClick={() => navigate('/dashboard')}
          aria-label="Abonten"
        >
          <Layers size={22} aria-hidden />
          abonten
        </button>
        <span className="agency-workspace-org">{org?.name}</span>
        <nav
          className="agency-workspace-nav"
          aria-label={t('Workspace navigation', 'Navigation de l’espace')}
        >
          <button
            type="button"
            className="is-current"
            aria-current="page"
            onClick={() => navigate('/dashboard')}
          >
            <Home size={17} aria-hidden />
            {t('Overview', 'Vue d’ensemble')}
          </button>
          {canBrowse && (
            <button type="button" onClick={() => navigate('/planner?view=inventory')}>
              <Map size={17} aria-hidden />
              {t('Marketplace', 'Marché')}
            </button>
          )}
        </nav>
        <div className="agency-workspace-utilities">
          <button
            type="button"
            className="agency-workspace-icon"
            onClick={toggle}
            aria-label={
              theme === 'dark'
                ? t('Switch to light mode', 'Activer le thème clair')
                : t('Switch to dark mode', 'Activer le thème sombre')
            }
          >
            {theme === 'dark' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
          </button>
          {canBrowse && (
            <button
              type="button"
              className="agency-home-button"
              onClick={() => navigate('/planner?view=assistant')}
              aria-label={t('Assistant', 'Assistant')}
            >
              <MessageSquare size={16} aria-hidden />
              <span className="agency-workspace-assistant-label">
                {t('Assistant', 'Assistant')}
              </span>
            </button>
          )}
          <details ref={menu} className="agency-workspace-account">
            <summary
              className="agency-workspace-icon"
              aria-label={t('Workspace and account', 'Espace et compte')}
            >
              <CircleUserRound size={18} aria-hidden />
            </summary>
            <div className="agency-workspace-menu">
              <label className="agency-workspace-switch">
                <span>{t('Workspace', 'Espace')}</span>
                <span className="agency-home-select">
                  <select
                    value={org?.organizationId}
                    disabled={switching || organizations.length < 2}
                    onChange={(event) => void onSwitch(event.target.value)}
                  >
                    {organizations.map((item) => (
                      <option key={item.organizationId} value={item.organizationId}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} aria-hidden />
                </span>
              </label>
              <button
                type="button"
                className="agency-workspace-mobile-nav"
                onClick={() => navigate('/dashboard')}
              >
                <Home size={17} aria-hidden />
                {t('Overview', 'Vue d’ensemble')}
              </button>
              {canBrowse && (
                <button
                  type="button"
                  className="agency-workspace-mobile-nav"
                  onClick={() => navigate('/planner?view=inventory')}
                >
                  <Map size={17} aria-hidden />
                  {t('Marketplace', 'Marché')}
                </button>
              )}
              <button type="button" onClick={() => navigate('/settings')}>
                {t('Settings', 'Paramètres')}
              </button>
              <LanguageSwitcher />
              <button
                type="button"
                onClick={() => {
                  if (confirmUnsavedNavigation())
                    void signOut().then(() => router.replace('/sign-in'));
                }}
              >
                {t('Sign out', 'Déconnexion')}
              </button>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
