import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  localizeHttpError,
  localizedErrorMessage,
  requestLocale,
} from './localized-exception.filter';

describe('localized API errors', () => {
  it('negotiates English/French country variants and quality without taking unsupported languages', () => {
    assert.equal(requestLocale('fr-CI,fr;q=.9,en;q=.8'), 'fr');
    assert.equal(requestLocale('fr;q=.2,en;q=.8'), 'en');
    assert.equal(requestLocale('de,fr;q=.7'), 'fr');
    assert.equal(requestLocale('fr;q=0,en;q=.5'), 'en');
    assert.equal(requestLocale('fr;q=9'), 'en');
  });
  it('preserves structured machine fields and status while translating validation messages', () => {
    const exception = new BadRequestException({
      message: [
        'email must be an email',
        'latitude must not be greater than 90',
        'locale must be one of the following values: en, fr',
      ],
      errorCode: 'validation',
      fields: ['email', 'latitude', 'locale'],
    });
    const result = localizeHttpError(exception, 'fr');
    assert.equal(result.statusCode, 400);
    assert.equal(result.errorCode, 'validation');
    assert.deepEqual(result.fields, ['email', 'latitude', 'locale']);
    assert.deepEqual(result.message, [
      'Saisissez une adresse email valide.',
      'Le champ « latitude » doit être inférieur ou égal à 90.',
      'Choisissez une valeur proposée pour « langue ».',
    ]);
    assert.deepEqual(
      localizeHttpError(exception, 'en').message,
      exception.getResponse() && (exception.getResponse() as { message: string[] }).message,
    );
  });
  it('makes location conflict/media failures actionable and never translates arbitrary provider details', () => {
    assert.match(
      String(
        localizeHttpError(
          new ConflictException(
            'Location changed during verification. Check the saved address and pin, then retry.',
          ),
          'fr',
        ).message,
      ),
      /adresse et le point/,
    );
    assert.match(
      localizedErrorMessage('Only JPEG, PNG, or WebP images are accepted.', 400),
      /JPEG, PNG ou WebP/,
    );
    assert.match(
      String(
        localizeHttpError(new ServiceUnavailableException('provider secret URL diagnostic'), 'fr')
          .message,
      ),
      /temporairement indisponible/,
    );
    assert.doesNotMatch(
      String(
        localizeHttpError(new ServiceUnavailableException('provider secret URL diagnostic'), 'fr')
          .message,
      ),
      /secret/,
    );
  });
  it('uses a stable auth error code when the service already returned French', () => {
    const result = localizeHttpError(
      new BadRequestException({
        message: 'Code de connexion incorrect ou expiré',
        errorCode: 'auth.invalid_code',
      }),
      'fr',
    );
    assert.equal(result.message, 'Code de connexion incorrect ou expiré');
  });
  it('preserves the terms content-change code and actionable French reaffirmation guidance', () => {
    const result = localizeHttpError(
      new ConflictException({
        code: 'PARTNER_TERMS_CONTENT_CHANGED',
        message:
          'Le contenu des conditions a changé. Rechargez-le, consultez-le et confirmez à nouveau.',
      }),
      'fr',
    );
    assert.equal(result.statusCode, 409);
    assert.equal(result.code, 'PARTNER_TERMS_CONTENT_CHANGED');
    assert.equal(
      result.message,
      'Le contenu des conditions a changé. Rechargez-le, consultez-le et confirmez à nouveau.',
    );
  });
});
