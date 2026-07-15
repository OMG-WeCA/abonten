import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds a vibrant top accent bar. Pass a semantic accent color, e.g. "primary". */
  accent?: 'primary' | 'gold' | 'blue' | 'teal' | 'violet' | 'orange' | 'emerald';
  /** Lifts on hover with a shadow (use for interactive cards). */
  interactive?: boolean;
  children: ReactNode;
}

const accentBar: Record<NonNullable<CardProps['accent']>, string> = {
  primary: 'bg-primary',
  gold: 'bg-accent-gold',
  blue: 'bg-accent-blue',
  teal: 'bg-accent-teal',
  violet: 'bg-accent-violet',
  orange: 'bg-accent-orange',
  emerald: 'bg-accent-emerald',
};

export function Card({ accent, interactive = false, className = '', children, ...rest }: CardProps) {
  const hover = interactive
    ? 'transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10'
    : 'transition-shadow duration-300';
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm ${hover} ${className}`}
      {...rest}
    >
      {accent && (
        <span className={`absolute inset-x-0 top-0 h-1 ${accentBar[accent]}`} aria-hidden="true" />
      )}
      {children}
    </div>
  );
}