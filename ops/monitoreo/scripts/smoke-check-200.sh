#!/usr/bin/env bash
set -euo pipefail

URL="${1:-${CHECK_URL:-http://127.0.0.1:5001/test-db-connection}}"

status_code="$(curl -s -o /dev/null -w '%{http_code}' "$URL")"

if [[ "$status_code" == "200" ]]; then
  echo "OK $URL"
  exit 0
fi

echo "FAIL $URL -> HTTP $status_code" >&2
exit 1
