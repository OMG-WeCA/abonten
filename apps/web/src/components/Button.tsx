import type { ButtonHTMLAttributes } from 'react';
import Link from 'next/link';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'white';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-primary text-white hover:bg-primary-hover shadow-lg shadow-primary/25 hover:shadow-primary/40',
  secondary:
    'bg-surface text-foreground border border-border hover:border-primary/60 hover:text-primary',
  outline: 'border border-foreground/25 text-foreground hover:bg-foreground/10 hover:border-foreground/40',
  ghost: 'text-foreground hover:bg-surface',
  white: 'bg-white text-primary hover:bg-white/90 shadow-lg shadow-black/10',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
  xl: 'px-8 py-3.5 text-base',
};

const base =
  'btn-sheen inline-flex items-center justify-center gap-2 rounded-full font-semibold uppercase tracking-wide transition-all duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.03] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60 disabled:pointer-events-none';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** When provided, the button renders as a link (internal route, mailto, or external URL). */
  href?: string;
}

function classesFor(variant: Variant, size: Size, className?: string) {
  return [base, variantClasses[variant], sizeClasses[size], className].filter(Boolean).join(' ');
}

function isExternal(href: string) {
  return /^https?:\/\//.test(href) || href.startsWith('mailto:') || href.startsWith('tel:');
}

export function Button({ variant = 'primary', size = 'md', href, className, children, ...rest }: ButtonProps) {
  const cls = classesFor(variant, size, className);

  if (href !== undefined) {
    const ariaLabel = rest['aria-label'];
    if (isExternal(href)) {
      return (
        <a href={href} className={cls} aria-label={ariaLabel}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={cls} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }

  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}