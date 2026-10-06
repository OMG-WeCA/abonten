import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Accent } from './accents';
import { accentChip, accentText } from './accents';
import { Reveal } from './Reveal';

interface Step {
  icon: LucideIcon;
  accent?: Accent;
  title: ReactNode;
  body: ReactNode;
}

const colsMap: Record<number, string> = {
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
};

export function StepFlow({
  steps,
  className = '',
  locale = 'en',
}: {
  steps: Step[];
  className?: string;
  locale?: 'en' | 'fr';
}) {
  const cols = colsMap[steps.length] ?? 'md:grid-cols-3';
  return (
    <Reveal variant="up">
      <ol className={`relative grid gap-8 ${cols} ${className}`}>
        {/* horizontal connector behind the badges (desktop only) */}
        <span
          className="absolute left-0 right-0 top-7 hidden h-px bg-border md:block"
          aria-hidden="true"
        />
        {steps.map((step, i) => {
          const Icon = step.icon;
          const accent = step.accent ?? 'primary';
          return (
            <li key={i} className="relative">
              <div
                className={`relative z-10 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-surface ring-1 ${accentChip[accent]}`}
              >
                <Icon className="h-7 w-7" strokeWidth={2.2} />
              </div>
              <span
                className={`mt-4 block text-sm font-bold uppercase tracking-wider ${accentText[accent]}`}
              >
                {locale === 'fr' ? 'Étape' : 'Step'} {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-1 text-xl font-extrabold uppercase tracking-tight text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">{step.body}</p>
            </li>
          );
        })}
      </ol>
    </Reveal>
  );
}
