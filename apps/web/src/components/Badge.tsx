import type { ReactNode } from 'react';

type Variant = 'success' | 'warning' | 'error' | 'info' | 'muted' | 'primary' | 'gold' | 'blue' | 'teal' | 'violet';

interface BadgeProps {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  success: 'bg-success/15 text-success ring-success/25',
  warning: 'bg-warning/15 text-warning ring-warning/25',
  error: 'bg-error/15 text-error ring-error/25',
  info: 'bg-info/15 text-info ring-info/25',
  muted: 'bg-muted/15 text-muted ring-muted/20',
  primary: 'bg-primary/15 text-primary ring-primary/30',
  gold: 'bg-accent-gold/15 text-accent-gold ring-accent-gold/30',
  blue: 'bg-accent-blue/15 text-accent-blue ring-accent-blue/30',
  teal: 'bg-accent-teal/15 text-accent-teal ring-accent-teal/30',
  violet: 'bg-accent-violet/15 text-accent-violet ring-accent-violet/30',
};

export function Badge({ variant = 'muted', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}