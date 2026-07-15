# AGENTS.md — Guidance for AI Agents Working on Abonten

> **Read [`SPEC.md`](./SPEC.md) before starting any work on this repository.**
> It is the authoritative product specification (vision, roles, modules, data model,
> workflows, NFRs, architecture, roadmap, glossary). Do not implement, refactor, or
> propose features that contradict it. If the spec is wrong or stale, **open a change to
> `SPEC.md` first**, then align the code.

## 1. What is Abonten?

Abonten is a multi-tenant **outdoor advertising (OOH) planning, booking, and measurement
platform** for the West & Central Africa (WeCA) market, aligned with **OMG WeCA**
(Omnicom Media Group West & Central Africa). It connects three stakeholder groups:

- **Media Partners** — register and publish billboard inventory.
- **Media Buyers / Planners** — discover inventory, plan campaigns with KPI estimates, and book.
- **Clients / Advertisers** — monitor live campaigns and daily proof of performance.

See `SPEC.md` §1–§4 for the full vision, market context, and personas.

## 2. Repository status

This repository is in the **spec / project-initialization phase**. There is intentionally:

- **No application code** yet.
- **No dependency manifests** (no `package.json`, `pyproject.toml`, `requirements.txt`, etc.).
- **No build or run commands.**

Do not scaffold application code, install dependencies, or create manifests unless a task
explicitly asks you to begin an implementation phase. When implementation begins, follow
`SPEC.md` §9 (Technical Architecture Direction) and §10 (Phased Delivery Roadmap), and work
in the smallest phase-appropriate slice.

## 3. Coding conventions (apply once code exists)

These conventions govern all future code. Adopt them at the first implementation commit and
keep them consistent.

- **Language & style:** TypeScript end-to-end is the recommended direction (`SPEC.md` §9
  option A). Use strict typing; no `any` without a justifying comment. Format with the
  project's linter/formatter (e.g., Prettier + ESLint) — do not introduce a second style.
- **API-first:** every feature is exposed through a versioned, OpenAPI-documented API. UIs and
  integrations consume the same API; no privileged UI-only paths.
- **Monorepo / bounded contexts:** organize by module (`identity`, `inventory`, `planning`,
  `booking`, `pop`, `monitoring`, `marketplace`, `reporting`, `platform-admin`, plus shared
  `core`/`contracts`). Start as a modular monolith; extract services only when load demands.
- **Data:** PostgreSQL with PostGIS for spatial data. Migrations are versioned code and must be
  reversible. Never store media in the database — use object storage.
- **Multi-tenant safety:** every query is scoped by organization/tenant. Enforce RBAC
  server-side on every request. Marketplace listings are the only intentionally shared data.
- **Audit:** material actions write to the append-only audit log. POP records are immutable once
  synced; corrections are appended, never overwritten (`SPEC.md` §5.4, §6.5).
- **Offline-first:** field POP capture and map tiles must degrade gracefully under low/no
  connectivity. Use optimistic UI, clear sync state, and conflict-free merges.
- **Localization:** store timestamps in UTC; format per user locale. English + French at launch.
  Multi-currency throughout (NGN, GHS, XAF, XOF, USD, EUR) with FX ref captured at quote time.
- **Tests:** add unit tests for domain logic and integration tests for API endpoints. Spatial,
  booking-conflict, and POP-sync logic are high-risk and must be covered.
- **Commits:** small, focused, with a clear message. Reference the `SPEC.md` section or roadmap
  phase your change implements.

## 4. Project structure (target layout)

Not scaffolded yet. When implementation begins, aim for:

```
abonten/
├─ SPEC.md                 # authoritative product spec (this repo's source of truth)
├─ AGENTS.md               # this file
├─ .gitignore
├─ apps/
│  ├─ api/                 # NestJS (or chosen backend) API
│  ├─ web/                 # Next.js planner/admin/client dashboards
│  └─ mobile/              # React Native (Expo) field + client app
├─ packages/
│  ├─ contracts/           # shared types generated from OpenAPI
│  ├─ core/                # shared domain primitives
│  └─ ui/                  # shared component library (if applicable)
├─ migrations/             # versioned DB migrations
└─ docs/                   # supporting docs, ADRs, diagrams
```

Deviate from this layout only with a documented reason in the PR/commit.

## 5. Workflow notes for agents

1. **Start with the spec.** Read `SPEC.md` end-to-end. Map the requested task to a section and a
   roadmap phase (MVP/V1/V2). If a task touches multiple phases, do the earliest phase first.
2. **Inspect before changing.** Reuse existing patterns and module boundaries. Do not duplicate
   logic across contexts.
