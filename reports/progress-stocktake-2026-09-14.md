# Abonten — Progress Stocktake

**Date:** 14 September 2026 (Africa/Lagos) · **Branch:** `main` · **HEAD:** `c49ae6353de55908b6da4b20af29ecdefa14d0a7` — *feat: complete account foundations milestone* · **Working tree:** clean (verified live; `git status --short --branch` reports only `main...origin/main [ahead 4]`)

Every present-tense claim below was verified live against SPEC.md, the repository, the running services and the database during this stocktake run. No code changes were made; test runs only wrote to gitignored build output.

---

## 1. Delivered and verified

### Account foundations (committed at `c49ae635`, accepted under Elder review)

| Area | State | Evidence |
| --- | --- | --- |
| Email-code signup / sign-in | Delivered and verified end to end (Mailpit-backed live flows) | 61 API + 11 web tests **re-run and passing live during this stocktake** (0 failures) |
| Microsoft SSO | Implemented, hardened (tenant-bound issuer validation, invitation-only org access, fail-closed SESSION_SECRET, base-path-aware callback) | Unit tests pass; **not live-verified** — no Entra credentials configured |
| Persisted resumable onboarding | Profile + organization creation, idempotent per-user key, transactional org/membership/audit creation | server-side idempotency + migration `1720000000005-OnboardingIdempotency` |
| Membership-aware routing & organization switching | Capabilities-guarded; single-use refresh rotation; revocation-vs-rotation races covered; invalid `activeOrgId` self-repairs | concurrency regressions in API suite |
| Role-specific dashboard shells | Partner / planner / client / admin / field shells with honest empty states | QA runs at acceptance (desktop + 390px) |
| Settings | Profile (name, contact, photo upload), preferences (locale/timezone), organization (name, country, default currency), security (sessions, logout, revoke-all) | live persistence smoke + browser proof at acceptance |
| Session security | Refresh-token families, sessionVersion, stale-tab/outage recovery, Web Locks cross-tab coordination | 11 web tests include concurrent-redemption and outage-retention cases |

Other hardening from the review loop, all covered by tests: membership privilege-escalation guards, last-owner atomicity, whitespace-validation, invitation audit-before-mail, Microsoft JIT enrollment removed, OIDC state sessions on Redis.

### Pre-existing (from earlier phases, before account foundations)

- **Public marketing website** — home + three audience pages, dark OMD navy theme, responsive; hosted at the temporary `/abonten` base path.
- **Inventory API** — substantial: site CRUD, face CRUD, metadata, rate cards, approval workflow (submit/approve/reject/suspend), PostGIS-aware (~508-line service). Seeded and exercised via API; **not yet surfaced as partner UI** beyond dashboard shells.
- **Marketplace API (read-only)** — lists approved sites with filters; no booking yet.
- **Platform-admin API** — site approval and reference-data surface (~149-line service).
- **Seed data** — 10 Lagos/Accra/Douala sites, 18 faces, 10 rate cards, 10 metadata records, 12 seeded users (idempotent).
- **Mobile app (Expo)** — navigation skeletons only (61 lines across four screens); see §2.

### Live verification during this stocktake

- API tests: **61 pass / 0 fail** (`pnpm --filter @abonten/api test`).
- Web tests: **11 pass / 0 fail** (`pnpm --filter @abonten/web test`).
- Published root renders the marketing site (browser check, HTTP 200).

---

## 2. Explicitly deferred per SPEC §5 / §7 / §10

These modules exist as **8-line stub services returning empty arrays** with wired controllers:

| Module | SPEC § | MVP/V1/V2 | Notes |
| --- | --- | --- | --- |
| Billboard inventory *management workflow* | 5.1 | MVP | Core CRUD exists; **bulk import (V1), spec-schema maturity, partner-facing UI surface** remain |
| Site metadata enrichment | 5.2 | V1 | Schema/seeded data exist; enrichment workflows (third-party import, POI) deferred |
| Media planning & campaign builder | 5.3 | MVP–V1 | Stub: `PlanningService.findAll(): string[]` |
| Proof of performance | 5.4 | MVP–V1 | Stub; schema (`pop_photos`, `proofs_of_performance`) ready, mobile POP capture is a skeleton |
| Client monitoring dashboard | 5.5 | MVP | Auth shell delivered; live campaign data/alerts deferred (nothing to show yet) |
| Booking | 5.6 | MVP | Stub; `bookings` table empty; quotes/multi-currency/FX deferred |
| Reporting & analytics | 5.7 | MVP–V1 | Stub; `report_definitions`/`report_runs` unused |
| Marketplace booking/commerce | 5.6 | MVP–V1 | Listing read-only; transaction/fee model V2 |

