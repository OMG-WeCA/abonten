interface MarqueeProps {
  items: string[];
  /** Leading label, e.g. "Now bookable across WeCA". */
  label?: string;
  className?: string;
}

/**
 * Pure-CSS infinite marquee of WeCA cities. Renders the list twice for a
 * seamless -50% translate loop. Pauses on hover.
 */
export function Marquee({ items, label, className = '' }: MarqueeProps) {
  const set = [...items, ...items];
  return (
    <div className={`marquee relative overflow-hidden ${className}`} aria-label={label ?? 'Markets'}>
      {label && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <span className="rounded-full border border-foreground/15 bg-background/80 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-foreground/90 backdrop-blur">
            {label}
          </span>
        </span>
      )}
      <div className="marquee-track py-4">
        {set.map((item, i) => (
          <span key={i} className="mx-6 inline-flex items-center gap-3 whitespace-nowrap text-sm font-semibold uppercase tracking-[0.14em] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-primary/70" aria-hidden="true" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}