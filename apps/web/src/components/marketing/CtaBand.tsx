import type { ReactNode } from 'react';
import { Button } from '../Button';
import { Reveal } from './Reveal';

interface CtaBandProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  variant?: 'navy' | 'primary';
}

export function CtaBand({
  eyebrow,
  title,
  subtitle,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
  variant = 'navy',
}: CtaBandProps) {
  const isPrimary = variant === 'primary';
  return (
    <section
      className={`relative overflow-hidden ${isPrimary ? 'bg-primary' : 'bg-surface-2 bg-cta-glow'}`}
    >
      <Reveal variant="up" className="relative mx-auto max-w-4xl px-6 py-20 text-center sm:py-24">
        {eyebrow && (
          <p
            className={`mb-3 text-xs font-bold uppercase tracking-[0.22em] ${
              isPrimary ? 'text-white/85' : 'text-accent-gold'
            }`}
          >
            {eyebrow}
          </p>
        )}
        <h2
          className={`text-3xl font-extrabold uppercase tracking-tight sm:text-4xl lg:text-5xl ${
            isPrimary ? 'text-white' : 'text-foreground'
          }`}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            className={`mx-auto mt-4 max-w-2xl text-base leading-relaxed sm:text-lg ${
              isPrimary ? 'text-white/85' : 'text-muted'
            }`}
          >
            {subtitle}
          </p>
        )}
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            href={primaryHref}
            size="xl"
            variant={isPrimary ? 'white' : 'primary'}
          >
            {primaryLabel}
          </Button>
          {secondaryLabel && secondaryHref && (
            <Button
              href={secondaryHref}
              size="xl"
              variant={isPrimary ? 'outline' : 'secondary'}
            >
              {secondaryLabel}
            </Button>
          )}
        </div>
      </Reveal>
    </section>
  );
}