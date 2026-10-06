import errorCopy from '@abonten/contracts/http-error-copy.json';
import { accountCopy } from './account-locale';
import { sitesCopy } from './sites-locale';

const pairs = new Map<string, string>(Object.entries(errorCopy));
function register(en: unknown, fr: unknown): void {
  if (typeof en === 'string' && typeof fr === 'string') pairs.set(en, fr);
  else if (en && fr && typeof en === 'object' && typeof fr === 'object') {
    for (const [key, value] of Object.entries(en))
      register(value, (fr as Record<string, unknown>)[key]);
  }
}
register(accountCopy.en, accountCopy.fr);
register(sitesCopy.en, sitesCopy.fr);
for (const [en, fr] of [
  [
    'Draft saved. Some media did not upload; your files remain here. Retry or open the draft.',
    'Le brouillon est enregistré. Certains médias n’ont pas été transférés ; vos fichiers restent ici. Réessayez ou ouvrez le brouillon.',
  ],
  [
    'Remove the selected video or restore LED format before saving.',
    'Retirez la vidéo sélectionnée ou rétablissez le format LED avant l’enregistrement.',
  ],
  [
    'Remaining files are preserved. Correct the reported file or retry.',
    'Les fichiers restants sont conservés. Corrigez le fichier signalé ou réessayez.',
  ],
  [
    'Upload could not finish. Check your connection and retry.',
    'L’import n’a pas pu aboutir. Vérifiez votre connexion et réessayez.',
  ],
] as const)
  pairs.set(en, fr);
const reverse = new Map(Array.from(pairs, ([en, fr]) => [fr, en]));

/** Exact controlled UI/error copy only. Retained failures switch language without
 * changing original evidence, field contents, provider diagnostics or user prose. */
export function displayUiText(value: string, locale?: string): string {
  const translations = locale === 'fr' ? pairs : reverse;
  const exact = translations.get(value);
  if (exact !== undefined) return exact;
  const count = /^(0|[1-9]\d{0,3}) (.+)$/.exec(value);
  if (
    count &&
    (
      [
        sitesCopy.en.register.errorSummarySuffix,
        sitesCopy.fr.register.errorSummarySuffix,
      ] as readonly string[]
    ).includes(count[2])
  )
    return `${count[1]} ${translations.get(count[2]) ?? count[2]}`;
  // Only the application's fixed Details prefix is translated; unknown diagnostic
  // or filenames after it remain literal unless themselves exact controlled copy.
  for (const prefix of [sitesCopy.en.detail.actionFailed, sitesCopy.fr.detail.actionFailed]) {
    if (value.startsWith(prefix)) {
      const rest = value.slice(prefix.length);
      return `${translations.get(prefix) ?? prefix}${translations.get(rest) ?? rest}`;
    }
  }
  return value;
}
