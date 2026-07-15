'use client';

import type { CSSProperties, ReactNode } from 'react';
import Image from 'next/image';
import { Button } from '../Button';
import { useParallax } from './useParallax';

interface HeroImage {
  src: string;
  alt: string;
}

interface HeroProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  trust?: ReactNode;
  /** Optional background photo (e.g. African cityscape) rendered behind a dark overlay. */
  image?: HeroImage;
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
  image,
  children,
}: HeroProps) {
  const glowRef = useParallax<HTMLDivElement>(0.12, 70);
  const blobRef = useParallax<HTMLDivElement>(0.22, 90);

  return (
    <section className="relative overflow-hidden bg-background">
      {image && (
        <div className="absolute inset-0" aria-hidden="true">
          <Image src={image.src} alt={image.alt} fill priority sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/65 to-background" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-transparent to-background/70" />
        </div>
      )}

      <div ref={glowRef} className="bg-hero-glow pointer-events-none absolute -inset-[12%]" aria-hidden="true" />
      <div className={`bg-dot-grid absolute inset-0 ${image ? 'opacity-30' : 'opacity-60'}`} aria-hidden="true" />

      <div
        ref={blobRef}
        className="animate-float pointer-events-none absolute right-[8%] top-[16%] h-24 w-24 rounded-full bg-accent-blue/20 blur-2xl"
        aria-hidden="true"
      />
      <div
        className="animate-float-slow pointer-events-none absolute left-[10%] bottom-[14%] h-28 w-28 rounded-full bg-accent-violet/20 blur-2xl"
        style={{ animationDelay: '-3s' } as CSSProperties}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-28 lg:py-32">
        <div className="mx-auto max-w-3xl text-center">
          {eyebrow && (
            <p className="animate-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-foreground/5 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-foreground/80 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
              {eyebrow}
            </p>
          )}
          <h1 className="animate-fade-up-delay-1 text-4xl font-extrabold uppercase leading-[1.04] tracking-tight text-foreground drop-shadow-[0_2px_20px_rgba(0,0,0,0.45)] sm:text-6xl lg:text-7xl">
            {title}
          </h1>
          {subtitle && (
            <p className="animate-fade-up-delay-2 mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">
              {subtitle}
            </p>
          )}
          {(primaryLabel || secondaryLabel) && (
            <div className="animate-fade-up-delay-2 mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
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