3. **Smallest complete slice.** Ship one vertically complete feature (e.g., site registration →
   approval → listing) rather than broad horizontal layers.
4. **Preserve tenant and audit invariants.** Any new entity must be tenant-scoped and must write
   audit entries for material changes.
5. **Verify before claiming done.** Run lint, type-check, and tests. For API changes, exercise
   the endpoint (and a negative case). For POP/booking logic, add or extend tests.
6. **Update the spec when reality diverges.** If you discover a missing entity, a wrong
   workflow, or an unclear requirement, update `SPEC.md` (and this file if conventions change)
   in the same change set.
7. **Do not commit secrets.** Use environment variables and the secret store; never hardcode
   credentials. `.gitignore` already excludes common secret/env patterns.

## 6. Things to never do without explicit instruction

- Do not create a branch or managed worktree unless asked; work on the existing checkout.
- Do not install dependencies or scaffold manifests in the spec phase.
- Do not bypass tenant isolation or RBAC, even for "quick" admin features.
- Do not delete or overwrite historical POP or audit records.
- Do not introduce a second language, framework, or styling system without a documented decision.

## 7. Seed Data

Seed data is **first-class** — every new feature should ship with seed data so devs can
immediately see and test it with a populated database.

### Where seed files live

- `apps/api/src/seed/` — organized by domain:
  `organizations.seed.ts`, `users.seed.ts`, `memberships.seed.ts`,
  `capability-overrides.seed.ts`, `billboard-sites.seed.ts`, `site-faces.seed.ts`,
  `site-metadata.seed.ts`.
- `seed-ids.ts` — deterministic UUIDs for idempotent upserts and stable cross-references.
- `index.ts` — the orchestrator that runs all seeders in dependency order.

### How to run

```sh
docker compose up -d          # PostgreSQL+PostGIS, Redis, MinIO, Mailpit
pnpm seed                      # or: pnpm --filter @abonten/api seed
```

The seed connects to `DATABASE_URL` (default: the docker-compose Postgres). It uses
`synchronize: true` (dev only) to auto-create tables from entities, then upserts all
seed data. It is **idempotent** — safe to re-run after schema or seed changes.

If the DB isn't running, the seed fails gracefully with a clear error and exit code 1
(no stack-trace crash).

### Seeded users for testing

| Email | Role | Org |
| --- | --- | --- |
| `ama@accraoutdoor.com` | org_owner | Accra Outdoor Media (media_partner) |
| `kwame@accraoutdoor.com` | inventory_manager | Accra Outdoor Media |
| `akosua@accraoutdoor.com` | field_operator | Accra Outdoor Media |
| `chidi@mediareach.com` | org_owner | mediaReach OMD Lagos (agency) |
| `aisha@mediareach.com` | planner | mediaReach OMD Lagos |
| `emeka@mediareach.com` | planner_admin | mediaReach OMD Lagos |
| `funke@unilever.com` | org_owner | Unilever West Africa (brand) |
| `tunde@unilever.com` | client_admin | Unilever West Africa |
| `ngozi@unilever.com` | client_viewer | Unilever West Africa |
| `seyi@omg-weca.com` | org_owner | OMG WeCA (platform) |
| `adaora@omg-weca.com` | platform_admin | OMG WeCA |

Capability overrides: `akosua` (field_operator) is granted `REPORT_VIEW`;
`kwame` (inventory_manager) has `INVENTORY_DELETE` revoked.

10 billboard sites across Lagos, Accra, and Douala with realistic lat/long, formats
(static, digital_led, 3d), illumination, and statuses. 13 site faces, 4 site metadata
records (traffic, visibility, audience, POI).

### Convention for adding new seed data

When a feature adds or changes entities:
1. **Create or update** the relevant `seed/<domain>.seed.ts` file (or create a new one).
2. **Follow the existing idempotent pattern**: use deterministic UUIDs from `seed-ids.ts`
   and `repo.save(repo.create({...id, ...fields}))` (upsert by primary key). For PostGIS
   geometry columns, use `createQueryBuilder` with `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`.
3. **Add new entities** to the orchestrator `index.ts` in **dependency order**
   (parents before children). Also register them in `database.module.ts` and the seed's
   `DataSource` entities array.
4. **Seed data should be realistic** and cover the WeCA market context (Nigeria, Ghana,
   Cameroon; real street names, plausible traffic counts, local currencies).
5. **Run `pnpm seed`** to verify it works, then `pnpm build && pnpm type-check && pnpm lint`
   to ensure the seed type-checks and lints clean.