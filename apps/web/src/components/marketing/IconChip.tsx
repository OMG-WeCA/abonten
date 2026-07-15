import type { LucideIcon } from 'lucide-react';
import type { Accent } from './accents';
import { accentChip } from './accents';

interface IconChipProps {
  icon: LucideIcon;
  accent?: Accent;
  className?: string;
}

export function IconChip({ icon: Icon, accent = 'primary', className = '' }: IconChipProps) {
  return (
    <span
      className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl ring-1 ${accentChip[accent]} ${className}`}
    >
      <Icon className="h-7 w-7" strokeWidth={2.2} />
    </span>
  );
}