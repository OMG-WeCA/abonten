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
docker compose up -d        # PostgreSQL+PostGIS, Redis, MinIO
pnpm dev                    # turbo runs all dev servers
```

- API health: `http://localhost:3000/health`
- Swagger: `http://localhost:3000/api/docs`
- Web: `http://localhost:3001`

Build & checks:

```sh
pnpm build        # turbo build across all packages
pnpm type-check   # tsc --noEmit across all packages
pnpm lint
```

## Tooling

pnpm workspaces + Turborepo; strict TypeScript everywhere; latest stable versions.
