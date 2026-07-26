interface MarqueeProps {
  items: string[];
  /** Leading label, e.g. "Now bookable across WeCA". */
  label?: string;
  className?: string;
}

/**
 * Pure-CSS market ticker. Two equal content groups create a true seamless
 * -50% loop; the label stays out of the moving content at every breakpoint.
 */
export function Marquee({ items, label, className = '' }: MarqueeProps) {
  const accessibleLabel = label ? `${label}: ${items.join(', ')}` : items.join(', ');

  const marketGroup = (duplicate = false) => (
    <div className="marquee-group" aria-hidden={duplicate}>
      {items.map((item) => (
        <span key={`${duplicate ? 'duplicate-' : ''}${item}`} className="marquee-item">
          <span className="h-1.5 w-1.5 rounded-full bg-primary/70" aria-hidden="true" />
          {item}
        </span>
      ))}
    </div>
  );

  return (
    <section className={`marquee ${className}`} aria-label={accessibleLabel}>
      {label && <span className="marquee-label">{label}</span>}
      <div className="marquee-viewport">
        <div className="marquee-track">
          {marketGroup()}
          {marketGroup(true)}
        </div>
      </div>
    </section>
  );
}