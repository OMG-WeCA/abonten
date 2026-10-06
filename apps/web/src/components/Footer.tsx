'use client';
import Link from 'next/link';
import { useLocale } from './LocaleProvider';
import { marketingCopy } from '../lib/marketing-copy';
export function Footer() {
  const { locale } = useLocale();
  const copy = marketingCopy[locale];
  return (
    <footer className="border-t border-border bg-surface-2">
      <div className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 font-extrabold uppercase tracking-tight text-foreground"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-white">
                A
              </span>
              <span className="text-xl">Abonten</span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">{copy.footer}</p>
            <p className="mt-4 text-xs leading-6 text-muted">
              {copy.markets}
              <br />
              {copy.language} · NGN · GHS · XOF · XAF
            </p>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              {copy.platform}
            </h3>
            <ul className="mt-4 space-y-2.5">
              {['/for-partners', '/for-planners', '/for-clients'].map((href, index) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="inline-flex min-h-9 items-center text-sm text-muted transition-colors hover:text-primary"
                  >
                    {copy.nav[index]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              {copy.company}
            </h3>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link
                  href="/#how-it-works"
                  className="inline-flex min-h-9 items-center text-sm text-muted hover:text-primary"
                >
                  {copy.how}
                </Link>
              </li>
              <li>
                <Link
                  href="/sign-in"
                  className="inline-flex min-h-9 items-center text-sm text-muted hover:text-primary"
                >
                  {copy.signIn}
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-12 border-t border-border pt-6 text-xs text-muted">
          <p>
            © {new Date().getFullYear()} Abonten. {copy.rights}
          </p>
        </div>
      </div>
    </footer>
  );
}
