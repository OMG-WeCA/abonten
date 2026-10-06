import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '../components/ThemeProvider';
import { AppShell } from '../components/AppShell';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Abonten — Outdoor inventory & location intelligence',
  description:
    'Discover outdoor inventory, compare locations and prepare campaign shortlists across West & Central Africa.',
  metadataBase: new URL('https://abonten.com'),
  openGraph: {
    title: 'Abonten — Outdoor inventory & location intelligence',
    description:
      'Present outdoor inventory, inspect reference media and plan campaigns with clear location, cost and source context.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={`${inter.variable} min-h-screen bg-background text-foreground antialiased`}>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
