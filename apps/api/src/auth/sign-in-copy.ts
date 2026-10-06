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
    intro: 'Utilisez ce code pour vous connecter :',
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
  // Both dynamic values are generated server-side, never interpolated from user input.
  return {
    subject: copy.subject,
    html: `<html lang="${locale}"><body><p>${copy.intro}</p><p style="font-size: 28px; font-weight: 700; letter-spacing: 0.2em">${code}</p><p>${copy.expiry(minutes)}</p></body></html>`,
  };
}
