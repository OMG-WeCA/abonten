import type { ReactNode } from 'react';
import type { Accent } from './accents';
import { accentText } from './accents';

interface Stat {
  value: ReactNode;
  label: ReactNode;
  sub?: ReactNode;
  accent?: Accent;
}

const defaultAccents: Accent[] = ['primary', 'gold', 'teal', 'blue'];

export function StatBand({ stats, className = '' }: { stats: Stat[]; className?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-4 ${className}`}>
      {stats.map((s, i) => {
        const accent = s.accent ?? defaultAccents[i % defaultAccents.length];
        return (
          <div key={i} className="text-center">
            <div
              className={`text-5xl font-extrabold uppercase tracking-tight sm:text-6xl ${accentText[accent]}`}
            >
              {s.value}
            </div>
            <div className="mt-3 text-sm font-bold uppercase tracking-wider text-foreground">
              {s.label}
            </div>
            {s.sub && (
              <div className="mt-1 text-xs uppercase tracking-wider text-muted">{s.sub}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}