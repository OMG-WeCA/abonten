import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { englishPartnerTerms } from './partner-terms.en';
import { frenchPartnerTerms } from './partner-terms.fr';

// Released artifacts are immutable. Any text/translation change requires a new
// artifact and version; stored historical content copies are never rewritten.
export const PARTNER_TERMS_DRAFT_VERSION = 'draft-0.2-r1-2026-10-06';
export type TermsLocale = 'en' | 'fr';
export interface PartnerTermsDocument {
  version: string;
  publishedDate: string;
  locale: TermsLocale;
  status: 'review_draft' | 'approved';
  translationStatus: 'source_draft' | 'translation_for_review' | 'approved';
  title: string;
  sections: Array<{ number: number; heading: string; paragraphs: string[] }>;
  digest: string;
  sourceEnglishDigest: string;
  acceptanceRequired: boolean;
  acceptanceMode: 'disabled' | 'preview' | 'approved';
}
export interface PartnerTermsInput {
  version: string;
  locale: TermsLocale;
  expectedDigest: string;
  accepted: boolean;
  authorityConfirmed: boolean;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

// A future release must be added as an immutable, reviewed artifact. Environment
// configuration can choose such a release; it can never promote this draft.
const approvedReleases: Readonly<Record<string, PartnerTermsDocument>> = Object.freeze({});

export function partnerTermsPolicy(environment: NodeJS.ProcessEnv = process.env): {
  mode: PartnerTermsDocument['acceptanceMode'];
  version: string;
} {
  const approvedVersion = environment.PARTNER_TERMS_APPROVED_VERSION?.trim();
  if (approvedVersion) {
    if (!Object.hasOwn(approvedReleases, approvedVersion)) {
      throw new ConflictException({
        code: 'PARTNER_TERMS_RELEASE_UNAPPROVED',
        message: 'No approved terms release is configured. The review draft cannot be activated.',
      });
    }
    return { mode: 'approved', version: approvedVersion };
  }
  return {
    mode:
      environment.NODE_ENV !== 'production' && environment.PARTNER_TERMS_PREVIEW_ENABLED === 'true'
        ? 'preview'
        : 'disabled',
    version: PARTNER_TERMS_DRAFT_VERSION,
  };
}

export function partnerTermsDocument(
  locale: TermsLocale,
  version = PARTNER_TERMS_DRAFT_VERSION,
  environment: NodeJS.ProcessEnv = process.env,
): PartnerTermsDocument {
  const policy = partnerTermsPolicy(environment);
  if (version !== PARTNER_TERMS_DRAFT_VERSION) {
    const release = Object.hasOwn(approvedReleases, version)
      ? approvedReleases[version]
      : undefined;
    if (!release || release.locale !== locale)
      throw new BadRequestException('Terms version is unavailable');
    return structuredClone(release);
  }
  const content = locale === 'fr' ? frenchPartnerTerms : englishPartnerTerms;
  const identity = {
    version,
    publishedDate: '2026-10-05',
    locale,
    status: 'review_draft' as const,
    translationStatus:
      locale === 'fr' ? ('translation_for_review' as const) : ('source_draft' as const),
    title: content.title,
    sections: content.sections,
  };
  return {
    ...structuredClone(identity),
    sections: content.sections.map((section) => ({
      number: section.number,
      heading: section.heading,
      paragraphs: [...section.paragraphs],
    })),
    digest: digest(identity),
    sourceEnglishDigest: digest({
      version,
      publishedDate: '2026-10-05',
      locale: 'en',
      status: 'review_draft',
      translationStatus: 'source_draft',
      ...englishPartnerTerms,
    }),
    acceptanceRequired: policy.mode !== 'disabled',
    acceptanceMode: policy.mode,
  };
}

/** Bind affirmation to the displayed identity; the server still owns canonical digest and copy. */
export function preparePartnerTermsAcceptance(
  input: PartnerTermsInput | undefined,
  locale: TermsLocale,
  environment: NodeJS.ProcessEnv = process.env,
): PartnerTermsDocument | undefined {
  const policy = partnerTermsPolicy(environment);
  if (policy.mode === 'disabled') {
    if (input)
      throw new BadRequestException({
        code: 'PARTNER_TERMS_ACCEPTANCE_DISABLED',
        message: 'The review draft is not active for acceptance.',
      });
    return undefined;
  }
  if (!input || input.accepted !== true || input.authorityConfirmed !== true) {
    throw new BadRequestException({
      code: 'PARTNER_TERMS_ACCEPTANCE_REQUIRED',
      message:
        locale === 'fr'
          ? 'Confirmez votre autorité et acceptez expressément la version affichée.'
          : 'Confirm your authority and expressly accept the displayed version.',
    });
  }
  if (input.version !== policy.version) {
    throw new ConflictException({
      code: 'PARTNER_TERMS_VERSION_CHANGED',
      message:
        locale === 'fr'
          ? 'La version des conditions a changé. Consultez-la et acceptez-la à nouveau.'
          : 'The terms version changed. Review it and accept again.',
    });
  }
  if (input.locale !== locale)
    throw new BadRequestException('Terms language must match the selected onboarding language');
  const document = partnerTermsDocument(locale, policy.version, environment);
  if (input.expectedDigest !== document.digest) {
    throw new ConflictException({
      code: 'PARTNER_TERMS_CONTENT_CHANGED',
      message:
        locale === 'fr'
          ? 'Le contenu des conditions a changé. Rechargez-le, consultez-le et confirmez à nouveau.'
          : 'The terms content changed. Reload it, review it and affirm again.',
    });
  }
  return document;
}
