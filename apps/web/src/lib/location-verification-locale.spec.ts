import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  locationVerificationMessage,
  localizedRejectionReason,
} from './location-verification-locale';

test('persisted English decisions render French and back without changing original evidence', () => {
  const check = {
    status: 'mismatch' as const,
    toleranceMeters: 250,
    policyVersion: 'address-pin-v1',
    message: 'Original English immutable decision',
  };
  const original = JSON.stringify(check);
  assert.match(locationVerificationMessage(check, 'fr'), /plus de 250 m.*soumettez/);
  assert.match(locationVerificationMessage(check, 'en'), /more than 250 m.*resubmit/);
  assert.match(
    locationVerificationMessage({ ...check, status: 'unable_to_verify' }, 'fr', true),
    /écart confirmé précédemment reste applicable/,
  );
  assert.equal(JSON.stringify(check), original);
});
test('unknown policies preserve original meaning instead of applying current policy copy', () => {
  assert.equal(
    locationVerificationMessage(
      { status: 'matched', policyVersion: 'future-v2', message: 'Original custom policy' },
      'fr',
    ),
    'Original custom policy',
  );
});
test('only exact automatic rejection copy localizes; manual reviewer notes and prefixes remain original', () => {
  const decision = {
    status: 'mismatch' as const,
    toleranceMeters: 250,
    policyVersion: 'address-pin-v1',
    message: '',
  };
  const en = locationVerificationMessage(decision, 'en');
  const fr = locationVerificationMessage(decision, 'fr');
  assert.equal(localizedRejectionReason(en, 'fr'), fr);
  assert.equal(localizedRejectionReason(fr, 'en'), en);
  assert.equal(localizedRejectionReason(`Reviewer note: ${en}`, 'fr'), `Reviewer note: ${en}`);
  assert.equal(
    localizedRejectionReason('Permit needs manual inspection.', 'fr'),
    'Permit needs manual inspection.',
  );
});
