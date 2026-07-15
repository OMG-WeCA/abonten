import { useEffect, useRef } from 'react';

/**
 * Subtle scroll parallax: translates the element on the Y axis as the page
 * scrolls, capped so it never reveals gaps. GPU-friendly (transform only),
 * passive listeners, rAF-batched, and disabled under prefers-reduced-motion.
 */
export function useParallax<T extends HTMLElement = HTMLDivElement>(speed = 0.15, max = 70) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const y = Math.min(window.scrollY * speed, max);
      el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [speed, max]);

  return ref;
}