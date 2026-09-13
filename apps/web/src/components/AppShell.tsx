'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AuthProvider } from './auth/AuthProvider';
import { Footer } from './Footer';
import { Navbar } from './Navbar';

function isApplicationRoute(pathname: string): boolean {
  return ['/sign-in', '/onboarding', '/dashboard', '/settings', '/auth/'].some(
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
