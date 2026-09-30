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

**Initial scope.** This specification covers the full product vision and a phased delivery
roadmap (MVP → V1 → V2). Implementation begins after this spec is approved; no application code
is scaffolded in the initialization phase.

---

## 2. Product Vision

**Vision statement.** *Abonten makes outdoor advertising in West & Central Africa as
discoverable, plannable, and accountable as digital — without leaving the realities of the
street behind.*

**Name.** "Abonten" draws from the Akan (Twi) word for *outdoors* / *in the open* — a name that
sits naturally in the region and signals the product's focus: the open-air, outdoor media
channel.

**Design principles.**

- **Street-first, not desk-first.** The hardest users to serve are field operatives capturing
  proof of performance on low-bandwidth phones in the rain. Optimize for them first.
- **Measure what was promised.** Every booked site carries KPI estimates at planning time and a
  verification trail at delivery time. The gap between the two is the product's core value.
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

### 4.5 Role model summary

Within each organization, users hold a **role** that scopes their actions:

| Role | Typical org type | Scope |
| --- | --- | --- |
| `org_owner` | any | Full control of the organization, billing, members. |
| `org_admin` | any | Manage members and most resources; no billing control. |
| `inventory_manager` | media_partner | Create/edit sites, rate cards, availability, POP. |
| `field_operator` | media_partner | Capture POP photos and condition reports (mobile). |
| `planner` | agency | Search, plan, reserve, book, export. |
| `planner_admin` | agency | Manage agency team and client links. |
| `client_viewer` | brand | Read-only campaign + POP monitoring. |
| `client_admin` | brand | Manage brand team, link to agency/client accounts. |
| `platform_admin` | platform | Cross-tenant administration and marketplace quality. |

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
- **Media assets:** reference photos (front, context/street, night), site diagrams.
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
5. **Reference photos.** `front` assets require `captured_at` at upload; UI guidance warns when a
   supplied capture date is older than 12 months. Unknown capture dates are left empty rather
   than invented.
6. **Entry plausibility checks (server-enforced).** Orientation within 0–359°; positive viewing
   distance and elevation; illumination hours matched against a time-range pattern; coordinates
   inside the declared country's bounding box when the country is one of Nigeria, Ghana, or
   Cameroon.
