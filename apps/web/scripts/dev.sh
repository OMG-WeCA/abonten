#!/usr/bin/env bash
set -euo pipefail

# Local configuration names an Asiri record, never its value. Other developers
# can run without it and use the coordinate fallback.
if [[ -f ../../.env ]]; then
  set -a
  source ../../.env
  set +a
fi

if [[ -n "${ABONTEN_MAPBOX_ASIRI_WORKSPACE:-}" && -n "${ABONTEN_MAPBOX_ASIRI_SECRET:-}" ]]; then
  exec asiri env \
    --workspace "$ABONTEN_MAPBOX_ASIRI_WORKSPACE" \
    --label abonten-local-map \
    "$ABONTEN_MAPBOX_ASIRI_SECRET" \
    -- bash -c 'export NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN="${MAPBOX_DEFAULT:?Mapbox token missing from Asiri environment}"; exec next dev -p 3001'
fi

exec next dev -p 3001
