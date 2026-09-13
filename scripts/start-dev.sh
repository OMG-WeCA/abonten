#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${TMPDIR:-/tmp}/abonten-dev"
mkdir -p "$RUNTIME_DIR"
cd "$ROOT_DIR"

exec 9>"$RUNTIME_DIR/start.lock"
if ! flock -n 9; then
  echo "Abonten startup is already in progress."
  exit 0
fi

url_is_ready() {
  local url="$1"
  local require_success="$2"
  local curl_args=(--silent --output /dev/null --max-time 2)

  if [[ "$require_success" == "true" ]]; then
    curl_args+=(--fail)
  fi

  curl "${curl_args[@]}" "$url"
}

wait_for_url() {
  local url="$1"
  local require_success="$2"
  local attempts="${3:-60}"
  local i

  for ((i = 1; i <= attempts; i += 1)); do
    if url_is_ready "$url" "$require_success"; then
      return 0
    fi
    sleep 1
  done

  return 1
}

ensure_docker() {
  if docker info >/dev/null 2>&1; then
    return
  fi

  echo "Starting Docker..."
  nohup bash -c 'exec 9>&-; exec dockerd' >"$RUNTIME_DIR/dockerd.log" 2>&1 &
  echo "$!" >"$RUNTIME_DIR/dockerd.pid"

  local i
  for i in $(seq 1 30); do
    if docker info >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done

  echo "Docker did not become ready. See $RUNTIME_DIR/dockerd.log" >&2
  return 1
}

start_app() {
  local name="$1"
  local port="$2"
  local health_url="$3"
  local require_success="$4"
  shift 4

  if url_is_ready "$health_url" "$require_success"; then
    echo "$name is already running on port $port."
    return
  fi

  if ss -ltn "sport = :$port" | grep -q LISTEN; then
    echo "Port $port is occupied, but $name did not pass its readiness check." >&2
    return 1
  fi

  echo "Starting $name..."
  nohup setsid bash -c 'exec 9>&-; exec "$@"' bash "$@" >"$RUNTIME_DIR/$name.log" 2>&1 &
  echo "$!" >"$RUNTIME_DIR/$name.pid"

  if ! wait_for_url "$health_url" "$require_success" 90; then
    echo "$name did not become ready. See $RUNTIME_DIR/$name.log" >&2
    return 1
  fi

  echo "$name is ready on port $port."
}

if [[ ! -x node_modules/.bin/turbo ]]; then
  pnpm install --frozen-lockfile
fi

ensure_docker
docker compose up -d --wait
pnpm db:migrate

start_app api 3000 http://127.0.0.1:3000/health true \
  pnpm --filter @abonten/api dev
# Verify the configured home page; HTTP errors must fail readiness.
start_app web 3001 "http://127.0.0.1:3001${NEXT_PUBLIC_BASE_PATH:-}/" true \
  env WEB_ALLOWED_DEV_ORIGINS="*.preview.ginshiki.olom.dev" pnpm --filter @abonten/web dev

echo "Abonten is running. Logs: $RUNTIME_DIR"
