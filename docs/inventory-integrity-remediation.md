# Inventory integrity correction: rollout and existing records

The correction requires no schema migration. It validates new and edited inventory,
checks approval again, and applies current eligibility to buyer reads. Existing
research references and scoped demo exceptions retain their previous purpose.

Time-based rate/permit expiry is evaluated in UTC. Read requests project an
ineligible stored listing as draft and deny buyer access; they do not write status
or audit rows. On a later inventory mutation, expired/incomplete publication is
reconciled transactionally to draft and audited before a repair can restore it.
The partner must submit it for review again. Removing the last bookable face or
ending the last current rate immediately causes that transaction and audit event.

Before a separately authorized release, inspect existing records read-only for:

- Empty required identity, non-positive/non-finite dimensions or inconsistent area.
- Incomplete or impossible digital pixels, counts and loop capacity.
- Unsupported currencies, expired rates and listed sites without current completeness.
- Independently verified audience/traffic without source, method or a trustworthy
  review event in the audit history. Current verification labels alone cannot
  establish who assigned them or whether the underlying data is measured.

Prepare a per-record correction proposal with the owner and supporting source.
Do not automatically change dimensions, prices, verification states or historical
audit rows. Legitimate reviewer evidence and owner-reported data must remain
distinct. A partner edit to reviewed evidence clears independent verification;
the earlier review remains in the audit history. Population estimates continue to
be geographic context and must not be described as measured reach.

No existing records, permissions, shared migrations or deployment were changed by
the implementation/QA pass. Production review, any record corrections and release
remain separate operations.
