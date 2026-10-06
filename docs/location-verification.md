# Address and map-pin checks

Inventory registration uses a saved, tenant-owned address, city, region, country and
WGS84 pin. A partner can check the saved location before submitting. Submission
checks the same facts server-side. Results are owner/moderator evidence, not public
buyer data. Geography is independent of traffic and population enrichment.

Policy `address-pin-v1` allows a 250 metre geodesic offset: a roadside board may be
away from a building address, and an address point is not a survey. Automatic
rejection requires exactly one address result, a matching country, exact/high
provider match confidence, explicit matched street/city/country components, no
unmatched or plausible supplied components, and rooftop or known point
accuracy. Street/city/parcel centroids, interpolated points, multiple candidates, missing
components, country conflict, malformed results and provider failures stay
`unable_to_verify`. They never establish a mismatch.

A precise match within 250 m goes to `pending_review`; ordinary approval is still
required. A confirmed mismatch becomes `rejected` with correction/resubmission
instructions and a transactional audit event. Unknown checks also go to
`pending_review`, unpublished. A recorded mismatch prevents approval/relisting.
Changing any location input clears verification/rejection and returns the site to
draft (unpublished), except decommissioned sites remain decommissioned. Harmless
case/spacing/diacritic changes do not invalidate equivalent facts.

The provider request happens outside a database transaction. Before saving the
result, a row lock and input fingerprint reject stale results. Duplicate pending
submissions replay without another provider request/audit. Recent (under 24 h)
unchanged definitive checks may be reused; uncertain checks can retry. Readiness is rechecked through the same transaction manager after the provider
returns, under the site row lock shared with face/rate mutations and dated-photo
deletion. Approval uses the same locked readiness reads. A photo deleted during
lookup therefore cannot yield an incomplete pending submission. Audit failure
rolls back status and evidence together. No provider URLs, tokens, addresses or
response bodies are logged. Requests have a 5 second timeout and 128 KiB response
limit; there is no per-keystroke autocomplete or pin proximity bias.

The 24-hour cache expiry only triggers a fresh lookup; it does not expire a
confirmed mismatch. An inconclusive recheck of unchanged inputs preserves the
original mismatch, its distance and checkedAt, and publication restrictions.
Optional `lastAttempt` records the latest inconclusive attempt's status,
reasonCode, checkedAt, provider and localized message separately. Changed inputs
invalidate the earlier decision; a later definitive match can replace it but
still requires resubmission and ordinary approval before publication.

## Provider configuration

The adapter implements Mapbox Geocoding v6 through the existing provider, with no
new dependency, account, credential or billing activation. It is disabled unless
all of these existing-runtime settings are explicitly configured:

- `MAPBOX_GEOCODING_ENABLED=true`
- `MAPBOX_GEOCODING_PERMANENT_ALLOWED=true`, only after confirming entitlement and
  authorizing the use of stored, potentially billable geocoding
- `MAPBOX_GEOCODING_TOKEN` or existing `MAPBOX_PUB_KEY`

A map-rendering token alone does not authorize stored geocoding. Disabled or missing
configuration returns `provider_not_configured` / “couldn’t verify”, preserving
manual review. No fake provider outcomes are available in production code.

Official [Mapbox v6 documentation](https://docs.mapbox.com/api/search/geocoding/#storing-geocoding-results)
says temporary results cannot be cached; permanent requests require a card on file
or enterprise contract. Because the evidence includes a provider-derived distance
and decision, this implementation conservatively requires stored-geocoding
permission rather than assuming a temporary-result exception. It never retains a
provider feature, resolved address, candidate coordinates or feature identifier.

## API

`POST /inventory/sites/:id/verify-location`, owner inventory-update capability,
optional `{ "locale": "en" | "fr" }`: checks saved facts and returns the decision.
`POST /inventory/sites/:id/submit`, optional locale: returns id/status/rejectionReason
and locationVerification. Detail/list owner reads expose nullable locationVerification.
The decision includes status, reasonCode, distanceMeters (nullable), toleranceMeters,
policyVersion, checkedAt (UTC), provider, inputFingerprint and localized message.
