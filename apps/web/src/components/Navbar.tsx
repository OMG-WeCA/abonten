'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { Button } from './Button';

const navLinks = [
  { href: '/for-partners', label: 'For Partners' },
  { href: '/for-planners', label: 'For Planners' },
  { href: '/for-clients', label: 'For Clients' },
];

const ACCOUNT_HREF = '/sign-in';

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) setOpen(false);
    };

    window.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnOutsidePress);
    };
  }, [open]);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };

    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 border-b border-foreground/10 bg-background/80 backdrop-blur-md"
    >
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
          <Button href={ACCOUNT_HREF} size="md">
            Sign in
          </Button>
        </div>

        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="rounded-xl p-2.5 text-foreground transition-colors hover:bg-foreground/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background md:hidden"
          aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
          aria-controls={menuId}
          aria-expanded={open}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div
          id={menuId}
          className="absolute inset-x-0 top-full border-b border-foreground/10 bg-background/95 px-6 py-4 shadow-2xl shadow-black/20 backdrop-blur-xl md:hidden"
        >
          <nav
            className="mx-auto flex max-w-7xl flex-col gap-1"
            aria-label="Mobile navigation"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('a')) setOpen(false);
            }}
          >
            {navLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`min-h-11 rounded-xl px-3 py-2.5 text-sm font-semibold uppercase tracking-wide transition-colors ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground/85 hover:bg-foreground/5 hover:text-primary'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <Button href={ACCOUNT_HREF} size="md" className="mt-3 min-h-11 w-full">
              Sign in
            </Button>
          </nav>
        </div>
      )}
    </header>
  );
}