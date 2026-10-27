import { Field, inputClass } from './sites-ui';
import { getSitesCopy } from '../../lib/sites-locale';

export function screenPixelError(value: string, locale?: string): string | undefined {
  if (!value.trim()) return undefined;
  const number = Number(value);
  if (!/^\d+$/.test(value.trim()) || !Number.isInteger(number) || number < 1 || number > 2147483647)
    return locale === 'fr'
      ? 'Saisissez un nombre entier positif de pixels.'
      : 'Enter a positive whole number of pixels.';
}

export function ScreenResolutionFields({
  id,
  width,
  height,
  onChange,
  locale,
  errors = {},
}: {
  id: string;
  width: string;
  height: string;
  locale?: 'en' | 'fr';
  onChange: (field: 'pixelWidth' | 'pixelHeight', value: string) => void;
  errors?: { pixelWidth?: string; pixelHeight?: string };
}) {
  const copy = getSitesCopy(locale);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(['pixelWidth', 'pixelHeight'] as const).map((field) => (
        <Field
          key={field}
          label={copy.detail[field]}
          htmlFor={`${id}-${field}`}
          error={errors[field]}
        >
          <input
            id={`${id}-${field}`}
            type="text"
            inputMode="numeric"
            value={field === 'pixelWidth' ? width : height}
            onChange={(event) => onChange(field, event.target.value)}
            aria-invalid={Boolean(errors[field])}
            className={inputClass}
          />
        </Field>
      ))}
    </div>
  );
}
