import { useEffect, useRef, useState } from 'react';

interface UseInViewOptions {
  /** Margin around the root, e.g. "0px 0px -10% 0px" triggers slightly before fully in view. */
  rootMargin?: string;
  /** Intersection ratio required before triggering. */
  threshold?: number;
  /** When true (default), the element stays visible after the first intersection. */
  once?: boolean;
}

/**
 * Lightweight Intersection Observer hook for scroll-triggered reveals.
 * Falls back to "visible" when IO is unavailable (SSR / very old browsers)
 * so content is never permanently hidden.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(options: UseInViewOptions = {}) {
  const { rootMargin = '0px 0px -10% 0px', threshold = 0.12, once = true } = options;
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) obs.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { rootMargin, threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin, threshold, once]);

  return { ref, inView } as const;
}