7. **Deliberate deferrals (approved):** geo-fenced polygon *capture* stays V1 (the column, DTO and
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
A new listing must have at least one bookable face, a current rate
covering each bookable face (a site-wide rate may be used as its default), and the reference photo above.
For digital faces, the pixel and loop/spot fields must be complete before that face can be
offered for booking. A recorded permit expiry that has passed makes a site unbookable; permits
that do not apply should remain unrecorded rather than inventing a reference. An existing
listed site with missing booking details needs correction before it is presented as ready for
the later agency booking flow.

**Lifecycle / states.**

```
draft → pending_review → approved → listed → (suspended) → decommissioned
                                 ↘ rejected (back to draft)
```

- `draft` — created by the media partner, not yet submitted.
- `pending_review` — submitted to platform admin for listing approval.
- `approved` / `listed` — visible and bookable in the marketplace. (Admin may auto-approve trusted
  partners; new partners require manual review.)
- `suspended` — temporarily unbookable (maintenance, permit lapse, quality hold).
- `decommissioned` — permanently retired; retained for historical reporting.

**Key user stories.**

- As a media partner, I can register a single site via a guided form or bulk-import many sites via
  CSV/Excel with validation feedback.
- As a media partner, I can manage multiple faces on a single structure as separately bookable
  units.
- As a platform admin, I review submitted sites for completeness and accuracy before listing.
- As a planner, I can trust that a listed site has verified coordinates and at least one reference
  photo.

**Module phase mapping.** MVP: single-site registration, approval, listing, basic attributes.
V1: bulk import, multi-face structures, full spec schema. V2: automated spec validation and
duplicate detection.

---

### 5.2 Site Metadata Enrichment

**Purpose.** Turn a bare site record into a *plannable* asset by enriching it with the data
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
or multiplied into an audience estimate. No traffic values are created from road class,
population or demo records. Production traffic remains unavailable until actual licensed
observations are imported. Additional countries are registry entries and source manifests,
not new schemas or country-specific service branches.

**Enrichment dimensions.**

- **Traffic counts:** Average Annual Daily Traffic (AADT) for vehicle exposure; peak/off-peak
  splits; pedestrian counts where relevant; source and vintage of the count.
- **Visibility score:** composite of viewing angle, unobstructed sightline, viewing distance,
  dwell time, and clutter/competition from adjacent sites. A normalized 0–100 score plus the
  sub-components that produced it.
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
- **KPI estimation** per selected site and for the plan aggregate:
  - Estimated **impressions** / opportunity-to-see (OTS) from traffic × visibility × days.
  - **Reach** and **frequency** (plan-level), with demographic coverage breakdown.
  - **GRP/TRP** where audience universe data is available.
  - Cost metrics: total cost, **CPM**, **CPRP**, cost per site, budget utilization.
- **Budget allocation:** distribute a total budget across sites with constraints (min/max per site,
  per-market caps); visualize allocation and remaining budget.
- **Scheduling:** per-site start/end within the flight, sequencing, and conflict checks against
  availability.
- **Scenarios:** save multiple plan variants, compare them side-by-side, and lock a winner into a
  booking.

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

- **Campaign performance:** delivery vs. plan (sites live, days delivered, exceptions), KPI
  achievement vs. estimate (impressions, reach, frequency), POP compliance rate, and cost
  reconciliation.
- **Inventory utilization (media partner):** occupancy by site/market/period, revenue, idle
  inventory, top-performing sites, booking lead times.
- **Audience reach (plan/aggregate):** modeled reach and frequency across a campaign, with
  demographic and geographic breakdowns where enrichment data supports it.
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
`proof_of_play?`, audit. A site may have one or many faces; booking targets a face. The
`pixel_*`/`spot_*`/`loop_*`/`spots_per_loop`/`proof_of_play` fields apply to digital faces
(`format = digital_led`) per §5.1.

**SiteAsset** (media)
`id`, `site_id` (or `face_id`), `kind` (`front` | `context` | `night` | `diagram`), `storage_ref`,
`captured_at` (required for `front`; §5.1), audit.

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

1. **Capture:** Media partner creates a site (single form or bulk import) with required fields and
   at least one reference photo → state `draft`.
2. **Submit:** Partner submits for listing → state `pending_review`. Validation requires
   coordinates, format, dimensions, a front-on reference image, a bookable face, and a current
   rate for every bookable face (site-wide or face-specific). Digital faces offered for booking also need their
   screen and loop/spot specifications.
3. **Review:** Platform admin reviews completeness/accuracy. Trusted partners may be auto-listed;
   new partners are manually reviewed → `approved` or `rejected` (back to `draft` with notes).
4. **List:** Approved sites become `listed` and appear in the marketplace with their enrichment and
   rate card.
5. **Maintain:** Partner updates specs/availability; admin may `suspend` for quality/permit issues
   or the partner may `decommission` retired sites. All changes are audited.

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
7. **Report:** At flight end, bookings go `completed`; delivery, KPI-vs-plan, POP compliance, and
   audience-reach reports are generated and shared with the client; utilization rolls up to the
   media partner.

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

- Designed for WeCA scale: start with Nigeria, Ghana, Cameroon; architect to extend to 23+
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

**Recommended stack (option A — TypeScript end-to-end).**

- **API:** NestJS (TypeScript) with a modular monolith layout; OpenAPI-generated contract.
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

**Alternative stack (option B — Python backend).** FastAPI (or Django) + PostgreSQL/PostGIS for
the API, React/Next.js for web, React Native for mobile. Equally viable; choose based on team
skills. **Recommendation: option A** for a single-language stack that shares types across API,
web, and mobile.

**Cross-cutting.** Shared contracts/types package generated from OpenAPI; a central config and
feature-flag service; structured logging with request IDs; database migrations as versioned code.

> The stack is a *direction*, not a final commitment. This spec phase does not scaffold code or
> pin dependency versions; that decision is made at implementation kickoff.

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
  shortlists.
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
- Audience modeling from anonymized movement data; integration with regional audience-measurement
  feeds (aligned with industry measurement reform).
- Optimization solver for budget/KPI site selection.
- Benchmarking across campaigns and markets; custom report builder.
- Public marketplace API for third-party planners/ERPs; transaction/fee model.
- Hardened offline-first mobile, local-language expansion, deeper observability and SLOs.

---

## 11. Glossary

Outdoor-advertising terms relevant to the WeCA market.

| Term | Meaning |
| --- | --- |
| **OOH / DOOH** | Out-of-Home advertising; Digital Out-of-Home (LED/programmatic screens). |
| **Billboard / Hoarding** | Large outdoor panel displaying advertising; "hoarding" is common WeCA usage. |
| **Spectacular** | A large, often custom-built, illuminated display, usually in prime locations. |
| **Wall wrap / Mural** | Advertising applied directly to a building wall; may be painted (mural). |
| **Street furniture** | Bus shelters, kiosks, benches, and similar municipal-scale ad surfaces. |
| **Transit media** | Ads on buses, taxis, trains, and transit stations. |
| **Tri-vision** | A panel with rotating prismatic slats showing three creatives in rotation. |
| **3D display** | A display with three-dimensional sculpted or layered elements. |
| **Face** | A single bookable viewing surface of a panel; a structure may have several faces. |
| **Front-lit / Back-lit / Edge-lit** | Illumination styles for static panels; LED implies the panel itself emits light. |
| **Orientation / Facing** | The compass direction a face points toward, affecting which traffic sees it. |
| **AADT** | Average Annual Daily Traffic — vehicles per day past a site; a key exposure input. |
| **Visibility score** | Composite measure of how clearly and long a panel can be seen. |
| **OTS / Impressions** | Opportunity-to-See; estimated number of times the ad is potentially seen. |
| **Reach** | The number/percentage of the audience exposed at least once. |
| **Frequency** | Average times an exposed individual sees the ad. |
| **GRP / TRP** | Gross/Target Rating Points — reach × frequency expressed as a percentage of a universe. |
| **CPM** | Cost per thousand impressions. |
| **CPRP** | Cost per rating point. |
| **Flight** | The scheduled run period of a campaign on a site or set of sites. |
| **POP / Proof of Performance** | Evidence (usually dated, geotagged photos) that a booked ad is live and intact. |
| **Rate card** | A vendor's published prices for inventory. |
| **Hold / Reservation** | A time-boxed reservation of inventory pending confirmation. |
| **Blackout** | Dates a site is unavailable (maintenance, permits, seasonal). |
| **KPI** | Key Performance Indicator (impressions, reach, frequency, compliance, etc.). |
| **SEC** | Socio-Economic Classification used in audience segmentation. |
| **MIPAN** | Media Independent Practitioners Association of Nigeria. |
| **ARCON / APCON** | Advertising Regulatory Council of Nigeria (formerly APCON). |
| **LASAA** | Lagos State Signage & Advertisement Agency (outdoor permits in Lagos). |
| **RECMA** | Independent agency that ranks media agencies by volume/activity. |
| **NDPR** | Nigeria Data Protection Regulation. |
| **WeCA** | West & Central Africa — the platform's home region. |

---

## 12. Open Questions and Assumptions

**Assumptions.**

- Abonten is an OMG WeCA–aligned product; initial pilot market is Nigeria (Lagos), expanding to
  Ghana and Cameroon.
- English and French are the launch languages; local languages follow in V2.
- The platform owns the marketplace and booking workflow but is **not** a payments/permitting
  system; invoices are generated and tracked but payment processing is out of MVP scope.
- Audience/KPI estimates are modeled, not measured, until V2 audience-measurement integrations
  exist; estimates always carry confidence and source.

**Open questions (resolve at implementation kickoff).**

- Final tech-stack decision (option A vs B) and hosting (cloud region vs. on-prem for data
  residency).
- Payments scope and whether invoicing ties into an existing OMG/agency finance system.
- Data sourcing partners for traffic, POI, and audience enrichment, and licensing terms.
- Auto-approval thresholds for trusted media partners vs. mandatory manual review.
- Exact KPI model parameters and any regional audience universe figures to seed GRP/TRP.
- Regulatory/permit data depth per market (Lagos vs. Accra vs. Douala) and whether permit
  metadata is mandatory for listing.
