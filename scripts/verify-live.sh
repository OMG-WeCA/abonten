#!/usr/bin/env bash
# Local live verification for the S1/S2 rejected points (run on a machine with
# docker). Covers: (1) seed end-to-end, (2) migrations against PostGIS Postgres,
# (3) POST /orgs with allowedEmailDomains round-trip via a live HTTP request.
#
#   bash scripts/verify-live.sh
#
# Uses the docker-compose stack (postgis/postgis:16-3.4, redis, mailpit, minio).
set -e

API_URL="http://localhost:${API_PORT:-3000}/api"
MAILPIT_API="http://localhost:${MAILPIT_UI_PORT:-8025}/api/v1"
SEED_EMAIL="ama@accraoutdoor.com" # a seeded org_owner

echo "=== [1] docker compose up -d ==="
docker compose up -d
echo "Waiting for postgres..."
for i in $(seq 1 40); do
  if docker compose exec -T postgres pg_isready -U abonten >/dev/null 2>&1; then echo "postgres ready"; break; fi
  sleep 1
done

echo "=== [2] run seed (applies migrations, then upserts all seed data) ==="
pnpm --filter @abonten/api seed

echo "=== [3] verify migrations: tables + PostGIS extension ==="
docker compose exec -T postgres psql -U abonten -d abonten -c "\dt"
docker compose exec -T postgres psql -U abonten -d abonten -c "SELECT extname FROM pg_extension WHERE extname='postgis';"
docker compose exec -T postgres psql -U abonten -d abonten -c "SELECT code, city, latitude, longitude, status FROM billboard_sites ORDER BY code LIMIT 5;"

echo "=== [4] verify seed counts (all entities populated) ==="
docker compose exec -T postgres psql -U abonten -d abonten -c "
SELECT 'organizations' AS t, count(*) FROM organizations UNION ALL
SELECT 'users', count(*) FROM users UNION ALL
SELECT 'memberships', count(*) FROM memberships UNION ALL
SELECT 'capability_overrides', count(*) FROM user_capability_overrides UNION ALL
SELECT 'billboard_sites', count(*) FROM billboard_sites UNION ALL
SELECT 'site_faces', count(*) FROM site_faces UNION ALL
SELECT 'site_metadata', count(*) FROM site_metadata UNION ALL
SELECT 'rate_cards', count(*) FROM rate_cards UNION ALL
SELECT 'site_assets', count(*) FROM site_assets;"

echo "=== [5] verify allowedEmailDomains round-trips (text column, @Column('simple-array')) ==="
docker compose exec -T postgres psql -U abonten -d abonten -c "SELECT name, allowed_email_domains FROM organizations;"

echo "=== [6] POST /orgs with allowedEmailDomains (live HTTP) ==="
echo "Starting API..."
pnpm --filter @abonten/api start &
API_PID=$!
for i in $(seq 1 40); do
  if curl -sf "$API_URL/health" >/dev/null 2>&1; then echo "API ready"; break; fi
  sleep 1
done

echo "Requesting magic link for $SEED_EMAIL ..."
curl -s -X POST "$API_URL/auth/magic-link" -H 'Content-Type: application/json' -d "{\"email\":\"$SEED_EMAIL\"}"
sleep 3
# Fetch the magic-link email from Mailpit and extract the verify token.
MSG_ID=$(curl -s "$MAILPIT_API/messages?limit=1" | grep -oE '"ID":"[^"]+"' | head -1 | cut -d'"' -f4)
TOKEN=$(curl -s "$MAILPIT_API/message/$MSG_ID" | grep -oE 'token=[a-f0-9-]+' | head -1 | cut -d= -f2)
echo "magic-link token: $TOKEN"
VERIFY_LOC=$(curl -s -i "http://localhost:${API_PORT:-3000}/api/auth/magic-link/verify?token=$TOKEN" | grep -i '^location:' | sed 's/\r//')
ACCESS_TOKEN=$(echo "$VERIFY_LOC" | grep -oE 'accessToken=[^&]+' | cut -d= -f2)
echo "access token: ${ACCESS_TOKEN:0:20}..."

ORG_HEADER="X-Org-Id: 11111111-0000-4000-8000-000000000001" # Accra Outdoor (ama is org_owner)
echo "POST /orgs request:"
BODY='{"name":"Probe Outdoor","type":"media_partner","country":"Ghana","defaultCurrency":"GHS","allowedEmailDomains":["probe.example","staff.example"]}'
echo "  $BODY"
RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$API_URL/orgs" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H "$ORG_HEADER" -H 'Content-Type: application/json' -d "$BODY")
echo "POST /orgs response:"
echo "$RESP" | sed 's/HTTP_STATUS/\\nHTTP_STATUS/'

NEW_ORG_ID=$(echo "$RESP" | grep -oE '"id":"[a-f0-9-]+"' | head -1 | cut -d'"' -f4)
echo "Read it back via GET /orgs/me (allowedEmailDomains should round-trip):"
curl -s "$API_URL/orgs/me" -H "Authorization: Bearer $ACCESS_TOKEN" -H "$ORG_HEADER" | grep -o 'Probe Outdoor.*' | head -c 300
echo

kill $API_PID 2>/dev/null || true
echo "LIVE_VERIFY_DONE"