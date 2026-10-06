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
const messages: Record<string, string> = {
  'Name is required': 'Le nom est requis',
  'Profile photo not found': 'Photo de profil introuvable',
  'Choose a PNG, JPEG, or WebP profile photo under 5 MB':
    'Choisissez une photo de profil PNG, JPEG ou WebP de moins de 5 Mo',
  'Profile photo must be under 5 MB': 'La photo de profil doit faire moins de 5 Mo',
  'a front-on reference photo with a known capture date is required':
    'Ajoutez une photo de face avec une date de prise connue pour pouvoir soumettre le site',
  'a front-on reference photo is required': 'Une photo de référence de face est requise',
  'add at least one bookable face': 'Ajoutez au moins une face réservable',
  'add a current rate for each bookable face':
    'Ajoutez un tarif en cours pour chaque face réservable',
  'complete the pixel and loop/spot details for each bookable digital face':
    'Complétez les pixels et les durées de boucle et de spot de chaque face numérique réservable',
  'the recorded permit has expired': 'Le permis enregistré a expiré',
  'Terms version is unavailable': 'Cette version des conditions est indisponible',
  'Terms language must match the selected onboarding language':
    'La langue des conditions doit correspondre à celle choisie à l’inscription',
  'Confirm your authority and expressly accept the displayed version.':
    'Confirmez votre autorité et acceptez expressément la version affichée.',
  'The terms version changed. Review it and accept again.':
    'La version des conditions a changé. Consultez-la et acceptez-la à nouveau.',
  'The review draft is not active for acceptance.':
    'Le projet de revue n’est pas activé pour acceptation.',
  'No approved terms release is configured. The review draft cannot be activated.':
    'Aucune version approuvée des conditions n’est configurée. Le projet de revue ne peut pas être activé.',
  'Bad Request': 'Vérifiez les informations saisies.',
  Unauthorized: 'Reconnectez-vous pour continuer.',
  Forbidden: 'Vous n’avez pas accès à cette action.',
  'Not Found': 'Cet élément est introuvable.',
  Conflict: 'Cet élément a changé. Actualisez et réessayez.',
  'ThrottlerException: Too Many Requests': 'Trop de demandes. Réessayez dans quelques instants.',
  'Organization name is required': 'Le nom de l’organisation est requis',
  'Country is required': 'Le pays est requis',
  'Partner terms apply only to media partners':
    'Les conditions partenaires concernent uniquement les partenaires média',
  'An active partner organization owner must accept terms':
    'Le propriétaire actif d’une organisation partenaire doit accepter les conditions',
  'Terms acceptance is not active': 'L’acceptation des conditions n’est pas activée',
  'Active organization membership required': 'Une adhésion active à l’organisation est requise',
  'Active representative not found': 'Le représentant actif est introuvable',
  'Add at least one positive daily, weekly, or monthly rate.':
    'Ajoutez au moins un tarif journalier, hebdomadaire ou mensuel positif.',
  'Use a three-letter currency code.': 'Utilisez un code de devise à trois lettres.',
  'Rate end date must be on or after its start date.':
    'La fin du tarif doit être postérieure ou égale à son début.',
  'Minimum booking length must be at least one day.':
    'La durée minimale de réservation est d’un jour.',
  'Site not found': 'Site introuvable',
  'Face not found': 'Face introuvable',
  'Asset not found': 'Média introuvable',
  'Metadata not found': 'Métadonnées introuvables',
  'Rate card not found': 'Tarif introuvable',
  'Organization not found': 'Organisation introuvable',
  'User not found': 'Utilisateur introuvable',
  'Active membership not found': 'Adhésion active introuvable',
  'No file uploaded': 'Choisissez un fichier à importer',
  'Unknown photo kind.': 'Choisissez un type de photo valide.',
  'The uploaded file is empty.': 'Le fichier importé est vide.',
  'Only JPEG, PNG, or WebP images are accepted.':
    'Seules les images JPEG, PNG ou WebP sont acceptées.',
  'Reference photos are limited to 10 MB.': 'Les photos de référence sont limitées à 10 Mo.',
  'Board videos are limited to 50 MB.': 'Les vidéos du panneau sont limitées à 50 Mo.',
  'This image could not be decoded safely. Use a complete, still JPEG, PNG or WebP image up to 40 megapixels.':
    'Cette image ne peut pas être décodée en sécurité. Utilisez une image complète et fixe JPEG, PNG ou WebP de 40 mégapixels maximum.',
  'Use an actual MP4 or WebM recording of the LED board.':
    'Utilisez une vidéo MP4 ou WebM du panneau LED réel.',
  'Use one H.264 MP4 or VP8/VP9 WebM board recording, up to 60 seconds and 1920 × 1080 pixels (portrait also supported).':
    'Utilisez une seule vidéo H.264 MP4 ou VP8/VP9 WebM du panneau, de 60 secondes et 1920 × 1080 pixels maximum (portrait accepté).',
  'This video could not be decoded safely. Export a complete H.264 MP4 or VP8/VP9 WebM recording and retry.':
    'Cette vidéo ne peut pas être décodée en sécurité. Exportez une vidéo complète H.264 MP4 ou VP8/VP9 WebM et réessayez.',
  'Board video validation is unavailable. Keep your file and retry after service recovery.':
    'La validation vidéo est indisponible. Conservez votre fichier et réessayez après le rétablissement du service.',
  'Media processing is busy. Keep your file and retry shortly.':
    'Le traitement des médias est occupé. Conservez votre fichier et réessayez bientôt.',
  'Device capture requires latitude, longitude, GPS accuracy and capture time together.':
    'La capture sur place nécessite latitude, longitude, précision GPS et date de prise ensemble.',
  'Use a valid capture date that is not in the future.':
    'Utilisez une date de prise valide qui n’est pas dans le futur.',
  'Board recordings are only available for digital LED inventory.':
    'Les vidéos du panneau sont réservées aux sites LED numériques.',
  'This upload operation already belongs to a different file or metadata. Start a new upload.':
    'Cet import correspond déjà à un autre fichier ou à d’autres métadonnées. Lancez un nouvel import.',
  'This legacy asset needs a replacement photo before it can be displayed.':
    'Remplacez cette ancienne photo avant de pouvoir l’afficher.',
  'Location changed during verification. Check the saved address and pin, then retry.':
    'L’emplacement a changé pendant la vérification. Vérifiez l’adresse et le point enregistrés, puis réessayez.',
  'Site status changed during verification. Refresh the site before retrying.':
    'Le statut du site a changé pendant la vérification. Actualisez avant de réessayer.',
  'Correct the address/pin mismatch and resubmit before listing this site.':
    'Corrigez l’incohérence entre l’adresse et le point, puis soumettez à nouveau avant publication.',
  'The selected face does not belong to this site.': 'La face choisie n’appartient pas à ce site.',
  'Only future rate cards can be withdrawn. End a current rate instead.':
    'Seuls les tarifs futurs peuvent être retirés. Terminez un tarif en cours.',
  'Remove this face’s unavailable periods before removing the face.':
    'Retirez les périodes d’indisponibilité de cette face avant de la supprimer.',
  'Choose a valid period of 1 to 366 days. The end date is the first available day.':
    'Choisissez une période valide de 1 à 366 jours. La date de fin est le premier jour disponible.',
  'Give a reason for the unavailable period.':
    'Indiquez un motif pour la période d’indisponibilité.',
  'An unavailable period already overlaps these dates.':
    'Une période d’indisponibilité recouvre déjà ces dates.',
  'A reservation already overlaps these dates.': 'Une réservation recouvre déjà ces dates.',
  'Unavailable period not found': 'Période d’indisponibilité introuvable',
  'No active organization context': 'Choisissez une organisation active',
  'No inventory or marketplace access': 'Vous n’avez pas accès aux sites ou à la place de marché',
  'Only media-partner organizations can manage billboard inventory':
    'Seules les organisations partenaires média peuvent gérer les sites',
  'Site not available': 'Site indisponible',
  'Not your site': 'Ce site n’appartient pas à votre organisation',
  'Not your face': 'Cette face n’appartient pas à votre organisation',
  'Not your rate card': 'Ce tarif n’appartient pas à votre organisation',
  'Not your unavailable period': 'Cette période n’appartient pas à votre organisation',
  'Too many sign-in code requests. Please try again later.':
    'Trop de demandes de code de connexion. Réessayez plus tard.',
  'Too many verification attempts. Please try again later.':
    'Trop de tentatives de vérification. Réessayez plus tard.',
  'Sign-in is temporarily unavailable. Please try again.':
    'La connexion est temporairement indisponible. Réessayez.',
  'Invalid or expired sign-in code': 'Code de connexion incorrect ou expiré',
  'latitude must be between -90 and 90': 'la latitude doit être comprise entre -90 et 90',
  'longitude must be between -180 and 180': 'la longitude doit être comprise entre -180 et 180',
  'orientation must be between 0 and 359 degrees':
    'l’orientation doit être comprise entre 0 et 359 degrés',
  'viewing distance must be greater than 0': 'la distance de vision doit être supérieure à 0',
  'elevation cannot be negative': 'la hauteur ne peut pas être négative',
  'illumination hours should look like 18:00-06:00 or 24/7':
    'les horaires d’éclairage doivent être du type 18:00-06:00 ou 24/7',
  'Add at least one bookable face': 'Ajoutez au moins une face réservable',
  'Add a front photo': 'Ajoutez une photo de face',
};
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
  const match = /^([a-zA-Z][\w.]*)(?: each value in)? (.+)$/.exec(message);
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
