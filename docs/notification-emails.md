# Notification emails

All current notification emails use `apps/api/src/common/notification-email.ts`:

- Sign-in codes, in English and French.
- New-account invitations, in English and French.
- Existing-team membership invitations and invitation resends, in English and French.

The renderer returns a subject, responsive HTML and a matching plain-text body.
It uses inline brand styles, a table layout, a hidden inbox preview, optional
code/details/action sections and a localized footer. The content remains readable
without remote images or web fonts. Pass plain text to content fields; the renderer
escapes it and accepts only HTTP(S) action URLs without embedded credentials.

Sign-in copy and expiry come from `auth/sign-in-copy.ts`. Invitation content comes
from `auth/invitation-email.ts`, including account type or team role, expiry in UTC,
and the existing configured sign-in URL. The admin interface supplies its current
language when creating an account invitation; the server stores it for resends.
Clients that omit a language retain the English default.

Send through `MailService.send(to, subject, html, text)`. Existing SMTP configuration,
sender, delivery deadlines and invitation delivery/audit behavior remain in place.
This change does not introduce new notification events or a marketing mailing list.

Run `pnpm --filter @abonten/api test` for renderer, transport and contract regressions.
The disposable Postgres invitation suite additionally verifies stored locale on
creation/resend. Preview actual captured SMTP messages in a local mail sink before
changing layout or copy; check desktop/mobile widths, both languages, plain text,
expiry and the configured action link. Browser previews do not replace testing in
individual email clients when client-specific compatibility is required.
