# Abonten — Product Specification

> **Status:** Draft v0.1 · **Date:** 2026-07-14 · **Owner:** OMG WeCA product team
> **Document type:** Authoritative product specification for the Abonten platform.
>
> This document is the single source of truth for product scope, roles, data, workflows,
> and delivery phasing. All implementation work should reference this spec. When reality
> diverges from this spec, update the spec first, then the code.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision](#2-product-vision)
3. [Target Market Context — OMG WeCA](#3-target-market-context--omg-weca)
4. [User Roles and Personas](#4-user-roles-and-personas)
5. [Core Feature Modules](#5-core-feature-modules)
   - 5.1 [Billboard Inventory Management](#51-billboard-inventory-management)
   - 5.2 [Site Metadata Enrichment](#52-site-metadata-enrichment)
   - 5.3 [Media Planning & Campaign Builder](#53-media-planning--campaign-builder)
   - 5.4 [Proof of Performance / Daily Site Updates](#54-proof-of-performance--daily-site-updates)
   - 5.5 [Client Monitoring Dashboard](#55-client-monitoring-dashboard)
   - 5.6 [Marketplace & Booking](#56-marketplace--booking)
   - 5.7 [Reporting & Analytics](#57-reporting--analytics)
6. [Data Model Outline](#6-data-model-outline)
7. [Key Business Workflows](#7-key-business-workflows)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Technical Architecture Direction](#9-technical-architecture-direction)
10. [Phased Delivery Roadmap](#10-phased-delivery-roadmap)
11. [Glossary](#11-glossary)
12. [Open Questions and Assumptions](#12-open-questions-and-assumptions)

---

## 1. Executive Summary

**Abonten** is a multi-tenant, outdoor (out-of-home, OOH) advertising planning, booking,
and measurement platform built for the West & Central Africa (WeCA) market. It connects the
three stakeholder groups that sit at the heart of the OOH value chain:

1. **Media Partners** — the outdoor site vendors who own and operate billboards, hoardings,
   digital/LED screens, wall wraps, and street/transit furniture. Abonten lets them register,
   specify, and publish their inventory to a shared marketplace.
2. **Media Buyers / Planners** — agency planners and strategists (e.g., OMG WeCA's mediaReach
   OMD and PHD Media teams) who need to discover inventory, plan campaigns against measurable
   KPIs, and book sites on behalf of clients.
3. **Clients / Advertisers** — the brands funding campaigns, who need transparent, near-real-time
   assurance that their buys are live and intact.

The platform's core promise is to replace today's fragmented, spreadsheet- and WhatsApp-driven
OOH workflow with a single system of record that pairs **inventory discovery** with **measurable
planning** and **verified delivery** (proof of performance). Abonten is designed first for the
operational realities of WeCA — intermittent connectivity, mobile-first field teams, mixed
currencies, and bilingual (English/French) markets — while remaining API-first so it can
integrate with broader media-buying and audience-measurement ecosystems.

**Why now.** Outdoor is a large and growing share of the WeCA media mix, yet it remains the
least instrumented channel: inventory is hard to find, planning relies on rough estimates, and
clients rarely get reliable proof that their sites are live. OMG WeCA's involvement in Nigeria's
Joint Industry Audience Measurement reform underscores regional demand for measurement
discipline. Abonten turns that demand into product.

---

## 2. Product Vision

**Vision statement.** _Abonten makes outdoor advertising in West & Central Africa as
discoverable, plannable, and accountable as digital — without leaving the realities of the
street behind._

**Name.** "Abonten" draws from the Akan (Twi) word for _outdoors_ / _in the open_ — a name that
sits naturally in the region and signals the product's focus: the open-air, outdoor media
channel.

**Design principles.**

- **Street-first, not desk-first.** The hardest users to serve are field operatives capturing
  proof of performance on low-bandwidth phones in the rain. Optimize for them first.
- **Measure what was promised.** Plans carry KPI estimates where the evidence supports them.
  Each booking has a verification trail at delivery time.
- **Multi-tenant by default.** Media partners, agencies, and brands are separate organizations
  sharing one marketplace. Tenant isolation and role-based access are foundational, not added
  later.
- **API-first.** Every capability in the product UI is also available through a versioned API,
  so Abonten can plug into agency planning stacks, ERPs, and future audience-measurement feeds.
- **Offline-resilient.** Connectivity is unreliable across WeCA. Capture, search caches, and
  maps must degrade gracefully and sync when back online.
- **Local in every sense.** Multi-currency, bilingual (English/French), and respectful of local
  regulatory frameworks (e.g., NDPR in Nigeria, Ghana's Data Protection Act, ARCON/LASAA
  advertising permit regimes).

**Success looks like:** a media partner can list a new billboard and see it bookable within a
day; a planner can assemble a 50-site, multi-city WeCA plan with KPI estimates in minutes
instead of days; and a client can open their phone each morning and see photographic proof that
every one of their sites is live and intact.

---

## 3. Target Market Context — OMG WeCA

**OMG WeCA** is **Omnicom Media Group West & Central Africa**, the regional arm of Omnicom's
media services network. It operates the leading media-agency footprint in the region, overseeing
two flagship networks — **mediaReach OMD** and **PHD Media** — widely regarded as the largest
media-agency network in Nigeria and across West & Central Africa.

**Footprint.** Owned offices in **Lagos (Nigeria)**, **Accra (Ghana)**, and **Douala
(Cameroon)**, complemented by partner offices that extend coverage across French West Africa and
**23+ countries** in the region. Per RECMA volume estimates, OMG WeCA in Nigeria holds roughly
a **35% share of media buying**, making it the dominant buyer in the market.

**Why OMG WeCA needs Abonten.** As the region's dominant buyer, OMG WeCA plans and executes
large OOH volumes across fragmented vendor estates. Today that work is manual and
verification-light. Abonten is purpose-built to:

- Give OMG WeCA planners a unified view of inventory across many media partners, replacing
  ad-hoc vendor catalogs and spreadsheets.
- Encode OMG WeCA's planning KPIs (impressions, reach, frequency, demographic coverage) into the
  site-selection workflow.
- Provide the proof-of-performance discipline that clients increasingly demand and that regional
  measurement reform (e.g., Nigeria's Joint Industry Audience Measurement initiative) is pushing
  the industry toward.

**Market dynamics the product must respect.**

- **Fragmented vendor base.** Hundreds of small-to-mid outdoor operators alongside a few large
  ones. Onboarding must be low-friction; partners vary widely in digital maturity.
- **Mixed languages.** Anglophone (Nigeria, Ghana, Cameroon) and Francophone (Côte d'Ivoire,
  Senegal, Burkina Faso, Benin, etc.) markets. French is a first-class UI language.
- **Mixed currencies.** NGN (Nigeria), GHS (Ghana), XAF/XOF (CEMAC/UEMOA Franc zones), plus
  USD/EUR for multinational clients. Pricing and invoicing must be multi-currency.
- **Regulatory patchwork.** Outdoor advertising permits and signage rules differ by country and
  city (e.g., ARCON/LASAA in Lagos, DAAR in Accra). Abonten tracks permit metadata but is not a
  permitting system itself.
- **Connectivity.** Field capture often happens on mobile networks with weak signal; offline-first
  behavior is a hard requirement, not a nicety.

> **Note.** Abonten is an OMG WeCA–aligned product. Specific individuals, headcounts, and
> market-share figures are contextual and should be re-verified against current OMG WeCA
> materials before any external publication.

---

## 4. User Roles and Personas

Abonten is multi-tenant: users belong to **organizations**, and an organization has a **type**
that determines which capabilities its members can access. The same human can hold membership in
more than one organization (e.g., a planner at an agency who is also an admin of a brand org),
but permissions are always evaluated per-organization-context.

### 4.1 Media Partner

The outdoor site vendor. Organization type: `media_partner`.

- **Persona — "Ama," inventory manager at a large outdoor operator in Accra.** Needs to bulk-load
  hundreds of sites, keep specs and availability current, and respond to booking requests quickly.
- **Persona — "Kwame," a small operator with one depot of billboards in Kumasi.** Needs a simple
  mobile-friendly way to register a site, snap a reference photo, and mark it available.
- **Capabilities:** register and manage billboard inventory and site metadata; manage rate cards
  and availability calendars; receive and accept/decline booking requests; upload proof of
  performance (or delegate to field staff); view revenue and utilization reports.

### 4.2 Media Buyer / Planner

The agency planner/strategist who buys on behalf of clients. Organization type: `agency`.

- **Persona — "Chidi," senior planner at mediaReach OMD in Lagos.** Builds multi-city WeCA plans
  under tight deadlines, needs defensible KPI estimates, and must justify site selection to
  clients.
- **Persona — "Aisha," junior planner.** Spends most time searching/filtering inventory and
  shortlisting sites; relies on saved filters and map views.
- **Capabilities:** browse the marketplace (search, filter, map); build campaigns and scenarios;
  estimate KPIs and allocate budgets; reserve/book sites; manage client relationships within the
  platform; export plans and reports.

### 4.3 Client / Advertiser

The brand funding the campaign. Organization type: `brand` (a.k.a. `client`).

- **Persona — "Tunde," marketing lead at an FMCG brand.** Wants a morning dashboard showing which
  sites are live, proof photos, and any issues — without having to ask the agency.
- **Persona — "Fatou," brand manager in Douala.** Cares about delivery compliance in Francophone
  markets and wants alerts when a site is down.
- **Capabilities (mostly read-only with light actions):** view active campaigns and status; browse
  the proof-of-performance gallery; receive and acknowledge issue alerts; view performance vs.
  plan; comment on/flag items for the agency.

### 4.4 Platform Admin

Operator of the Abonten platform itself (OMG WeCA product/ops staff). Organization type:
`platform` (cross-tenant).

- **Persona — "Seyi," platform ops.** Approves new organizations and inventory listings, manages
  marketplace quality, investigates disputes, and monitors system health.
- **Capabilities:** review and approve organization onboarding and site listings; manage
  marketplace catalog quality and duplicate/abuse handling; configure reference data (formats,
  currencies, markets, KPI models); access support tools and audit logs; monitor platform
  telemetry. Admins never impersonate tenants; they act through explicit admin endpoints with full
  audit.

### Invite-only admission amendment (2026-10-22)

Admission is controlled by the existing `platform_admin` role. For a new account,
the administrator supplies only an email and a product account type: media partner,
agency or brand. The recipient verifies that email and supplies their own name,
company, country and remaining standard onboarding details. Organization creation,
owner membership and invitation acceptance commit together. The accepted account
type is fixed by the invitation; platform accounts and privileged roles cannot be
selected by a recipient. No organization is pre-created by a new-account invite.
Existing team invitations remain a separate flow bound to an existing organization
and a role, under the existing tenant and role-assignment controls.
Public email verification and Microsoft SSO cannot create an uninvited identity;
existing accounts retain sign-in. Public organization creation is disabled. There
are no bearer invitation tokens. New-account invitations expire after seven days;
resending renews pending/expired admission, while revocation cancels it. Acceptance
is single-use and never restores revoked memberships or changes existing roles.
Admission, resend, revocation, organization creation and acceptance are audited.
Partner terms retain the existing approved-version policy. No new administrator
grant or first-user privilege is introduced. Inventory moderation is unchanged.

### 4.5 Role model summary

Within each organization, users hold a **role** that scopes their actions:

| Role                | Typical org type | Scope                                                  |
| ------------------- | ---------------- | ------------------------------------------------------ |
| `org_owner`         | any              | Full control of the organization, billing, members.    |
| `org_admin`         | any              | Manage members and most resources; no billing control. |
| `inventory_manager` | media_partner    | Create/edit sites, rate cards, availability, POP.      |
| `field_operator`    | media_partner    | Capture POP photos and condition reports (mobile).     |
| `planner`           | agency           | Search, plan, reserve, book, export.                   |
| `planner_admin`     | agency           | Manage agency team and client links.                   |
| `client_viewer`     | brand            | Read-only campaign + POP monitoring.                   |
| `client_admin`      | brand            | Manage brand team, link to agency/client accounts.     |
| `platform_admin`    | platform         | Cross-tenant administration and marketplace quality.   |

> Roles and permissions are defined as a capability map in code (see §9). The table above is the
> authoritative intent; the implementation must enforce it server-side on every request.

---

## 5. Core Feature Modules

### 5.1 Billboard Inventory Management

**Purpose.** Let media partners register, specify, and publish their outdoor inventory so it
becomes discoverable and bookable in the marketplace.

**Inventory types supported.** Billboards/hoardings, digital/LED screens (DOOH), wall wraps and
murals, street furniture (bus shelters, kiosks), transit media (bus sides, taxi wraps, transit
station panels), 3D and spectacular displays, and tri-vision panels.

**Key site attributes captured at registration.**

- **Identity:** internal site code, display name, description, media-partner owner.
- **Location:** latitude/longitude (required), street address, city, state/region, country,
  market/zone, plus an optional geo-fenced polygon for large installations.
- **Physical specs:** panel type, format (`static`, `digital_led`, `3d`, `tri_vision`, `mural`,
  `transit`, `street_furniture`), sub-format, width × height (with units), total display area,
  number of faces, elevation/height above ground.
- **Orientation & viewing:** primary facing direction (compass + degrees), viewing angle, average
  viewing distance, one-way/two-way traffic exposure.
- **Illumination:** `none`, `front_lit`, `back_lit`, `edge_lit`, `led`; illumination hours; whether
  illumination is required for visibility at night.
- **Creative / substrate:** printable area, bleed, mounting substrate, file requirements per face.
- **Media assets:** site photos, a site video or 360° panorama, and optional site diagrams.
  See the capture requirements below.
- **Commercial:** default rate card (per day/week/month), currency, minimum booking duration,
  blackout/seasonal rules.
- **Compliance:** permit reference, permit expiry, regulatory class (where applicable).

**Inventory trust contract (merged from the accepted inventory execution plan, 2026-09-17).**

1. **Collectable at registration (was stored-but-uncollected):** site code (partner-entered;
   auto-generated when omitted), panel type, sub-format, average viewing distance, elevation,
   permit reference and permit expiry, and market/zone linkage are all collectable in the
   registration and edit forms. All seven SPEC format values (`static`, `digital_led`, `3d`,
   `tri_vision`, `mural`, `transit`, `street_furniture`) are selectable in the UI.
2. **Digital face attributes.** When a face belongs to a site with `format = digital_led`, the
   face additionally carries: screen pixel dimensions (`pixel_width` × `pixel_height`), spot
   length (seconds), loop length (seconds), spots per loop, and a proof-of-play capability flag.
   These are first-class `SiteFace` fields (additive schema) and are required before any DOOH
   share-of-voice or delivery maths can be computed in later phases.
3. **Provenance at entry.** Whenever orientation, viewing distance, or elevation is entered or
   changed outside a map-assisted capture flow, the mutation must carry structured provenance
   (source, method, optional collection date), which is stored as a `site_metadata` record with
   `dimension = 'structure'` and `verification = 'partner_declared'`. "If you typed it, say how
   you know it."
4. **Verification states.** `site_metadata` records carry `verification` ∈ `unverified` (default),
   `partner_declared`, `field_verified`, `third_party` so later phases can filter by evidence
   level. Enrichment records also carry a `data_class` (`demo` | `production`): demo-class rows
   are excluded from production reads, planning surfaces, and any model input, and are labelled
   wherever they render.
5. **Capture dates.** Draft uploads can leave capture dates unknown for later correction.
   The UI suggests replacing photos older than 12 months.
6. **Entry plausibility checks (server-enforced).** Orientation within 0–359°; positive viewing
   distance and elevation; illumination hours matched against a time-range pattern; coordinates
   inside the declared country's bounding box for supported markets.
7. **Deliberate deferrals (approved):** geo-fenced polygon _capture_ stays V1 (the column, DTO and
   storage are live; the map-drawing UI is not); booking calendars/holds stay V1
   per §5.6/§6.2; viewing angle, traffic exposure, and regulatory class stay V1 with provenance (they are model inputs for the
   measurement phase, not capture blockers for the inventory product).

**Partner inventory readiness amendment (2026-09-24).** Partner-managed blackout dates,
face-level prices, and map-assisted registration are part of the inventory release. Booking
requests, confirmation, and reservation calendars belong to the later agency-side implementation.
Face-level prices override the site default while effective; a future rate can be withdrawn
before it takes effect, while an active rate is ended and retained in the record.
Until agency-side quoting can combine rate segments, a search window spanning a face-specific
price change must not be shown at the site-default price.
A new listing must meet the site capture requirements below and have at least one
bookable face with a current rate for every bookable face. A site-wide rate can
serve as the default.
For digital faces, the pixel and loop/spot fields must be complete before that face can be
offered for booking. A recorded permit expiry that has passed makes a site unbookable; permits
that do not apply should remain unrecorded rather than inventing a reference. An existing
listed site with missing booking details needs correction before it is presented as ready for
the later agency booking flow.

**Lifecycle / states.**

**Demo trust and bilingual-market amendment (2026-10-06).** Registration, editing,
onboarding and buyer discovery support Nigeria, Ghana, Benin, Côte d'Ivoire and
Cameroon consistently, in English and French. Country-specific currency defaults
are NGN, GHS, XOF, XOF and XAF; country coverage does not imply enrichment coverage.
Typed addresses are checked against the submitted WGS84 pin through an existing
authorized geocoding integration when configured. Only an unambiguous, country-
consistent, sufficiently precise result beyond the documented tolerance can cause
automatic reviewed-and-rejected publication, with actionable correction and
resubmission guidance. Missing, failed or ambiguous lookup remains unable to verify,
never a confirmed mismatch. Location decisions and inputs are persisted and audited;
changed location inputs invalidate earlier verification. An inconclusive check keeps
the submission unpublished for ordinary review rather than silently listing it.

Reference-media uploads extract available EXIF location and capture time without
inventing absent metadata. Browser on-site capture records device location, accuracy,
time and an explicitly declared capture method; these remain evidence, not proof of
independent verification. Missing GPS/time is visible and can be explained. Media
admission is bounded and checks actual bytes; parsing is inert. Actual LED-board
videos are separate inventory evidence from campaign creative, are available in buyer
inspection, and do not autoplay. Media stays in object storage and remains tenant-
controlled before authorized marketplace publication.

**Digital screen dimensions (2026-10-27).** Screen resolution uses the existing
face-level `pixelWidth` and `pixelHeight` fields, distinct from physical dimensions
in metres/feet and from uploaded media dimensions. The face-registration/editing
step labels screen width and height in px and accepts positive whole numbers.
Saved partner, review and buyer views display width × height px for each digital
face; missing values remain explicit. Registration and main site editing collect
pixels beside physical dimensions.
Registration with resolution creates a Main screen face in the draft transaction.
Editing addresses each existing face by ID and shows its name; no resolution is
copied across faces. First-screen creation requires inventory-create permission.
Switching format preserves stored face resolutions; static forms hide pixel entry.
Single-screen advanced settings are collapsed; multi-screen settings use named screens.
Physical multi-sided inventory uses “Advertising sides” in these controls.
This adds no new schema or completeness
requirement to existing inventory; prior digital publication rules remain.

**Site capture requirements (2026-10-23).** Drafts may be saved with incomplete
media. Before submission for review, a partner supplies a wide/long-view photo
showing the site in its surroundings and a close-up/short-view photo showing the
board clearly, plus at least one site-context video or 360° panorama. Both photos
need a known capture date; absent EXIF dates may be honestly declared. The media
types are explicitly chosen, never inferred from legacy front/context photos.
Site videos are available for every inventory format, separate from existing LED
board recordings and campaign creative. Panorama uploads use full 360° 2:1
equirectangular still images and open in an interactive, keyboard/touch-accessible
viewer. The format check establishes compatibility, not proof of authentic capture.
Already approved or listed sites on the earlier media policy keep their dated
front photo requirement until their next submission. Existing asset labels are retained.
Registration and editing show illustrative framing guidance and explain each
requirement in English and French. Reviewers and authorized buyers can inspect
the same media. Existing provenance, tenant boundaries and upload limits remain.

Partner terms are immutable versioned content with an affirmative, authorized-
representative acceptance event tied to the exact content digest, locale, organization,
user and UTC time. The supplied Abonten draft is a review version; production
activation requires explicit approval and an operator-controlled activation setting.
Local preview may exercise the signup acceptance flow without presenting the draft
as approved or legally active. The terms require accurate inventory and authentic
media, authority to supply, prompt corrections and the supplied operational periods;
no registration details, governing law, fees or legal compliance facts are invented.
English/French interfaces, validation and authentication emails follow the selected
locale and preserve entered work on recoverable failures.

```
draft → pending_review → approved → listed → (suspended) → decommissioned
                                 ↘ rejected (back to draft)
```

- `draft` — created by the media partner, not yet submitted.
- `pending_review` — submitted to platform admin for listing approval.
- `approved` → `listed` — platform approval publishes the eligible site to the marketplace.
- `suspended` — temporarily unbookable (maintenance, permit lapse, quality hold).
- `decommissioned` — permanently retired; retained for historical reporting.

**Key user stories.**

- As a media partner, I can register a single site via a guided form or bulk-import many sites via
  CSV/Excel with validation feedback.
- As a media partner, I can manage multiple faces on a single structure as separately bookable
  units.
- As a platform admin, I review submitted sites for completeness and accuracy before listing.
- As a planner, I can inspect a listed site's coordinates, verification status and reference media.

**Module phase mapping.** MVP: single-site registration, approval, listing, basic attributes.
V1: bulk import, multi-face structures, full spec schema. V2: automated spec validation and
duplicate detection.

---

### 5.2 Site Metadata Enrichment

**Purpose.** Turn a bare site record into a _plannable_ asset by enriching it with the data
planners and KPI models need: traffic, visibility, audience, and context.

**Geographic context foundation (V1 amendment, 2026-09-30).** Nigeria and Ghana
use one country-configurable enrichment pipeline. Public reference layers (OSM roads
and POIs, geoBoundaries gbOpen administrative polygons, WorldPop population grids) are
deliberately shared across tenants; this is an additional, explicit exception to the
marketplace-only sharing rule. Private inventory and context derived for a site remain
subject to the site's existing owner/platform/marketplace authorization. Operators import
immutable, versioned, checksummed source artifacts with licence, attribution, reference
year, publication/fetch dates, CRS, coverage, units and quality. Imports activate atomically
and retries are idempotent; demo references never participate in production context.

The site surface calls this **geographic context**, never audience, reach, impressions or
traffic exposure. It reports road proximity, mapped POIs within 250/500/1000 metre geodesic
catchments, administrative containment, and modelled residential population. Population
is persons per pixel, area-weighted at catchment edges, with NoData/coverage reported;
partial estimates are not extrapolated to missing areas. Missing data stays null rather
than zero. OSM completeness is unknown, so an empty mapped POI result does not establish
the absence of real POIs. Each metric retains the exact source import, year, quality and
method. Road context retains the absolute nearest mapped segment and adds the nearest
source-named road within 1 km with its own distance and provenance. The named-road
headline never substitutes for the absolute nearest segment; partial import coverage and
missing source names remain explicit. Inventory coordinates are never sent to public population or enrichment APIs;
raster processing runs locally. GHSL/built-up indicators are optional future layers.

Real traffic observations may be imported separately with an observed interval, duration,
count/unit, direction and vehicle-class definitions. A short count is never relabelled AADT
or multiplied into an audience estimate. Observed traffic requires licensed observations.
Road class and residential population remain geographic context. Any future modelled
circulation must qualify separately under [§5.3](#planning-measurement). Demo records are
excluded from production measurement. Additional countries are registry entries and
source manifests, not new schemas or country-specific service branches.

**Enrichment dimensions.**

- **Traffic counts:** Average Annual Daily Traffic (AADT) for vehicle volume; peak/off-peak
  splits; pedestrian counts where relevant; source and vintage of the count.
- **Visibility inputs:** viewing angle, sightline, viewing distance, dwell time and nearby
  visual clutter where documented. See [Viewability Fit](#planning-measurement) for the
  planning calculation.
- **Audience demographics:** modeled age, gender, socio-economic classification (SEC), and
  inferred interests where data permits; coverage confidence and data source.
- **Surrounding Points of Interest (POIs):** malls, markets, schools, universities, religious
  centers, transport hubs, business districts, residential density — with distance and category.
- **Illumination status:** confirmed night-time visibility (lit vs. unlit), useful for night
  campaign planning and POP night checks.
- **Environmental context:** rain/shade exposure, traffic direction, road class, and any seasonal
  notes that affect delivery or visibility.

**Data sourcing.** Enrichment may come from: manual entry by the media partner, platform surveys,
third-party data providers, mobile-location / movement datasets (V2), and government traffic
counts. Each enrichment record carries `source`, `method`, `collected_at`, `confidence`, and
`expires_at` so planners can judge reliability.

**Update cadence & quality.** Traffic and demographics are refreshed periodically (e.g., annually
for AADT, quarterly for POI drift). Every field has an optional confidence/quality flag; stale or
low-confidence enrichments surface in the planner UI so estimates are never presented as fact.

**Module phase mapping.** MVP: manual traffic + visibility + POI entry. V1: structured enrichment
schema with source/confidence, third-party import. V2: automated enrichment from movement data and
benchmarking against regional audience panels.

---

### 5.3 Media Planning & Campaign Builder

**Purpose.** Let planners discover inventory and assemble defensible campaigns with KPI estimates,
budgets, and schedules.

**Discovery — search, filter, map.**

- Full-text and attribute search across the marketplace.
- Filters: geography (country/city/market/draw-radius), format, illumination, panel size range,
  price range, availability window, minimum KPI thresholds, media-partner, and tags.
- **Map view** is first-class: pan/zoom, draw a polygon or radius to select sites, toggle layers
  (traffic heat, POIs, demographics), and see availability at a glance. Map tiles must work
  offline-cached for low-connectivity planning.

**Campaign builder.**

- Campaign header: name, client (brand org), agency owner, objective, target audience, date range
  (flight), currency, total budget.
- Site selection: manual add from search, auto-recommend by KPI/budget fit, route-based selection
  (sites along a corridor), and saved shortlists.
- **KPI estimation** for selected faces and the plan where evidence supports the measure.
  Use the [planning measurement definitions](#planning-measurement). Report demographic
  breakdowns where supported and **GRP/TRP** where the audience universe and exposure basis
  are known.
- **Costs:** total cost, cost per site and budget utilization. Label **CPM** with the
  impression type used and calculate **CPRP** only when rating points are available.
- **Budget allocation:** distribute a total budget across sites with constraints (min/max per site,
  per-market caps); visualize allocation and remaining budget.
- **Scheduling:** per-site start/end within the flight, sequencing, and conflict checks against
  availability.
- **Scenarios:** save multiple plan variants, compare them side-by-side, and lock a winner into a
  booking.

#### Planning measurement

The planner UI, planning API and plan exports use these five groups in this order.
Gross, viewable (OTS) and likelihood-to-see (LTS) impressions have separate labels
and values. Map supplier metrics by their qualifying criteria.

1. **Traffic and circulation.** Traffic counts vehicle passages. Circulation counts person
   passages, including people on foot and occupants of vehicles where supported. Keep
   these units separate and state the location, interval, direction and whether the
   value is observed or modelled. Converting vehicles to persons requires supported
   occupancy estimates.
2. **Gross impressions.** Potential ad exposures from people present in the defined
   exposure zone for a face while the face is functioning and the ad is displayed.
   For digital faces, use the advertiser's play times or the planned slot schedule
   for a forecast.
3. **Viewable impressions (OTS).** The subset of gross impressions that meets the
   applicable viewability criteria, including enough time to see the ad.
4. **Likelihood-to-see impressions (LTS).** Viewable impressions with additional evidence
   that the ad was likely noticed.
5. **Audience, reach and frequency.** Audience requires stronger evidence beyond LTS
   that people saw or were highly likely to see the ad. Reach counts distinct people
   with at least one qualifying exposure across the selected faces in the stated period.
   Frequency is qualifying exposures per person reached over the same faces and period.
   Disclose the exposure basis and deduplication method and use the same basis for both.
   A reach percentage also requires a defined population.

These definitions follow the [MRC OOH Measurement Standards, December 2025, §§3.1–3.3](https://mediaratingcouncil.org/sites/default/files/Standards/MRC%20OOH%20Standards%20Combined_FINAL.pdf).

A future circulation model can estimate directional flows from road and transit networks,
POIs and sparse counts. Relative route demand derived from open data stays planning
context until the model can estimate absolute passage volumes validated against
independent observations for the relevant locations, directions and periods. A
qualified model can supply circulation inputs to impression estimates. Each impression
type still requires its own evidence. [WOO Global OOH Audience Measurement Guidelines 2.0, §2.1.1](https://cdn.oohcentral.com/research/world-ooh/global-ooh-audience-measurement-guidelines-2.0.pdf#page=14)

**Abonten Directional Travel Demand Model (ADTM, V1).** A planner can compare directional
route alternatives for a stated time window in any market with usable inputs. Each
origin-to-destination pair has a relative demand weight and a declared source. The
model assigns a pair's fixed demand to its routes in proportion to the inverse of
their travel times. Changing travel times can redistribute demand across its routes.

The generator in `POST /api/planning/v1/studies` takes a country, local study area,
campaign flight, local dayparts and time zone. It uses current production
OpenStreetMap roads and points of interest and WorldPop resident estimates from the
geographic context imports. It groups them into zones, generates trips between
residential and activity zones, and weights each direction using resident estimates,
mapped destination categories, distance and a versioned local daypart profile.
The profile expresses assumptions about trip timing, such as morning travel toward
schools and offices and later travel toward homes. Return the data vintages and the
weight contributions so planners can see what drove the result. Exclude unknown
population from origin weights without substituting zero, and report missing coverage.

The study keeps one board-relevant set of directed pairs across all requested
dayparts, including local and through trips. Report the share of generated demand
weight sent to routing and retain the unresolved weight of any pair Mapbox cannot
route. Generated weights are relative to the selected area and assumptions.

For comparisons based on planner-supplied weights and candidate routes, use
`POST /api/planning/v1/travel-demand/scenarios`. Supply sourced durations directly
or request Mapbox Directions estimates for an offset-qualified departure time.
Use one travel time source per comparison.
Only public road waypoints and departure time go to Mapbox when the planner
deliberately starts a study. The study action authorizes that request; a separate
provider-transfer checkbox is not part of the planning journey. Inventory, brief
and client data stay within Abonten for routing. The provider
can return a routing estimate in places where traffic coverage is absent. Report
which inputs were used and distinguish a predicted duration from a confirmed
traffic observation. If any alternative lacks a comparable duration, leave that
pair's allocation unresolved and keep its weight in the scenario denominator.

Shares describe the submitted scenario and its assumptions. They stay separate
from traffic and circulation counts, board exposure and audience metrics.

**Board route sample (V1).** The planner chooses **Recommended**
or sets a **Custom** budget in directed origin-to-destination (OD) pairs. A → B
and B → A count separately. Add both as a block where the inputs support both
directions. Keep the selected pairs fixed across the compared dayparts and
calculate weights and route choices for each daypart.
Include both local and through trips. Let routes bypass the board and use their
actual geometry to determine which routes cross its road. Show the number of
directed pairs used and the actual candidate-route count for each daypart.

Recommended uses the smallest tested sample that meets both checks against a
larger, comparable reference for the board and still meets them at every larger
tested sample size. For every face and daypart, the modeled split of passing
weight by direction and Viewability Fit must each be within 3 percentage points
of the reference. In every daypart, the sample must also capture at least 95%
of the reference's modeled passing weight at the board. Compare
passing weights on the same demand-weight scale, using the same road
cross-section, face criteria and routing and weighting methods. Keep the
reference pairs fixed across dayparts. Alongside the recommended count, show the
reference size, the largest score difference and the lowest passing-weight
coverage across dayparts. If the reference is unavailable or too weak to support
the checks, explain why. If no tested sample meets both checks, show the shortfall.

In the Accra pilot, the original placement met the checks with 16 directed pairs
and the more demanding placement needed 34. The 34-pair sample differed by at most
1.9 percentage points and captured at least 95.2% of modeled passing weight against
the same 72 directed reference pairs across three dayparts. These are historical
pilot findings. The integrated planner derives its recommendation for the actual
board. If a smaller stable sample cannot be established, it uses the requested
reference and explains the shortfall without declaring that reference converged.

**Abonten Score.** Report Directional Demand and Viewability Fit separately for each
face and time window. At a defined road cross-section, sum the ADTM weight of each
route alternative once for the direction it crosses, using its trip-pair weight
times its within-pair route share. Directional Demand is the percentile of that
weight against declared comparable road approaches in the same time window.
Use one routed sample for the board and its benchmark approaches, keep those
approaches fixed across dayparts and report coverage. Show unavailable when the
routed sample provides no matched weight for the direction or comparable
approaches are unavailable.

Viewability Fit is the share of all modeled passage weight crossing the board's
road cross-section in either direction that meets the checks for that face.
Assess the direction of travel, the face's orientation and position relative to
the road, usable sightline, continuous time in view and display eligibility where
supported. Estimate time in view from the lengths and speeds of the visible
road sections for the time window. When using Mapbox, report the local segment
speeds as routing estimates and indicate whether the response showed evidence
of traffic coverage. A passage known to be ineligible contributes to the total
passing weight only. Report assessment coverage as a share of that same total.
Show Fit as unavailable when there is no matched weight or when any positive
weight remains unresolved. Both results describe modeled route demand, separate
from measured traffic, impressions and audience.

**Abonten Audience Model (V1).** Estimate campaign reach and frequency by
assigning ADTM trips to a weighted simulated population. Use census data or WorldPop
to size the population, OpenStreetMap roads and destinations to describe where people
can travel, and ADTM’s directional weights, routes and travel times to model journeys.
Keep the same simulated people across all faces, dayparts and days in the flight so
the model captures recurring trips and overlap between faces.

Use the same engine across markets. Local travel surveys and counts can calibrate
trip volumes and timing. Multi-day travel diaries or mobility panels can calibrate
how often people repeat trips and how much audiences overlap across corridors.
Use existing data first. A short opt-in browser diary can fill a specific gap
without an app or hardware installation. Where recurrence is assumed, retain its
basis in the internal methodology and show planners the estimated range and material
limitations. Use contrasting
markets with different travel patterns and data coverage for the first validation.

Apply each face’s viewability checks and the campaign schedule to the simulated
journeys. Report modeled OTS impressions, 1+ reach, reach at the planner's chosen positive
whole-number threshold, and average OTS frequency. Calculate all four from the same
frequency distribution across the flight. Count each person once at each reach threshold.
A population total and relative trip weights alone are insufficient to support an absolute
reach estimate. Publish estimates only where the inputs support person-trip scale, qualifying
opportunities and a disclosed deduplication method. Audience measurement retains its
separate evidence requirements above.

AAM is part of the authenticated agency study API at `POST /api/planning/v1/studies`.
`GET /api/planning/v1/studies/:id` reports progress and results, while
`POST /api/planning/v1/studies/:id/evaluate` changes selected faces, objective, budget
or the positive whole-number threshold using the retained study. This does not reroute
or change its population. The study applies representative local weekday/weekend
periods to each calendar day of the flight, using saved face profiles and planned
display allocations to qualify opportunities. Report source coverage, weighted cohort
basis and assumptions internally, with sensitivity results and material coverage
limits in the planner interface. Cancellation and retry preserve controls.
Interrupted, expired or source-incompatible studies require a new or retried study.
Redis-backed attempt leases, shared capacity and cancellation keep progress consistent
across API processes. Fence stale workers and overlapping evaluations so an earlier
request cannot overwrite a newer accepted attempt or face selection.
`POST /api/planning/v1/studies/:id/compare` evaluates a saved alternative against retained
evidence without changing the current study. Bind displayed comparisons to the current
study, applied decisions and saved alternative revisions; discard superseded responses.
The superseded 1,000-person example API is removed to keep one audience engine.

**Composite Abonten Score (V1).** Rank whole plans against the confirmed
objective, target audience and flight. Apply comparable full-flight costs, the
budget cap and availability as eligibility constraints. For a reach brief, use the
Audience Model’s estimate of how many people have at least one qualifying opportunity.
For a frequency brief, use the number of people who reach the brief’s frequency
threshold, such as 3+. Recalculate overlap across the proposed faces. Explain how
many new people a recommended face adds or how many it moves across the target
threshold. Use the Abonten Score’s face-level signals to explain the underlying
demand and viewability. The composite is a plan ranking based on forecast metrics
and remains separate from delivery reporting.

**Integrated planning release (2026-11-07 decision).** Complete the map-led journey
from a confirmed market, flight, budget/currency, objective and target audience to
face comparison, modeled audience, a recommended face mix and saved alternatives.
Use the existing OMG Penpot planning journey and support both light and dark themes.
All three models consume the same declared study, fixed directed trip pairs and
versioned input evidence. Include local trips and trips entering/leaving the study
area. Recommended sampling is computed for the actual board and its dayparts using
the stability and passing-weight checks above. Custom sampling is a planner control.
Show a reference shortfall or missing source as an actionable data state.

Save face-level facing, viewing distance/angle, obstruction and display inputs once
through the partner inventory workflow with provenance. Infer road approaches from
public road geometry and offer map-assisted correction. Keep partner work limited
to facts that maps cannot establish. A road proximity match alone cannot establish
the sightline. Faces on one structure use the same nearest-road cross-section by
default. A distinct optional `roadApproach` point selects another road explicitly.
The furthest usable `sightline` point determines visibility and cannot silently
change the road being assessed. Use directional Mapbox segment distances, durations and speeds when
calculating continuous time in view, with the face's position, orientation and display
conditions. Explain the score through the face's directional exposure, viewing
time and material missing inputs; keep technical calibration in the methodology.
Use a face's explicit illumination schedule or parseable saved site hours for night
eligibility. A declared unlit site is ineligible at night; unknown operating hours
remain unresolved. Disclose the day/night timing assumption. AAM may report an
assessed subtotal with the excluded faces and periods named, without redistributing
their journeys. Whole-flight Composite recommendations require complete coverage
for each included face.

The user approved population-wide modeled reach where observations are absent.
Use a declared geographic population and explicit person-trip, participation,
recurrence and route-choice assumptions with lower/base/higher sensitivity results.
Report this as an uncalibrated planning estimate until independent observations
support calibration. Relative trip weights alone never establish person-trip scale.
Retain the same modeled population, journeys and geographic basis when changing
selected faces. Apply local calendar days, weekday/weekend timing and the selected
display schedule throughout the flight. Reach at each positive integer threshold,
OTS impressions and average frequency come from the same frequency distribution.

Targeting supports location and modeled travel-purpose groups, plus age and sex
where public data supports them. Maintain source vintage, coverage and an explicit
missing-data response for demographic inputs. Assess demographic coverage over the
known resident population, excluding water and other NoData cells from the coverage
denominator. Derive age/sex proportions within the demographic grid's own all-age,
both-sex totals before applying them to the study's fixed resident population;
different raster resolutions must not silently change that population. Resident demographics and destination
categories do not establish individual traveler identity or measured interests.
Household audience qualification and campaign-led strategy are described below.
SEC qualification is included using the chosen A, B, C1, C2, D and E classes and
versioned, market-appropriate evidence. Broader interest targeting remains outside this slice. Unsupported
targeting cannot silently become an all-person estimate or earn a targeting bonus.
The Composite Abonten Score uses the resulting objective-specific incremental reach
and frequency with authorized inventory, current availability and comparable flight
costs. Explain each selected face and the modeled people it adds or moves above the
chosen frequency threshold. Preserve unknown commercial facts in research references.

**Brief, strategy and audience qualification (2026-11-08 clarification, V1 §5.3).**
Campaign setup is a structured media-planning form. Planners enter the campaign
description, primary audience, optional secondary audience, target-group parameters
such as age, gender and SEC, campaign objectives, market/geography, media budget,
currency and flight. Campaign forms express first and last campaign days inclusively;
the API retains its exclusive end-date contract, converted at the interface boundary.
Saved plans, cost calculations and displayed dates must describe the same flight.
A product, service or price mentioned in the description informs judgment about the
target group (TG), geography and strategy. It is not a separate required field,
an automatic household-affordability cutoff or an independent measurement-model
input. Media budget and flight remain separate campaign constraints. Human or AI intelligence translates the context and
available evidence into explicit, reviewable TG criteria and strategy decisions.
The planner can revise that interpretation; never silently substitute education
travelers, an age band or an income threshold for the requested audience.

The primary path is enter campaign context → define audiences and objectives →
build and compare plans. Planners decompose their own briefs and can complete the
form without an AI request. Optionally, choose “Import brief” and select a file:
that deliberate action starts extraction and fills the same campaign form with
reviewable values. Do not insert a second raw-text/copy/save/proposal workflow.
The extraction must read the full admitted text, including its tail, rather than
confusing a bounded description with the original document. It must not invent missing details or apply an incompatible
interpretation silently. Preserve existing saved context. There is no separate
offer/payment form, save-context step or provider-sharing checkbox. Opening,
editing or reopening campaign context never sends it automatically; a passive
file attachment outside the deliberate import action is not an extraction request.
Provider configuration and service privacy information belong in the appropriate
organization/account context, not in the campaign form. Optional audience refinements
must not turn every brief into a purchasing-profile or unsupported-requirements form.

Use compact field groups, selected-parameter pills, audience tags, metric cards and
comparison rows to make decisions and results scannable. Retain meaningful labels
and accessible controls. Show reasons, detailed evidence and provenance on demand;
do not stack paragraphs, repeated headings and introductions around every control.

The primary audience drives portfolio optimization. Report secondary-audience
population, modeled OTS, reach and frequency separately on the same fixed study
and journeys. Audiences may overlap; do not add their totals or imply they are
disjoint. SEC groups describe modeled socioeconomic profiles using occupation,
education, household assets and living conditions, not a
product-price affordability threshold. Preserve source vintage, classification
definition, geographic coverage and uncertainty internally; do not fabricate
class membership or silently ignore a selected SEC filter.

The Abonten SEC model uses the A, B, C1, C2, D and E labels with a versioned
multifactor method. Fit class probabilities from actual weighted joint public
survey records, retaining the four input domains and learned class proportions.
Do not substitute six equal wealth bands, import another country's class shares,
or claim that model classes are observed NRS chief-income-earner grades. Survey
respondent occupation is not the occupation of their household's principal earner;
students, homemakers, retirees and people without work must not automatically
become class E. Preserve missing input and unclassified mass. Adult-only evidence
cannot silently qualify children. Aggregate reference outputs may be retained;
raw respondent records, identifiers, free text and restricted coordinates do not
enter product storage, source control or provider requests. Geography and joint
age/gender support must reflect the source's actual sample; no neighborhood-level
precision can be inferred from a national profile. Combining SEC and parent
qualification must propagate uncertainty about their unobserved dependence.

The initial feed is [Afrobarometer Round 10](https://www.afrobarometer.org/data/merged-data/),
using published records under its [usage policy](https://www.afrobarometer.org/data/data-usage-and-access-policy/).
The actual public file includes Nigeria, Ghana, Benin, Côte d'Ivoire and Cameroon.
Fit a deterministic, regularized six-class categorical latent model per country,
using a normalized four-domain likelihood: occupation, education, household-owned
asset count and the source's official lived-poverty category. Occupation is nominal
rather than an automatic status-to-class rule. Retain convergence and comparable
regularized-objective diagnostics; optimizer instability does not become a sampling
confidence interval. Six class names alone do not establish identifiable profiles.
Order the resulting profiles from A to E by their education, assets and living
conditions; learn the class proportions from weighted records. Preserve fractional
posterior membership, unclassified mass and country/age/gender sample support.
Calculate each selected class union within each retained fit, preserving covariance;
do not sum six independent error margins. Unknown adults remain potentially eligible
in the upper sensitivity scenario. Selecting all six classes is the full eligible
adult union: a person cannot be excluded merely because their individual class is
unknown. Its base and bounds therefore preserve the adult population, or the
existing parent estimate when parent qualification is chosen, without pretending
that every individual grade was classified. Report source classification coverage
separately. A class-specific selection with no supported evidence yields an
unavailable estimate, not a claimed zero.
These are Abonten model classes, not survey-assigned A–E labels. Adult-only support
starts at 18: within a native 15–19 population bin, the initial uniform-age
approximation assigns 2/5 to ages 18–19, not the entire bin. Combining parent and
SEC probabilities uses a conditional maximum-entropy base with structural
Fréchet bounds for their unobserved dependence. The methodology, source version,
fit checks and coverage remain inspectable without requiring planners to enter
model coefficients.

**Initial SEC publication rule.** Withhold a class-specific point estimate when
the selected cohort's union share differs by more than five percentage points
between comparable converged fits. Weight that diagnostic by the actual selected
adult population; a sparse stratum alone must not disable a whole market. This is
an internal pilot quality rule, not a WOO/MRC requirement or confidence interval.
Keep its diagnostic and threshold in methodology metadata. An unreliable secondary
audience does not block a supported primary recommendation. The exhaustive six-class
union retains the adult/parent identity described above. Until a different display
policy is chosen, use a short unavailable status rather than publishing an unstable
point figure; retain its underlying range for analysis.

The platform chatbot is a separate assistant, available alongside planning. A
planner can ask it to inspect the current campaign/plan, edit draft context and
audiences, find and compare faces, run ADTM/AAM and save alternatives. Give it the
authorized context and platform tools so it can decide how to accomplish the
request; do not encode a fixed intent router or mandatory action sequence. Reuse
the same authorized domain operations as the interface, preserving tenant scope,
ownership, optimistic revisions, idempotency and audit. Reflect completed actions
in the visible plan and report actual tool results; a response cannot claim that
an action succeeded when it did not. This scope does not authorize booking,
publishing, payments or messages to other people. A deliberate chat send starts
the request; editing or navigating never triggers silent agent actions.

Planning intelligence receives the available audience capabilities, supported child
ages and reference scope. A proposal uses the same campaign-period catalogue as the
interface; the engine API may still accept explicitly supplied custom periods.
Keep methodological notes separate from unsupported audience requirements. Preserve
chosen criteria when a proposal leaves them unspecified, and discard proposals that
finish after their brief or decisions have changed.
AI observations and coverage cautions are advisory proposal notes, not new audience
filters. A proposal preserves any unsupported requirements already chosen by the
planner, but cannot turn its own free-text notes into hard qualification gates.
The planner can explicitly add a must-have requirement through the audience controls.
Show the applied audience and material scope before calculation; a proposal cannot
claim that a criterion lacking evidence has been measured.

ADTM models travel demand and journeys. AAM composes the chosen audience with those
journeys and face viewing checks to estimate modeled OTS impressions, distinct
1+/N+ reach and frequency. Household attributes belong in AAM when the chosen TG
requires them. Parent status and a child's school location are separate criteria;
an adult need not personally make an education-purpose trip to qualify as a parent.
Composite ranks objective-specific incremental qualified reach from that same
distribution within commercial constraints, applying qualification once.

School geography describes where children attend school, independently of household
residence. A modeled school catchment may combine public school locations, population
and sourced enrollment or travel evidence. Preserve the distinction between observed
household relationships and inferred school assignment, propagate uncertainty, and
report missing school coverage rather than treating every local resident as eligible.
Strategy decisions include the applied study area, dayparts, objective and frequency
threshold; descriptive strategy text alone cannot change execution.

Abonten owns technical calibration, reference selection, coefficients and validation
internally. Customer controls express the brief and strategy in business terms;
they do not require trip rates, household-generation parameters, spending-budget
fractions or assumption acknowledgements. Explain results with useful reasons,
estimated ranges, coverage and material data limitations in plain language. Retain
technical assumptions and provenance in the model methodology and audit evidence.

Keep the implementation market-independent through versioned reference inputs,
including source, licence/access conditions, survey period, geographic grain,
monetary base/currency where relevant, method and coverage. Use supported joint
household evidence for parent, school-enrollment and economic TG attributes. Any
derived relationships remain distinguishable internally from observations;
relative area wealth alone cannot establish a monetary purchasing-capacity claim.
Show qualified population evidence even when missing face facts prevent OTS.
Missing reference or viewing evidence stays actionable and cannot qualify everyone.

The first household reference feed uses published Nigerian and Ghanaian aggregates;
its coverage varies by child age and school-location evidence. The initial parent
estimate covers adults living with their biological children who attend school.
Show this scope when chosen; it does not establish guardians or parents living
elsewhere. Combine child-parent and school-participation marginals with documented
internal association and sibling assumptions, then compose the resulting adult
probabilities with the fixed age/sex population once. Lower/base/higher values are
a structural sensitivity range, not a statistical confidence interval. The initial
Nigerian school catchment uses mapped school locations and published school travel
times. Preserve unknown destinations and missing mapping coverage; do not assign
all unknown journeys to the selected area. Add markets through versioned reference
data rather than market-specific calculation branches.

Persist brief context, selected TG and strategy through saved alternatives; recheck
reference versions on resume. Changing the offer context alone cannot silently
change the target universe or measurement outputs: revised TG/strategy decisions
drive recalculation. Preserve stable cohorts across selected-face and N changes.
Add only missing Penpot states and retain both themes and the organized journey.
Use the same versioned API for browser and integration clients. Verify context/TG
separation, the Lagos school-parent brief, unsupported evidence, saved comparisons,
population conservation and whole-plan ranking. No viewing facts or household
observations may be invented to force positive exposure results.

Drafts preserve model controls, face choices and scenario alternatives. Reopening
rechecks current facts and reuses only source-compatible, authorized study results.
Routing may run asynchronously with visible progress, cancellation and retry so a
larger reference does not block navigation or lose planner work. Required API and
browser QA cover the normal journey and relevant missing-data/recovery paths.

Distinguish reported results for past periods from forecasts for planned flights.
Disclose source, method, period, coverage and evidence status for each metric, along
with the confidence or uncertainty of any estimate. Leave unsupported metrics
unavailable. Show a whole-plan total only with comparable coverage across all
selected faces and dates. Label a subtotal as partial and state which faces and
periods it covers. Keep these measures separate from costs, inventory availability,
geographic context, brief-fit scores and POP delivery evidence.

**Agency location-intelligence workspace (2026-10-04 amendment).** The agency
landing surface is a full-screen marketplace map with selectable board pins,
face-level shortlist, date-window and budget controls, and a floating planner.
Board detail retains production enrichment provenance and explicit missing-data
states. Distances are geodesic straight-line kilometres, not travel distances.
Cost estimates use effective published face/site rates and state their duration,
currency, minimum term and availability-check time; no FX or monthly daily rate
is inferred. Selection is a draft shortlist and never reserves inventory.
Manual draft interest may retain a listed, physically flight-eligible face whose
quote or calendar check remains unknown; known unavailability still blocks adding
it, and incomplete facts never confirm budget fit. This tab retains bounded controls
and at most 100 face identifiers, scoped to the user and agency. Returning reloads
authorized inventory and availability; incomplete restoration keeps full-plan budget
fit unknown. Signout clears these tab drafts. Raw uploads, transient chat and transfer
authorization are not stored. Deliberately saved planning drafts retain reviewed
brief context, target group and strategy as described above.
Popup visibility follows the same source, classification and freshness rules as
planner grounding. Malformed locations remain unknown and cannot create distances.

Briefs support PDF, PPTX, XLSX, DOCX and text/CSV equivalents through bounded,
inert local text extraction. Documents are untrusted data: active content is not
executed, file bytes are not persisted, and extracted constraints require planner
confirmation. Legacy binary Office formats require conversion. Until an approved
AI provider is configured, the assistant identifies itself as local planning help,
never simulates model output, and does not transfer briefs to an external provider.
When the server has an approved OpenAI credential, the planner uses the fixed
`gpt-6-luna` model through the Responses API. Chat carries a bounded conversation
and a server-loaded marketplace snapshot; canonical pricing, availability and
geodesic calculations remain authoritative facts separate from model commentary.
Model recommendations must reference faces in that snapshot. For a provisional research shortlist, admitted research face IDs remain selectable interest despite unknown commercial availability; they must not be represented as bookable supply. When one shortlist is requested, recommendation IDs describe one portfolio; alternatives are not added to that portfolio. Its preliminary exact-calendar-month, same-currency asking subtotal must respect the planning ceiling; missing prices cannot become zero, a confirmed fit or a stated remaining balance. Structured response array/string bounds are communicated to the provider and enforced again on return. The model cannot
book inventory or execute arbitrary code. The existing tool-less grounded
recommendation endpoint does not invoke platform tools; the separate platform
chatbot uses the scoped planning tools described above. The new planning journey sends the
current brief only when the planner deliberately asks to extract its details or
sends a chatbot request; that action authorizes its request, including after an edit. It does not create a
standing permission or silently send later edits. Other chat integrations retain
their own deliberate-send and brief-sharing boundaries. Requests are bounded, cancellable and rate-limited,
use `store: false`, and never retry automatically. Configured-provider failures
are visible and require a deliberate retry; they do not masquerade as local help.
Server-only structured Nest log events record provider and final-plan outcomes,
latency, ephemeral request IDs, bounded actual token counts and allowlisted
provider diagnostics. No messages, briefs, keys, raw errors or user/organization
identifiers are logged. Log collection, metrics and alerting remain deployment
requirements; limits are process-local.
Server discovery uses bounded structured geography, format and text filters from
confirmed controls and unambiguous campaign requirements; ambiguous alternatives
require clarification. At most three eight-board marketplace pages are read per
request, independently of the map's initial viewport/snapshot. Canonical same-currency
flight estimates prioritize up to twelve discovered candidates alongside the selected
boards. Coverage, discarded candidates and unresolved requirements are explicit;
this is bounded advisory discovery, not an exhaustive portfolio optimizer.
Production enrichment is projected into model context with source, verification,
units, observation/reference period, freshness and missing states. Demo-class rows
never enter model input. Mapped roads, POIs and residents are geographic context,
and interval traffic observations do not establish billboard exposure. Unconsented
brief-derived filters, constraints and candidate choices stay out of provider requests.
Model context has a separate compact snapshot budget with explicit omitted
source/face details; full canonical API facts are retained. Recommendations are
validated against the exact transferred IDs. Upload admission precedes buffering,
allows two 10 MB documents per process, bounds body reads to twenty seconds and
parsing to fifteen seconds, and holds capacity until a cancelled child closes.
Local document extraction remains available regardless of provider availability.
The workspace reports OTS only when the [measurement requirements](#planning-measurement)
are met.

**Map-led planner.** Use the Planning journey page in the OMG Penpot project as the
design reference for the map workspace, board browser, face and daypart analysis,
shortlist and comparison. Keep the map in view while planners open these panels.
The shortlist records explicit face choices and stays visible as the planner moves
between panels. A planner can compare a board's faces by local weekday or weekend
daypart and review routing coverage before using the scores. The route layer uses
ADTM's relative demand. Display face scores only when their inputs support them.
In plan review, show the selected faces, comparable flight costs and budget fit.
Let planners run AAM on the selected viewable approaches and change the reach
threshold using the resulting frequency distribution. Report the sample basis and
missing inputs next to the estimate. The agency draft can save the objective,
target audience and reach threshold as planner-entered controls. Recheck evidence
and require the planner to start each new routing study deliberately; provider
transfer authorization is carried by that action, without another checkbox.

**Agency work continuity (2026-10-06 amendment).** The agency dashboard is a
workspace home with a primary start-plan action, direct marketplace access,
personal saved planning drafts, and actionable checks derived from those drafts.
The full-screen location-intelligence planner remains first-class on its own route.
Personal planning drafts are durable, scoped to the signed-in user and agency,
and exposed through the versioned planning API. A draft stores a bounded name,
flight, country/search/format controls, budget/currency, optional audience planning
controls, reviewed brief context, target group, strategy and at most 100 face/site
identifiers. It stores no raw uploaded document, transient extraction, conversation,
standing transfer authorization, quoted price, availability, enrichment snapshot or reservation.
Saving and updating are authorized and audited; optimistic revisions prevent
silent overwrites. These drafts are planning interest, not commercial campaigns.
Resume rechecks current authorized inventory and availability, preserves unknown
and unresolved facts, and does not claim complete budget fit after partial load.
The existing unsaved tab draft remains recoverable until explicitly replaced.
Comparison uses the selected faces' current specifications, costs, units, periods,
availability and provenance; geographic context is never audience exposure.
Dashboard attention items state the precise underlying missing control, stale
flight or failed recheck and open the relevant correction journey. Empty saved
work is an invitation to make a real plan, never invented campaigns or metrics.

**Agency dashboard (2026-11-09 implementation).** The agency home is a
quiet campaign work list with flight dates, compact planning and committed budget
context, inline operational follow-up and recent personal drafts. A restrained
per-campaign bar compares committed bookings with that campaign's planning budget;
it does not represent spend or delivery. Unbooked campaigns retain that state
without a committed fill. Campaigns
follow the lifecycle in §6.3; personal drafts and alternative plans remain separate
from booked work. Financial totals stay within one currency and state their
planning or commitment basis. Attention opens the relevant campaign or draft
action, and current unsaved work remains recoverable. The authenticated versioned
planning API reads actual agency-owned campaigns and campaign details; alternatives
with `scenario_of` and personal planning drafts are excluded from campaign totals.
An empty campaign register remains empty. Campaign-view permission opens the
overview; booking, monitoring and issue permissions govern their respective facts.
Restricted facts remain unavailable rather than appearing as zero.
Commitment uses the quote subtotal before tax and requires an unambiguous issued
or paid quote for each confirmed, live or completed booking in the campaign
currency. The API identifies this basis as `quote_subtotal`; recorded taxes and
totals remain separate detail facts. Missing or duplicate quotes and
unmatched currencies keep the total unavailable; recorded rates have no assumed
full-flight basis and no FX conversion is inferred. Campaign-wide quotes remain
readable facts without an assumed booking-coverage allocation. Known subtotals
remain explicitly partial. Requested or held bookings are not commitments.
Campaign details expose existing line items, booking and quote facts,
the latest synced check per booking, older synced checks linked to visible open
issues, private photo previews and open issue records for follow-up.
Photo reads follow campaign ownership through the booking and synced check, require
monitoring permission independently of booking permission, and expose bounded
image previews without storage keys or EXIF. Stored originals remain immutable.
Flight and line-item end boundaries are exclusive; interfaces show the last
included calendar day. This read slice does not
create campaigns, reservations, proof, messages or payments. Light, dark and phone
layouts follow the approved Penpot review; its sample figures are not runtime data.

**Agency-scoped demonstration amendment (2026-10-06).** An explicitly authorized
operator may add clearly labelled synthetic Lagos inventory and personal demo
planning scenarios to a verified existing mediaReach OMD agency. A nullable
inventory demo-agency scope is enforced by every discovery, detail, child-resource,
planning and enrichment read; ordinary inventory with no scope remains shared.
Scoped demo inventory is visible only to its designated agency and owning
organization, subject to their existing capabilities. It is not verified physical
inventory or commercially bookable supply. Synthetic dimensions, NGN sample prices
and sample planning availability carry an explicit demo discriminator/provenance.
The scoped catalog may be listed for demonstration without a reference photo;
ordinary publication readiness is unchanged. No fabricated photos, video, permits,
location verification, audience enrichment, measurement, bookings or terms are
created. Enrichment for synthetic pins remains unavailable rather than implying
measured board performance. A dedicated insert-only, idempotent helper verifies
the exact target organization and active member capabilities, adds at least six
connected sample boards, and creates private budget-fit, over-budget and incomplete
constraint scenarios per already authorized planner. It never grants roles,
creates users, merges identities, rewrites existing drafts or runs generic seeds.
Demo contacts use reserved `.example` addresses. Existing personal draft isolation
and revision/audit rules remain unchanged; rollback must not expose scoped samples
as ordinary shared listings.

**Source-qualified research planning (2026-10-07 amendment).** An authorized
operator may import real, publicly documented billboard references into an existing
agency's private planning catalog. These are research references, distinct from
partner-registered/verified or commercially bookable stock and from DEMO inventory.
The importing agency curates the record; it does not represent the media owner.
A separate nullable research-agency scope is enforced across every discovery,
parent/child/media, planning and enrichment read. Public-source evidence records
publisher, canonical URL, access date, explicitly reported dimensions and WGS84
coordinates with accuracy/verification limitations. Unknown data stays absent;
reported monthly asking prices retain source, currency, period and fetch date and
are neither daily-prorated nor converted to confirmed flight quotes. Unknown slot
specifications, availability, permits, taxes, production costs and traffic are not
invented. A researched reference can be shortlisted, compared and saved as planning
interest despite unverified commercial specifications; this never permits booking,
publication as partner-verified supply, or confirmed budget fit. AI grounding carries
these distinctions and can compare a source-priced preliminary monthly baseline,
while the canonical full-flight cost and availability remain unconfirmed. Imported
references are insert-only, audited and idempotent; existing DEMO and user data are
preserved. Existing source-media rights are not inferred and no photos are copied
without authorization. An internally authored campaign brief is planning work and
must not assert instructions from a real client. Uploaded briefs remain inert;
uploading or confirming extracted controls alone never transmits them. In the
planning journey, a deliberate extraction or chatbot request authorizes its current
brief for that request. Other chat integrations retain their own sharing boundary.

**Canonical grounded-recommendation output amendment (2026-10-07, MVP §5.3).** For
the existing tool-less recommendation endpoint, provider output
selects admitted site/face identifiers and bounded, vetted advice/question/reason
codes. Unconstrained model prose is never returned publicly or retained as chat
history. The server derives concise English/French recommendation text and a
separate proposal summary from those identifiers and authorized source facts.
The separate platform chatbot may give concise natural-language explanations;
its authoritative action cards, prices, availability and measurement results come
from completed platform tools, not model-authored arithmetic or success claims.
Proposed totals, source-qualified asking prices, dates, distances and missing data
are recomputed independently from the current selection. A proposal whose known
budget-currency subtotal already exceeds its comparable media ceiling is withheld
with clarification, even if other prices or currencies remain unresolved;
unknown prices, mixed currencies, partial months and mixed research/ordinary stock
cannot establish whole-plan fit or a remaining reserve. Geography is limited to
explicitly sourced city/country facts; neighborhoods and subarea coverage remain
unknown unless separately evidenced. The canonical accepted summary describes only
the returned recommendations, including a coherent empty summary when withheld.
Raw model text cannot invent costs, source facts, geographic coverage or availability.
Cost inclusion labels refer only to selected faces contributing priced estimates
to the displayed draft subtotal; retrieved but unselected or unpriced DEMO records
must not label a real-only or empty draft as including DEMO costs.

**Brief-fit planning amendment (2026-10-08, MVP §5.3 / V1 scoring).** The agency
planner uses one server-side deterministic face-level assessment and budgeted
portfolio selector for automatic suggestions and AI proposals. Confirmed optional
preferences identify target areas, corridors, audience tags, approach direction,
daypart and planning goal; existing country/city/format/flight/budget constraints
remain authoritative. Client and model scores or invented enrichment are not
accepted. The versioned default product policy weights geographic fit 30%, audience
fit 20%, directional visibility and usable exposure 30%, incremental geographic or
corridor contribution 10%, and value 10%. These configurable provisional weights
are product choices, not empirical measurement coefficients or certification.

Unsupported factors remain null with explicit uncertainty bounds; the displayed
supported score contribution/range is never renormalized over missing evidence.
Evidence coverage, confidence and verified/owner-reported/modeled/unknown provenance
are separate from fit. Optional traffic is not a prerequisite. Unknown prices cannot
establish budget fit; unknown availability is provisional planning interest only.
Directional evidence considers face and approach bearings, distance, obstruction,
speed/dwell and lighting when supported, without a universal roadside penalty.
Research coordinates cannot establish precise angular geometry. Digital exposure
needs schedule/daypart, spot/loop and dwell context; share of time alone is insufficient.
Geographic redundancy informs portfolio selection. Keep unsupported exposure
probabilities unavailable. Apply the [planning measurement requirements](#planning-measurement)
when reporting OTS, reach and CPM.

Portfolio selection applies comparable full-flight currency-qualified costs, or
explicitly preliminary exact-calendar-month research asking comparisons, and hard
constraints using a disclosed bounded deterministic search, with stable ties
and diagnosed infeasibility. AI cannot override its admitted recommendations.
Existing real inventory and saved plans are preserved. Optional draft-v1 preferences
are additive; reopened plans disclose current scoring version and recalculation.
Compact English/French scores, confidence and reasons expand into useful factor
evidence and coverage limits, including on mobile. Technical calibration remains internal.

**Usable-exposure correction (2026-10-09, §5.3).** Physical visibility, purchased
campaign exposure, brief-fit utility and evidence confidence are distinct. Known
incompatible approach/facing or an impossible requested exposure excludes a face
from automatic portfolios; obstruction, dwell, geography or cheap prices cannot
compensate. Direction, obstruction, legibility, dwell and applicable lighting are
necessary conditions combined without additive compensation. Digital advertiser
allocation, matching-flight schedule/daypart and dwell attenuate the whole usable
exposure and the utility actually optimized, rather than only one factor. These
indices remain explicitly uncalibrated heuristics, not measured OTS or attention.
Missing exposure stays unknown. Coordinate/price-only planning interest may remain
provisional with a separately disclosed evidence-poor planning policy; it must not
outrank supported usable exposure by gaining an assumed full exposure multiplier.
Unknown geographic overlap never receives a novelty bonus over known overlap;
dropping evidence cannot increase conservative incremental portfolio utility.
Full-portfolio regressions cover wrong-facing cheap pairs, tiny digital allocation,
missing overlap evidence, supported alternatives and sparse-data continuity.

**Key user stories.**

- As a planner, I can draw a polygon over Lagos and see all bookable billboards inside it with KPI
  estimates and price.
- As a planner, I can set a ₦20M budget and a target frequency and have the builder recommend a
  site mix that fits.
- As a planner, I can save a plan, share it with my client (read-only), and export it to
  PDF/Excel.

**Module phase mapping.** MVP: search/filter/map, manual site selection, simple cost totals.
V1: KPI estimation engine, budget allocation, scenarios, route selection. V2: optimization solver
for budget/KPI, integration with audience-measurement feeds.

---

### 5.4 Proof of Performance / Daily Site Updates

**Purpose.** Give clients verified, near-real-time assurance that their booked sites are live and
intact — the operational heart of Abonten's accountability promise.

**Daily site update (POP check).** For each booked site on each day of its flight, a field
operative (or the media partner) captures a check-in containing:

- **Photos:** one or more geotagged, timestamped photos (EXIF preserved), including a required
  front-on "creative visible" shot and an optional context/night shot.
- **Status check:** `intact`, `damaged`, `creative_missing`, `lighting_issue`, `wrong_creative`,
  `obstructed`, `competitor_overlap`, `site_down`.
- **Condition report:** free-text + structured notes (e.g., "panel torn at lower edge",
  "illumination off on east face").
- **Location/time proof:** GPS coordinates, capture timestamp, device ID, operative identity.

**Capture experience (mobile-first, offline-resilient).** The field app must let an operative
queue a day's checks offline and sync when connectivity returns. Photos are compressed and
resumable-uploaded; a check is not marked "delivered" until the server confirms receipt.

**Verification & alerts.**

- **AI-assisted checks (V2):** optional automatic comparison of the creative-visible photo against
  the booked creative to flag mismatches or occlusion; results are advisory and human-reviewed.
- **Exception alerts:** any non-`intact` status, missed daily check, or photo that fails integrity
  checks raises an alert routed to the agency planner and the client (per notification
  preferences), and an issue record is created (see §5.5).
- **Escalation:** missed checks escalate (e.g., partner → planner → client) on a configurable
  SLA; repeated exceptions flag the site for marketplace-quality review.
- **Audit trail:** every check is immutable once submitted; corrections are appended, never
  overwritten, so the delivery record is defensible.

**Key user stories.**

- As a field operative, I can photograph 30 sites in a morning with no signal and have them all
  sync when I'm back online.
- As a client, I get a push notification the moment one of my sites is reported down.
- As a planner, I can see, for any campaign day, exactly which sites have and haven't been checked.

**Module phase mapping.** MVP: manual photo upload + status, manual alerts, online capture.
V1: offline capture + sync, structured condition reports, SLA escalation. V2: AI-assisted creative
verification, automated integrity checks.

---

### 5.5 Client Monitoring Dashboard

**Purpose.** Give clients a calm, trustworthy daily view of their campaigns: what's live, what's
verified, and what needs attention.

**Dashboard sections.**

- **Campaign status:** active / upcoming / ended flights; per-campaign flight progress (% of days
  elapsed, % of sites verified today); KPI-vs-plan progress bars.
- **Proof-of-performance gallery:** timeline of the latest verified photos per site, filterable by
  date, site, and status; "today" default view; before/after and night/day comparisons.
- **Issue alerts:** open issues with severity, age, and owner; one-tap acknowledge or "raise to
  agency."
- **Map view:** active sites plotted with live/issue/unchecked status colors.
- **Daily digest:** an optional emailed/pushed morning summary ("42 of 45 sites verified; 1 issue
  open in Accra").

**Issue tracking.** Issues are first-class records (see §6) created from POP exceptions or manual
client flags. Each issue has a type, severity, status (`open` → `acknowledged` → `in_progress` →
`resolved` → `closed`), owner, comments thread, and link back to the originating POP check and
booking. SLAs and escalations are configurable.

**Key user stories.**

- As a client, my default screen answers "are my ads up today?" in under five seconds.
- As a client, I can drill from a red pin on the map straight to today's photo and the open issue.
- As a client, I can flag a concern that routes to my agency planner without leaving the app.

**Taste notes.** The client dashboard is the most operator-facing surface and must feel calm and
scannable: hierarchy by status (issues first, then progress, then archive), generous use of
imagery, minimal jargon, and clear empty/loading/error states. Mobile is the primary form factor.

**Module phase mapping.** MVP: read-only status + POP gallery + basic alerts. V1: issue tracking,
daily digest, map view, SLAs. V2: predictive alerts, benchmarking, client-facing KPI
reconciliation.

---

### 5.6 Marketplace & Booking

**Purpose.** Provide the shared inventory marketplace and the booking machinery that turns a plan
into confirmed reservations.

**Availability calendar.** Each bookable face has a per-day availability calendar showing booked,
held, blackout, and free days. Planners see availability within their search date window;
partners manage blackouts and maintenance holds.

**Booking lifecycle.**

```
requested → held → confirmed → live (in-flight) → completed
                     ↘ cancelled            ↘ cancelled
```

- `requested` — planner asks to book a site/face for a window.
- `held` — partner (or auto-policy) grants a time-boxed hold, expiring if not confirmed.
- `confirmed` — booking is firm; site is marked unavailable for the window.
- `live` — within the flight window; POP capture is expected.
- `completed` — flight ended; closed out for reporting and invoicing.
- `cancelled` — at any pre-live stage, with reason and audit.

**Pricing.** Rate cards per site/face with: standard rates by duration (day/week/month/4-week),
currency, tiered/seasonal pricing, optional dynamic pricing (V2), and partner-negotiated rates for
specific agencies. Quotes and invoices are generated from confirmed bookings in the campaign
currency, with FX reference rates recorded at quote time for cross-currency deals.

**Conflict detection.** The system prevents double-booking a face for overlapping windows,
respects blackouts, and warns on partial-day conflicts. Holds auto-expire; expired holds free the
inventory.

**Change management.** Date extensions, site swaps, and cancellations are tracked as booking
amendments with reasons, preserving the original record for audit.

**Key user stories.**

- As a planner, I can place a 48-hour hold on a shortlist while a client approves.
- As a media partner, I can see all my upcoming holds/confirmations in one calendar.
- As a planner, I can convert a confirmed plan into bookings in one action.

**Module phase mapping.** MVP: availability calendar, request/confirm/cancel, simple rate cards.
V1: holds with expiry, multi-currency quotes/invoices, blackouts, amendments. V2: dynamic pricing,
automated partner acceptance policies, marketplace transaction fees.

---

### 5.7 Reporting & Analytics

**Purpose.** Close the loop: report on delivery, utilization, and audience reach so all parties
can learn and justify spend.

**Report families.**

- **Campaign performance:** delivery vs. plan (sites live, days delivered, exceptions), POP
  compliance and cost reconciliation. Compare reported and forecast KPIs where both are
  available on a consistent [measurement basis](#planning-measurement).
- **Inventory utilization (media partner):** occupancy by site/market/period, revenue, idle
  inventory, top-performing sites, booking lead times.
- **Audience reach (plan/aggregate):** reach and frequency across a campaign where
  qualifying exposure and deduplication evidence supports them. Include demographic
  and geographic breakdowns where supported.
- **Marketplace analytics (platform admin):** GMV, partner activity, listing quality, POP
  compliance across the platform, dispute trends.
- **Client-facing reports:** clean, brandable delivery reports with photo evidence and KPI summary,
  exportable to PDF.

**Delivery.** Dashboards (filterable by org, market, period), scheduled reports (email/digest),
and CSV/PDF export. Aggregations are pre-computed for common queries; raw records remain
queryable for drill-down. Reports respect tenant boundaries.

**Key user stories.**

- As a planner, I can hand a client a one-click delivery report with photos and KPI achievement.
- As a media partner, I can see which of my sites sit idle most and adjust pricing.
- As a platform admin, I can report platform-wide POP compliance to leadership.

**Module phase mapping.** MVP: campaign delivery report with POP compliance. V1: utilization and
audience-reach dashboards, scheduled exports. V2: benchmarking across campaigns/markets,
audience-measurement feed integration, custom report builder.

---

## 6. Data Model Outline

This is a logical outline, not a physical schema. Entity names and fields are intended to guide
implementation; final names, types, and normalization belong in code (see §9 and AGENTS.md).
Every entity has standard audit fields (`id`, `created_at`, `updated_at`, `created_by`,
`updated_by`) and is tenant-scoped where indicated.

### 6.1 Identity & tenancy

**Organization**
`id`, `name`, `type` (`media_partner` | `agency` | `brand` | `platform`), `country`, `default_currency`,
`default_locale`, `status` (`active` | `suspended`), `billing_ref`, audit. The root tenant boundary.

**User**
`id`, `email`, `name`, `phone`, `locale`, `status`, `mfa_enabled`, audit. A human; can belong to
multiple organizations.

**Membership**
`id`, `user_id`, `organization_id`, `role` (see §4.5), `status`, audit. Join table that ties users
to organizations and their role within.

**ApiKey / OAuthCredential**
`id`, `organization_id`, `label`, `scopes`, `hashed_secret`, `last_used_at`, `revoked_at`. For
API-first access per organization.

### 6.2 Inventory

**BillboardSite** (a.k.a. Site / Billboard)
`id`, `organization_id` (media partner owner), `code`, `name`, `type`, `format`, `sub_format`,
`latitude`, `longitude`, `geo_polygon?`, `address`, `city`, `region`, `country`, `market_id`,
`orientation_deg`, `viewing_distance`, `elevation`, `illumination_type`, `illumination_hours`,
`status` (lifecycle per §5.1), `permit_ref`, `permit_expires_at`, audit.

**SiteFace** (bookable unit)
`id`, `site_id`, `face_label`, `width`, `height`, `area`, `units`, `printable_area`, `bookable`,
`pixel_width?`, `pixel_height?`, `spot_length_seconds?`, `loop_length_seconds?`, `spots_per_loop?`,
`proof_of_play?`, `planning_profile?`, audit. The optional planning profile stores face
direction, usable sightline, viewing distance/angle, obstruction, minimum viewing
time, display/illumination schedules, an optional analysis-road correction and
source/method/date provenance. Missing inputs remain missing. A site may have one
or many faces; booking targets a face. The
`pixel_*`/`spot_*`/`loop_*`/`spots_per_loop`/`proof_of_play` fields apply to digital faces
(`format = digital_led`) per §5.1.

**SiteAsset** (media)
`id`, `site_id` (or `face_id`), `kind` (`front` | `context` | `night` | `diagram`), `storage_ref`,
`captured_at` (required for `front` at listing, unknown allowed at storage; §5.1), audit.

**SiteMetadata** (enrichment, §5.2)
`id`, `site_id`, `dimension` (`traffic` | `visibility` | `audience` | `poi` | `illumination` |
`environment` | `structure`), `payload` (JSON, dimension-specific), `source`, `method`, `confidence`,
`collected_at`, `expires_at`, `verification` (`unverified` default | `partner_declared` |
`field_verified` | `third_party`), `data_class` (`demo` | `production`), audit. One site has many
enrichment records across dimensions and vintages. The `structure` dimension carries partner
declared orientation/viewing-distance/elevation provenance (§5.1); `data_class = demo` rows are
excluded from production reads and model inputs.

**Market / GeoArea**
`id`, `name`, `country`, `parent_id` (hierarchy: country → region → city → market/zone), `bounds`,
audit. Reference data for search and reporting.

**Tag / Category**
`id`, `scope`, `value`. Lightweight taxonomy for sites (e.g., "high-traffic", "night-dominant").

### 6.3 Planning & booking

**Campaign**
`id`, `organization_id` (agency owner), `client_org_id` (brand), `name`, `objective`, `currency`,
`total_budget`, `flight_start`, `flight_end`, `target_audience`, `status` (`draft` | `planned` |
`booking` | `live` | `completed` | `cancelled`), `scenario_of?`, audit.

**CampaignItem** (line item = a face booked for a window within a campaign)
`id`, `campaign_id`, `face_id`, `start_date`, `end_date`, `rate`, `currency`, `status`, audit.
Links a plan line to a booking.

**Booking / Reservation**
`id`, `campaign_item_id`, `face_id`, `start_date`, `end_date`, `status` (§5.6 lifecycle), `hold_expires_at`,
`rate`, `currency`, `fx_rate_ref`, `cancelled_reason`, audit. The transactional booking record.

**RateCard**
`id`, `organization_id` (media partner), `face_id?`, `currency`, `rates` (per duration), `seasonal_rules`,
`effective_from`, `effective_to`, audit.

**Quote / Invoice**
`id`, `campaign_id` (or `booking_id`), `currency`, `line_items`, `subtotal`, `taxes`, `total`,
`fx_rate_ref`, `status` (`draft` | `issued` | `paid` | `void`), audit.

**Creative**
`id`, `campaign_id`, `face_id?`, `name`, `file_ref`, `dimensions`, `status`, audit. The artwork
bound to a booking; used by POP verification.

### 6.4 Proof of performance & issues

**ProofOfPerformance** (daily site update, §5.4)
`id`, `booking_id` (or `face_id` + `date`), `check_date`, `status` (`intact` | `damaged` | …),
`condition_notes`, `latitude`, `longitude`, `captured_at`, `device_id`, `operatives` (user refs),
`sync_state` (`pending` | `synced` | `failed`), `integrity_flags`, audit. Immutable once synced.

**PopPhoto**
`id`, `pop_id`, `storage_ref`, `kind` (`creative_visible` | `context` | `night`), `exif`,
`ai_flags?` (V2), audit.

**Issue** (alert, §5.5)
`id`, `campaign_id?`, `booking_id?`, `pop_id?`, `type`, `severity`, `status` (`open` → … → `closed`),
`owner_org_id`, `assigned_user_id`, `summary`, `due_at`, `resolved_at`, audit.

**IssueComment**
`id`, `issue_id`, `author_user_id`, `body`, audit.

**AlertRule / NotificationPreference**
`id`, `organization_id`, `user_id?`, `trigger`, `channels` (`email` | `push` | `sms` | `in_app`),
`sla_minutes`, audit. Drives escalation in §5.4/§5.5.

### 6.5 Platform & cross-cutting

**AuditLog**
`id`, `actor_user_id`, `actor_org_id`, `action`, `entity_type`, `entity_id`, `before`, `after`,
`at`, `ip`, `request_id`. Append-only; the backbone of trust and dispute resolution.

**ReferenceData** (formats, currencies, locales, KPI model params, SEC bands)
Code tables, versioned, admin-managed.

**ReportDefinition / ReportRun**
`id`, `owner_org_id`, `kind`, `parameters`, `schedule`, `last_run_at`, `output_ref`, audit.

### 6.6 Key relationships (summary)

```
Organization ──< Membership >── User
Organization(media_partner) ──< BillboardSite ──< SiteFace
                                              ──< SiteAsset
Site ──< SiteMetadata (many dimensions/vintages)
Market (hierarchy) ── Site
Organization(agency) ──< Campaign ──< CampaignItem >── SiteFace
                                          │
                                       Booking ──< ProofOfPerformance ──< PopPhoto
                                          │                              │
                                       Creative                    Issue ──< IssueComment
                                       Quote/Invoice
Platform ──< AuditLog, ReferenceData, ReportRun (cross-tenant, admin-scoped)
```

---

## 7. Key Business Workflows

### 7.1 Site registration → approval → listing

1. **Capture:** The media partner creates a `draft` and can save it with incomplete
   reference media.
2. **Submit:** Partner submits for listing → state `pending_review`. Validation requires
   coordinates, format, dimensions, the site capture requirements in §5.1, at
   least one bookable face and a current rate for each bookable face. Bookable
   digital faces also need screen and loop/spot specifications.
3. **Review:** A platform admin reviews the submission. Rejected sites return to
   `draft` with notes.
4. **List:** Approval moves the site to `listed` and publishes it in the marketplace
   with its enrichment and rate card.
5. **Maintain:** Partner updates specs/availability; admin may `suspend` for quality/permit issues
   or the partner may `decommission` retired sites. All changes are audited.

**Inventory integrity correction (2026-10-21).** Structure and face dimensions must be finite and
positive; area is derived from width × height in the recorded units. API clients may supply a
matching area, but cannot override it with an inconsistent value. Digital pixels and spot counts
are positive integers; recorded spot durations and counts must fit within the loop. Partial
digital drafts remain possible; complete digital specifications are required for listing.
Required identity strings cannot be blank and rates use the supported platform currencies.
Audience and traffic records require source/method; partners submit owner-reported evidence.
Only the existing platform reviewer role may assign independent verification. Partner changes
to reviewed evidence reset its verification to owner-reported; previous audit records remain.
All writes and publication gates enforce these rules. A listed site that loses completeness
returns to draft in the same transaction, with an audit event. At time-based expiry, reads
project an ineligible stored listing as draft and deny buyer access without writing records;
the next normal inventory mutation reconciles stored status before any repair can republish it.
Renewed eligibility requires the normal submit/review path. Research references and labelled
demo exceptions retain their existing scope. Legacy invalid records require separate review;
these corrections do not bulk rewrite historical data or add a scheduled write process.

### 7.2 Campaign planning → booking → execution → monitoring → reporting

1. **Discover:** Planner searches the marketplace (filters + map) and shortlists sites/faces.
2. **Plan:** Planner builds a campaign, sets budget and flight, estimates KPIs, allocates budget,
   and saves scenarios. Client may review read-only.
3. **Reserve:** Planner requests bookings / holds on selected faces → `requested` → `held`.
4. **Confirm:** Media partner accepts (or auto-policy accepts) → `confirmed`; inventory locked,
   quote/invoice generated.
5. **Execute:** On flight start, bookings go `live`; creatives are bound to faces.
6. **Monitor:** Daily POP checks are captured; statuses flow to the client dashboard; exceptions
   raise issues and alerts; SLAs escalate misses.
7. **Report:** At flight end, bookings go `completed`. The client receives delivery and
   POP compliance reports, plus KPI comparisons and audience reach where evidence supports them.
   Utilization rolls up to the media partner.

### 7.3 Proof-of-performance capture → verification → alert

1. Field operative captures a daily check (photo + status + condition), offline-queued.
2. On sync, the check is validated (geo/time integrity, required photo); status recorded
   immutably.
3. Non-`intact` or missed checks create an **Issue** and trigger **Alerts** to planner + client per
   preferences; SLA clock starts.
4. (V2) AI-assisted creative comparison flags mismatches for human review.
5. Issue is worked to resolution (`acknowledged` → `in_progress` → `resolved` → `closed`); the
   whole thread links back to the POP check and booking for audit.

### 7.4 Issue → resolution

1. Issue is created (from POP exception or manual client/planner flag) with type, severity, owner.
2. Owner acknowledges within SLA; status advances as work proceeds, with comments.
3. Resolution is verified (e.g., a follow-up POP check showing `intact`) and the issue is closed.
4. Repeated issues on a site feed marketplace-quality review.

---

## 8. Non-Functional Requirements

### 8.1 Scalability & market coverage

- Designed for WeCA scale: start with Nigeria, Ghana, Benin, Côte d’Ivoire and Cameroon; architect to extend to 23+
  partner markets without schema changes (markets, currencies, locales are reference data).
- Support tens of thousands of sites, hundreds of organizations, and high daily POP volume;
  search and map queries remain fast via spatial indexing (PostGIS) and pre-computed
  aggregations.
- Horizontal scaling of stateless API services; media stored in object storage, not the database.

### 8.2 Offline-first / low-connectivity

- Field POP capture works fully offline: queue photos and checks locally, sync with resumable
  uploads and deduplication when online.
- Planner map tiles and common search results are cacheable for low-bandwidth use.
- UIs degrade gracefully: optimistic updates, clear "sync pending" indicators, and conflict-free
  merge for offline edits.
- Mobile app is the primary client for field operatives and a first-class client for clients.

### 8.3 Security & privacy

- Authentication: Microsoft OAuth (Azure AD / Microsoft Entra ID) as primary SSO; emailed six-digit sign-in codes as the passwordless email alternative; capabilities-driven authorization with per-user overrides; scoped API keys.
- Authorization: server-side RBAC enforced on every request; tenant isolation so one org cannot
  read another's private data (marketplace listings are the exception — intentionally public to
  authenticated buyers).
- Data protection: encryption in transit (TLS) and at rest; secrets in a managed secret store;
  least-privilege service credentials.
- Privacy & compliance: align with **NDPR (Nigeria)**, **Ghana's Data Protection Act**, and
  **GDPR** for multinational clients. POI/audience enrichment sourced from personal location data
  is aggregated/anonymized and consent-gated; no raw individual tracking is exposed.
- Audit: append-only audit log for all material actions, supporting dispute resolution and
  compliance reviews.

### 8.4 Multi-currency & multi-language

- **Currencies:** NGN, GHS, XAF, XOF, USD, EUR as first-class; extensible. FX reference rates are
  captured at quote time for cross-currency deals.
- **Languages:** English and French at launch (UI + email/report localization); architecture
  supports adding local languages later. Locale-aware date/number/currency/address formatting.
- **Time zones:** all timestamps stored in UTC; displayed in the user's locale timezone.

### 8.5 Reliability, observability, accessibility

- **Availability:** target high availability for the API and client dashboard; POP capture is
  offline-tolerant by design so field work never blocks on uptime.
- **Observability:** structured logs, metrics, tracing, and alerting across services; per-tenant
  usage telemetry for marketplace analytics.
- **Backups & durability:** regular database backups and media replication; point-in-time recovery
  for the audit trail.
- **Accessibility:** WCAG 2.1 AA for web dashboards; mobile capture optimized for one-handed
  outdoor use (large touch targets, high contrast, minimal typing).

---

## 9. Technical Architecture Direction

**Approach: monorepo, API-first, service-oriented modules.**

- **Monorepo** holding all applications and packages (API, web, mobile, shared types, tooling) so
  the spec, types, and docs evolve together.
- **API-first.** Every feature is exposed through a versioned, documented API (OpenAPI). Internal
  UIs and third-party integrations consume the same API; no privileged backdoors for the UI.
- **Module boundaries.** Within the monorepo, organize by bounded context: `identity`,
  `inventory`, `planning`, `booking`, `pop`, `monitoring`, `marketplace`, `reporting`,
  `platform-admin`, plus shared `core`/`contracts`. Start as a modular monolith; extract services
  only when load demands it.

**TypeScript stack.**

- **API:** NestJS in a modular monolith with OpenAPI documentation.
- **Data:** PostgreSQL with **PostGIS** for spatial queries; Redis for caching/queues; object
  storage (S3-compatible) for media.
- **Web:** Next.js (React, TypeScript) for planner and admin dashboards.
- **Mobile:** React Native (Expo) for field POP capture and client monitoring, with offline-first
  local storage and background sync.
- **Async:** a job queue (e.g., BullMQ on Redis) for POP sync, report generation, and
  notifications.
- **Maps:** Mapbox or self-hosted OpenStreetMap tiles with offline cache support.
- **Infra:** containerized (Docker) deployable to cloud or on-prem; CI with lint, type-check,
  tests, and contract checks.

**SEC reference preparation (2026-11-08 decision).** A versioned offline Python
generator may read the public SPSS source with `pyreadstat` and fit the SEC reference
inside a bounded, temporary Docker container. This avoids adding a statistical-file
parser or fitting runtime to the API. Retain the generator, reproducible invocation,
source checksum and aggregate reference; keep raw survey files out of the repository.
The serving API and web remain TypeScript, with no Python host installation or API
runtime dependency.

**Cross-cutting.** Shared TypeScript contracts, structured logging with request IDs,
and versioned database migrations. Use central configuration and feature flags
for features that require controlled rollout.

---

## 10. Phased Delivery Roadmap

Phases are cumulative. Each phase is independently shippable and demonstrable.

### MVP — "Inventory + basic booking + basic proof"

Goal: a working marketplace loop for a single market (e.g., Lagos), proving the core value chain.

- Organization & user onboarding (media partner, agency, brand), RBAC, MFA.
- Billboard inventory: single-site registration, spec capture, admin approval, marketplace
  listing.
- Marketplace: search, basic filters, map view, availability by date.
- Booking: request → confirm → cancel; simple single-currency rate cards.
- POP: online photo upload + status per booked site/day.
- Client dashboard: read-only campaign status + POP gallery + basic alerts.
- Reporting: simple campaign delivery report with POP compliance.

### V1 — "Plannable, accountable, multi-market"

Goal: defensible planning and reliable accountability across Anglophone + Francophone markets.

- Inventory: bulk import, multi-face structures, full spec schema, lifecycle maturity.
- Site metadata enrichment: structured schema with source/confidence, third-party import, POI.
- Planning: KPI estimation engine, budget allocation, scenarios, route-based selection, saved
  shortlists, and the [planning models and scores](#planning-measurement). This includes ADTM,
  the open-data baseline for the Abonten Audience Model, and the Composite Abonten Score.
- Booking: holds with expiry, blackouts, amendments, multi-currency quotes/invoices with FX ref.
- POP: offline capture + background sync, structured condition reports, SLA escalation, exception
  alerts.
- Client dashboard: issue tracking, daily digest, map view, SLAs.
- Reporting: utilization and audience-reach dashboards, scheduled exports.
- Platform: French UI localization, multi-currency, reference-data management, marketplace-quality
  tooling.

### V2 — "Intelligent, integrated, scaled"

Goal: automation, audience-grade measurement, and ecosystem integration across 23+ markets.

- AI-assisted POP verification (creative matching, occlusion/condition detection).
- Dynamic pricing and automated partner acceptance policies.
- Audience Model calibration from anonymized movement data and integration with regional
  audience-measurement feeds (aligned with industry measurement reform).
- Optimization solver for budget/KPI site selection.
- Benchmarking across campaigns and markets; custom report builder.
- Public marketplace API for third-party planners/ERPs; transaction/fee model.
- Hardened offline-first mobile, local-language expansion, deeper observability and SLOs.

---

## 11. Glossary

Outdoor-advertising terms relevant to the WeCA market.

| Term                                | Meaning                                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| **OOH / DOOH**                      | Out-of-Home advertising; Digital Out-of-Home (LED/programmatic screens).                |
| **Billboard / Hoarding**            | Large outdoor panel displaying advertising; "hoarding" is common WeCA usage.            |
| **Spectacular**                     | A large, often custom-built, illuminated display, usually in prime locations.           |
| **Wall wrap / Mural**               | Advertising applied directly to a building wall; may be painted (mural).                |
| **Street furniture**                | Bus shelters, kiosks, benches, and similar municipal-scale ad surfaces.                 |
| **Transit media**                   | Ads on buses, taxis, trains, and transit stations.                                      |
| **Tri-vision**                      | A panel with rotating prismatic slats showing three creatives in rotation.              |
| **3D display**                      | A display with three-dimensional sculpted or layered elements.                          |
| **Face**                            | A single bookable viewing surface of a panel; a structure may have several faces.       |
| **Front-lit / Back-lit / Edge-lit** | Illumination styles for static panels; LED implies the panel itself emits light.        |
| **Orientation / Facing**            | The compass direction a face points toward, affecting which traffic sees it.            |
| **AADT**                            | Average Annual Daily Traffic, in vehicle passages per day averaged over a year.         |
| **Abonten Directional Travel Demand Model (ADTM)** | Models where and when people travel, using relative demand weights and route travel times. |
| **Abonten Audience Model**          | Estimates reach and frequency using simulated people with recurring journeys across faces and days. |
| **Abonten Score**                   | Planning readout with Directional Demand and Viewability Fit for each face and period.  |
| **Composite Abonten Score**         | Ranks campaign plans against the objective, target audience, flight and budget.          |
| **Directional Demand**              | Percentile of the modeled demand approaching the face against comparable approaches.   |
| **Viewability Fit**                 | Share of modeled passing demand that meets the viewing requirements for the face.      |
| **Gross impressions**               | Potential exposures while a functioning face displays the ad to its exposure zone.      |
| **Viewable impressions (OTS)**      | Opportunity to see. Gross impressions that meet the viewability criteria.               |
| **LTS impressions**                 | Likelihood-to-see impressions, with evidence a viewable ad was likely noticed.          |
| **Audience**                        | People who meet the audience criteria in [§5.3](#planning-measurement).                 |
| **Reach**                           | Distinct people with a qualifying exposure across the selected faces and period.        |
| **Frequency**                       | Average qualifying exposures per person reached, on the same measurement basis.         |
| **GRP / TRP**                       | Gross/Target Rating Points — reach × frequency expressed as a percentage of a universe. |
| **CPM**                             | Cost per thousand impressions of the stated type.                                       |
| **CPRP**                            | Cost per rating point.                                                                  |
| **Flight**                          | The scheduled run period of a campaign on a site or set of sites.                       |
| **POP / Proof of Performance**      | Evidence (usually dated, geotagged photos) that a booked ad is live and intact.         |
| **Rate card**                       | A vendor's published prices for inventory.                                              |
| **Hold / Reservation**              | A time-boxed reservation of inventory pending confirmation.                             |
| **Blackout**                        | Dates a site is unavailable (maintenance, permits, seasonal).                           |
| **KPI**                             | Key Performance Indicator (impressions, reach, frequency, compliance, etc.).            |
| **SEC**                             | Socio-Economic Classification used in audience segmentation.                            |
| **MIPAN**                           | Media Independent Practitioners Association of Nigeria.                                 |
| **ARCON / APCON**                   | Advertising Regulatory Council of Nigeria (formerly APCON).                             |
| **LASAA**                           | Lagos State Signage & Advertisement Agency (outdoor permits in Lagos).                  |
| **RECMA**                           | Independent agency that ranks media agencies by volume/activity.                        |
| **NDPR**                            | Nigeria Data Protection Regulation.                                                     |
| **WeCA**                            | West & Central Africa — the platform's home region.                                     |

---

## 12. Open Questions and Assumptions

**Assumptions.**

- Abonten is an OMG WeCA–aligned product; initial pilot market is Nigeria (Lagos), expanding to
  Ghana and Cameroon.
- English and French are the launch languages; local languages follow in V2.
- The platform owns the marketplace and booking workflow but is **not** a payments/permitting
  system; invoices are generated and tracked but payment processing is out of MVP scope.
- Planning forecasts and any audience estimates require the evidence and disclosures in
  [§5.3](#planning-measurement). V2 adds audience-measurement integrations.

**Open questions.**

- Hosting and data residency requirements for each market.
- Payments scope and whether invoicing ties into an existing OMG/agency finance system.
- Data sourcing partners for traffic, POI, and audience enrichment, and licensing terms.
- Auto-approval thresholds for trusted media partners vs. mandatory manual review.
- Exact KPI model parameters and any regional audience universe figures to seed GRP/TRP.
- Regulatory/permit data depth per market (Lagos vs. Accra vs. Douala) and whether permit
  metadata is mandatory for listing.
