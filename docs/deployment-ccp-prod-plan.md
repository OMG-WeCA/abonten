# Abonten clean-production preparation for ccp-prod

Prepared against baseline main `59f70c4c68c97f0b513f099e926f4e157fd3a697`.
This is a proposal, not an applied deployment. The accompanying registration-map
fix uses the shared map provider; its OSM review mode remains development-only.
Select the reviewed release commit's actual image tag before building or deploying;
the example tag is a placeholder, not a release identifier.
No real values belong in these files. Do not copy the local review environment,
database, accounts, five Lagos sites, images or raster paths to production.

## Verified host conventions

Read-only inspection on 2026-09-30 found Ubuntu 24.04.4, x86_64, Docker 29.7.2,
Compose v5.5.0, 4 shared CPUs, approximately 6.8 GiB available RAM and 96 GiB
free disk. Recheck capacity and ports at deployment time; these are observations,
not resource reservations or an availability guarantee.

CCP is under `/home/Maestro/apps/ccp`. Traefik uses external Docker network
`traefik`, file-provider directory `/etc/traefik/dynamic`, host source directory
`/home/Maestro/apps/traefik/config/dynamic`, entrypoint `websecure` and resolver
`letsencrypt`. Existing HTTP-to-HTTPS redirection stays in place. Abonten was not
deployed during inspection. This plan uses `/home/Maestro/apps/abonten` as a new
operator-approved checkout destination; it does not touch CCP or other projects.

## Files and operational choices

Use the existing `compose.production.yml` plus `compose.ccp-prod.yml`.
The overlay creates the dedicated PostGIS/Redis stack and isolates backing
services on an internal network. Only API/web join Traefik. No database, Redis,
object storage or storage console port is published. Use loopback API 3302 and
web 3303 for local checks, subject to a fresh conflict check.

`compose.ccp-prod.minio.yml` is OPTIONAL and must be included explicitly only
after storage approval. Existing projects use MinIO, but no shared Abonten
bucket or credential was established. Choose either:

- Dedicated local MinIO, an approved immutable image, private `abonten-assets`
  bucket and an application key limited to object Get/Put/Delete and necessary
  bucket metadata operations for that bucket. Admin credentials never go to API.
- An approved managed S3-compatible service with the same private-bucket and
  restricted-key contract. Omit the MinIO overlay and supply its endpoint.

Local MinIO would use `S3_ENDPOINT=http://minio:9000`. Storage is accessed by
the API; browsers receive assets through authenticated API routes, not the
internal object endpoint. Internal container traffic is not TLS-encrypted by
this proposal. Public traffic uses HTTPS; confirm this internal-network trust
model and host/backup encryption requirements before deploying. No anonymous
bucket policy, public console or new object-storage public route is proposed.
Validate `mc ready local` exists and succeeds in the selected MinIO release;
the current dev image pattern uses it, but the production image is not selected.

PostGIS `16-3.4` matches repository integration CI. Redis `7-alpine` matches
CI. Resolve and record approved immutable digests at release time. Do not
silently deploy a new floating MinIO version or pull/build while approval is
pending. Existing API image includes GDAL on Node 24; the static web uses nginx.

The container limits total 3968 MiB without local MinIO, 4480 MiB with it,
and 2.5/3 shared CPUs respectively. They are ceilings, not reservations.
Start with one API process, bounded logs and no concurrent source-import/build
jobs. Redis uses 128 MiB maxmemory with no eviction; monitor memory because
refusing a write is safer than silently dropping sign-in attempt/rate limits.
Monitor Postgres, API/GDAL and Redis OOM/write failures and real service usage.
API imports may need a separately approved temporary resource adjustment.

Keep at least 30 GiB host disk free. Allow an initial 40 GiB planning budget
for new images, DB, media, raw sources and import scratch space; this is not an
enforced quota. Do not launch full-country PBF processing before estimating
scratch requirements. Start with authorized, bounded public reference imports.
The clean app may launch with no reference imports and must show unavailable
coverage truthfully. Backups must leave the host so the 96 GiB is not consumed
by retained copies. No new disk or retention policy has been provisioned.

## Approval and secure provisioning gates

Owner approval is still required for:

1. The `olom-dev` workspace envelope/scope `weca/abonten/prod`, without weakening
   its existing audit policy.
2. Three independent 32+ character signing/code keys: `JWT_SECRET`,
   `SESSION_SECRET`, `EMAIL_CODE_SECRET`.
3. Dedicated Postgres bootstrap credential plus a non-superuser `abonten_app`
   credential/`DATABASE_URL`; dedicated `REDIS_PASSWORD`/matching `REDIS_URL`.
