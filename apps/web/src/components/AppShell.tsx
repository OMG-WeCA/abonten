'use client';

import { installUnsavedNavigationGuard } from '../lib/unsaved-navigation';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AuthProvider } from './auth/AuthProvider';
import { LocaleProvider } from './LocaleProvider';
import { Footer } from './Footer';
import { Navbar } from './Navbar';

if (typeof window !== 'undefined') installUnsavedNavigationGuard();

function isApplicationRoute(pathname: string): boolean {
  // /sites and /admin host the partner inventory workflow and the platform
  // review queue — operational surfaces that must never render inside the
  // public marketing shell.
  return [
    '/sign-in',
    '/onboarding',
    '/dashboard',
    '/planner',
    '/settings',
    '/auth/',
    '/sites',
    '/admin',
    '/partner-terms',
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const applicationRoute = isApplicationRoute(pathname);

  return (
    <AuthProvider>
      <LocaleProvider>
        {applicationRoute ? (
          children
        ) : (
          <>
            <Navbar />
            <main className="page-fade">{children}</main>
            <Footer />
          </>
        )}
      </LocaleProvider>
    </AuthProvider>
  );
}
