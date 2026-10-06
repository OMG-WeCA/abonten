import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { displayUiText } from './display-ui-text';
import { accountCopy } from './account-locale';
import { sitesCopy } from './sites-locale';

test('retained controlled service and form failures render in the selected language without clearing state', () => {
  const original = 'The AI provider is unavailable. Contact your administrator.';
  const fr = displayUiText(original, 'fr');
  assert.match(fr, /Contactez votre administrateur/);
  assert.equal(displayUiText(fr, 'en'), original);
  assert.equal(
    displayUiText(accountCopy.en.workspace.switchError, 'fr'),
    accountCopy.fr.workspace.switchError,
  );
  assert.equal(
    displayUiText(sitesCopy.en.detail.photoUploadFailed, 'fr'),
    sitesCopy.fr.detail.photoUploadFailed,
  );
  assert.equal(original, 'The AI provider is unavailable. Contact your administrator.');
  assert.equal(
    displayUiText(`2 ${sitesCopy.en.register.errorSummarySuffix}`, 'fr'),
    `2 ${sitesCopy.fr.register.errorSummarySuffix}`,
  );
  assert.equal(
    displayUiText(`${sitesCopy.en.detail.actionFailed}CUSTOM ORIGINAL DIAGNOSTIC`, 'fr'),
    `${sitesCopy.fr.detail.actionFailed}CUSTOM ORIGINAL DIAGNOSTIC`,
  );
});
test('unknown provider, manual and document prose stays literal rather than inferred', () => {
  for (const value of [
    'Custom partner evidence',
    'Fournisseur inconnu : message original',
    '<script>raw inert text</script>',
  ]) {
    assert.equal(displayUiText(value, 'fr'), value);
    assert.equal(displayUiText(value, 'en'), value);
  }
});
