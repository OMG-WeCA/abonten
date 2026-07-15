'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from './ThemeProvider';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/planner', label: 'Planner' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/monitoring', label: 'Monitoring' },
  { href: '/admin', label: 'Admin' },
];

export function Navbar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight text-foreground">Abonten</span>
          <span className="hidden text-xs text-muted sm:inline">OMG WeCA</span>
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active ? 'bg-primary text-white' : 'text-foreground hover:bg-surface'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
        <button
          onClick={toggle}
          className="rounded-md border border-border p-2 text-foreground transition-colors hover:bg-surface"
          aria-label="Toggle theme"
        >
          {theme === 'light' ? '\u{1F319}' : '\u2600\uFE0F'}
        </button>
      </div>
      {/* Mobile nav */}
      <div className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden">
        {navLinks.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${
                active ? 'bg-primary text-white' : 'text-foreground hover:bg-surface'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
