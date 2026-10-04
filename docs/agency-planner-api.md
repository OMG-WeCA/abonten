# Agency planner API (SPEC §5.3)

All `/api/planning/v1` endpoints require JWT authentication, active organization
membership and `CAMPAIGN_CREATE` + `MARKETPLACE_VIEW`. `x-org-id` selects the
organization, falling back to the user's active organization.

`GET assistant/status` reports `mode: local | openai`, `provider: null | openai`,
`model: null | gpt-6-luna`, `aiAvailable`, document formats, 10 MB upload limit,
`documentsRetained: false` and `externalTransfer`. Provider availability means
configured, not a health guarantee; this endpoint never contacts OpenAI.

`POST assistant` accepts:

- `message`: 1–4,000 characters; `locale`: `en` (default) or `fr`.
- `briefText`: at most 60,000 confirmed characters, treated as untrusted data.
- `shareBriefWithProvider`: boolean, default false; consent for this exact brief.
- `history`: at most eight `{role: user | assistant, content: 1–4000 characters}`.
- `context.selectedSiteIds`: at most 12 distinct UUIDs;
  `context.selectedFaceIds`: at most 24 distinct UUIDs, across at most 12 boards.
- `context.faceCurrencies`: at most 24 distinct `{faceId, currency}` entries, only
  for selected faces; currency must be supported and match a usable published
  rate. Without a choice, one unambiguous published currency is used. Budget
  currency never overrides a face’s published currency.
- `context.selectionTruncated`: optional boolean, default false. When some draft
  selections are omitted, included subtotals remain visible but full-plan budget
  fit is unknown and remaining budget is null.
- `context.filters`: country/city (80 characters), format (`static`, `digital_led`,
  `3d`), search (160 characters).
- `context.window`: valid UTC `YYYY-MM-DD` dates, start inclusive, end exclusive,
  positive flight of at most 366 days.
- `context.budget`: finite amount from 0 to 1e12 and currency
  `NGN | GHS | XAF | XOF | USD | EUR`.

No client prices or enrichment are accepted. The server rereads selected faces
and listed, ready marketplace sites, plus up to eight candidate boards using
filters. Candidate coverage is explicitly bounded, not exhaustive. Availability
uses existing overlapping bookings/blackouts without exposing tenant details.
Flight eligibility also checks permit coverage, bookable face association and
complete digital specs before reporting availability or accepting recommendations.
Missing pricing can require a quote without making a physically eligible face
unavailable.

The reply includes `mode`, `provider`, `model`, `aiAvailable`, `message`,
`briefShared`, deterministic local `constraints`, `missing`,
`requiresConfirmation: true`, `questions`, validated
`recommendations: [{siteId, faceId, reason}]` and `facts`:

- `checkedAt`, `window` or null; `sites` with IDs, display labels, WGS84 coordinates,
  format, physical `specs` (elevation metres, orientation degrees, width/height
  in recorded site `units`; null values/units remain unknown), and faces (`selected`, flight eligibility/reason, availability,
  `estimate: FaceCostEstimate`). Estimates use canonical planning-math rules and
  include price currency, flight days, source rate ID, basis, assumptions and
  availability-check timestamp. Missing dates/rates remain unavailable.
- `requestedBudget`: confirmed input amount/currency or null, and `filters`: confirmed map filters.
- `budget`: canonical `summarizeBudget` over selected faces only, with separate
  published-currency subtotals, priced/unpriced/unchecked counts, `fit` (within, over or unknown), remaining budget or null, and assumptions. No inferred FX.
- `distances`: canonical pairwise `selectionDistances` between selected boards,
  with kilometres, Haversine method and registered-coordinate provenance.
- `ots: null`, `reach: null`, explicit unavailable-model assumptions.

Facts are authoritative. Model commentary is planning advice for review, not a
quote or executed action. Recommendations are checked against the server
snapshot and cannot reference an unavailable face or duplicate it. No provider
function/tool calls, bookings, code execution or browser actions are enabled.

Without a server `OPENAI_API_KEY`, replies are explicitly deterministic local
help. With a key, the fixed HTTPS Responses endpoint uses only `gpt-6-luna`,
`reasoning.effort: none`, strict JSON-schema output, `store: false`, and a maximum
1,800 output tokens. One call is made per request, with no automatic retry.

Uploads remain local and ephemeral. Confirmed text goes to OpenAI only with
explicit consent. If a supplied brief lacks consent, all history is also omitted
because earlier model messages could paraphrase it; local extracted constraints
are not sent. The client must clear history and reset consent whenever a brief
is edited, replaced, removed or consent revoked. Ordinary typed chat and
confirmed structured planning controls are sent when the configured planner is
used. The API does not persist conversations or provider replies. `store: false`
does not make promises about the provider's separate abuse-monitoring policy.

Admission is acquired before any grounding read and held until the planning
operation finishes, including a cancelled in-flight database query. Rejected
capacity/rate requests perform no marketplace or grounding database reads.

Provider payloads are capped at 384 KiB UTF-8, responses at 64 KiB, deadline at
30 seconds for the entire planning request (grounding and provider). HTTP disconnect aborts the call; an already running database query may finish, but no subsequent read or provider spend is started. Each API process allows four active
calls globally and one per user/organization, six attempts per minute per
user/organization and twenty per minute per organization; limits are process
local and must be shared before horizontal scaling. Rate metadata expires after
one minute and is bounded to 10,000 entries. No messages, briefs, keys or provider
error bodies are logged. Errors are sanitized: 413 oversized context, 429
capacity/rate, 502 provider/invalid/incomplete/unverified output, 503 missing or
rejected credential, 504 deadline. The UI offers explicit manual retry. Configured
provider failures never silently fall back to local help.

Planner operations emit structured JSON through the existing Nest logger. A fresh
ephemeral request UUID correlates `agency_planner.provider` and
`agency_planner.plan` events. Fields are limited to exact model/mode, outcome,
mapped HTTP status, latency, allowlisted provider request IDs/error codes and
bounded token counts from the actual provider response. Provider schema failures
and final inventory-reference failures have separate outcomes. Admission
rejection, cancellation, timeout and local help are also recorded. Events contain
no user/organization identifiers, messages, brief text, keys, raw errors or
provider bodies. Logging failures do not change a result or retry a request.
These events support diagnosis; log collection, metrics, alerting and shared
usage enforcement remain operational deployment work.
