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