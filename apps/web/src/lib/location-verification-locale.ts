import { displayNumber } from './locale-format';

type RecordedCheck = {
  status: 'matched' | 'mismatch' | 'unable_to_verify';
  toleranceMeters?: number;
  policyVersion?: string;
  message: string;
};

/** Render the recorded decision in the current language without rerunning or changing it. */
export function locationVerificationMessage(
  check: RecordedCheck,
  locale?: string,
  recheck = false,
): string {
  // An unknown future policy's meaning must not be inferred from this version.
  if (check.policyVersion && check.policyVersion !== 'address-pin-v1') return check.message;
  const fr = locale === 'fr';
  if (recheck)
    return fr
      ? 'La dernière vérification est inconclusive. L’écart confirmé précédemment reste applicable ; corrigez l’adresse ou le repère, ou réessayez la vérification. Le site reste non publié.'
      : 'The latest check was inconclusive. The previously confirmed mismatch still applies; correct the address or pin, or retry verification. The site remains unpublished.';
  const tolerance = displayNumber(check.toleranceMeters ?? 250, locale);
  if (check.status === 'mismatch')
    return fr
      ? `Examen automatique : l’adresse précise et le repère sont distants de plus de ${tolerance} m. Corrigez l’adresse ou le repère, puis soumettez à nouveau. Le site reste non publié.`
      : `Automatically reviewed: the precise address and map pin are more than ${tolerance} m apart. Correct the address or pin, then resubmit. The site remains unpublished.`;
  if (check.status === 'matched')
    return fr
      ? `L’adresse et le repère correspondent à moins de ${tolerance} m. Le site doit encore être approuvé avant publication.`
      : `The address and map pin agree within ${tolerance} m. The site still needs approval before publication.`;
  return fr
    ? 'Impossible de vérifier l’adresse avec certitude. Précisez l’adresse et vérifiez le repère ; la soumission reste non publiée pour examen.'
    : 'Couldn’t verify the address with certainty. Add a precise address and check the pin; the submission remains unpublished for review.';
}

/** Automatic rejection copy can outlive the selected UI language. Manual notes
 * and prefixed/provider prose stay verbatim; only this policy's exact copy changes. */
export function localizedRejectionReason(value: string, locale?: string): string {
  const recorded = {
    status: 'mismatch' as const,
    toleranceMeters: 250,
    policyVersion: 'address-pin-v1',
    message: value,
  };
  const en = locationVerificationMessage(recorded, 'en');
  const fr = locationVerificationMessage(recorded, 'fr');
  return value === en || value === fr ? (locale === 'fr' ? fr : en) : value;
}
