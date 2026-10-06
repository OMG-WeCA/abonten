# Versioned partner terms (SPEC 5.1 / 7.1)

The current content is **a review draft, not an approved release**. It is the
substantive sections 1–13 of `Abonten_Partner_Listing_Terms_Draft_0.2.docx`, Library
file `libfile_f497ce5528ac81918db272eb88df98d6`, source Library version 1. The internal
approval note is not included in the partner-facing terms. English is preserved;
French is a faithful translation for review, explicitly not legally reviewed.
No controlling language is designated.

The application preview revision was bumped after initial translation refinement;
source document version remains 0.2. Earlier preview events retain their exact
stored copies and cannot be rewritten. Once published, a changed document or
translation requires a new immutable artifact and application version.

The immutable application version is `draft-0.2-r1-2026-10-06`. Its English SHA-256
content digest is `33c89625d6ab02685175262f35f6e9c7dd57afcdb029587e559b5a415dc3a16f`;
the French digest is `c2c04639be95250a0aa6cfe4cea6733411fc9efc615490672e3afa19b02f3cc1`.
Digests cover version, document date, locale, review status, translation status,
title and the ordered content. Acceptance-policy flags are excluded so an
operator's preview switch does not alter the immutable document identity.

## Policy and activation

- Default: acceptance disabled; the review draft remains readable.
- Local preview: set `PARTNER_TERMS_PREVIEW_ENABLED=true` with a non-production
  `NODE_ENV`. Signup requires an unchecked, affirmative authority and draft
  acknowledgement. The event is labeled `preview_acknowledgement`, never legal
  acceptance. The same switch is ignored in production.
- Approved release: `PARTNER_TERMS_APPROVED_VERSION` can select only an immutable,
  genuinely approved artifact in the release registry. **The registry currently
  has no approved releases.** Setting this variable to the draft or an unknown
  version fails closed; it cannot promote a draft. Adding an approved release
  requires reviewed content, translations and publication approval first.

Abonten is the confirmed entity and trademark name. No registration number,
address, support or notice contact, privacy notice, commercial/payment role,
governing law/forum, liability regime or controlling-language fact is invented.
The production release must resolve the remaining legal/business publication
items with the authorized owner. This implementation does not activate terms.

## API and audit

- `GET /api/partner-terms/current?locale=en|fr`: content and current policy.
- `GET /api/partner-terms/:version?locale=en|fr`: immutable known version.
- `POST /api/orgs`: media-partner onboarding accepts optional `partnerTerms` with
  `version`, `locale`, `expectedDigest`, `accepted: true`, `authorityConfirmed: true`; it is required
  when the configured policy requires an affirmative event. The server owns the
  digest and content. Client-supplied versions/languages and the digest of the displayed copy are
  checked exactly. A stale digest receives HTTP 409 and requires reload/review/
  fresh affirmation; the client cannot supply the stored canonical content.
- `GET /api/orgs/:orgId/partner-terms`: history for an active organization member,
  with matching active tenant context.
- `POST /api/orgs/:orgId/partner-terms`: an active partner organization owner can
  affirm a current version. An organization-row lock serializes this against
  membership changes and concurrent acceptance. Repeated requests return the
  original event, not a second acceptance or audit.

Each event records the account and organization IDs, their representative/name
snapshots, exact version/locale/digest/content copy, UTC event time, authority
confirmation and explicit preview/approved kind. It writes an audit event in the
same transaction. Signup commits organization, owner membership, acceptance,
audit and onboarding idempotency row together. The database rejects UPDATE and
DELETE of acceptance records. No IP/device fingerprint is collected for this
flow, and seed scripts do not fabricate affirmative acceptance events.

The signup modal supports Escape, trapped/restored focus and scrolling without
leaving or discarding entered data. `/partner-terms` is the public bilingual
reader; `/partner-terms/accepted` shows the exact stored copy, and lets an existing
owner affirm a newly required version. Failed requests have a safe retry path.
Language/version changes require a fresh checkbox, not inferred consent.

## Verification

`orgs/partner-terms.spec.ts` covers content identity, full EN/FR structure,
production gating, affirmative checks, tenant denial, HTTP content/query errors,
audit/copy retention, transactional signup rollback and repeated/concurrent signup.
`orgs/partner-terms.postgres.integration.spec.ts` runs with
`POSTGRES_INTEGRATION_URL`, creates/drops an isolated schema and applies the real
migration. It checks actual PostgreSQL locks, one-event/audit concurrency,
append-only trigger enforcement and complete rollback on audit failure.
