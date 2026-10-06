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
  it('explains capture timezone and incomplete GPS failures in French without losing the correction', () => {
    for (const [message, expected] of [
      [
        'Capture times need a timezone; a calendar date may be supplied without a time.',
        /fuseau horaire.*date seule/,
      ],
      [
        'Device capture needs a timestamp with timezone; GPS latitude, longitude and accuracy must be supplied together when available.',
        /latitude, la longitude et la précision GPS/,
      ],
      [
        'GPS fix time needs complete device GPS and a timezone.',
        /latitude, la longitude, la précision GPS et un fuseau horaire/,
      ],
    ] as const) {
      const error = new BadRequestException(message);
      assert.match(String(localizeHttpError(error, 'fr').message), expected);
      assert.equal(localizeHttpError(error, 'en').message, message);
    }
    assert.match(
      localizedErrorMessage('deviceAccuracyMeters must not be greater than 100000', 400),
      /précision GPS en mètres.*100000/,
    );
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
  it('keeps document rejection and planner correction guidance in French with unchanged English contracts', () => {
    for (const [message, expected] of [
      [
        'Use PDF, DOCX, PPTX, XLSX, TXT, CSV, TSV or Markdown. Legacy DOC, PPT and XLS files must be exported first.',
        /Exportez d’abord les anciens fichiers DOC, PPT et XLS/,
      ],
      [
        'No readable text found. Scanned documents need a text layer or a text export; OCR is unavailable.',
        /couche de texte.*reconnaissance optique/,
      ],
      ['Document extraction timed out. Try a smaller document or text export.', /export texte/],
      ['Corrupt Office archive entry.', /endommagée.*Exportez/],
      [
        'PowerPoint slide relationships are missing. Export the document again.',
        /incomplets.*Exportez/,
      ],
      ['Unsafe Excel worksheet relationship target.', /non sûres.*export texte/],
      ['Choose one pricing currency per selected face.', /une seule devise.*face/],
      [
        'Choose a valid inclusive start and exclusive end date within 366 days.',
        /début incluse.*fin exclue.*366/,
      ],
    ] as const) {
      assert.match(localizedErrorMessage(message, 400), expected);
      const error = new BadRequestException({ message, code: 'unchanged' });
      assert.equal(localizeHttpError(error, 'en').message, message);
      assert.equal(localizeHttpError(error, 'fr').code, 'unchanged');
    }
    assert.match(
      localizedErrorMessage('selectedFaceIds must contain no more than 24 elements', 400),
      /24.*faces sélectionnées/,
    );
    assert.match(
      localizedErrorMessage('briefText must be shorter than or equal to 60000 characters', 400),
      /texte du brief.*60000/,
    );
    assert.doesNotMatch(
      localizedErrorMessage('Unsafe PRIVATE_CUSTOM document content', 400),
      /PRIVATE_CUSTOM/,
    );
  });
  it('keeps provider retry/escalation guidance actionable without translating diagnostic schema codes', () => {
    const result = localizeHttpError(
      new ServiceUnavailableException({
        message: 'The AI provider is unavailable. Contact your administrator.',
        providerCode: 'invalid_api_key',
      }),
      'fr',
    );
    assert.match(String(result.message), /Contactez votre administrateur/);
    assert.equal(result.providerCode, 'invalid_api_key');
    assert.match(
      localizedErrorMessage('The AI planner timed out. Please retry manually.', 504),
      /délai.*manuellement/,
    );
    assert.match(
      localizedErrorMessage(
        'The planning context is too large. Shorten the brief or conversation.',
        413,
      ),
      /Raccourcissez le brief/,
    );
  });
});