4. Storage choice, private bucket, bootstrap administrator where applicable,
   and a separate least-privileged `S3_ACCESS_KEY`/`S3_SECRET_KEY`.
5. Approved SMTP provider, authenticated sender and SMTP credentials. Real SMTP,
   not Mailpit, is required for emailed sign-in codes. Azure SSO stays optional.
6. The Asiri server service account, device enrollment/trust and scoped policy
   below; no copied human credentials or broader other-app access.
7. The domain's HTTPS routing change using the existing Traefik resolver.

Peter supplies the A record. A reusable Mapbox public token was not found in
the checked local WeCA config or `olom-dev` metadata. Peter must identify or
provide it securely, including allowed URL `https://abonten.omgwca.com`.
`NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is public build configuration, but keep entry
in the approved provisioning flow. No production OSM review fallback is enabled.
The token, API URL and base path are frozen into the static web build.

`.env.ccp-prod.example` records only variable names/nonsecret defaults. Store
real values in Asiri through the supported user-controlled secure flow, not a
populated `.env` file, chat, command argv, tool output or Git. Username/password
components in DATABASE_URL/REDIS_URL must be URL-encoded. Redis's local config
accepts a provisioned URL-safe `[A-Za-z0-9_-]` password of at least 32 characters.
Docker environment injection leaves runtime values accessible to authorized
host/Docker administrators; it does not protect against host compromise.

## Practical Asiri handoff (documented commands; NOT executed)

Local CLI help and the installed Asiri skill support the commands below.
The current server `asiri workspace list` returned HTTP 401. Do not overwrite
its existing state, log in with `--force`, delete keys or copy Mac credentials.
The owner can refresh the existing session using `asiri login` WITHOUT force
if that is the intended identity. For this application, prefer a new isolated
service-account state so existing app access is preserved.

On Peter's already trusted Mac, AFTER action-time approval, create the account
and exact-scope inject-only policy:

```sh
asiri service-account create --workspace olom-dev --slug abonten-ccp-prod --name "Abonten production on ccp-prod"
asiri service-account grant --workspace olom-dev --service-account abonten-ccp-prod --scope weca/abonten/prod --secret '*' --inject-only
```

The installed CLI has no `envelope` subcommand. Owner/admin must configure or
confirm the envelope in the supported dashboard and preserve audit mode. Check
the policy metadata confirms this scope only before runtime use. Secret entry
and any credential-generation/submission steps belong to Peter in the secure
UI or an approved private stdin/value-file workflow. CLI forms are:

```sh
# USER ONLY: real values enter via private stdin or a controlled source file.
asiri add --workspace olom-dev weca/abonten/prod/SECRET_NAME --stdin
asiri push --workspace olom-dev --scope weca/abonten/prod --dry-run
asiri push --workspace olom-dev --scope weca/abonten/prod
```

After explicit approval, the server uses a NEW isolated state directory,
not a repair of its existing install. Verify it is new before initializing.
Owner takes over browser approval and any credential entry; the agent must not
complete enrollment approval or handle secret values.

```sh
export ASIRI_HOME="$HOME/.local/share/asiri-abonten-prod"
asiri init --device abonten-ccp-prod --kind server
asiri service-account login --workspace olom-dev --service-account abonten-ccp-prod
asiri whoami
```

The login creates an owner/admin approval link (default origin `https://asiri.dev`).
If separate device trust is requested, `asiri device trust --workspace olom-dev`
starts another explicit browser approval. If allowed secrets are not wrapped
to the approved trusted server device, Peter runs `asiri rewrap --workspace
olom-dev` from his trusted Mac. Rewrap is itself an approval-controlled access
change; confirm intended recipients before doing it. The server then uses:

```sh
asiri pull --workspace olom-dev
asiri env --workspace olom-dev --label abonten-prod weca/abonten/prod -- <approved-command>
```

Inspect only identity/policy/secret metadata, never raw reads or environment
dumps. Strict audit failure is a hard stop. The precise secure secret-entry UI
and envelope settings must be completed by the owner; CLI help alone cannot
confirm those dashboard controls. No login/trust/policy mutation occurred here.

## Deployment checklist (only after gates)

- [ ] Confirm approval, secure provisioning, sender, storage choice, backup
      location/encryption/retention, first real operator email and incident owner.
- [ ] Confirm DNS points to ccp-prod, disk/RAM headroom, 3302/3303 unused and
      `traefik` network present. Preserve all existing routes and service stacks.
