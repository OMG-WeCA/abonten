// Centralized accent-color class maps. Keeping the full literal class strings here
// ensures Tailwind v4 detects every utility (no dynamic class concatenation).

export type Accent =
  | 'primary'
  | 'gold'
  | 'amber'
  | 'orange'
  | 'blue'
  | 'sky'
  | 'teal'
  | 'emerald'
  | 'violet';

export const accentText: Record<Accent, string> = {
  primary: 'text-primary',
  gold: 'text-accent-gold',
  amber: 'text-accent-amber',
  orange: 'text-accent-orange',
  blue: 'text-accent-blue',
  sky: 'text-accent-sky',
  teal: 'text-accent-teal',
  emerald: 'text-accent-emerald',
  violet: 'text-accent-violet',
};

export const accentChip: Record<Accent, string> = {
  primary: 'bg-primary/15 text-primary ring-primary/30',
  gold: 'bg-accent-gold/15 text-accent-gold ring-accent-gold/30',
  amber: 'bg-accent-amber/15 text-accent-amber ring-accent-amber/30',
  orange: 'bg-accent-orange/15 text-accent-orange ring-accent-orange/30',
  blue: 'bg-accent-blue/15 text-accent-blue ring-accent-blue/30',
  sky: 'bg-accent-sky/15 text-accent-sky ring-accent-sky/30',
  teal: 'bg-accent-teal/15 text-accent-teal ring-accent-teal/30',
  emerald: 'bg-accent-emerald/15 text-accent-emerald ring-accent-emerald/30',
  violet: 'bg-accent-violet/15 text-accent-violet ring-accent-violet/30',
};

export const accentBar: Record<Accent, string> = {
  primary: 'bg-primary',
  gold: 'bg-accent-gold',
  amber: 'bg-accent-amber',
  orange: 'bg-accent-orange',
  blue: 'bg-accent-blue',
  sky: 'bg-accent-sky',
  teal: 'bg-accent-teal',
  emerald: 'bg-accent-emerald',
  violet: 'bg-accent-violet',
};

export const accentGradient: Record<Accent, string> = {
  primary: 'from-primary/20 to-primary/0',
  gold: 'from-accent-gold/20 to-accent-gold/0',
  amber: 'from-accent-amber/20 to-accent-amber/0',
  orange: 'from-accent-orange/20 to-accent-orange/0',
  blue: 'from-accent-blue/20 to-accent-blue/0',
  sky: 'from-accent-sky/20 to-accent-sky/0',
  teal: 'from-accent-teal/20 to-accent-teal/0',
  emerald: 'from-accent-emerald/20 to-accent-emerald/0',
  violet: 'from-accent-violet/20 to-accent-violet/0',
};

/** Raw theme CSS variable per accent — used for custom-property overrides (e.g. card glow). */
export const accentVar: Record<Accent, string> = {
  primary: 'var(--color-primary)',
  gold: 'var(--color-accent-gold)',
  amber: 'var(--color-accent-amber)',
  orange: 'var(--color-accent-orange)',
  blue: 'var(--color-accent-blue)',
  sky: 'var(--color-accent-sky)',
  teal: 'var(--color-accent-teal)',
  emerald: 'var(--color-accent-emerald)',
  violet: 'var(--color-accent-violet)',
};