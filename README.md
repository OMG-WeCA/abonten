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
docker compose up -d --wait # start services and wait for their health checks
pnpm db:migrate             # create/update the schema from versioned migrations
pnpm dev                    # turbo runs all dev servers
```

TypeORM synchronization is disabled in every environment, so run `pnpm db:migrate`
before the first development start and after pulling new migrations. To populate the
local database with sample organizations, users, and inventory as well, run `pnpm seed`
instead; the seed command applies migrations before its idempotent upserts.

- API health: `http://localhost:3000/health`
- Swagger: `http://localhost:3000/api/docs`
- Web: `http://localhost:3001`

Build & checks:

```sh
pnpm build        # turbo build across all packages
pnpm type-check   # tsc --noEmit across all packages
pnpm lint
```

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
