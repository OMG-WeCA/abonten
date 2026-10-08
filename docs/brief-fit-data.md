# Brief-fit evidence adapter (SPEC §5.3)

`POST /api/planning/v1/assess` is authenticated with the existing marketplace and
campaign-create capabilities. It is read-only and never calls an AI provider.
Request: `{locale?: 'en'|'fr', context?: PlannerContextDto}`. Context keeps the
existing bounded selection, filters, budget and inclusive-start/exclusive-end
flight. Optional `fitPreferences` contains `version:1`, up to eight 80-character
`targetAreas`, `targetCorridors` and `audienceTags`, optional cardinal travel
`approachDirection`, `daypart: any|day|night` and `goal: balanced|coverage|value`.
These are confirmed planning preferences, not observations. Local assessment has a thirty-second cancellable deadline, four in-flight process workers and thirty requests per user/organization per minute; capacity remains held until interrupted work settles. Limits are process-local. Scores, geometry,
traffic, prices, provenance and factor weights cannot be supplied by the client.

Response is the canonical planner reply plus `assessment`:
`{version, provisional:true, config, assessments, portfolio, recalculated:true}`.
Each assessment separates supported score contribution and uncertainty range from
evidence coverage/confidence, with factor reasons, sources and unknowns. Portfolio
selection discloses a bounded search, not an exhaustive optimum. Unknown prices
cannot enter an under-budget priced portfolio; unknown availability remains
provisional interest. Missing traffic does not block eligibility. Model choices
cannot override the deterministic IDs, budget constraints or infeasibility.

Discovery reads at most three eight-board pages. Before retaining eight candidate
faces per board and twelve discovered boards, the complete bounded authorized
face read is ranked by supported fit and evidence confidence, with stable IDs.
Selected boards/faces are retained and count against the existing request limits.
At most six authorized geographic contexts are read; unprocessed context remains
unknown and coverage/omissions are explicit. Saved scores are never trusted.

## Existing source fields

City/country are owner-reported labels; neither a
board name, address text nor research GPS is converted into a neighborhood or
corridor. Existing region-level administrative containment and nearest mapped named-road proximity remain descriptive geographic context, not neighborhood or surveyed corridor membership. Their exact source/import/vintage remains in canonical enrichment, but neither supplies face-level target-area/corridor evidence. Residential
population, descriptive AADT, observation counts and legacy visibility `/100`
indices do not become target audience shares or measured face exposure.

A listed registered pin does not by itself establish survey accuracy. Research
coordinates are always owner-reported and cannot establish precise directional
geometry. Site-level orientation is never copied to an individual face bearing.
Digital face spot/loop fields remain owner-reported specifications; they do not
supply schedule, dwell, probability of seeing an ad, impressions or reach.

## Optional strictly sourced face metadata

No new observation is created by this release. The existing generic production
metadata store can supply the following optional, independently collected fields.
All records must belong to the authorized site, have `dataClass: production`,
non-synthetic source, method, collection date not in the future, and expiry covering
the current time **and the end of the proposed flight**. Verification must be
`partner_declared` (owner-reported) or `field_verified`/`third_party` (verified). An explicit `payload.evidenceKind: modeled` on otherwise validated field/third-party evidence remains modeled, not verified.
Missing, expired, malformed, unverified and DEMO facts remain unknown; they are
never filled with zero or a verified average.

Face records must name the exact `payload.faceId`:

- `environment`: `areaNames:string[]` (up to eight 80-character source labels) only with `areaGranularity: neighborhood`, and `corridorName:string` (up to 80 characters) for explicitly source-defined face membership. Names, addresses and generic regions are not substituted.
- `structure`, `visibility` or `environment`: `faceBearingDeg` (outward normal),
  `approachHeadingDeg` (direction of travel), `viewingDistanceM`,
  `legibilityDistanceM`, `unobstructedFraction` in `[0,1]`, `dwellSeconds`,
  `speedKph`, and `viewablePathM`, with explicit units above.
- `illumination`: `nightLighting:boolean`; `illumination` or `environment`:
  `daypartCoverage:{day,night}`, each fraction in `[0,1]`.
- `environment`: digital `scheduleDaypartCoverage:{day,night}` based on the
  purchased schedule/daypart, not just loop share. The same face-level record must include `scheduleWindow:{startDate,endDate}` with the exact planned flight, and the purchased advertiser allocation. A generic operating timetable or allocation from a different flight cannot establish usable exposure. `advertiserSpotsPerLoop` must explicitly count the purchased advertiser creative placements per loop; stored inventory `spotsPerLoop` is not treated as advertiser allocation. Recorded loop/spot and dwell
  evidence remain separately necessary.
- `audience`: `segments:{tag:fraction}` with at most 30 source-defined tags, each
  fraction in `[0,1]`. These must be observed or validated modeled target-group
  shares relevant to the face; residents and vehicle counts are not segments.
  Legacy DEMO demographic payloads are excluded.

A current `structure` field-survey record may qualify a registered coordinate only
when its payload has exactly matching `latitude`/`longitude` and positive
`coordinateAccuracyMetres <=25`. This 25 m admission tolerance is provisional
product policy, not a statement that 25 m accuracy validates viewing geometry.
Face-bearing/approach evidence is still independently required; precise geometry
also requires verified coordinate status. Public research pins never qualify.

The default weights and confidence coefficients are product policy in
`planning-scoring.ts`, explicitly provisional and versioned; they are not MRC,
Route, WOO or Geopath empirical coefficients, certification or measured Nigerian
campaign effectiveness. No roadside-side penalty exists.

## Saved work

Draft version 1 accepts optional `fitPreferences` and an informational
`scoringVersion` (at most 64 characters). Existing drafts reopen unchanged. No
score, quote, availability snapshot, uploaded document, conversation or consent is
stored. Current authorized facts are rechecked and scores recalculated. The UI
shows the current method and discloses recalculation/version differences.