- [ ] Use reviewed exact revision and green CI. CI builds images but does not
      publish them. Choose approved server build or separately authorized registry
      publication; never tag this uncommitted draft as the reviewed main image.
- [ ] Check injected URLs, role identities and storage configuration WITHOUT
      printing values or expanded Compose config. Every Compose invocation uses
      `--env-file /dev/null` to avoid accidentally loading development settings.
- [ ] Start only the dedicated backing services. PostGIS initializes the
      extension through existing init SQL. Securely create the non-superuser
      application/migration role, owning its schema/tables; grant only required DB
      and schema privileges. Keep bootstrap superuser credentials out of API.
      This secure role-provisioning step is gated, not automated by this draft.
- [ ] If MinIO selected, create private bucket and restricted app identity in
      the approved secure admin flow before API startup; no anonymous policy.
- [ ] Back up initialized target and verify restore. Run versioned migrations
      BEFORE starting the API. Do not run `seed`, synchronize, migration revert or
      restore the Mac demo DB. A fresh DB has no demo inventory/accounts/photos.
- [ ] Start API/web, then verify local health, SMTP code delivery, normal real
      onboarding, Mapbox tiles, asset upload/read/delete via app and tenant denials.
- [ ] Apply only the approved new Traefik file. Preserve `/api`; API router
      priority 200 beats web priority 100. Do not rewrite `/api` away. Public app
      API_BASE_URL/WEB_BASE_URL/NEXT_PUBLIC_API_BASE_URL are the same origin;
      NEXT_PUBLIC_BASE_PATH is empty. API `/health` stays a local check.
- [ ] Verify HTTPS certificate and public sign-in, inventory, tiles and assets;
      confirm no local demo records, no public backing ports and other CCP routes
      still work. Do not bypass certificate warnings or protections.
- [ ] Schedule separately approved public reference imports with checksums,
      source versions/licenses and coverage bounds, using durable enrichment paths
      shared by API and one-off import container. Do not import fake traffic/views.

Illustrative commands, only within approved Asiri injection after provisioning
and selection of an actual approved revision/tag (base + overlay):

```sh
docker compose --env-file /dev/null -f compose.production.yml -f compose.ccp-prod.yml config --quiet
docker compose --env-file /dev/null -f compose.production.yml -f compose.ccp-prod.yml build
docker compose --env-file /dev/null -f compose.production.yml -f compose.ccp-prod.yml up -d postgres redis
# Secure role and bucket provisioning plus verified backup happen here.
docker compose --env-file /dev/null -f compose.production.yml -f compose.ccp-prod.yml run --rm --no-deps api node dist/migrate.js run
docker compose --env-file /dev/null -f compose.production.yml -f compose.ccp-prod.yml up -d --no-build api web
curl --fail http://127.0.0.1:3302/health
curl --fail http://127.0.0.1:3303/_container/health
```

If local MinIO is approved, append `-f compose.ccp-prod.minio.yml` consistently
and start `minio` with the backing services. Backup/post-provisioning checks
must pass before the API migration/start. The raw illustrated commands are
not permission to execute them now. Never use `config` without `--quiet` with
real injected credentials, `printenv`, `set -x`, `--unsafe-argv` or secret dumps.

## Backup, migration and rollback

Separate volumes under project `abonten-prod`: `abonten_pgdata`,
`abonten_redisdata`, optional `abonten_objectdata`, existing `abonten_enrichment`.
The API is the node image user; verify `/app/var/enrichment` is writable by that
user before imports. DB raster references point at that exact container path.
Take consistent Postgres logical backups plus referenced enrichment files and
object storage snapshots/backups to approved encrypted off-host storage. Pause
writes/imports for a coordinated snapshot or use a tested consistent recovery
procedure. Record source hashes, image digests, migration state and restore
commands. Redis authentication state can be transient; restoring old email-code
TTL state must not reactivate expired codes. Test recovery in an isolated stack,
not over the live DB; backups alone do not establish recoverability.

For a later update, retain the previous API/web image tags and previous Abonten
Traefik file. Roll back application images to the previous reviewed compatible
revision, retaining additive schema and all volumes. Do not run migration revert
on a DB with writes. A first release has no previous app tag: withdraw only the
new Abonten route/stop only its API/web while preserving volumes and all other
projects. Restoring a DB is a separate explicit data-recovery decision with
known data-loss implications. No `down -v`, volume removal or destructive cleanup.

The root runbook's statement that all Part 2/3 context is unimplemented is stale:
descriptive NG/GH geographic context is implemented in the reviewed revision;
booking/audience/reach/traffic measurement is still unavailable. Release copy
and verification must reflect that distinction without claiming ad views.
