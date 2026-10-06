import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';

/** Supported language negotiation; country variants share the product language. */
export function requestLocale(header: string | undefined): 'en' | 'fr' {
  const candidates = (header ?? '')
    .split(',')
    .map((part, index) => {
      const [tag, quality] = part.trim().split(';');
      const q = quality?.trim().startsWith('q=') ? Number(quality.trim().slice(2)) : 1;
      return { language: tag.toLowerCase().split('-')[0], q, index };
    })
    .filter(
      (item) =>
        ['en', 'fr'].includes(item.language) &&
        Number.isFinite(item.q) &&
        item.q > 0 &&
        item.q <= 1,
    )
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return candidates[0]?.language === 'fr' ? 'fr' : 'en';
}
// One public, controlled-copy registry is shared with client error display.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const messages: Record<string, string> = require('@abonten/contracts/http-error-copy.json');
const codeMessages: Record<string, string> = {
  'auth.request_limit': messages['Too many sign-in code requests. Please try again later.'],
  'auth.verify_limit': messages['Too many verification attempts. Please try again later.'],
  'auth.unavailable': messages['Sign-in is temporarily unavailable. Please try again.'],
  'auth.invalid_code': messages['Invalid or expired sign-in code'],
  PARTNER_TERMS_ACCEPTANCE_REQUIRED:
    messages['Confirm your authority and expressly accept the displayed version.'],
  PARTNER_TERMS_VERSION_CHANGED: messages['The terms version changed. Review it and accept again.'],
  PARTNER_TERMS_CONTENT_CHANGED:
    'Le contenu des conditions a changé. Rechargez-le, consultez-le et confirmez à nouveau.',
  PARTNER_TERMS_ACCEPTANCE_DISABLED: messages['The review draft is not active for acceptance.'],
  PARTNER_TERMS_RELEASE_UNAPPROVED:
    messages['No approved terms release is configured. The review draft cannot be activated.'],
};
const fields: Record<string, string> = {
  name: 'nom',
  organizationName: 'nom de l’organisation',
  email: 'adresse email',
  phone: 'téléphone',
  country: 'pays',
  city: 'ville',
  region: 'région',
  address: 'adresse',
  code: 'code',
  locale: 'langue',
  defaultLocale: 'langue par défaut',
  defaultCurrency: 'devise par défaut',
  currency: 'devise',
  timezone: 'fuseau horaire',
  latitude: 'latitude',
  longitude: 'longitude',
  width: 'largeur',
  height: 'hauteur',
  format: 'format',
  orientationDeg: 'orientation',
  viewingDistance: 'distance de vision',
  elevation: 'hauteur au sol',
  illuminationHours: 'horaires d’éclairage',
  capturedAt: 'date de prise',
  captureMethod: 'méthode de capture',
  captureAccuracy: 'précision GPS',
  deviceLatitude: 'latitude du relevé GPS',
  deviceLongitude: 'longitude du relevé GPS',
  deviceAccuracyMeters: 'précision GPS en mètres',
  deviceCapturedAt: 'date et heure de capture',
  deviceLocationRecordedAt: 'date et heure du relevé GPS',
  termsVersion: 'version des conditions',
  termsLanguage: 'langue des conditions',
  representativeName: 'nom du représentant',
  accepted: 'acceptation',
  reason: 'motif',
  startDate: 'date de début',
  endDate: 'date de fin',
  faceLabel: 'libellé de face',
  faceId: 'face',
  organizationId: 'organisation',
  minBookingDays: 'durée minimale de réservation',
  amount: 'montant',
  message: 'message',
  briefText: 'texte du brief',
  shareBriefWithProvider: 'autorisation de partage du brief',
  selectedSiteIds: 'panneaux sélectionnés',
  selectedFaceIds: 'faces sélectionnées',
  faceCurrencies: 'devises des faces',
  selectionTruncated: 'sélection partielle',
  history: 'historique du chat',
  role: 'rôle',
  content: 'contenu',
  search: 'recherche',
  expectedDigest: 'empreinte du texte affiché',
  authority: 'autorité du représentant',
};
function fallback(status: number): string {
  if (status === 401) return messages.Unauthorized;
  if (status === 403) return messages.Forbidden;
  if (status === 404) return messages['Not Found'];
  if (status === 409) return messages.Conflict;
  if (status === 413)
    return 'Le fichier ou la demande est trop volumineux. Réduisez sa taille et réessayez.';
  if (status === 429) return 'Trop de demandes. Réessayez dans quelques instants.';
  if (status >= 500)
    return 'Le service est temporairement indisponible. Conservez vos informations et réessayez.';
  return 'Vérifiez les informations saisies et réessayez.';
}
/** Only translate controlled domain/validator copy; never interpret arbitrary provider content. */
export function localizedErrorMessage(message: string, status: number): string {
  if (messages[message]) return messages[message];
  if (Object.values(messages).includes(message)) return message;
  if (
    [
      'Invalid Office document archive.',
      'Invalid Office document directory.',
      'Invalid Office archive entry.',
      'Invalid Office local entry.',
      'Inconsistent Office archive entry.',
      'Corrupt Office archive entry.',
      'Invalid Office archive directory size.',
      'Malformed Office relationship attributes.',
    ].includes(message)
  )
    return 'La structure du document Office est invalide ou endommagée. Exportez-le à nouveau ou utilisez un export texte.';
  // These are parser-owned structural labels, not document text or diagnostics.
  const office = '(?:PowerPoint slide|Excel worksheet)';
  if (
    new RegExp(
      `^(?:${office} relationships are missing|Malformed ${office} relationships|${office} order is missing)\\. Export the document again\\.$`,
    ).test(message) ||
    new RegExp(
      `^(?:Malformed (?:or duplicate )?${office} relationships|${office} order references a missing or duplicate relationship|${office} order references an invalid relationship type|Malformed ${office} order)\\.$`,
    ).test(message)
  )
    return 'Les liens ou l’ordre des diapositives PowerPoint ou des feuilles Excel sont invalides ou incomplets. Exportez le document à nouveau.';
  if (
    new RegExp(
      `^(?:External ${office} relationships are not accepted|Unsafe ${office} relationship target|${office} relationship target is missing or unsafe)\\.$`,
    ).test(message)
  )
    return 'Les liens externes ou les cibles manquantes ou non sûres du document ne sont pas acceptés. Utilisez un export texte.';
  const combined =
    /^(Please fix: |Site is not ready for review: |Site cannot be listed yet: )(.+)\.$/.exec(
      message,
    );
  if (combined)
    return `${combined[1] === 'Please fix: ' ? 'À corriger : ' : 'Ce site doit être complété : '}${combined[2]
      .split('; ')
      .map((part) => localizedErrorMessage(part, status))
      .join(' ; ')}.`;
  if (/^coordinates fall outside .+'s bounding box — check the pin$/.test(message))
    return 'Les coordonnées se trouvent hors du pays choisi. Vérifiez le point sur la carte.';
  const match = /^(?:each value in )?([a-zA-Z][\w.]*)(?: each value in)? (.+)$/.exec(message);
  if (match) {
    const key = match[1].split('.').at(-1) ?? '';
    const label = fields[key];
    const rule = match[2];
    if (label) {
      if (rule.includes('must be an email')) return `Saisissez une ${label} valide.`;
      if (rule.includes('must be a six-digit')) return 'Le code doit comporter six chiffres.';
      if (rule.includes('should not be empty') || rule.includes('must not be empty'))
        return `Le champ « ${label} » est requis.`;
      if (rule.includes('must be a string')) return `Le champ « ${label} » doit être un texte.`;
      if (rule.includes('must be a number') || rule.includes('must be an integer'))
        return `Saisissez un nombre valide pour « ${label} ».`;
      if (rule.includes('must be a valid ISO') || rule.includes('must be a Date'))
        return `Saisissez une date valide pour « ${label} ».`;
      if (rule.includes('must be one of the following values'))
        return `Choisissez une valeur proposée pour « ${label} ».`;
      if (rule.includes('must be a boolean')) return `Confirmez le choix pour « ${label} ».`;
      if (rule.includes('must be an array'))
        return `Choisissez une liste valide pour « ${label} ».`;
      if (rule.includes('must contain a UUID'))
        return `Choisissez des éléments valides pour « ${label} ».`;
      if (rule.includes('must be unique') || rule.includes("mustn't contain duplicate"))
        return `Chaque élément de « ${label} » doit être unique.`;
      const items = /must contain (?:not more than|no more than) (\d+) elements/.exec(rule);
      if (items) return `Choisissez au maximum ${items[1]} éléments pour « ${label} ».`;
      if (rule.includes('must be a UUID')) return `Choisissez un élément valide pour « ${label} ».`;
      const min = /must not be less than ([\d.-]+)/.exec(rule);
      if (min) return `Le champ « ${label} » doit être supérieur ou égal à ${min[1]}.`;
      const max = /must not be greater than ([\d.-]+)/.exec(rule);
      if (max) return `Le champ « ${label} » doit être inférieur ou égal à ${max[1]}.`;
      const length = /must be longer than or equal to (\d+) characters/.exec(rule);
      if (length) return `Le champ « ${label} » doit contenir au moins ${length[1]} caractères.`;
      const cap = /must be shorter than or equal to (\d+) characters/.exec(rule);
      if (cap) return `Le champ « ${label} » doit contenir au plus ${cap[1]} caractères.`;
      return `Vérifiez le champ « ${label} ».`;
    }
  }
  return fallback(status);
}
export function localizeHttpError(
  exception: HttpException,
  locale: 'en' | 'fr',
): Record<string, unknown> {
  const raw = exception.getResponse();
  const body: Record<string, unknown> =
    typeof raw === 'string' ? { message: raw } : { ...(raw as Record<string, unknown>) };
  body.statusCode = exception.getStatus();
  if (locale === 'en') return body;
  const code =
    typeof body.errorCode === 'string'
      ? body.errorCode
      : typeof body.code === 'string'
        ? body.code
        : '';
  if (codeMessages[code]) body.message = codeMessages[code];
  else if (Array.isArray(body.message))
    body.message = body.message.map((part: unknown) =>
      localizedErrorMessage(String(part), exception.getStatus()),
    );
  else
    body.message = localizedErrorMessage(
      typeof body.message === 'string' ? body.message : '',
      exception.getStatus(),
    );
  if (typeof body.error === 'string')
    body.error = messages[body.error] ?? fallback(exception.getStatus());
  return body;
}
@Catch(HttpException)
export class LocalizedExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const locale = requestLocale(request.get('accept-language'));
    response.setHeader('Content-Language', locale);
    response.status(exception.getStatus()).json(localizeHttpError(exception, locale));
  }
}
