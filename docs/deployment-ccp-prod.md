# Abonten release preparation for ccp-prod

This repository can package the API and the static web app as separate containers. `compose.production.yml` binds both to loopback ports by default; ccp-prod's TLS ingress must route the public web and API URLs to those ports, or the bind address must be set for its network layout. PostgreSQL with PostGIS, Redis, S3-compatible storage, and SMTP remain external services. The development `docker-compose.yml` is not a production stack.

## Release gate

1. Use a specific reviewed Git revision. Its CI run must pass lint, type checks, unit and integration tests, both app builds, and both container builds. A local green check does not substitute for the first CI run.
2. Confirm the release scope. Inventory capture, provenance, audit, demo labels, partner detail, and map are the current Part 1 slice. Booking availability/conflict checks and Part 2/3 audience context and estimates remain unimplemented. The marketing copy review was deferred by operator decision; review the public pages before making live product claims.
3. Decide the public web and API URLs, ingress routing, free bind ports, and any web path prefix. `API_BASE_URL` is the public API origin; `WEB_BASE_URL` is the public web origin. `NEXT_PUBLIC_API_BASE_URL` must point to the same API origin. If the web is served below a path, set `NEXT_PUBLIC_BASE_PATH` before building and preserve that path at ingress.
4. Provision distinct 32+ character JWT, OIDC session, and email-code secrets; a production PostgreSQL/PostGIS database; Redis; an existing S3 bucket and key pair; and working SMTP. Supply them through Asiri or ccp-prod's secret injection. The names and shape are in `.env.production.example`. The API now refuses to start in production when a required service setting is absent.
5. Use a dedicated public Mapbox `pk.` token with URL restrictions covering the chosen web URL. It is embedded in the static web build, so changing it requires a rebuild. Check tile loading in the browser; a successful container health check cannot prove Mapbox authorization.
6. Back up the target database and verify the restore path. Determine whether migration `PartOneInventoryTrust1720000000007` has already run. For a fresh migration, only the ten fixed seed metadata IDs become `demo`; partner metadata retains `production`. If an older copy of that migration already ran, inspect all `demo` rows outside those seed IDs before release. Do not relabel them automatically because some may be intentional demo records. This query lists rows needing review after the column exists:

   ```sql
   SELECT id, site_id, dimension, source, created_at
   FROM site_metadata
   WHERE data_class = 'demo'
     AND id NOT IN (
       SELECT ('77777777-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
       FROM generate_series(1, 10) AS n
     );
   ```

## Release sequence

Run these commands on ccp-prod only after the gate above. Export the required values into the shell from the approved secret source; do not save a populated environment file or put values in Git. `--env-file /dev/null` prevents Compose from silently loading a local development `.env`. The Compose file fails when required values are missing.

```sh
export ABONTEN_IMAGE_TAG="$(git rev-parse --short=12 HEAD)"
docker compose --env-file /dev/null -f compose.production.yml config --quiet
docker compose --env-file /dev/null -f compose.production.yml build
docker compose --env-file /dev/null -f compose.production.yml run --rm --no-deps api node dist/migrate.js run
docker compose --env-file /dev/null -f compose.production.yml up -d --no-build
docker compose --env-file /dev/null -f compose.production.yml ps
```

Verify the API `/health` endpoint, web home and sign-in, a media partner's inventory list and existing site detail, metadata provenance and demo labels, map tiles, and an authorized asset upload followed by retrieval from object storage. Check an unauthorized or cross-organization read stays denied. Only then shift ingress traffic. The container health checks show process availability; these browser and data checks establish the user-visible result.

## Rollback

Retain the previous image tag. If the new revision fails after traffic moves, restore the previous tag and run `docker compose --env-file /dev/null -f compose.production.yml up -d --no-build`, then check the same key routes. The Part 1 migration is additive, so leave it applied during an application rollback. Restore a database backup only under a separate data-recovery decision; do not run migration revert on a database that has received live writes. Rebuild web whenever public URL, path prefix, or Mapbox token changes.
