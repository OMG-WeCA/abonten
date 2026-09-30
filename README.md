# Abonten

Outdoor advertising planning, booking, and measurement platform for OMG WeCA
(West & Central Africa). See [`SPEC.md`](./SPEC.md) for the authoritative product
specification and [`AGENTS.md`](./AGENTS.md) for agent guidance.

## Monorepo layout

- `apps/api` — NestJS API (TypeScript, TypeORM + PostgreSQL/PostGIS, Redis, Swagger)
- `apps/web` — Next.js web app (App Router, Tailwind CSS)
- `apps/mobile` — Expo / React Native app (expo-router, offline-first scaffolding)
- `packages/contracts` — shared TypeScript types/DTOs from SPEC.md §6
- `packages/config` — shared tsconfig / eslint / prettier config
- `packages/ui` — shared UI components (starter)

## Getting started

```sh
pnpm install
./scripts/start-dev.sh # dependencies, migrations, API, and web
```

The startup script is safe to run again: it reuses healthy dependency containers and app
processes, then applies pending migrations. Logs and PID files stay outside the repository
under `/tmp/abonten-dev`.

TypeORM synchronization is disabled in every environment. To populate a new local database
with sample organizations, users, and inventory, run `pnpm seed` once; the seed command
applies migrations before its idempotent upserts.

- API health: `http://localhost:3000/health`
- Swagger: `http://localhost:3000/api/docs`
- Web: `http://localhost:3001`

Web routing defaults to `/`. For subpath hosting, set `NEXT_PUBLIC_BASE_PATH` to a
leading-slash path without a trailing slash before starting or building the app.
Navigation, images, and the Microsoft sign-in return route use the same prefix.

Build & checks:

```sh
pnpm build        # turbo build across all packages
pnpm type-check   # tsc --noEmit across all packages
pnpm lint
```

## Production packaging

The API and static web app have separate container targets and a production Compose
template. The template uses external PostgreSQL/PostGIS, Redis, S3-compatible storage,
SMTP, and a TLS reverse proxy. It binds app ports to loopback only. See
[`docs/deployment-ccp-prod.md`](./docs/deployment-ccp-prod.md) for the release gate,
configuration, migration order, smoke checks, and rollback. The development Compose
file above is for local dependencies only.

## Email sign-in

The passwordless email flow uses `POST /api/auth/email-code/request` followed by
`POST /api/auth/email-code/verify`. The request endpoint always returns the same
acceptance response for a valid email-shaped input. Codes are six digits, expire after
10 minutes by default, are stored as keyed hashes in Redis, and can only be used once.
Set a distinct 32+ character `EMAIL_CODE_SECRET` in production; the development default
uses the JWT secret only for local convenience. SMTP connection, greeting, socket, and
overall delivery deadlines are configurable; see [`.env.example`](./.env.example).

Organization invitations persist membership before attempting code delivery. The invite
response reports `membership.change` (`created` or `unchanged`) separately from
`delivery.status` (`sent` or `failed`). If delivery fails, repeat the same
`POST /api/orgs/:orgId/invite` request with the same role after the reported rate limit or
mail outage clears. That retry never changes an active role or reactivates revoked access;
role changes use the membership endpoint, while revoked access requires explicit
administrative restoration rather than an invitation retry.

Maintained infrastructure integration checks run the shipped authentication Lua and identity
migration against disposable test keys/schemas (they never flush Redis or reset the database):

```sh
REDIS_INTEGRATION_URL=redis://localhost:6379 pnpm --filter @abonten/api test:integration:redis
POSTGRES_INTEGRATION_URL=postgresql://abonten:abonten@localhost:5432/abonten \
  pnpm --filter @abonten/api test:integration:postgres
```

## Tooling

pnpm workspaces + Turborepo; strict TypeScript everywhere; latest stable versions.
## Geographic context (Nigeria and Ghana)

The site detail page includes production-only road, administrative-area, mapped POI,
modelled resident population, and observed-traffic context. Unknown data stays unknown;
these metrics are not audience, reach, impressions, or footfall.

See [the operator import guide](docs/enrichment-imports.md) for official source URLs,
source licences, validated manifests, CLI commands, and adding another country.
Run `pnpm --filter @abonten/api enrichment:import sources` to inspect the registry.
Imports require PostGIS and GDAL; the API container includes GDAL and its durable
`ENRICHMENT_DATA_DIR` must be shared with the operator import process.
The normal seed creates explicitly labelled synthetic reference examples only;
they never appear in production context. No live datasets are committed to the repo.

Run `POSTGRES_INTEGRATION_URL=... pnpm --filter @abonten/api test:integration:enrichment`
against a disposable PostGIS database to exercise metre distances, raster NoData and
partial coverage, import replay/rollback, and demo isolation. Unit/API checks run in `pnpm test`.