Also deferred (per prior runs): French localization depth, offline-first mobile sync, any marketing-copy remediation.

---

## 3. Current repo and runtime state

- **Repo:** HEAD `c49ae635` on `main`, clean tree, 4 commits ahead of `origin/main` (1d46c63, e58c8fc, dffd793, c49ae63). GitHub remote `OMG-WeCA/abonten` — **not pushed**.
- **Migrations:** 6 applied (init, platform-admin remediation, identity canonicalization, account foundations, refresh-token families, onboarding idempotency).
- **Infrastructure (docker compose):** Postgres+PostGIS, Redis, Mailpit, MinIO — all healthy just now after being freshly started; the doc's PostGIS schema (`postgis_postgis_16_3_4`) bearing tiger tables is intact.
- **Applications:** API (port 3000) and Web (port 3001) restarted this run with their normal commands; both return HTTP 200 (`/health` ok, `/sign-in` renders). Mailpit on 8025.
- **Retained data (live counts):** users 29 · organizations 14 · memberships 23 · sites 10 · faces 18 · rate cards 10 · audit logs 40 · refresh tokens 49 · **bookings 0 · campaigns 0 · POP 0**.
- **Published previews:** Web, API, Mailpit registered in the environment; web root verified serving. The long-standing cross-port fetch failure observed before is **not reproduced** — the environment now serves both ports normally.
- **One operational caveat:** the environment was found stopped at the start of this run (Worker restart) and both app processes needed a manual restart; the saved startup configuration only covers infrastructure auto-heal, so app processes need `pnpm start` after environment resumes.

---

## 4. Known limitations and open risks

1. **Microsoft SSO not live-verified.** Fully implemented with honest unavailable-state disclosure; end-to-end sign-in remains blocked on Entra credentials (tenant ID, client ID, client secret). Medium risk until one real sign-in round-trip is verified.
2. **Cross-port gateway history.** An earlier published-preview web→API fetch failure was attributed to gateway behavior; it did not reproduce this run, but a live *authenticated* published-browser session (not just page loads) has not been re-run after environment restarts. Low risk, worth one recheck next time verification runs.
3. **Environment processes do not auto-start.** API/web processes must be started manually after Worker/environment restarts (see §3). Saved startup config covers services.json metadata only.
4. **Main is 4 commits ahead of origin and unpushed.** No push has occurred; origin state does not reflect the milestone.
5. **Domain modules are honest stubs, not production paths.** Any dashboard surfaces claiming planning/booking/POP data intentionally show empty states; the code behind them is placeholder.
6. **No CI/CD or observability tooling yet** beyond tests and local infra (SPEC §8.5 NFRs unaddressed).

---

## 5. Recommended order for upcoming phases (derived from SPEC §10)

The MVP goal is "a working marketplace loop for a single market, proving the core value chain." The spec's own dependency order and what already exists suggest:

1. **MVP inventory workflow completion** — bulk approval UX for partners, spec capture against the *delivered* API, and honest partner-facing inventory UI. The API groundwork (§1 inventory service) is already the largest non-account module; surfacing it converts the seed data into a demoable flow. Includes the admin approval loop (§7.1).
2. **Marketplace + basic booking** — search/filters/map/availability on the existing readonly listing service, then `request → confirm → cancel` bookings against seeded single-currency rate cards (§5.6 MVP scope). This closes the marketplace loop.
3. **MVP POP: online photo capture per booked site/day** — depends on bookings; schema and field-app navigation skeleton already exist.
4. **Client dashboard with real data + basic alerts, then MVP reporting** — campaign status + POP gallery, then the simple delivery report with POP compliance. Reporting naturally lands last in MVP because it needs everything above.
5. **Release hygiene alongside the above:** push `main` to origin (origin is unpushed; the milestone exists only locally), decide on CI, and finally complete the Microsoft Entra credential setup to live-verify SSO.

V1 (bulk import, KPI engine, holds/blackouts/multi-currency, offline POP, French UI) and V2 follow only after MVP lands, per the cumulative roadmap.

---

## 6. Summary

**Where we are:** account foundations are done, committed, and live-verified (61 API + 11 web tests green today; runtime healthy; retained data intact). Infrastructure and the public site are in place. **Where we aren't:** every core advertising workflow — planning, booking, POP, monitoring, reporting — is an intentional stub, and inventory management has API depth but no product surface. **Risks worth tracking:** unpushed `main`, unverified Entra SSO, no auto-restart for app processes. **Recommended next:** MVP inventory surfacing → marketplace/booking → POP → client dashboard/reporting, per the spec's own MVP sequence.
