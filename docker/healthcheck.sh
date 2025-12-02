#!/usr/bin/env bash
set -eo pipefail

PORT="${PORT:-3333}"
BASE_URL="http://127.0.0.1:${PORT}"

# Check backend + database via settings endpoint
curl -fsS --max-time 5 "${BASE_URL}/api/settings" >/dev/null
