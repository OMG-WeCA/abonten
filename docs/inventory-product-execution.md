# Abonten — Inventory Product Execution

**From demo inventory to a credible, scientific out-of-home (OOH) product — in three ordered parts.**

- **Status:** Proposal for execution. Research and documentation only — nothing in this document has been approved for build, and no datasets have been downloaded.
- **Date:** 2026-09-16
- **Author:** Abonten agent team (worker thread), for OMG WeCA platform ownership.
- **Companion documents:** [`SPEC.md`](../SPEC.md) (authoritative product spec — this document proposes changes to it, it does not change it), [`AGENTS.md`](../AGENTS.md) (conventions).

**2026-09-24 status note:** This document's field matrix records the 2026-09-16 starting point. The Partner inventory work now includes audited inventory changes, provenance checks, digital face specs, a live registration map, face creative requirements, face-level rates and minimum duration, Partner-managed blackout dates, and a stricter listing gate. Booking requests, holds, confirmation, and reservation calendars remain for the agency-side implementation. `SPEC.md` carries the current product contract; use the live code and tests for implementation status.

---

## How to read this document

Abonten today has a working inventory demo: media partners can register billboard sites, add faces, rate cards, and photos, and the partner dashboard shows lifecycle counts and earning potential. That is a real start — but it is not yet a product a media planner in Lagos or Accra would trust with a media budget. The gap is not more features; it is **trust**: trusted location data, trusted context data, and numbers we can defend line by line.

This document splits the work into **exactly three ordered parts**. Each part has a rationale, dependencies, deliverables, completion gates, and an honest progress checklist. Order matters: Part 1 makes what partners enter trustworthy and pleasant to enter; Part 2 builds the data foundation that lets us describe every site's surroundings from real published data; Part 3 turns that foundation into planning numbers we are willing to defend. Skipping ahead to Part 3 without Parts 1–2 would produce exactly the kind of invented-sounding numbers this document exists to prevent.

**A note for readers new to data and measurement** (the operator asked for this explicitly): every dataset in Part 2 is explained in plain language — where it comes from, what it can support, and, just as important, what it *cannot* tell us. Part 3 explains the measurement ladder the OOH industry uses, with sources, and sets rules for the words we may and may not use. When a number is an estimate, we will call it an estimate.

---

# Part 1 — Trusted inventory model, capture, and a polished experience

## 1.1 Rationale

Every later part depends on the quality of what partners enter. If orientation, viewing distance, illumination, and permit status are optional, half-remembered, or absent, no downstream model can rescue them — "garbage in, garbage out" applies literally here. Part 1 therefore does two things:

1. **Close the capture gap** — make the data model's important fields actually collectable, with provenance, so a site record describes reality well enough to reason about.
2. **Make the experience polished** — a partner who enjoys registering inventory enters better data. This means a photo gallery that is easy to browse, an honest map view that shows where a site really is, forms that explain why each field matters, and layouts that work on the laptops and phones people actually use.

Part 1 is deliberately scoped to **capture and experience**, not modelling. No impression estimates are promised here.

## 1.2 Field coverage matrix (current truth, inspected 2026-09-16)

The matrix below maps every field group against four states:

- **Implemented (end-to-end)** — the web UI collects it, the API accepts it, and the database stores it. The full path works.
- **Stored but not collected** — the database and API accept it, but the web UI never asks for it or never sends it. Until the UI can set these, they do not exist for users: "API-supported" is not "implemented". Mostly form/UI work — the cheapest wins in Part 1.
- **Missing** — not in the database at all. Requires migration + API + form work (proposed, not approved).
- **Verification-needed** — we collect it, but nothing checks it is plausible. A field that is easy to enter wrong.

### Site / structure

