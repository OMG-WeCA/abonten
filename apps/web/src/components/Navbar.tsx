'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { Button } from './Button';

const navLinks = [
  { href: '/for-partners', label: 'For Partners' },
  { href: '/for-planners', label: 'For Planners' },
  { href: '/for-clients', label: 'For Clients' },
];

const DEMO_MAILTO = 'mailto:hello@abonten.com?subject=Abonten%20demo%20request';

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-foreground/10 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="group flex items-center gap-2.5" aria-label="Abonten home">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-lg shadow-primary/30 transition-transform group-hover:scale-105">
            <span className="text-lg font-black leading-none">A</span>
          </span>
          <span className="text-xl font-extrabold uppercase tracking-tight text-foreground">
            Abonten
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-wide transition-colors ${
                  active ? 'text-primary' : 'text-foreground/80 hover:text-primary'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:block">
          <Button href={DEMO_MAILTO} size="md">
            Get Started
          </Button>
        </div>

        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-lg p-2 text-foreground transition-colors hover:bg-foreground/10 md:hidden"
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-foreground/10 bg-background px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-1">
            {navLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-lg px-3 py-2.5 text-sm font-semibold uppercase tracking-wide ${
                    active ? 'text-primary' : 'text-foreground/80 hover:text-primary'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <Button href={DEMO_MAILTO} size="md" className="mt-3 w-full">
              Get Started
            </Button>
          </nav>
        </div>
      )}
    </header>
  );
}