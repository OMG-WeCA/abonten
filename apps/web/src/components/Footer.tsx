import Link from 'next/link';

const productLinks = [
  { href: '/for-partners', label: 'For Media Partners' },
  { href: '/for-planners', label: 'For Planners & Buyers' },
  { href: '/for-clients', label: 'For Clients & Advertisers' },
];

const companyLinks = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#stats', label: 'By the numbers' },
  { href: 'mailto:hello@abonten.com', label: 'Contact' },
];

const legalLinks = [
  { href: '#', label: 'Privacy' },
  { href: '#', label: 'Terms' },
  { href: '#', label: 'Security' },
];

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-surface-2">
      <div className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
                <span className="text-lg font-black leading-none">A</span>
              </span>
              <span className="text-xl font-extrabold uppercase tracking-tight text-foreground">
                Abonten
              </span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
              Outdoor advertising, planned &amp; verified. The planning, booking, and
              proof-of-performance platform for West &amp; Central Africa — aligned with OMG WeCA.
            </p>
            <p className="mt-4 text-xs uppercase tracking-wider text-muted/70">
              23+ markets · English &amp; French · NGN · GHS · XAF · XOF
            </p>
          </div>

          {/* Platform */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Platform</h3>
            <ul className="mt-4 space-y-2.5">
              {productLinks.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-muted transition-colors hover:text-primary">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Company</h3>
            <ul className="mt-4 space-y-2.5">
              {companyLinks.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-muted transition-colors hover:text-primary">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Legal</h3>
            <ul className="mt-4 space-y-2.5">
              {legalLinks.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-muted transition-colors hover:text-primary">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {year} Abonten — OMG WeCA. All rights reserved.</p>
          <p className="uppercase tracking-wider">
            Aligned with Omnicom Media Group West &amp; Central Africa
          </p>
        </div>
      </div>
    </footer>
  );
}