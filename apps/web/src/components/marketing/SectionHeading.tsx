import type { ReactNode } from 'react';
import type { Accent } from './accents';
import { accentText } from './accents';
import { Reveal } from './Reveal';

interface SectionHeadingProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: 'left' | 'center';
  accent?: Accent;
  className?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'center',
  accent = 'gold',
  className = '',
}: SectionHeadingProps) {
  const isCenter = align === 'center';
  return (
    <Reveal variant="up" className={isCenter ? 'mx-auto max-w-2xl' : 'max-w-2xl'}>
      <div className={`${isCenter ? 'text-center' : ''} ${className}`}>
        {eyebrow && (
          <p className={`mb-3 text-xs font-bold uppercase tracking-[0.22em] ${accentText[accent]}`}>
            {eyebrow}
          </p>
        )}
        <h2 className="text-3xl font-extrabold uppercase tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">{subtitle}</p>
        )}
      </div>
    </Reveal>
  );
}