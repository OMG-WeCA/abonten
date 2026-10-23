import { renderNotificationEmail } from '../common/notification-email';

export type SignInLocale = 'en' | 'fr';
export const signInCopy = {
  en: {
    subject: 'Your Abonten sign-in code',
    intro: 'Use this code to sign in:',
    expiry: (minutes: number) =>
      `It expires in ${minutes} minutes. If you did not request it, you can ignore this email.`,
    requestLimit: 'Too many sign-in code requests. Please try again later.',
    verifyLimit: 'Too many verification attempts. Please try again later.',
    unavailable: 'Sign-in is temporarily unavailable. Please try again.',
    invalid: 'Invalid or expired sign-in code',
  },
  fr: {
    subject: 'Votre code de connexion Abonten',
    intro: 'Voici votre code de connexion :',
    expiry: (minutes: number) =>
      `Il expire dans ${minutes} minutes. Si vous ne l’avez pas demandé, vous pouvez ignorer cet email.`,
    requestLimit: 'Trop de demandes de code de connexion. Réessayez plus tard.',
    verifyLimit: 'Trop de tentatives de vérification. Réessayez plus tard.',
    unavailable: 'La connexion est temporairement indisponible. Réessayez.',
    invalid: 'Code de connexion incorrect ou expiré',
  },
} as const;
export function signInEmail(code: string, minutes: number, locale: SignInLocale = 'en') {
  const copy = signInCopy[locale];
  return renderNotificationEmail({
    locale,
    subject: copy.subject,
    title: locale === 'fr' ? 'Connectez-vous à Abonten' : 'Sign in to Abonten',
    preheader:
      locale === 'fr'
        ? `Votre code de connexion expire dans ${minutes} minutes.`
        : `Your sign-in code expires in ${minutes} minutes.`,
    paragraphs: [copy.intro],
    code,
    note: `${copy.expiry(minutes)} ${locale === 'fr' ? 'Ne partagez jamais ce code.' : 'Never share this code.'}`,
  });
}
