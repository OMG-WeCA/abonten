'use client';

import { Check, Languages } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { Locale } from './LocaleProvider';

const languages = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
] as const;

/** Shared visual control; document readers can change language without saving a profile. */
export function LanguageMenu({
  locale,
  onChange,
  saving = false,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
  saving?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const label = locale === 'fr' ? 'Langue' : 'Language';
  const current = languages.find((language) => language.value === locale)!;

  useEffect(() => {
    if (!open) return;
    options.current[languages.findIndex((language) => language.value === locale)]?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open, locale]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <div
      ref={root}
      className="relative shrink-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={`${label}: ${current.label}`}
        title={`${label}: ${current.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-busy={saving}
        disabled={saving}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={`flex h-11 w-11 items-center justify-center rounded-lg transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 ${open ? 'bg-surface text-foreground' : 'text-muted hover:bg-surface hover:text-foreground'}`}
      >
        <Languages aria-hidden="true" className="h-5 w-5" />
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={label}
          className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-border bg-surface-2 p-1.5 shadow-xl"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              close();
            } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              const index = options.current.findIndex(
                (option) => option === document.activeElement,
              );
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? languages.length - 1
                    : (index + (event.key === 'ArrowDown' ? 1 : -1) + languages.length) %
                      languages.length;
              options.current[next]?.focus();
            }
          }}
        >
          {languages.map((language, index) => (
            <button
              key={language.value}
              ref={(element) => {
                options.current[index] = element;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={locale === language.value}
              lang={language.value}
              tabIndex={-1}
              onClick={() => {
                close();
                onChange(language.value);
              }}
              className="flex min-h-11 w-full items-center justify-between gap-4 rounded-lg px-3 text-left text-sm font-semibold text-foreground hover:bg-surface focus:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              {language.label}
              {locale === language.value && (
                <Check aria-hidden="true" className="h-4 w-4 text-primary" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
