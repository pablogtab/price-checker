#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec 9>.deploy.lock
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }
docker compose -f compose.prod.yaml config --quiet
docker compose -f compose.prod.yaml build
docker compose -f compose.prod.yaml up -d --wait --wait-timeout 180
docker compose -f compose.prod.yaml exec -T api node -e 'fetch("http://localhost:3215/api/settings").then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))'
