'use client';

import type { ReactNode } from 'react';
import { useInView } from './useInView';

interface RevealProps {
  children: ReactNode;
  /** Kept for API compatibility; the reveal is always a subtle fade-up. */
  variant?: 'up' | 'in' | 'left' | 'right' | 'scale';
  /** Stagger delay in milliseconds (applied via animation-delay). */
  delay?: number;
  className?: string;
  once?: boolean;
}

/**
 * Progressive-enhancement scroll reveal. Content renders VISIBLE by default.
 * When the element scrolls into view, JS adds `.reveal-animate` to play a
 * subtle fade-up. If JS or the IntersectionObserver never fires, content
 * simply stays visible — it is never hidden waiting for a trigger.
 */
export function Reveal({ children, delay = 0, className = '', once = true }: RevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>({ once });
  return (
    <div
      ref={ref}
      className={`reveal ${inView ? 'reveal-animate' : ''} ${className}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}