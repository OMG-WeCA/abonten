'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AuthProvider } from './auth/AuthProvider';
import { Footer } from './Footer';
import { Navbar } from './Navbar';

function isApplicationRoute(pathname: string): boolean {
  // /sites and /admin host the partner inventory workflow and the platform
  // review queue — operational surfaces that must never render inside the
  // public marketing shell.
  return ['/sign-in', '/onboarding', '/dashboard', '/settings', '/auth/', '/sites', '/admin'].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const applicationRoute = isApplicationRoute(pathname);

  return (
    <AuthProvider>
      {applicationRoute ? (
        children
      ) : (
        <>
          <Navbar />
          <main className="page-fade">{children}</main>
          <Footer />
        </>
      )}
    </AuthProvider>
  );
}