| Field group | State | Notes |
| --- | --- | --- |
| Name, city, country, region, address | Implemented | Country uses a datalist (Nigeria/Ghana/Cameroon); free text otherwise. |
| Latitude / longitude | Implemented | Required, bounds-checked at entry; no map-assisted capture (map picker is a Part 1 UX candidate). |
| Format (static / digital_led / 3d) | Implemented (partial) | The UI offers only these three values; SPEC §5.1 also requires `tri_vision`, `mural`, `transit`, and `street_furniture` — not selectable in the registration/edit UI today. |
| Sub-format | Stored but not collected | Column + DTO exist; form does not ask (e.g. *48-sheet, mega-compact, LED truck*). |
| Site type | Stored but not collected | `type` defaults to `billboard`; form never offers other structures (unipole, gantry, building wrap…). |
| Width / height / units | Implemented | |
| Area | Implemented (derived) | Derived as width × height on create and recomputed whenever dimensions change (`inventory.service.ts`); a manually supplied area overrides on create. |
| Orientation (degrees) | Implemented | Free numeric entry; **verification-needed** — no compass helper; easy to enter 30 vs 300. |
| Illumination type + hours | Implemented | Type from a fixed list; hours free text; **verification-needed**. |
| Viewing distance | Stored but not collected | Column exists; form does not ask. Critical for any later visibility reasoning. |
| Elevation (mounting height) | Stored but not collected | Column exists; form does not ask. |
| Geo polygon (site outline) | Stored but not collected | DTO + JSON column exist; form does not collect. V1 candidate. |
| Site code | Implemented (display), not collectable | The API generates it when omitted; the partner **sees** the code in the sites list and on the detail page — but the register/edit form cannot enter or change it. |
| Permit reference + expiry | Stored but not collected | Columns + DTO exist; form does not ask. **High-value, low-effort.** Regulatory backdrop: state/local bodies (e.g. LASAA in Lagos) administer outdoor advertising in practice, but which authority regulates it as a matter of law is **unsettled** in Nigeria — two co-ordinate Federal High Court decisions in 2025 reached opposite conclusions (*Massilia Motors v ARCON* favoured local-government exclusivity; *Godec Power v AGF & ARCON* upheld ARCON's authority); appellate guidance is awaited (Appendix A). We store a reference only — we do **not** judge validity. |
| Market linkage | Stored but not collected | `marketId` accepted; form does not offer market selection. |

### Faces (the bookable unit)

| Field group | State | Notes |
| --- | --- | --- |
| Face label, width, height, area, units | Implemented | |
| Printable area | Stored but not collected | The API DTO accepts it; the UI has no control and never sends it (`addFace` sends label, dimensions, and bookable only). |
| Bookable flag | Stored but not collected | The API accepts it, but the UI hard-codes `true` when creating a face and only *displays* the value — no edit control (`sites/detail/page.tsx`). |

### Digital-specific attributes (all **Missing** today)

| Field group | State | Notes |
| --- | --- | --- |
| Screen pixel dimensions / resolution | Missing | Needed for creative specs; cheap to add. |
| Spot length / loop length / spots per loop | Missing | Required before any DOOH share-of-voice math (Part 3) is even possible. |
| Proof-of-play capability | Missing | Whether the screen can export play logs. Determines what Part 3 can honestly promise for digital sites. |

### Commercial / availability

| Field group | State | Notes |
| --- | --- | --- |
| Rate cards (per day/week/month, currency, effective window) | Implemented | Currency by country (NGN/GHS/XAF); cards can be ended with an `effectiveTo`. |
| Seasonal rules | Stored but not collected | DB column + API DTO accept them; the UI rate-card call sends only currency, rates, and `effectiveFrom`. |
| Multi-currency display | Implemented | Partner dashboard converts via FX snapshot API (open.er-api.com, 1-hour cache, strict validation). |
| **Availability (calendars, holds, blackouts, conflict checks)** | **Missing — unimplemented** | SPEC.md requires date-level availability, blackout/seasonal rules, time-boxed holds and conflict checks (§6). Today `BookingService.findAll()` returns `[]`, the booking DTO is `// TODO: define fields per SPEC.md Section 6`, and the dashboard labels the section "Bookings, occupancy & revenue — Coming soon". Nothing is built. |

### Reference media (photos)

| Field group | State | Notes |
| --- | --- | --- |
| Asset kinds `front`, `context`, `night` | Implemented | Upload flow works; storage refs point to object storage. |
| Asset kind `diagram` | Stored but not collected | Accepted by the schema, but the UI offers only front/context/night uploads. |
| Capture date (`capturedAt`) | Stored but not collected | The UI upload sends only file + kind — no date is set (`sites-api.ts uploadAsset`). Should become **required for front photos** (proposed). |
| Gallery browsing (next/previous, keyboard) | Missing (UX) | Thumbnails only today — see §1.5. |

### Provenance (who says so, and how sure are we?)

| Field group | State | Notes |
| --- | --- | --- |
| `site_metadata` table: dimension, payload, source, method, confidence, collected_at, expires_at | Implemented (schema) | This is the single most important provenance-capable structure we have. Seed data uses dimensions `traffic`, `visibility`, `audience`, `poi`. |
| Metadata **capture UI** | Missing | No partner/admin UI to view or attach metadata records. Today provenance exists only for seeded rows. Part 1 must surface it read-only; Part 2/3 will write to it. |
| Structured provenance on core fields | Missing | Orientation/illumination/size entered free-form carry no "who measured this and when". Proposed: reuse `site_metadata` (dimension `structure`) rather than new columns — see spec proposals below. |

### SPEC-required fields not yet modelled (Missing)

SPEC.md §5.1 requires field groups that have no column, DTO field, or UI today:

| SPEC field group | SPEC reference | State | Notes |
| --- | --- | --- | --- |
| Viewing angle, one-way/two-way traffic exposure | "Orientation & viewing" | Missing | Inputs to any later visibility reasoning; traffic exposure also bounds what future counts can plausibly support. |
| Face bleed, mounting substrate, file requirements | "Creative / substrate" (per face) | Missing | Needed for artwork and proof-of-performance quality checks. |
| Minimum booking duration | "Commercial" | Missing | Prerequisite for honest booking rules once availability exists. |
| Regulatory class | "Compliance" | Missing | Distinct from permit reference: the class of regulation the structure falls under, where applicable. |
| Illumination required for night visibility | "Illumination" | Missing | SPEC §5.1 captures "whether illumination is required for visibility at night" as its own attribute; no column, DTO field, or UI exists. |

### Lifecycle and trust plumbing (partially implemented)

Draft → pending review → published / rejected (with reason) / suspended, `clientRequestId` idempotent-create, tenant-scoped queries and server-side RBAC are implemented. **Inventory auditing is not.** The `audit_logs` entity/table exists (SPEC §6.5) and audit writes happen in organization and auth flows — but `inventory.service.ts` performs every site, face, asset, metadata, rate-card, delete, and lifecycle mutation with no audit write at all (verified 2026-09-16: zero audit references in the inventory module). Until that changes, "audited" must not be claimed anywhere for inventory.

**Part 1 must add (future work — this scope is documentation only):** transactional audit writes for every inventory mutation capturing actor, organization, action, entity type + id, and before/after snapshots, plus tests proving each mutation writes exactly one audit row and rolls back atomically with the mutation.

### MVP / V1 mapping

| Field group | MVP (current delivery phase) | V1 |
| --- | --- | --- |
| Core site record, lifecycle, faces, rate cards, photos | Done end-to-end; the stored-but-not-collected gaps above (printable area, bookability edit, seasonal rules, capture date, `diagram` kind) are Part 1 form work | — |
| Inventory audit trail | — | MVP-priority: transactional actor/org/action/entity/before/after audit writes per SPEC §6.5, with tests — currently absent for all inventory mutations |
| Viewing distance, elevation, permit ref, site-code entry, sub-format, market | Form work only (already stored) | Provenance required at entry (SPEC proposal #3). Orientation is already collected end-to-end (verification-needed); format values `tri_vision`/`mural`/`transit`/`street_furniture` need UI options per SPEC §5.1 (MVP form work) |
| Digital face attributes (resolution, spot/loop length, proof-of-play) | — | V1; required before any DOOH delivery maths (Part 3) |
| Availability (calendars, holds, blackouts, conflict checks) | — | V1 per the SPEC roadmap ("V1: holds with expiry, blackouts, amendments"); prerequisite for conflict-checked booking |
| SPEC-required structure fields (viewing angle, traffic exposure, bleed/substrate/file specs, regulatory class, minimum booking duration) | — | V1, captured with provenance; feeds the visibility work in Part 3 |

## 1.3 Proposed SPEC changes (proposals only — not implemented)

Per AGENTS.md, spec changes are opened before code. Proposed items, for OMG WeCA review:

1. **§5.1 (inventory):** make viewing distance, elevation, permit reference, and site code visible/collectable at registration (they are already stored — align the spec's field list with reality, then align the form with both).
2. **§5.1 (digital sites):** add digital face attributes (screen resolution, spot length, loop length, spots per loop, proof-of-play capability) as first-class fields on faces when `format = digital_led`.
3. **§5.1 (provenance):** require a `site_metadata` record (dimension `structure`) whenever orientation, viewing distance, or elevation is entered outside the map-assisted flow — i.e. "if you typed it, say how you know it".
4. **§5.1 (media):** require `capturedAt` for `front` assets and cap asset age guidance (e.g. warn when > 12 months).
5. **§5.1 (verification):** define the four verification states (unverified / partner-declared / field-verified / third-party) as an enum on metadata records, so Part 3 can filter by it.

None of these change tenant isolation, RBAC, audit, or POP immutability rules.

## 1.4 Capture discipline (what "trusted" means in practice)

- **Provenance over precision.** An orientation entered "from Google Maps street view, 2026-08" is more valuable than a precise-looking number of unknown origin. `site_metadata.source` + `method` + `confidence` exist for exactly this.
- **Plausibility checks at entry** (proposed): lat/lng inside the declared country bounding box; orientation within 0–359; illumination hours pattern-checked; viewing distance positive. Cheap, catches the worst errors.
- **Immutability where it matters.** POP photos stay append-only (SPEC §5.4). Inventory edits should be audited per SPEC §6.5 — but today they are not (see §1.2); closing that gap is a Part 1 deliverable, not a settled fact.

### 1.4.1 Pre-slice truth reset (blocker — before the metadata UI, pilot, or any public claim)

Two pieces of demo fiction sit directly in Part 1's path, and both must be corrected before the first slice — not deferred to Part 3:

- **Seeded metadata is presented as sourced fact.** `apps/api/src/seed/site-metadata.seed.ts` writes values to the *same Lagos sites the first slice reuses* that look authoritative but are not: AADT figures with `source: 'LAMATA 2025'` / `'LAMATA panel'` (we hold no LAMATA data), audience demographics, and unvalidated visibility scores. **Fix:** give `site_metadata` rows an enforceable demo/production data class (column or payload field; a migration sets `demo` on all seeded rows), and suppress demo rows from production context packs, planning surfaces, and any model input — enforced in service queries and tests. Seeded values either carry a visible `demo` label wherever they render or do not render at all.
- **Homepage copy overclaims.** `apps/web/src/app/page.tsx` currently promises bookability "within a day", "real KPIs", "defensible reach, frequency", "1000s" of billboards ready to book, daily proof for every site, and "23+ markets" — none of which today's build can stand behind. **Fix in Part 1:** remove these claims or label them explicitly as demo/roadmap ("demo content — not live product claims"), applying the §3.3 language rules to the marketing surface. The copy audit starts here, not in Part 3.
  **Update 2026-09-17 (operator decision):** the marketing-copy correction was implemented during Part 1, then **rolled back** with the rest of the marketing-website changes (`page.tsx`, `for-partners`, `for-planners`, `for-clients`, `Footer.tsx`, `layout.tsx` metadata restored to pre-Part-1 HEAD e3b3651). Marketing website auditing/remediation is **deferred until after product completion** — it is not a Part 1 prerequisite or completion gate. The enforced demo/production data classing above remains implemented and is unaffected.

## 1.5 Experience specification (build-ready)

### 1.5.1 Photo gallery expansion and navigation

Current state: detail page shows a `PhotosSection` with static thumbnails; the admin review page uses authenticated thumbnails. There is no way to move between photos.

**Specification:**

- Clicking any thumbnail opens a **lightbox** overlay: the photo at full available size, caption (asset kind + capture date, localized), and **previous / next** controls.
- **Keyboard:** `←`/`→` navigate, `Esc` closes. Focus moves into the dialog on open and returns to the invoking thumbnail on close; focus is trapped while open.
- **Accessibility:** container has `role="dialog"`, `aria-modal="true"`, and an accessible name ("Photo gallery — {site name}"); each image has meaningful `alt` text (kind + capture date; e.g. "Front view, captured 12 May 2026"); buttons have `aria-label`s (already the pattern in `sites-ui.tsx`).
- **Behaviour:** arrow buttons disabled (not hidden) at either end; image preloads the neighbour for snappiness; loading state shows a spinner, never a layout shift; mobile supports swipe gestures in addition to buttons; works for all four asset kinds, including authenticated admin thumbnails.
- **Copy:** en/fr strings added to `sites-locale.ts` only (per project convention).

### 1.5.2 One-click immersive Mapbox location view

Current state: **no Mapbox wiring exists anywhere** in the web app (verified by search). An operator-reported token named `MAPBOX_DEFAULT` has been referenced, but its type, scopes, owner, URL restrictions, and environment binding are **unverified** — it may be the account's default public token, and it is not confirmed to be bound or available at all. Nothing about its classification may be assumed.

**Specification:**

- Site detail page gains a **"View on map"** button (and the sites list a map toggle, stretch). One click opens a full-screen immersive map centered on the site coordinate (from stored lat/lng).
- **Back navigation is always obvious:** a persistent visible "Back to site" button (top-left), `Esc` key, and browser back all return to the exact prior scroll position (via history state, so the route stays shareable).
- **Honest overlays only.** The map may show, each labelled with what it is:
  - the site marker (its stored coordinate) — labelled "Registered location";
  - an orientation arrow from stored `orientationDeg`, labelled "Facing (as entered)" — because we do not independently verify it yet;
  - an optional radius band (e.g. 500 m) labelled **"500 m around the pin — residents/roads context, not viewers"**; and
  - the required Mapbox attribution plus OpenStreetMap attribution when OSM-derived tiles/data are shown.
- **Forbidden overlays until Part 2/3 exist:** traffic heat, "audience", footfall, catchment "viewers", or any number that looks like a measurement.
- **Token plan (step 0 — verify before building; record metadata only, never values):**
  - Record the token's prefix and class (`pk.` public vs `sk.` secret), granted scopes (e.g. `styles:read`, `fonts:read`), owning account, allowed-URL list, which environment binding supplies it, and whether it is the account's **default public token** — which Mapbox docs say cannot be scope-managed or URL-restricted.
  - **Default architecture (build-ready, matches our static-export stack):** the web app builds with Next.js `output: 'export'` (`next.config.mjs`) — static assets, no Next server at request time — so there is **no page-render injection point**. A dedicated, non-default `pk.` public token per environment is therefore injected **at CI/build time** via a build environment variable (e.g. `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`), carrying only the public scopes the map needs (e.g. `styles:read`, `fonts:read`) and restricted to our preview/production URLs. The value is inlined into the bundle at build and frozen after it — build-time inlining is not page-render injection. Rotation procedure: create a fresh URL-restricted token → update the CI secret → rebuild → redeploy → delete the old token. Never committed to the repo, never logged.
  - **If runtime rotation without rebuilds is required:** two stack-compatible alternatives — (a) a small authenticated runtime-config endpoint on the API (the API server already runs; static pages fetch the token at load), or (b) a deployment change to a server-rendered runtime. Both are deliberate deployment decisions, not the default; the proxy caveat below still applies to any proxy variant.
  - **`sk.` tokens are server-only.** Any secret-scope token is used exclusively in server-side code and never reaches the client, logs, or error messages.
  - **If policy forbids any client-visible token:** proxying is **not a thin change** — a Mapbox GL style references source tiles, sprites, glyphs, and fonts, so proxying the full style affects routing, caching, attribution, and the 2-second performance target. That path is a **separately validated architecture/licensing/performance spike**, not the build-ready default.
- **Graceful degradation:** if the proxy/token is unavailable, the button shows the site coordinates as text with a "copy" affordance. A map that fails must never block the page.
- **Performance:** lazy-load the map bundle only when the view is opened; target interactive in < 2 s on the reference laptop below.

### 1.5.3 Consistent form label / input / helper / error structure

Codify what the best current fields already do (`Field` in `sites-ui.tsx`):

- **Label:** always visible (never placeholder-only), `htmlFor` bound to the input `id`.
- **Helper text:** one line under the input explaining *why we ask* (e.g. "Facing direction helps planners judge approach roads — a compass or street-view estimate is fine").
- **Error:** specific and actionable ("Orientation must be between 0 and 359 degrees"), linked to the input via `aria-describedby`, shown per-field.
- **Submit:** on failure, focus moves to the first errored field; a summary line names the count of problems without duplicating every message.
- **Units:** unit selector (m/ft) sits beside every dimension input; values are stored with their unit as entered.
- All strings bilingual (en/fr) via `sites-locale.ts`.

### 1.5.4 Responsive acceptance

The operator's effective viewports (display-scaled laptops) are first-class test targets, alongside common phones:

| Viewport | Requirement |
| --- | --- |
| 1366 × 768 (native laptop) | Two-column form grid holds; gallery lightbox fits with controls visible; no horizontal scroll. |
| 1920 × 1080 | Content max-width centres; map view uses the full canvas. |
| **911 × 512 (effective, display-scaled laptop)** | Single-column form; all primary actions reachable without scroll-into-view tricks; lightbox controls remain tappable (≥ 44 px targets); no horizontal scroll. |
| **1280 × 720 (effective, display-scaled laptop)** | Same bar as 1366 × 768. |
| Mobile 390 × 844 and 360 × 800 | Single column; gallery swipe; map view full-screen with back button; tables collapse to cards where needed. |

Acceptance = manual pass at every row + automated Playwright viewport matrix for the three key screens (register, detail, dashboard).

## 1.6 Deliverables and completion gates — Part 1

**Deliverables:** pre-slice truth reset (seed-metadata demo/production data classing with suppression enforcement; the homepage/marketing-copy correction was rolled back 2026-09-17 on operator decision and is deferred until after product completion — see §1.4.1); updated register form (stored-but-not-collected fields collectable; digital face attributes if spec approved); plausibility checks; inventory audit coverage (transactional actor/org/action/entity/before/after writes with tests); gallery lightbox; immersive map view (token architecture per §1.5.2); form conventions applied; responsive matrix passing; bilingual copy; tests (unit + API + Playwright) green.

**Completion gates (all must hold):**

1. Every "Stored but not collected" row in §1.2 is either collectable in the form or has an approved spec note deferring it. ✅ **Met 2026-09-17** — code, sub-format, market, viewing distance, elevation, permit ref, permit expiry, structure provenance, face printable area + bookable + digital attrs, seasonal rules, and per-photo capture dates are all collectable; geo-polygon capture and availability are explicitly deferred in SPEC §5.1 (V1).
2. A new site can be registered with orientation, viewing distance, elevation, permit ref, and capture-dated front photo — each carrying provenance. ✅ **Met 2026-09-17** — server 400s without provenance (verified live: `Provenance required…`), writes the `structure` metadata row (`partner_declared`/`production`), and requires `capturedAt` on front uploads (UI defaults front to today and warns under 12-month-old dates).
3. Gallery and map view pass the viewport matrix in §1.5.4 and keyboard/screen-reader spot checks. ✅ **Met 2026-09-17** — recorded passes at 1366×768 / 1920×1080 / 1280×720 / 911×512 / 390×844 / 360×800; lightbox keyboard (←/→/Esc, focus trap/restore) and map Esc-with-history verified; labelled screenshots recorded in QA runs (see §1.8).
4. Every inventory mutation (site/face/asset/metadata/rate-card/delete/lifecycle) writes exactly one transactional audit record — actor, organization, action, entity type + id, before/after — proven by tests. ✅ **Met 2026-09-17** — 17 unit + 4 Postgres-integration tests; live run showed `inventory.site.updated`, `inventory.asset.added/removed` rows.
5. No secret-scope token or secret value appears in any client bundle, log, or error message (bundle inspection verified); any public map token in use is dedicated, non-default, least-privilege, and URL-restricted, with its metadata (never its value) recorded. ⚠️ **Partially met 2026-09-17 (re-verified same day)** — Mapbox self-introspection + scoped probes confirm the in-use token is `pk.` public class (code `TokenValid`), owned by account **devrue**, and **non-default**: its authorization denies `styles:list` and `fonts:list` (probes 403), and token management is impossible (`tokens:read`/`tokens:write` probes 404) — a reduced scope set the default public token cannot have. Allowed scopes verified: `styles:read` (style JSON and the raster style-tiles endpoint — the only Mapbox endpoints the app uses) and `fonts:read` (glyphs; a corrected probe with a valid font name returned 200 — the earlier "fonts denied" note tested only `fonts:list`). Bound via the secrets workflow (file `MAPBOX_DEFAULT` + env `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`; value never printed); the built client bundle contains no secret-scope token and inlines only the public token by design. **It is not URL-restricted** (verified: style requests succeed with no Referer and with a foreign Referer) — replacing it with a dedicated URL-restricted token requires Mapbox account/dashboard access, a genuine operator dependency; the rotation procedure is documented (§1.5.2), and the owner-account intent (devrue) awaits operator confirmation.
6. API test suite green (**101 passing — verified 2026-09-17**, up from 84); web suite green (**39 passing — verified 2026-09-17**, up from 30). ✅
7. Proposed SPEC changes from §1.3 either merged into `SPEC.md` via a spec change, or explicitly deferred with a note. ✅ **Merged 2026-09-17** into SPEC §5.1 (trust contract, verification enum, plausibility, front-photo capture date; deferrals noted).
8. **Truth reset (pre-slice blocker):** seeded metadata rows carry an enforced demo/production data class, and demo rows are suppressed from production context packs and model inputs (tests prove it). ✅ **Met 2026-09-17 (data-classification component)** — 10/10 seeded rows stamped `demo` (migration + seed); the production predicate is enforced in-query on **all** surfaces that serve metadata (partner inventory reads, planner search `keyMetadata` aggregate, buyer detail) and proven by unit tests on each path; owner-facing site detail intentionally still lists demo rows (labelled "Demo data") so partners can see what is attached to their sites. **Marketing-surface copy labelling: rolled back 2026-09-17 on operator decision and removed from this gate** — the homepage/marketing relabeling previously recorded here (two-round stub-capability relabeling of `page.tsx`, the for-* pages, footer, and layout metadata) was reverted to the pre-Part-1 baseline (HEAD e3b3651); marketing website auditing/remediation is **deferred until after product completion** and is no longer a Part 1 completion gate. It is tracked as later follow-up work, not silently dropped.

### 1.8 Part-1 execution evidence (2026-09-17)

**Implementation route.** A single migration `1720000000007-PartOneInventoryTrust` (site_metadata `data_class` + `verification`; site_faces digital columns) plus: `inventory-audit.ts` (exactly-one-row transactional audit); `InventoryService` rewritten so all 17 mutations run inside `DatabaseService.transaction` with read-back moved post-commit; `inventory-validation.ts` server plausibility; DTOs extended for the collectable fields; `markets.controller` (`GET /markets`) + `markets.seed.ts`; web: `sites-plausibility.ts` mirror, `Lightbox.tsx`, `SiteMap.tsx` (lazy `import('mapbox-gl')`, raster style-tiles basemap, HTML markers, 500 m radius polygon, Esc + history integration, no-token fallback), detail-page rewrite (metadata read-only, face edit incl. digital attrs, seasonal rules, lightbox, map), register-page extension (market select, units select, provenance block, capture dates, first-error focus + error summary), homepage truth reset (bilingual-safe English copy — **rolled back 2026-09-17 with the marketing-website changes**, see the rollback bullet below), locale additions (en+fr). The API's metadata reads were split: the partner's own site detail returns all attached rows (UI labels demo rows), while `listMetadata` keeps in-query demo suppression for planning/production surfaces.

**Tests.** `pnpm test`: API **101/101** (17 new `inventory-trust.spec.ts`, 20 updated `inventory-boundaries.spec.ts`, 4 new Postgres-integration specs proving real-DB transactional rollback incl. a sabotaged CHECK constraint; baseline 84), web **39/39** (9 new `sites-trust.spec.ts` covering plausibility mirror, provenance triggers, old-photo guidance, localized captions, and the radius-circle geometry; baseline 30). `pnpm type-check` 6/6 tasks, `pnpm lint` 7/7 tasks, `pnpm build` 5/5 tasks green.

**Live API verification (real Postgres, retained data).**
- kwame (inventory_manager, `INVENTORY_DELETE` revoked by seed override): GET site detail 200; DELETE site **403** `Insufficient capabilities`; PATCH 200 — revocation enforced.
- akosua (field_operator + `REPORT_VIEW` override): GET site detail 200; PATCH site **403**.
- Structure provenance: PATCH with `orientationDeg` but no provenance → **400** `Provenance required…`; with provenance → 200 + `site_metadata` row (dimension `structure`, verification `partner_declared`, data_class `production`) + audit rows; QA mutation reverted afterwards (append-only audit history retained by design).
- Negative: unknown site → 404; wrong org → 401/403.
- Upload flow: front/night photo upload with capture date exercised live against MinIO (audited `inventory.asset.added`, then `inventory.asset.removed`; QA artifact removed afterwards).
- Migrations + seed re-run idempotently against the retained DB (27 sites, 10 demo metadata rows, 42 existing audit rows preserved).

**Browser verification (recorded passes).** QA runs `1789643971001-8c1d9b39` (main desktop, 9 labelled screenshots), `1789644423082-0b9e7881` (390×844), `1789644576520-6bad1b68` (1920×1080), `1789644601441-6abc032b` (360×800), `1789645005415-d1b54004` (1280×720), `1789645100624-61b63fef` (911×512), plus the corrected map proof `1789645739117-575ee895` / `1789646204044-5b405ed1` / `1789646339018-b598af17`. Verified: homepage truth-reset copy and demo labels (historical — the homepage is since rolled back, see the rollback bullet below); register form market select (7 markets), units select, provenance block conditional on structure entry, validation summary + first-error focus; detail metadata section with `Demo data` badges; lightbox captions (`Context · captured 1 Apr 2025`) with keyboard nav and Esc close; map overlay open/close with history-integrated Esc; French locale across list + detail (`Voir sur la carte`, `Déclaré par le partenaire`, `Non vérifié`); kwame's UI shows no site/face delete controls.

**Two QA-time fixes.** (1) `listMarkets` double-prefixed the API base (page-level regression caught by browser QA — markets select stayed empty until fixed). (2) The map `error` handler over-fired (transient tile errors and StrictMode teardown noise replaced a working map with the fallback); now only pre-load failures of the active instance fail over, and `preserveDrawingBuffer` was added for deterministic capture.

**Map exit-history fix (2026-09-17, final verification round).** Live verification after the marketing rollback found that the map overlay's browser-back close was broken: the App Router re-renders the page inside its own popstate handling (and can remount the subtree synchronously mid-dispatch), which detached the component's popstate listener before it ran, leaving the overlay open; the browser then restored its own cached scroll (overriding any correction). Fixed in `SiteMap.tsx`: key/popstate listeners are attached once per overlay with the latest `onExit` read through a ref; every exit path (Esc, back button, browser back) pops the pushed entry exactly once (no stale "dead" back press after Esc-close); scroll restoration moved to a module-level popstate handler that survives remounts, with `history.scrollRestoration = 'manual'` scoped to the map session and a bounded frame-budget correction loop; a passive scroll listener tracks the page position while the overlay is open so a smooth scroll still settling behind the overlay restores honestly. Verified live at 911×512: browser-back, Esc, and the visible Back button each close the overlay, pop the history state, and restore scroll exactly (300/250/200 targets in three scripted runs); radius toggle, honest overlays, attribution control and 24/24 tile requests (HTTP 200) confirmed in the same pass.

**Post-review fixes (2026-09-17, review findings).**
- **Inventory detail metadata leak to cross-org viewers (red-team review finding, 2026-09-17):** `GET /api/inventory/sites/:id` admitted a cross-org `MARKETPLACE_VIEW` holder for a listed site and then served the **owner-only unfiltered metadata variant** (`listSiteMetadataForOwner`) — including `data_class='demo'` rows (the seeded fabricated traffic/audience/visibility fiction) — plus the owning organization's internal id, for the same audience `/api/marketplace/:id` deliberately minimizes. The test could not catch it: the trust harness applied the demo filter to every `site_metadata` SELECT regardless of query shape, so the old assertion ("getSite ... is also filtered") was a false green that asserted the opposite of real-Postgres behavior. Fixed in `inventory.service.ts`: `assertCanReadSite` now returns an explicit reader classification (`owner` | `platform` | `marketplace`); `getSite` serves the unfiltered owner view only to the owning partner and platform admins (moderation; both decided explicitly), gives a marketplace viewer the production-filtered set (`PRODUCTION_METADATA_WHERE`) — the same audience as the buyer surface — and minimizes `organizationId` away for marketplace readers. Harness fixed to apply the demo filter only when the SQL carries the production predicate in its WHERE clause, so the two reads are genuinely distinguished; tests updated (owner sees labelled demo rows; cross-org planner sees production rows only and no `organizationId`). Live-verified on the running API: aisha@mediareach.com (planner, MARKETPLACE_VIEW) reading IKO-001 gets metadata `[('structure','production')]` and **no** `organizationId`; kwame@accraoutdoor.com (owner) gets all three rows (`traffic/audience` demo + `structure` production) with `organizationId`; the marketplace buyer surface returns the identical minimized view.
- **Cross-tenant asset deletion (red-team review finding, 2026-09-17):** `InventoryService.deleteAsset` was the only inventory mutation without an ownership assert — the route required `INVENTORY_EDIT` validated against the caller's own org, then deleted by asset id alone, so a caller in another media-partner org could delete a marketplace-visible site's reference photos (including the kinds the last-front-photo guard never protects) and the post-commit storage removal made it irreversible; the audit row recorded the attacker's org, leaving the victim org without a trace. Fixed by calling `assertOwnership(orgId, siteId)` at the start of `deleteAsset` (404 unknown site / 403 foreign site, before any row or object is touched). Tests: two new boundary tests (cross-tenant delete refuses with no row/object/audit change; unknown site 404s without an audit row) and the cross-tenant "no audit rows" trust test extended to cover `deleteAsset`. Live-verified on the running API with two real accounts: a JDC Corp draft site + night asset created, then an Accra `inventory_manager` attempted `DELETE /api/inventory/sites/<jdcSite>/assets/<jdcAsset>` with its own `X-Org-Id` → **403 "Not your site"** (previously 200 `{deleted:true}`); unknown site → 404; JDC's asset survived; audit_logs contains no row for the rejected attempt and only JDC-attributed rows for the real mutations; the probe site was then deleted (its audit rows retained by design).
- **Marketplace demo suppression:** `marketplace.service.ts` served demo-class metadata to any `MARKETPLACE_VIEW` planner/buyer — `search()` aggregated every row into `keyMetadata` (the aggregate also discarded `data_class`, so no consumer could even label it) and `getMarketplaceSite()` returned every row. Fixed by moving the shared predicate into `common/metadata-filter.ts` and enforcing it inside the search subselect and the buyer-detail metadata query. New `marketplace-trust.spec.ts` (2 tests) uses a harness that honors whatever predicate it finds in the SQL — removing the filter from the query fails the test with demo rows present. Verified live with a `MARKETPLACE_VIEW` planner token: BDL-009 (2 demo rows in DB) serves zero metadata rows; IKO-001's production `structure` row still flows; search aggregates exclude demo dimensions.
- **Marketing-website rollback (2026-09-17, operator decision):** after the Part-1 run was stopped for stocktake, the operator directed a targeted rollback of the marketing-website copy changes made during this work. The six files were restored to the pre-Part-1 baseline (HEAD e3b3651): `apps/web/src/app/page.tsx`, `apps/web/src/app/for-partners/page.tsx`, `apps/web/src/app/for-planners/page.tsx`, `apps/web/src/app/for-clients/page.tsx`, `apps/web/src/components/Footer.tsx`, and the metadata descriptions in `apps/web/src/app/layout.tsx`. The diffs were re-checked before rollback (all six were copy-only string changes; no product functionality) and `git diff e3b3651` over those files is now empty, while all product files, tests, migrations, seeds, and this document remain in place. The marketing relabeling recorded in the bullet below therefore **no longer describes the working tree**; the marketing surfaces are back at their pre-Part-1 wording, and marketing website auditing/remediation is deferred until after product completion (not a prerequisite or completion gate of Part 1).
- **Marketing claims beyond the homepage (two-step correction after review):** the same claim families the truth reset removed from the homepage remained on the shared marketing surface. The first pass removed the phrase-level claims (footer "23+ markets", layout/OG metadata, for-partners bookability/payments/bulk-load, for-planners KPI/polygon/availability, for-clients daily-proof/real-time/digest wording). A second review correctly showed the rewrites still claimed present-tense capability for **stub** modules (`PopService`/`MonitoringService` return empty, no issue or quote endpoints, mobile capture screens are placeholders, `field_operator` has no photo-upload capability), so the daily-proof family persisted under different wording. The fix is copy-only relabeling: every proof/monitoring/issue/quote/planner-workspace claim now says **Planned:** or "on the public roadmap", the homepage hero/pillar/step/showcase no longer state that field teams capture or verify today, and the only present-tense product claims left are the shipped ones (audited inventory records, capture-dated reference photos, rate cards, review lifecycle, marketplace reads, FX reference endpoint). Verified with recorded passes QA runs 1789648777573-7ab586f1, 1789649458340-4e55daf7, and 1789650994663-c269edc2 (vision-inspected); API 103/103, web 39/39, type-check/lint/build green.

**Honest limitations.** (1) This QA browser's GL stack cannot rasterize mapbox-gl v3 at all — proven with a minimal external repro (esm.sh mapbox-gl, same inline style, even a static `image` source renders black) — so tile *compositing* is verified by request (8/8 HTTP 200) and DOM (markers/controls/attribution), not by pixel; a GPU-enabled browser is needed for the final visual confirmation. (2) The auth email-code rate limiter (3/min/IP) repeatedly locked out QA sign-ins; dev-Redis limiter keys were cleared twice to unblock QA — dev-only action, no product change. (3) Pre-existing, unrelated integration specs (user-identity/canonicalize) fail on unordered row assertions — documented as pre-existing, untouched here. (4) Token rotation: `MAPBOX_DEFAULT` is a shared, non-URL-restricted public token owned by account `devrue` (self-introspected 2026-09-17; scopes styles:read/fonts:read allowed, list/management scopes denied, so non-default); before public launch it must be replaced by a dedicated URL-restricted token per environment (§1.5.2) — creating that token requires the operator's Mapbox dashboard (a `pk.` token cannot create or modify tokens; API probes return 404), with the operator confirming the intended owner account.

**Release-prep correction, 2026-09-24:** The Mapbox GL implementation and GL rendering limitation above describe the 2026-09-17 attempt. The current map uses Leaflet with Mapbox raster tiles. Before ccp-prod release, a dedicated URL-restricted public token and a real-browser tile check are still required. The deployment sequence and data-class migration review are in `docs/deployment-ccp-prod.md`.

## 1.7 Progress checklist — Part 1 (honest, as of 2026-09-17 — all Part-1 items executed)

- [x] Site/face/rate-card/asset CRUD with lifecycle, idempotency, RBAC (implemented in earlier phases)
- [x] Inventory audit writes (actor/org/action/entity/before/after, transactional, tested) — implemented 2026-09-17: `inventory-audit.ts` (`writeInventoryAudit` via the same `EntityManager`), every inventory mutation refactored onto `DatabaseService.transaction`; 17 unit + 4 Postgres-integration tests, incl. a sabotage CHECK proving rollback
- [x] Pre-slice truth reset: demo/production data class on seed metadata with suppression enforcement (§1.4.1) — implemented 2026-09-17; the migration now stamps only the ten deterministic seed records `demo`, leaving unrelated preexisting partner metadata `production` (release-prep correction 2026-09-24). `listMetadata` suppresses demo rows in-query. The homepage/marketing-copy component was **rolled back 2026-09-17 on operator decision** along with the other marketing-website changes; marketing copy remediation is deferred until after product completion (see §1.4.1 and §1.8).
- [x] End-to-end UI gaps: printable area, editable bookability, seasonal rules, capture date, `diagram` uploads (schema/API accept them; the UI never sends them) — implemented 2026-09-17 across register + detail pages; UI upload exercised live against MinIO
- [ ] Availability (calendars, holds, blackouts, conflict checks) — unimplemented; booking service is a stub and the dashboard says "Coming soon" (SPEC §6 scope, V1)
- [x] Partner dashboard with lifecycle counts, city breakdown, portfolio value + FX (implemented)
- [x] Register form collects 15 core fields (name, format, lat/lng, address, city, region, country, width, height, units, orientation, illumination type + hours, description)
- [x] `site_metadata` provenance schema exists (seeded traffic/visibility/audience/poi records only)
- [x] Form collects viewing distance, elevation, permit ref, site code, sub-format, market (stored but not collected today) — implemented 2026-09-17 (`GET /markets` + 7 seeded markets; market select verified in the browser)
- [x] Plausibility checks at entry — implemented 2026-09-17 (`inventory-validation.ts` server-side; mirrored in `sites-plausibility.ts` client-side with first-error focus + error summary)
- [x] Metadata provenance surfaced in UI (read-only view; write flow later) — implemented 2026-09-17 (detail page "Recorded data & provenance" section with verification labels, source/method/confidence/vintage, and Demo-data badges; structure-provenance rows written by the site mutations)
- [x] Gallery lightbox with next/previous, keyboard, a11y — implemented 2026-09-17 (`Lightbox.tsx`: focus trap/restore, arrow/Esc keys, disabled-at-ends buttons, localized `kind · captured <date>` captions, neighbour preload, swipe)
- [x] Immersive Mapbox view with back navigation and honest overlays (token plan per §1.5.2: verify MAPBOX_DEFAULT metadata, then dedicated per-environment public token with URL restrictions; full proxy only as an approved spike) — implemented 2026-09-17 with the verified reduced-scope token via env-mode secret binding; raster style-tiles basemap chosen deliberately (token lacks fonts:read); no-token and load-failure fallbacks with copyable coordinates
- [x] Form label/helper/error conventions applied across all inventory forms — implemented 2026-09-17 (`Field` with label/hint/error + error summary + first-error focus on register, detail-edit, face, rate-card forms)
- [x] Responsive acceptance at 1366×768 / 1920×1080 / 911×512 / 1280×720 / mobile widths — verified 2026-09-17 across recorded browser passes (see the Part-1 execution evidence below); detail/register/homepage stack cleanly with no horizontal overflow (layout verified; the homepage copy content was later rolled back without layout impact)
- [x] SPEC change proposals (§1.3) merged into `SPEC.md` §5.1 (2026-09-17, same change set; deferrals noted there) — operator review of the merged text still welcome

---

# Part 2 — The data foundation: sourcing, download, and ingestion (agent-owned)

## 2.1 Rationale

A site record currently says: *here is a 12 m × 3 m LED board at these coordinates with these rates.* A planner needs to know: *what kind of road is it on, how many people live around it, what kind of neighbourhood is it, which administration governs it?* Today we cannot answer any of that from data — and buying answers from a vendor on day one is neither affordable nor necessary for context.

The good news, explained plainly: **a surprising amount of credible context data about Nigeria, Ghana, and Cameroon is free and legally usable.** Satellite-derived population grids, OpenStreetMap roads and points of interest, and administrative boundaries are all published openly by reputable institutions (European Commission JRC, Meta's humanitarian data programme, WorldPop at Southampton, William & Mary geoLab, OpenStreetMap contributors) — and every licence is checked before use, because openness is not uniform even across these sources (the Relative Wealth Index, for one, turns out to be non-commercial: §2.2.5). None of it measures *who saw an ad* — that honest limit is Part 3's subject — but all of it lets us describe sites with sourced, citable context instead of vibes.

**Why agents own this work:** downloading, checksumming, projecting, and joining spatial datasets is repetitive, careful, scriptable work — exactly what agent workers should do under human-approved licence terms. Humans decide *whether* a source may be used and *what* we may claim from it; agents execute *how* it is fetched and refreshed. Every stage below is designed so a human reviewer can verify provenance in one file.

**Hard constraint respected by this document:** nothing has been downloaded yet. Part 2 execution means actual downloads in a future approved session.

## 2.2 Dataset catalogue (novice guidance)

Each entry: what it is → publisher + exact URL → geography/vintage/resolution → licence + commercial use → how we would get it → local storage → what it enables → **what it cannot establish**.

### 2.2.1 Roads and points of interest — OpenStreetMap via Geofabrik extracts

- **What it is:** a community-maintained map database — road classes, intersections, and points of interest (markets, malls, fuel stations, transit stops). Geofabrik republishes ready-made country extracts daily.
- **Publisher/URL:** https://download.geofabrik.de/africa/nigeria.html (likewise `/africa/ghana.html`, `/africa/cameroon.html`).
- **Geography/vintage/resolution:** full country; refreshed daily; vector (lines/points), detail varies by locality — dense in Lagos/Accra/Douala, thinner elsewhere.
- **Licence (ODbL 1.0) — obligations apply to every ODbL source we ingest (OpenStreetMap **and** BITP alike), and depend on what we do with the data:** ODbL permits commercial use, but public use carries obligations that go beyond attribution (official summary: https://opendatacommons.org/licenses/odbl/summary/; OSM terms: https://www.openstreetmap.org/copyright). Classify every stored or served output from **any** ODbL source and meet the matching obligation:
  - **Unmodified copy** (the raw `.osm.pbf` kept as downloaded): redistribution requires ODbL notice + attribution; keep licence notices intact.
  - **Collective database** (our PostGIS tables where OSM data sits alongside unrelated records): attribution + licence statement for the OSM portion.
  - **Derivative/adapted database** (clipped, filtered, or attribute-enriched OSM layers — which our nearest-road and POI-mix processing *will* create): if publicly used or served, the **adapted database must itself be offered under ODbL** — an attribution-only approach is insufficient. Plan a public "adapted database offer" (download of the OSM-derived layers) alongside the attribution page.
  - **Produced works** (context sheets, per-site values, reports generated from OSM): attribution + licence link required; if produced *from an adapted database*, the share-alike offer above also applies.
  - Also keep-open: any redistribution must be available without technical restrictions.
  - Record the final licence confirmation and each output's classification in its manifest at download time.
- **Download mechanism:** direct HTTP download of the `.osm.pbf` file (~677 MB for Nigeria; Ghana and Cameroon smaller). No account, no key.
- **Local ingestion/storage:** keep the raw `.osm.pbf` outside Git; clip to metro areas; import road network + POI tables into PostGIS (e.g. via `osmium`/`imposm` style tooling); derive "nearest major road class + distance" per site.
- **Enables:** road context (is this an arterial or a side street?), POI surroundings, distance-to-intersection, basemap attribution for the map view.
- **Cannot establish:** how many vehicles or people actually pass a site. OSM has no traffic counts.

### 2.2.2 Population grids — WorldPop

- **What it is:** gridded estimates of how many people live in each ~100 m cell, built by disaggregating census counts onto satellite-derived building footprints.
- **Publisher/URL:** https://www.worldpop.org/ (data portal: https://data.worldpop.org/). Nigeria, Ghana, Cameroon all covered.
- **Geography/vintage/resolution:** country rasters at ~100 m; vintages per country vary (e.g. census-anchored "constrained" estimates around 2020); each dataset page states its epoch — record it per download.
- **Licence:** Creative Commons BY 4.0 per WorldPop's licensing (verify the licence line on each dataset page at download time and record it in the manifest).
- **Download mechanism:** direct HTTP per country/year; no key.
- **Local ingestion/storage:** raw GeoTIFF outside Git; zonal sums into PostGIS per site radius.
- **Enables:** "roughly N thousand residents live within 500 m of this site" — a **residential context** number with a real source.
- **Cannot establish:** who walks or drives past the site, who looks at it, or unique people. People living near ≠ people passing ≠ viewers.

### 2.2.3 Population and built-up grids — GHSL (European Commission JRC)

- **What it is:** the EC's Global Human Settlement Layer — peer-reviewed global rasters of resident population (GHS-POP), built-up surface (GHS-BUILT-S), and settlement classification, produced from satellite imagery + census data. Also useful as a cross-check on WorldPop.
- **Publisher/URL:** https://human-settlement.emergency.copernicus.eu/datasets.php and the download wizard https://ghsl.jrc.ec.europa.eu/downloadWizard.php.
- **Geography/vintage/resolution:** GHS-POP R2023A: 100 m (also 1 km), epochs 1975–2030 (5-year steps), Mollweide and WGS84 rasters; built-up surface at 100 m; 10 m built-up layer for 2018/2022 exists.
- **Licence:** open and free under the European Commission reuse policy — reuse authorised with proper acknowledgment; the JRC explicitly requires citing the peer-reviewed methodology paper (Pesaresi et al. 2024, *International Journal of Digital Earth*, DOI 10.1080/17538947.2024.2390454), not just the website.
- **Download mechanism:** direct HTTP per tile/epoch via the wizard; no key.
- **Local ingestion/storage:** raw rasters outside Git; manifest records DOI + epoch + resolution.
- **Enables:** resident population cross-check; built-up-density context ("this pin sits in a dense built-up corridor"); settlement classification (urban centre vs town vs rural) per site.
- **Cannot establish:** pedestrian or vehicle traffic, and it is a **resident** population model (daytime/nighttime movement is not modelled at site level).

### 2.2.4 Population density maps — Meta Data for Good (High Resolution Population Density Maps)

- **What it is:** Meta's humanitarian programme publishes machine-learning population maps built from satellite imagery and census data, per country, on the Humanitarian Data Exchange (HDX).
- **Publisher/URL:** https://ai.meta.com/ai-for-good/datasets/high-resolution-population-density-maps/ (downloads land on HDX, e.g. https://data.humdata.org/).
- **Geography/vintage/resolution:** per-country rasters; fine grid (roughly 30 m cells; confirm the exact figure on the dataset page when we download); vintages vary by country.
- **Licence:** Creative Commons BY (per HDX listing; confirm per file).
- **Download mechanism:** direct HTTP from HDX; no account needed for public files.
- **Local ingestion/storage:** same as WorldPop; used as a second opinion rather than a primary.
- **Enables:** a second, independent residential-density estimate where WorldPop and GHSL disagree.
- **Cannot establish:** presence of people *now* (it is a residential model), and it inherits the biases of satellite-imagery-based estimation in informal settlements. Use for cross-checks, not as sole source.

### 2.2.5 Wealth context — Meta Relative Wealth Index (permission-gated: not in the default acquisition path)

- **What it is:** a gridded relative-wealth index for low- and middle-income countries, predicted from connectivity, satellite imagery, and survey data (peer-reviewed: Chi, Fang, Chatterjee & Blumenstock — *PNAS* 2022, DOI 10.1073/pnas.2113658119).
- **Publisher/URL:** https://data.humdata.org/dataset/relative-wealth-index
- **Geography/vintage/resolution:** ~2.4 km grid cells; one static vintage (built from data roughly 2021–2023 — record the exact vintage from the file at download).
- **Licence — read this part carefully:** HDX metadata (verified 2026-09-16 via the HDX dataset API) marks the dataset **`isopen: false`** with licence **CC BY-NC 4.0 — "NonCommercial — You may not use the material for commercial purposes."** Abonten is a commercial platform, so agents may **not** download or ingest this dataset under the default acquisition path. It is **permission-gated**: usable only if OMG WeCA separately obtains written commercial permission from Meta — a hard human approval gate, treated like any vendor purchase. This is exactly the licence trap the manifest system exists to catch, and the reason every licence is recorded, not assumed.
- **Download mechanism (only after permission):** direct HTTP from HDX; no key.
- **What it would enable (if permission is granted):** a relative affluence band per site neighbourhood ("wealth index decile 7 of 10 within 2 km") — useful for audience-fit planning conversations.
- **Cannot establish:** household income of people passing the site; it is a **relative index** (comparable within countries), a modelled estimate, and static in time. Never present it as income data.
- **Licence-clean substitute used by the default pilot:** commercial-activity context from OpenStreetMap POIs — the count and mix of shops, malls, banks, markets, and offices within each band (ODbL, attribution-safe, rides on the OSM download we already plan). This is a **neighbourhood commercial-mix indicator**, not a wealth measurement, and must be labelled as such.

### 2.2.6 Administrative boundaries — geoBoundaries (preferred) and why not GADM

- **What it is:** polygons for administrative levels (country → state → LGA/district → ward) used to aggregate everything above ("this site is in Lagos State, Ikeja LGA").
- **Publisher/URL:** https://www.geoboundaries.org/ — API pattern `https://www.geoboundaries.org/api/current/gbOpen/{ISO3}/{ADM}/` returns download links (e.g. `gbOpen/NGA/ADM2/` for Nigeria's second level).
- **Geography/vintage/resolution:** all countries; multiple precision levels (HPSC full-precision, SSC simplified); versioned releases.
- **Licence:** **CC BY 4.0 (gbOpen release) — commercial use allowed with attribution.** Note: the `gbAuthoritative` variant is *not* usable commercially, and `gbHumanitarian` mirrors may carry less open licences — use `gbOpen` and record it.
- **Download mechanism:** HTTP via the API (returns JSON with download URLs) or GitHub releases; no key.
- **Local ingestion/storage:** GeoJSON/GeoPackage outside Git; loaded into PostGIS for point-in-polygon assignment.
- **GADM (https://gadm.org/, licence https://gadm.org/license.html):** higher-detail boundaries, but the licence is **academic/non-commercial only — commercial use requires prior permission**. Abonten is a commercial platform, so GADM is **not our default**. If its deeper levels are ever genuinely needed, that is a human decision to request permission, not an agent's to assume.
- **Enables:** clean, licence-safe catchment aggregation ("residents within this LGA"), reporting rollups, map overlays at honest zoom levels.
- **Cannot establish:** anything about people — boundaries only draw lines.

### 2.2.7 Traffic and pedestrian counts — candidates and the honest gap

The novice summary has changed since this document's first draft, and the change matters: **an open, corridor-level traffic-count candidate for Lagos exists, and it must be evaluated — the earlier "no dataset can help" conclusion was too strong.**

What we verified (2026-09-16):

- **Lagos — BITP (Bus Industry Transition Program) dashboard, https://bitp.cpcslabs.ca/:** CPCS Transcom Ltd was engaged by LAMATA; the project collected **manual classified traffic counts** (among other surveys) along **eight named Quality Bus Corridors** — Ojuelegba–Idi Araba–Ilasamaja; Iju Ishaga–Abule Egba; Iyana Iba–Igando; Ketu–Alapere–Akanimodo; Onipanu–Oshodi; Iyana Ipaja–Ayobo; Yaba–Lawanson–Cele; Anthony–Oshodi (1.6–14.4 km, mainland Lagos). **ODbL-licensed;** authors CPCS Transcom Ltd., Geotrans Ltd and LAMATA; **data current to December 2023**. This is corridor-level, dated, and its fitness for billboard planning is unverified — but it is a genuine, licence-clean candidate that the earlier review of public sources missed.
  - **Verification required before it becomes a pilot input:** whether a supported machine-readable export or raw-data download exists (dashboard is a web app; do **not** scrape — request a written raw-data route from LAMATA/CPCS if no export is offered); exact fields (count-site coordinates, direction, count periods/dates, vehicle classes); whether counts match road/face geometry of our sites; refreshability. Limitations to document: corridor coverage only (8 corridors, not city-wide), Dec-2023 vintage, classified-vehicle scope unknown until fields are inspected. **ODbL output classification:** like OSM, BITP is ODbL-licensed — before ingestion, classify the intended join/output (corridor counts joined to Abonten sites will be an adapted-database territory; public use triggers the notice, attribution, share-alike offer, and unrestricted-access obligations per §2.2.1).
- **Nigeria:** the National Bureau of Statistics publishes quarterly *Road Transport Data* (national aggregates — vehicles registered, road crashes, etc.), https://microdata.nigerianstat.gov.ng/index.php/catalog/164. Useful background; **not** per-road or per-site traffic.
- **Ghana:** the Ghana Highway Authority's annual reports (e.g. https://static-gha.s3.amazonaws.com/static/reports/annual/Ann2021.pdf) cover road condition and axle-load statistics — again, no open segment-level AADT (average annual daily traffic) tables.
- **Academic studies** exist (e.g. manual counts on Ogun State highways, DOI 10.2478/logi-2020-0011) but are one-off surveys of specific corridors at specific dates — usable as *contextual sanity ranges*, never as a currency, and each needs its own licence check before ingestion.
- **Beyond BITP, no other open, site-level vehicle or pedestrian count dataset for Lagos, Accra, or Douala was located in the sources reviewed (2026-09-16)** — marked **unverified-availability**: candidates may exist inside ministries or the advertising authorities (LASAA etc.) but are not confirmed.

**Practical consequence:** traffic/pedestrian figures come from (a) **BITP corridor counts where a site matches a QBC** — after the access/fields verification above; (b) **partner-declared counts** — stored in `site_metadata` with `source`, `method`, `confidence`, `collected_at`, and a verification state, labelled "partner-declared, unverified" until field-checked; and/or (c) **our own structured field capture** (count sheets from field operators — an operational cost the business must accept for Part 3 credibility). For sites outside the eight corridors, only (b) and (c) apply. No procurement is assumed.

### 2.2.8 Licensed mobility / audience sources — access-dependent, not assumed

- **Meta Data for Good movement datasets** (on HDX; Movement Range Maps is listed CC BY — confirm each licence line at download): *Movement Range Maps* (daily admin-level "change in movement" and "stay-put" relative to a pre-pandemic baseline; **updates stopped May 2022**, historical files still downloadable, e.g. https://data.humdata.org/dataset/movement-range-maps) and *Movement Distribution Maps* (daily distance-from-home categories since Dec 2022, refreshed monthly, 140+ countries, differential-privacy protected; https://ai.meta.com/ai-for-good/datasets/movement-distribution-maps/).
  - *What they could enable:* coarse, city-level movement rhythm context (how far people typically travel from home) — useful for sanity-checking catchment assumptions, never for frame-level exposure.
  - *Cannot establish:* exposure at a specific site; the data measures Facebook users with location services, is aggregated to admin areas, and carries a known bias toward smartphone users. Not audience measurement.
- **Named commercial measurement candidates (public announcements only — commercial terms unverified):**
  - **Nigeria — "Moving Audiences"** (Moving Walls technology, operated with Interaction Channel Ltd under an OAAN partnership, announced April 2021). Trade press (Punch, Businessday, Marketing Edge, ThisDay, April–May 2021) reports it positioned as an OOH "currency of measurement" for Nigeria, with 1,900+ unique OOH assets from 70+ OAAN members reported measured since October 2019, spot-level measurement with 10-minute reporting, and MIPAN/APCON endorsement at launch. **Unverified today:** whether the service still operates, its current inventory coverage, methodology, industry/regulatory standing, and any licensing/DPA/pricing terms. None of the announcements reviewed mentions MRC-style accreditation.
  - **Ghana — Moving Walls + Publicis West Africa** launched what they announced as Ghana's first advanced OOH measurement platform (press release, November 2025: real-time analytics and audience insights; access offered via Publicis West Africa). **Unverified:** coverage, methodology, operating status, and terms.
- **What this changes for Abonten:** a commercial measurement provider may exist in our launch markets — which makes partnering a live option *and* makes the build-versus-partner decision (§3.4) a research task, not a default. Before any decision, OMG WeCA should commission a documented evaluation of each candidate: current operation, inventory coverage, methodology against the OAAA/MRC ladder, accreditation status (none claimed to date), and access/licensing/DPA/pricing. **No purchases are authorised or planned by this document.**

### 2.2.9 What we deliberately did not include

- Scraped or unofficial "traffic estimate" websites (unclear rights, unknown methods).
- Any dataset whose licence we could not verify from the publisher's own page today.
- Anything requiring payment or an account with data-sharing terms we have not read.

## 2.3 The bounded pilot (a proposal — nothing is approved)

**Pilot: "Lagos context pack."** One metro, one vintage, no models, no audience claims.

- **Question it answers:** can agents, using only the open sources above, attach a defensible, provenance-complete *context pack* to every seeded Lagos site — and can a human reviewer verify every number back to its source in under a minute?
- **Scope:** the Lagos subset of the ten seeded billboard sites. For each site: admin assignment (state/LGA via geoBoundaries), nearest-road class + distance (OSM), resident population in 250 m / 500 m / 1 km bands (WorldPop primary, GHSL cross-check), commercial-POI density and mix within bands (OSM, ODbL), built-up share (GHSL). Each value stored as a `site_metadata` record with source, method, confidence, collected date, and expiry.
- **Traffic candidate:** where a site lies on or near a BITP Quality Bus Corridor, add corridor-matched classified counts (§2.2.7) — after the access/fields verification and a supported data route from LAMATA/CPCS; counts are corridor-level, Dec-2023 vintage, and labelled as such.
- **Excluded by licence:** the Meta Relative Wealth Index — CC BY-NC 4.0 forbids commercial use (§2.2.5). It can join the pack only after OMG WeCA separately obtains written commercial permission; that is a hard human approval gate, not an agent decision.
- **Explicit non-goals:** no impressions, no reach, no visibility score, no footfall, no "viewers". The pack says what is *around* the site — full stop.
- **Success criteria:** (1) every context value has a manifest line and a licence note; (2) a one-page human-readable provenance sheet per site; (3) three sites hand-verified against satellite/street imagery by a human with agreement on all context fields; (4) the whole pipeline re-runs from manifests alone on a clean machine.
- **Approval needed before execution:** OMG WeCA sign-off on the source list (§2.2) and the storage/location plan (§2.4). This document is the briefing for that decision — it does not grant it.

## 2.4 Staged acquisition plan (agent-executed, human-gated)

**Where data lives (layout):**

```
<raw-root>/            # OUTSIDE Git — e.g. a MinIO bucket `abonten-raw` or a data volume
  raw/<source>/<dataset>/<version>/     # untouched files exactly as downloaded
data/                   # IN Git — small, human-readable
  manifests/<source>.<dataset>.manifest.json   # the trust record (see below)
  processed/...                                 # regenerated derivatives, small summaries only
```

- Raw bulk data **never** enters Git. Git holds manifests and code; MinIO (already running in our stack) or a data volume holds the heavy files. Object-storage refs are recorded like site assets already are.
- **Manifest per downloaded file** (`data/manifests/…`): source name, exact URL, download timestamp (UTC), licence + attribution line, SHA-256 checksum, byte size, stated CRS, vintage/resolution, feature/row count, ingestion script version, reviewer, **and — for every ODbL source (OSM, BITP, …) — the intended output classification (unmodified / collective / adapted / produced) before ingestion**. The manifest is the contract that lets anyone re-verify or re-download exactly what we used.
- **Checksums:** `sha256sum` computed at download; re-verified before every processing run; a mismatch fails the run loudly.
- **CRS/quality checks (in order):** geometry validity (e.g. `ST_IsValid`), row/feature count vs manifest, bounds check (features fall inside the expected country bounding box), duplicate-key check, then load into PostGIS. Storage CRS is WGS84 (EPSG:4326) to match the sites' lat/lng; distance math uses meter-aware geography functions (e.g. `ST_DWithin` on geography) instead of naive degree arithmetic. Reprojections are recorded in the manifest of the derivative.
- **Site joins (the only analytics in Part 2):** point-in-polygon admin assignment; nearest-major-road class + distance; population summed per radius band; commercial-POI density/mix; built-up share. Every join is a plain spatial operation with an honest name ("residents within 500 m", never "audience").
- **Refresh cadence (documented, not automatic at first):** OSM extract monthly (metro-clipped), geoBoundaries per release, GHSL/WorldPop per product release, RWI only if commercial permission is separately obtained (a fixed vintage if ever ingested), movement data monthly *if* ever approved. Each refresh writes a new manifest version; old manifests are kept, so any historical analysis can name its inputs.
- **Lineage rule:** every derivative records (input manifests + script + parameters + timestamp). A number without a lineage chain does not ship.
- **Stages:**
  - **Stage 0 (done):** this document; no downloads.
  - **Stage 1 (Lagos pilot):** download the three licence-clean core sources for Lagos (OSM Nigeria extract — which also feeds the POI-mix layer; geoBoundaries NGA ADM1+ADM2; GHSL/WorldPop Lagos tiles), ingest, generate context packs for the seeded Lagos sites, human verification pass. RWI is excluded from this stage pending separate commercial permission (§2.2.5). **BITP step:** check the dashboard for a supported machine-readable export of the classified counts; if none exists, request a written raw-data route from LAMATA/CPCS (no scraping); ingest corridor counts only if fields, periods, coordinates/direction, and licence classification prove sufficient for site matching — and document every limitation (§2.2.7).
  - **Stage 2:** extend to Accra and Douala (GHA + Cameroon extracts and boundaries); same gates.
  - **Stage 3:** scheduled refresh + lineage dashboard + attribution page ("Data sources & licences") published in-product.
- Each stage ends with a human review gate; each download is re-runnable from its manifest.

## 2.5 Deliverables and completion gates — Part 2

**Deliverables:** ingestion scripts (re-runnable, versioned); manifests for every file; PostGIS context tables; per-site context packs with provenance; the "Data sources & licences" attribution page; a short runbook (download → verify → ingest → derive → review).

**Completion gates (all must hold):**

1. Every ingested file has a manifest with a passing checksum and a recorded licence.
2. Raw data verifiably lives outside Git (repo size and `git status` clean of data files).
3. The pipeline re-runs from manifests on a clean machine without human intervention.
4. Every context value shown in-product carries source + method + confidence + collection date (provenance surfaced by Part 1 work).
5. Three-site human verification passed per metro.
6. Attribution page reviewed for completeness (OSM, EC/GHSL, WorldPop, Meta HDX, geoBoundaries, BITP as applicable) **and the ODbL adapted-database offer published if any ODbL-derived layer — OSM, BITP, or any other — is publicly used, with each source's output classification recorded in its manifest (§2.2.1)**.
7. **No traffic/pedestrian/audience number exists anywhere in the system** that is not provenance-backed — the gap in §2.2.7 stays visibly a gap.
8. **BITP ingestion (if any) rides a supported route:** a machine-readable export from the dashboard, or a written raw-data release from LAMATA/CPCS — never scraping — with corridor coverage, fields, count periods, direction, the Dec-2023 vintage, and its ODbL output classification (likely adapted-database; notice, attribution, share-alike offer, and unrestricted access as applicable) documented in its manifest before public use.

## 2.6 Progress checklist — Part 2 (honest)

- [x] Candidate sources identified with verified publisher URLs (this document)
- [x] Licence analysis: geoBoundaries CC BY 4.0 preferred; GADM rejected as default (non-commercial); Meta Relative Wealth Index found CC BY-NC (`isopen: false` on HDX, verified 2026-09-16) and permission-gated out of the default path
- [x] Traffic-source review updated: BITP (LAMATA/CPCS, ODbL, manual classified counts on eight Lagos QBCs, current to Dec 2023) identified and added as an evaluated candidate with a verification checklist; no other open site-level counts located in the sources reviewed (2026-09-16)
- [ ] BITP access route confirmed (supported machine-readable export or written raw-data release from LAMATA/CPCS — no scraping) and fields/coordinates/direction/count-periods verified for site matching
- [x] Storage/manifest/lineage design written (this document)
- [ ] Operator approval for the source list and pilot scope
- [ ] Stage 1 downloads (Lagos) with manifests + checksums
- [ ] PostGIS context tables + ingestion scripts
- [ ] Lagos context packs generated for seeded sites
- [ ] Human verification pass (3 sites)
- [ ] Stage 2 (Accra, Douala)
- [ ] Refresh cadence automation + attribution page

---

# Part 3 — Validated planning intelligence

## 3.1 Rationale

Only after Parts 1–2 do we have inputs worth modelling: well-captured inventory with provenance, plus sourced context. Part 3 turns those into planning intelligence — and the hard problem is not computing numbers; it is **earning the right to each number**. The OOH industry has spent a decade defining exactly how exposure metrics may be built and claimed; our job is to follow those principles honestly at WeCA scale, and to be transparent that we are *aligned with their principles*, not *accredited by their bodies*.

## 3.2 The measurement ladder (what the industry actually does)

Authoritative sources, cited so any reader can check us:

1. **OAAA OOH Impression Measurement Guidelines (May 2021)** — https://oaaa.org/wp-content/uploads/2022/10/May2021_OOHImpressionsGuidelines.pdf. Establishes the ladder **circulation → Opportunity to See (OTS) → Likelihood to See (LTS)**, defines OTS via **viewsheds** (the area actually in line of sight, factoring size, distance, orientation, illumination, and — for digital — loop and spot length), and recommends OTS as the core currency metric, with LTS as a refinement using variable factors (traffic speed, weather, eye-tracking evidence). It also requires **published, transparent methodologies** and validated data sources.
2. **MRC Out-of-Home Measurement Standards, Phase 1 & 2 Combined Final (December 2025)** — https://mediaratingcouncil.org/sites/default/files/Standards/MRC%20OOH%20Standards%20Combined_FINAL.pdf. Defines the full metric hierarchy: **location traffic/circulation → gross impressions → viewable (OTS) impressions → LTS impressions → audience**, where *audience* means unique individuals in the **Display Exposure Zone** meeting explicit presence/functionality/viewability/consumption criteria. Also defines **Apparent Size**, **Display Exposure Zone**, reach & frequency rules, invalid-traffic filtration, and mandatory disclosure. (The MRC accredits measurement services — that is its role; nothing here claims or implies accreditation of Abonten.)
3. **Geopath** (US audience-measurement currency; methodology overview at https://geopath.org/): operationally shows how pedestrian + vehicular traffic, a **Visibility Adjustment Index**, and reach/frequency **deduplication across frames** produce a currency. We have no access to Geopath data for WeCA; we cite it as the pattern to emulate, not a source we hold.
4. **DOOH specifics — OAAA/DPAA primers and the IAB DOOH Measurement Guide (July 2025):** digital inventory is measured through **loops, spots, and share of voice** (a spot's SOV derives from its share of loop time), with machine **proof-of-play logs** underpinning delivered impressions. The IAB guide grounds DOOH "impressions" in opportunity-to-see at the location combined with playback records.
5. **MRC Digital Place-Based Audience Measurement Standards (2017)** — the cautionary tale: **venue traffic is not a currency**; audience requires presence/notice qualifiers and dwell reasoning. A mall's visitor count is not a screen's audience.

**The ladder in one plain sentence per rung:**

- **Circulation/location traffic** — how many vehicles or people pass a point (a *count*, not an audience).
- **Gross impressions** — passings adjusted to exposures of the display (still not unique people).
- **OTS / viewable impressions** — refined by the viewshed: size, distance, orientation, illumination, obstructions.
- **LTS** — further refined by likelihood factors (speed, dwell, clutter, illumination at night).
- **Audience** — unique people meeting strict presence + notice criteria; the only rung where "reach" is honest.
- **Reach & frequency** — deduplicated people and average exposures across a plan — the top of the ladder, and the most demanding to compute correctly.

## 3.3 What we will and will not say (language rules)

These rules are binding on product copy, reports, and agent-generated analysis:

| We may say | We may NOT say | Why |
| --- | --- | --- |
| "≈ 42,000 residents live within 500 m (WorldPop 2020, 100 m grid; band is residential context)" | "42,000 viewers" or "audience of 42,000" | Residents in a radius are **not** passers-by and **not** viewers. Catchments ≠ viewers. |
| "Estimated gross exposures per day, modelled from traffic counts of declared provenance, ± band" | A single precise "daily impressions" figure with no band, basis, or provenance | Summed exposures across days are **not** unique reach. |
| "Internal visibility score: 0.72 — heuristic from orientation, distance, size, illumination; not independently validated" | "Visibility-verified" or any Geopath-style implication | Our visibility score is an internal heuristic, **not validated science**, until it is tested against field observation and documented. |
| "Map imagery © Mapbox © OpenStreetMap contributors" | Implying the map layer knows anything about audiences | A maps provider is a **basemap**, not audience measurement. |
| "Aligned with the principles in the OAAA 2021 guidelines and MRC 2025 OOH Standards" | "MRC-compliant", "accredited", "Geopath-rated", or any certification claim | Accreditation is a formal audit status held by specific measurement vendors. Abonten holds none. |
| "Permit ref: LASAA/2026/…, as declared by partner on 12 Mar 2026" | "Fully permitted" | We store declarations; we do not certify regulatory compliance — and in Nigeria even the regulator's authority over outdoor advertising is in unresolved dispute between co-ordinate courts (§1.2). |
| "OOH measurement platforms have been announced or launched in our markets — Moving Audiences in Nigeria (OAAN/ICL, 2021) and Moving Walls + Publicis West Africa in Ghana (Nov 2025), per press reports; Abonten figures are our own estimates unless sourced from a licensed provider" | "MRC-compliant", "accredited", "national currency", or any statement about a platform's accreditation or standing that has not been verified against authoritative registries | Press reports verify the announcements, not current operation or standing (§3.4). Registry and operator checks must precede any such claim. |

Every published number carries: **method note, source(s), vintage, uncertainty band, and confidence label** — stored as `site_metadata` provenance or report footnotes, per SPEC §5.1/§6.5.

## 3.4 The validation ladder (how a number earns trust in Abonten)

Each level must be *reached*, not assumed:

1. **Declared** — partner-entered, provenance-required (Part 1). Label: "partner-declared".
2. **Sourced context** — derived from the Part 2 datasets with lineage (population bands, road class, admin area, commercial-POI mix). Label: source + vintage.
3. **Field-verified** — a structured field check (photo + form) confirms the declared attribute. Label: "field-verified, date, operator".
4. **Modelled, with a published method and an empirical validation contract** — count-based models stop at circulation / gross / OTS estimates (§3.4.1); publishing requires formula, inputs, band, ground-truth validation results, and a drift/revalidation rule. Tests prove the code; field data validates the numbers.
5. **Third-party audited** — out of scope until a licensed currency/measurement partner exists (§2.2.8); the architecture keeps the door open (provenance + method disclosures are what an auditor would ask for).

### 3.4.1 Metric-by-metric input and validation contract

Every metric Abonten publishes must satisfy its row — inputs, honest label, validation, and measurable threshold — before it ships. The MRC Combined Final standard (§3.2, source 2) defines audience as unique individuals and calls for periodic internal and external empirical validation of methods and underlying data; the rows below encode that for our scale.

| Metric | Inputs we will accept | Honest label | Validation before publishing | Acceptance threshold | Status |
| --- | --- | --- | --- | --- | --- |
| Admin assignment, road class, distance | geoBoundaries, OSM with lineage | Sourced context (source + vintage) | Manifest + checksum + 3-site human verification per metro (§2.4) | 100% provenance-complete; human spot-check agrees on all sampled sites | In scope (Part 2) |
| Residents within radius bands | WorldPop (primary) + GHSL (cross-check) | "Residents within N m — residential context, not viewers or passers-by" | Zonal sums recomputed from raw rasters; cross-grid agreement check | Cross-grid agreement within ±20% at metro level; per-site discrepancies disclosed | In scope (Part 2) |
| Commercial-POI mix | OSM POIs | "Commercial venues within N m (OSM)" | OSM POI completeness is unverified in parts of WeCA — publish only with an undercount caveat | Completeness spot-checked before any numeric claim | In scope (caveated) |
| Vehicle & pedestrian traffic (typed counts) | Partner-declared or field count sheets; for Lagos-pilot sites on/near a QBC, BITP corridor counts (ODbL, Dec 2023, §2.2.7) | "Vehicle (or pedestrian) count, direction D, at location L, period P" — vehicles/day or persons/day; **never impressions** | Sampling plan, not a spot recount: counts spanning ≥2 weekdays + ≥1 weekend day, am-peak/midday/pm strata, and a second season — or a documented seasonality caveat; direction and road/face recorded per count; independent recount of ≥10% of sites | Recount agrees within ±15% on ≥80% of re-counted sites; the sampling plan covers its named strata or the estimate is labelled season-limited | In scope (typed, labelled) |
| Person circulation | Typed counts × occupancy factors per mode (car/truck/bus/danfo), each from a cited published local source | "Person circulation estimate — modelled occupancy, sources cited" | Every occupancy factor carries a named source + vintage; factors applied per vehicle class | No cited occupancy factor ⇒ no person-circulation figure (vehicle counts stay vehicle counts) | In scope, gated |
| Gross impressions | Person circulation × direction/face match (share of counted traffic on the face's read side) | "Gross exposures — modelled, not audience, not unique people" | Direction/face matching derived from stored orientationDeg + road geometry and field-checked per site; display functionality confirmed (screen lit/working at check) | Matching factor field-verified on sampled sites; display functionality confirmed at photo check | In scope, gated |
| OTS / viewable impressions | Gross × exposure-zone model: zone geometry (line of sight from the face), apparent size/angle limits, qualified-presence duration within the zone, illumination state; for DOOH, loop fractionalisation (spot length/loop share) × expected dwell in the zone | "Modelled OTS estimate ± band — potential to see, not confirmed seeing" | Exposure-zone geometry + viewability rules documented per site; OTS validated on holdout sites against **independently observed qualified exposures** — observers recording face-directed presence/meeting viewability criteria within the zone, **not raw passings** | On holdouts, model within ±30% of observed qualified exposures and the band covers ≥80%; failing ⇒ OTS stays draft and published output stops at gross/circulation | Deferred until all upstream gates pass |
| LTS | OTS × likelihood adjustments (speed, clutter, dwell) | "LTS estimate — refinement, not audience" | Requires the OTS gate plus dedicated likelihood evidence per factor | Not defined — deferred | Deferred |
| Visibility score | Internal heuristic (orientation, distance, size, illumination) | "Internal heuristic, not validated science" | Regression tests only — code behaviour, never empirical claims | Label rule only; no numeric accuracy claim | Internal diagnostic |
| Share of voice (digital) | Loop/spot structure + machine proof-of-play logs from the screen operator | "SOV per recorded loop schedule" | Play-log samples reconciled against the scheduled loop | Reconciliation within ±5% on sampled screens; no logs ⇒ no SOV | Deferred (needs Part 1 digital fields + operator logs) |
| Reach & frequency (unique people) | Requires a licensed, representative, privacy-compliant deduplication source (panel, MAID, or carrier data under DPA) | Not offered | Independent methodological validation; empirical dedup checks against ground truth, per MRC requirements | Not defined until a qualified source exists | **Deferred — not offered** |

Four rules the table implies, stated once:

- **The ladder is typed; no row collapses two quantities.** Vehicle counts, pedestrian counts, person circulation, gross exposures, OTS, and LTS are different units; every conversion between them adds a named, sourced, per-mode or per-site factor (occupancy, direction/face match, exposure zone, loop fraction). A vehicle count alone can never become a person impression.
- **Tests prove code, not people.** Unit/integration tests verify arithmetic and plumbing; they cannot prove unique people were deduplicated or that an exposure-zone model is true. Only representative data plus empirical validation against qualified exposures can — which is why OTS is gated and reach/frequency is deferred.
- **Drift and revalidation:** every modelled number names its revalidation interval (e.g. traffic inputs re-verified quarterly; viewshed/exposure-zone calibration re-run when inventory attributes change or at 6 months). Stale inputs make estimates visibly stale (`expires_at`), never silently reused.
- **Privacy/DPA gate:** any individual-level input (MAID, panel) enters only under a signed DPA with a documented lawful basis, and only as aggregates — no raw individual data lands in our databases.

**Two different artefacts, neither is an audience measure (SPEC §5.4).** *Proof-of-performance (POP) photos* are field-captured evidence that the board stood lit as booked — display condition and compliance, used for POP reporting and dispute resolution. *Proof-of-play logs* are machine records exported by digital screen players; they are the delivery evidence for DOOH (§3.2). Reports must never convert photos or play logs into exposure or audience claims.

**Uncertainty handling:** estimates are reported as ranges with the method attached; confidence decays with data age (`expires_at` on metadata); expired context data is visibly stale, not silently reused.

**Build versus partner — now a named research task.** Press reports reviewed 2026-09-16 describe **Moving Audiences** in Nigeria (Moving Walls technology, operated with Interaction Channel Ltd under an OAAN partnership, announced April 2021 as an OOH "currency of measurement", with 1,900+ OAAN-member assets reported measured since October 2019) and **Moving Walls + Publicis West Africa** in Ghana (launched November 2025 as "Ghana's first advanced OOH measurement platform") as announced or launched in two of our three launch markets; whether each still operates, at what coverage, and on what terms is unverified. Announcements are not evidence of accreditation or of a unified standard: before any accreditation-absence or currency claim is published, the evaluation must check authoritative sources — MRC accreditation listings, industry registries (e.g. OAAN member records), direct operator confirmations, and written licence/DPA terms. Before the build-versus-partner decision in this part is finalized, OMG WeCA should commission exactly that evaluation (candidates, criteria, and reporting in §2.2.8). Until it lands, Abonten's own estimates stay labelled as our own (§3.3), and no partnership or currency claim appears in product copy.

## 3.5 Deliverables and completion gates — Part 3

**Deliverables:** planning-context pack per site (Part 2 output, surfaced); declared-traffic intake with provenance and verification workflow; the metric input/validation contract (§3.4.1) adopted as the product rule; a documented, empirically validated estimation method (viewshed factors from OAAA/MRC definitions) applied only to verified-traffic sites, producing circulation/gross/OTS estimates labelled as estimates; report language audited against §3.3; methodology pages per metric; **reach/frequency explicitly deferred** until a licensed, representative, privacy-compliant deduplication source and a validated method exist.

**Completion gates (all must hold):**

1. No number appears in the product without method + source + vintage + band (spot-audited).
2. Language audit: zero violations of the §3.3 "will not say" column across UI, emails, and exports.
3. Estimation restricted to sites with provenance-verified traffic inputs, producing **typed, labelled circulation estimates only** — gross/OTS appear only behind their §3.4.1 gates, and no metric is published beyond its validation status and threshold.
4. Digital sites: SOV/delivery maths only where loop/spot structure + machine proof-of-play logs are recorded (Part 1 fields).
5. Every modelled metric passes its holdout/ground-truth validation threshold — OTS validated against **independently observed qualified exposures, not raw passings** — and carries a drift/revalidation rule; any individual-level input (panel/MAID) arrives only under a signed DPA with a documented lawful basis.
6. Reach/frequency does not exist anywhere in the product until gate 5's source exists; product copy makes no reach claim.
7. Internal red-team review signs off; SPEC updated (measurement vocabulary section).
8. No accreditation or local-standard-compliance claim anywhere; platform and regulatory claims verified against authoritative registries/sources first.

## 3.6 Progress checklist — Part 3 (honest)

- [x] Measurement principles researched and cited (this document: OAAA 2021, MRC Dec 2025, Geopath pattern, IAB DOOH 2025, MRC place-based 2017)
- [x] Honesty language rules drafted (§3.3)
- [ ] Operator review of the measurement vocabulary and validation ladder
- [ ] Declared-traffic intake with provenance + verification workflow
- [ ] Planning-context pack surfaced per site (depends on Part 2 Stage 1)
- [ ] Metric input/validation contract adopted (§3.4.1) with acceptance thresholds
- [ ] Published, empirically validated circulation→gross→OTS ladder (typed units; occupancy evidence; direction/face matching; exposure-zone geometry and viewability rules; daypart/season sampling; holdout validation against qualified exposures)
- [ ] Reach/frequency: gated until a licensed, representative, privacy-compliant dedup source and validated method exist (deferred)
- [ ] Report language audit (§3.3) across UI/exports
- [ ] SPEC measurement-vocabulary change merged

---

# Summary of proposed decisions

1. **Three ordered parts, dependencies honoured:** capture/experience first, data foundation second, modelling last. No number ships before its inputs do.
2. **Fill "stored but not collected" before adding new schema:** viewing distance, elevation, permit ref, site code, sub-format, market linkage — the cheapest trust wins.
3. **Provenance-first data model:** reuse `site_metadata` (source/method/confidence/collected_at/expires_at) as the single provenance mechanism; no parallel truth.
4. **geoBoundaries (CC BY 4.0) as the boundaries source; GADM excluded as default** (non-commercial licence).
5. **Population from two independent grids (WorldPop primary, GHSL cross-check); roads, POIs and commercial-activity mix from OSM** — licences checked for commercial use *including output-level ODbL obligations for every ODbL source, OSM and BITP alike* (public use of any ODbL-derived layer triggers an adapted-database offer, §2.2.1); RWI wealth data excluded from the default path (CC BY-NC) unless separate permission is granted; all manifest-tracked, raw data outside Git.
6. **Traffic/pedestrian counts: no other open, site-level dataset was located/verified in the sources reviewed (2026-09-16); the strongest open Lagos candidate — BITP (LAMATA/CPCS, ODbL, classified counts on eight Quality Bus Corridors, current to Dec 2023) — was added to the pilot after the initial review**, pending its access/fields verification (§2.2.7); declared-with-provenance plus field capture; count-only estimation stays at typed, labelled circulation until the §3.4.1 ladder gates pass, and reach/frequency is deferred.
7. **Mapbox token discipline:** verify `MAPBOX_DEFAULT` metadata first (class, scopes, owner, allowed URLs, binding — never values); our static-export stack means the dedicated non-default public `pk.` token is injected at CI/build time (not page render) with least privilege, URL restrictions, and a rebuild-based rotation procedure; `sk.` tokens server-only; full proxy or runtime-config endpoint only as deliberate alternatives; basemap ≠ measurement.
8. **Language discipline as a shipped feature:** the §3.3 table is enforced in copy review, not just intended.

# Open dependencies

- **Operator/OMG WeCA approval:** SPEC change proposals (§1.3); Part 2 source list + pilot scope; any future vendor procurement (none assumed).
- **Part 1 → Part 3 dependency:** digital face attributes (loop/spot length, proof-of-play) must exist before any DOOH delivery maths.
- **Part 2 → Part 3 dependency:** no planning intelligence ships before its inputs have manifests and provenance.
- **Traffic data acquisition** (ministerial/authority requests or vendor panels) is a human-led workstream; agents execute only after approval.
- **Field operations capacity** for verification passes (POP field operators exist; verification runs need scheduling).

# The first executable slice (smallest vertically complete step, upon approval)

**Slice: "Lagos context pack, three sites, end-to-end."**

1. **Truth reset first (§1.4.1):** enforce the demo/production data class on seeded metadata (demo rows suppressed from production context and model inputs) before any context pack. The homepage/marketing-copy component is deferred to the later website-review pass (rolled back 2026-09-17 by operator decision; §1.4.1).
2. Merge SPEC change #5 (verification-state enum on metadata) — small, unblocks honest labelling.
3. Ship the register-form additions for permit ref + viewing distance + elevation (already stored; form-only work) with plausibility checks.
4. With operator sign-off on §2.2: download the three licence-clean Lagos sources (OSM, geoBoundaries, GHSL/WorldPop — RWI excluded pending separate commercial permission), write manifests + checksums, ingest into PostGIS, generate context packs for **three** seeded Lagos sites, produce one-page provenance sheets, and run the three-site human verification. **BITP:** request a supported machine-readable export route from LAMATA/CPCS (or a written raw-data release — no scraping) and add corridor-matched counts for QBC-adjacent sites if fields verify.
5. Demo: a site detail page showing sourced context ("≈ N residents within 500 m — WorldPop 2020 · arterial road 40 m — OSM · Ikeja LGA — geoBoundaries") next to the honest map view.

This slice is small enough to finish cleanly, exercises every gate in Parts 1–2, and produces the first genuinely defensible numbers in Abonten.

# Limitations of this document

- **Research-only.** No dataset was downloaded, no licence accepted, no purchase made. All publisher pages were read 2026-09-16; licences and vintages must be re-confirmed at download time and recorded in manifests.
- **Traffic and pedestrian data: one open Lagos candidate (BITP, ODbL, corridor-level, Dec 2023) located and added to the pilot plan; its access route, fields, and site-matching fitness are unverified, and no other open site-level counts were located in the sources reviewed (2026-09-16)** — availability elsewhere (ministries, advertising authorities) is unverified, not ruled out. Any future counts must carry provenance.
- **Commercial mobility/audience vendors were not evaluated.** Named candidates exist from public announcements (Moving Audiences/OAAN in Nigeria, 2021; Moving Walls + Publicis West Africa in Ghana, Nov 2025), but their current operation, coverage, methodology, and terms are unverified (no contacts, contracts, DPAs, or prices).
- **Local regulatory/measurement context** (ARCON/LASAA and equivalents) is summarised from public sources; no legal advice is implied, and no compliance representation is made.
- **Measurement principles are cited from US/global bodies** (OAAA, MRC, Geopath, IAB); they are principles to follow, and Abonten holds no accreditation. Press announcements name measurement platforms in Nigeria (Moving Audiences/OAAN/ICL, 2021) and Ghana (Moving Walls + Publicis West Africa, Nov 2025), but the sources reviewed do not verify their current operation, coverage, methodology, or terms, and do not establish whether any holds formal accreditation — authoritative registry checks are required before such claims are made (§3.4).
- **Seeded inventory is demo data**; the matrix in §1.2 reflects the code, while real-world partner behaviour may surface further gaps.
- The **pilot is a proposal**; nothing herein authorises execution.

---

# Appendix A — Source list (all URLs cited)

**Measurement principles**
- OAAA OOH Impression Measurement Guidelines (May 2021): https://oaaa.org/wp-content/uploads/2022/10/May2021_OOHImpressionsGuidelines.pdf
- OAAA Measurement & Analytics Guide for Agencies and Advertisers (March 2020): https://oaaa.org/wp-content/uploads/2022/09/OOH-Measurement-and-Analytics-Guide.pdf
- MRC Out-of-Home Measurement Standards, Phase 1 & 2 Combined Final (December 2025): https://mediaratingcouncil.org/sites/default/files/Standards/MRC%20OOH%20Standards%20Combined_FINAL.pdf
- Geopath (methodology overview / US currency): https://geopath.org/
- IAB Digital Out-Of-Home (DOOH) Measurement Guide (July 2025): https://www.iab.com/guidelines/dooh-measurement-guide/ · full PDF https://www.iab.com/wp-content/uploads/2025/07/IAB_DOOH_Measurement_Guide_July_2025.pdf
- MRC Digital Place-Based Audience Measurement Standards (2017): https://mediaratingcouncil.org/Standards (Digital Place-Based section)
- OAAA/DPAA DOOH primer (loops, slots, share of voice): https://oaaa.org / https://dpaa.org (primer documents)
- Nigeria regulatory context — unsettled at Federal High Court level: *Massilia Motors Ltd v ARCON* (FHC Lagos Division, 2025 — favoured local-government exclusivity) vs *Godec Power Nigeria Ltd v AGF & ARCON* (FHC Lokoja Division, 2025 — upheld ARCON's authority); neither binds the other, appellate guidance awaited; review: S. P. A. Ajibade & Co., "Who regulates outdoor advertising in Nigeria?" (Jan 2026): https://www.mondaq.com/nigeria/advertising-marketing-branding/1727806/ · LASAA (Lagos administration) — public records
- Moving Audiences (Nigeria) — OAAN + Interaction Channel Ltd partnership with Moving Walls technology, announced April 2021, positioned as an OOH "currency of measurement": https://businessday.ng/brands-advertising/article/more-value-for-ooh-advertisers-as-oaan-icl-partner-to-provide-audience-measurement/ · https://punchng.com/icl-association-to-boost-outdoor-advertising-in-nigeria/ (current operation, coverage, and terms unverified)
- Ghana OOH measurement platform — Moving Walls + Publicis West Africa, launched November 2025: https://www.prnewswire.com/news-releases/moving-walls-and-publicis-west-africa-announce-official-launch-of-ghanas-first-advanced-out-of-home-measurement-platform-302608493.html (coverage, methodology, and terms unverified)

**Datasets**
- OpenStreetMap country extracts (Geofabrik): https://download.geofabrik.de/africa/nigeria.html · /africa/ghana.html · /africa/cameroon.html — ODbL
- WorldPop gridded population: https://www.worldpop.org/ · https://data.worldpop.org/ — CC BY 4.0 (confirm per dataset)
- GHSL (EC JRC): https://human-settlement.emergency.copernicus.eu/datasets.php · https://ghsl.jrc.ec.europa.eu/downloadWizard.php — EC reuse with acknowledgment; methodology: Pesaresi et al. 2024, DOI 10.1080/17538947.2024.2390454
- Meta High-Resolution Population Density Maps: https://ai.meta.com/ai-for-good/datasets/high-resolution-population-density-maps/ (downloads via https://data.humdata.org/) — CC BY
- Meta Relative Wealth Index: https://data.humdata.org/dataset/relative-wealth-index — **CC BY-NC 4.0, HDX `isopen: false` (verified 2026-09-16); commercial use forbidden without permission — permission-gated, not in the default acquisition path**; methodology: Chi, Fang, Chatterjee & Blumenstock, *PNAS* 2022, DOI 10.1073/pnas.2113658119
- geoBoundaries: https://www.geoboundaries.org/ · API `https://www.geoboundaries.org/api/current/gbOpen/{ISO3}/{ADM}/` — CC BY 4.0 (gbOpen); citation: Runfola et al. 2020, DOI 10.1371/journal.pone.0231866
- GADM (excluded as default — licence): https://gadm.org/ · https://gadm.org/license.html — academic/non-commercial only
- Meta Movement Range Maps (historical, ended May 2022): https://data.humdata.org/dataset/movement-range-maps — CC BY
- Meta Movement Distribution Maps: https://ai.meta.com/ai-for-good/datasets/movement-distribution-maps/ — public on HDX
- Mapbox token security guidance (default public token cannot be URL-restricted; client apps use public-scope tokens; secret-scope requests stay server-side; isolate, rotate, and URL-restrict tokens): https://docs.mapbox.com/help/dive-deeper/how-to-use-mapbox-securely/ · https://docs.mapbox.com/accounts/guides/tokens/
- Lagos BITP traffic-count dashboard (LAMATA/CPCS; manual classified counts on eight Quality Bus Corridors; ODbL; data current to Dec 2023): https://bitp.cpcslabs.ca/
- ODbL 1.0 official summary (attribution, share-alike for adapted databases and works produced from them): https://opendatacommons.org/licenses/odbl/summary/ · OSM copyright/terms: https://www.openstreetmap.org/copyright
- Nigeria NBS Road Transport Data (national aggregates): https://microdata.nigerianstat.gov.ng/index.php/catalog/164
- Ghana Highway Authority annual reports (road condition/axle load; no open segment AADT): https://static-gha.s3.amazonaws.com/static/reports/annual/Ann2021.pdf
- Example academic manual traffic counts (Ogun State, Nigeria): DOI 10.2478/logi-2020-0011

**Internal references**
- Field coverage verified against: `apps/api/src/common/entities/` (billboard-site, site-face, site-asset, site-metadata, rate-card entities), `apps/api/src/inventory/dto/inventory.dto.ts`, `apps/api/src/booking/booking.service.ts` (stub returning `[]`), `apps/api/src/booking/dto/booking.dto.ts` (TODO), `apps/api/src/seed/`, `apps/web/src/app/sites/new/page.tsx`, `apps/web/src/app/sites/detail/page.tsx` (upload kinds, hard-coded bookability), `apps/web/src/lib/sites-api.ts` (no capturedAt/seasonalRules sent), `apps/web/src/components/dashboard/PartnerDashboard.tsx` ("Coming soon" badge), `apps/web/src/components/sites/sites-ui.tsx` (inspected 2026-09-16)

# Appendix B — Glossary for novices

- **OOH / DOOH** — out-of-home advertising; DOOH is its digital (screen) form.
- **Circulation / location traffic** — counted vehicles or people passing a location. The rawest, most honest number; still not an audience.
- **Viewshed** — the area from which a display is actually visible, given size, angle, distance, and obstructions.
- **OTS (Opportunity to See)** — an impression refined by the viewshed: someone *could* have seen the display.
- **LTS (Likelihood to See)** — further refined by speed, dwell time, illumination, clutter.
- **Audience** — unique people meeting strict presence + notice criteria; the only basis for honest "reach".
- **Reach & frequency** — how many *different* people, and how often on average (requires deduplication).
- **Share of voice (SOV)** — on a digital loop: an advertiser's share of total loop time.
- **Proof-of-play** — machine logs exported by a digital screen player recording that a spot actually played; the delivery evidence for DOOH.
- **Proof-of-performance (POP) photos** — field-captured photos proving installation condition and compliance; not an audience measure. A distinct artefact from proof-of-play logs.
- **Provenance** — who measured a value, how, when, and how confident we are. Abonten's `site_metadata` exists to carry it.
- **CRS** — coordinate reference system; the "units" of a map. Mixing them silently is the classic data bug; we store WGS84 and record every projection.
- **Manifest** — a small file recording exactly what was downloaded, from where, when, with what checksum and licence. Our unit of data trust.
