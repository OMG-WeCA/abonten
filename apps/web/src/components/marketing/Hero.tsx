import type { ReactNode } from 'react';
import { Button } from '../Button';

interface HeroProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  trust?: ReactNode;
  children?: ReactNode;
}

export function Hero({
  eyebrow,
  title,
  subtitle,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
  trust,
  children,
}: HeroProps) {
  return (
    <section className="relative overflow-hidden bg-background bg-hero-glow">
      <div className="bg-dot-grid absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-28 lg:py-32">
        <div className="mx-auto max-w-3xl text-center">
          {eyebrow && (
            <p className="animate-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-foreground/5 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-foreground/80 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
              {eyebrow}
            </p>
          )}
          <h1 className="animate-fade-up-delay-1 text-4xl font-extrabold uppercase leading-[1.04] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            {title}
          </h1>
          {subtitle && (
            <p className="animate-fade-up-delay-2 mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">
              {subtitle}
            </p>
          )}
          {(primaryLabel || secondaryLabel) && (
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {primaryLabel && primaryHref && (
                <Button href={primaryHref} size="xl" variant="primary">
                  {primaryLabel}
                </Button>
              )}
              {secondaryLabel && secondaryHref && (
                <Button href={secondaryHref} size="xl" variant="outline">
                  {secondaryLabel}
                </Button>
              )}
            </div>
          )}
          {trust && (
            <p className="mt-9 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              {trust}
            </p>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}