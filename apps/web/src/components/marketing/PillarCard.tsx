import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Accent } from './accents';
import { accentVar } from './accents';
import { IconChip } from './IconChip';

interface PillarCardProps {
  icon: LucideIcon;
  accent?: Accent;
  title: ReactNode;
  children: ReactNode;
  className?: string;
}

export function PillarCard({
  icon,
  accent = 'primary',
  title,
  children,
  className = '',
}: PillarCardProps) {
  return (
    <div
      className={`group card-glow relative h-full overflow-hidden rounded-2xl border border-border bg-surface p-8 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/20 ${className}`}
      style={{ '--glow-accent': accentVar[accent] } as CSSProperties}
    >
      <div className="relative z-10">
        <IconChip icon={icon} accent={accent} />
        <h3 className="mt-6 text-xl font-extrabold uppercase tracking-tight text-foreground">
          {title}
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">{children}</p>
      </div>
    </div>
  );
}