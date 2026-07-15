import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '../components/ThemeProvider';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Abonten — Outdoor Advertising, Planned & Verified',
  description:
    'The planning, booking, and proof-of-performance platform for outdoor advertising across West & Central Africa.',
  metadataBase: new URL('https://abonten.com'),
  openGraph: {
    title: 'Abonten — Outdoor Advertising, Planned & Verified',
    description:
      'List inventory, plan multi-city campaigns with real KPIs, and prove every billboard is live — across 23+ markets in West & Central Africa.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={`${inter.variable} min-h-screen bg-background text-foreground antialiased`}>
        <ThemeProvider>
          <Navbar />
          <main className="page-fade">{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}