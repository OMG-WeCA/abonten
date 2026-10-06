'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '../LocaleProvider';
import { Sun, Moon } from 'lucide-react';

interface Ad {
  city: string;
  area: string;
  accent: string;
}

const ADS: Ad[] = [
  { city: 'Lagos', area: 'Eko Atlantic', accent: 'var(--color-primary)' },
  { city: 'Accra', area: 'Osu · Ring Road', accent: 'var(--color-accent-gold)' },
  { city: 'Douala', area: 'Bonanjo', accent: 'var(--color-accent-teal)' },
  { city: 'Abuja', area: 'Wuse II', accent: 'var(--color-accent-blue)' },
];

// Fixed star field for the night scene (percent positions within the panel).
const STARS = [
  { l: '8%', t: '14%', s: 2, d: '0s' },
  { l: '18%', t: '26%', s: 1.5, d: '0.4s' },
  { l: '27%', t: '12%', s: 2.5, d: '0.8s' },
  { l: '38%', t: '22%', s: 1.5, d: '1.2s' },
  { l: '47%', t: '9%', s: 2, d: '0.2s' },
  { l: '58%', t: '18%', s: 1.5, d: '1s' },
  { l: '67%', t: '28%', s: 2, d: '0.6s' },
  { l: '76%', t: '12%', s: 2.5, d: '1.4s' },
  { l: '85%', t: '24%', s: 1.5, d: '0.3s' },
  { l: '92%', t: '15%', s: 2, d: '0.9s' },
  { l: '14%', t: '40%', s: 1.5, d: '1.1s' },
  { l: '33%', t: '44%', s: 2, d: '0.5s' },
  { l: '52%', t: '40%', s: 1.5, d: '1.3s' },
  { l: '71%', t: '42%', s: 2, d: '0.7s' },
  { l: '88%', t: '38%', s: 1.5, d: '1.5s' },
  { l: '23%', t: '33%', s: 1.5, d: '0.1s' },
];

/**
 * Signature OOH effect: a billboard that cycles WeCA creatives and toggles
 * between day (unlit) and night (illuminated, glowing) — evoking the
 * illumination attribute billboards carry. Pure CSS + a tiny
 * state/interval; no IntersectionObserver, so it can never go blank.
 */
export function BillboardShowcase() {
  const { locale } = useLocale();
  const [night, setNight] = useState(true);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((p) => (p + 1) % ADS.length), 2800);
    return () => clearInterval(id);
  }, []);

  const ad = ADS[index];

  return (
    <div className="mx-auto max-w-3xl">
      <div
        className={`relative overflow-hidden rounded-2xl border border-border p-6 transition-colors duration-700 sm:p-10 ${night ? 'bg-surface-2' : 'bg-surface'}`}
        style={{ minHeight: 380 }}
      >
        {night && (
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {STARS.map((st, i) => (
              <span
                key={i}
                className="twinkle-star absolute rounded-full bg-foreground"
                style={{ left: st.l, top: st.t, width: st.s, height: st.s, animationDelay: st.d }}
              />
            ))}
          </div>
        )}

        <div className="relative mx-auto flex max-w-md flex-col items-center">
          {/* Panel frame */}
          <div
            className={`relative aspect-[16/9] w-full overflow-hidden rounded-md border-4 transition-all duration-700 ${night ? 'border-border' : 'border-foreground/30'}`}
            style={{
              boxShadow: night
                ? `0 0 0 1px ${ad.accent}, 0 0 45px ${ad.accent}, 0 0 90px color-mix(in oklab, ${ad.accent} 55%, transparent)`
                : '0 12px 30px rgba(0, 0, 0, 0.35)',
            }}
          >
            {/* Cycling creative — raises in like a billboard panel */}
            <div
              key={index}
              className="billboard-ad absolute inset-0 flex flex-col justify-between p-4 sm:p-5"
              style={{
                background: `linear-gradient(135deg, color-mix(in oklab, ${ad.accent} 85%, black), color-mix(in oklab, ${ad.accent} 50%, black))`,
              }}
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/80">
                Abonten · Illustration
              </span>
              <div>
                <div className="text-3xl font-black uppercase leading-none text-white drop-shadow sm:text-4xl">
                  {ad.city}
                </div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-white/85">
                  {ad.area}
                </div>
              </div>
            </div>
            {/* Day dimming overlay (unlit panel reads flatter in daylight) */}
            {!night && <div className="absolute inset-0 bg-background/45" aria-hidden="true" />}
          </div>

          {/* Legs */}
          <div className="flex w-2/3 justify-between">
            <span className="h-20 w-2.5 rounded-b bg-gradient-to-b from-border to-background" />
            <span className="h-20 w-2.5 rounded-b bg-gradient-to-b from-border to-background" />
          </div>
          {/* Ground line */}
          <div className="h-px w-4/5 bg-foreground/20" />
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => setNight((n) => !n)}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-foreground transition-colors hover:border-primary/60 hover:text-primary"
          aria-label={locale === 'fr' ? 'Passer du jour à la nuit' : 'Toggle day and night'}
        >
          {night ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          {night ? (locale === 'fr' ? 'Nuit' : 'Night') : locale === 'fr' ? 'Jour' : 'Day'}
        </button>
        <p className="text-xs uppercase tracking-wider text-muted">
          {locale === 'fr'
            ? 'Éclairage de nuit · vue de jour'
            : 'Night illumination · daytime view'}
        </p>
      </div>
    </div>
  );
}
