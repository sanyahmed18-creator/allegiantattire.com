#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Swap the new home page in (or roll it back).
#
#   ./tools/go-live.sh            → back up index.html, then publish home-v2.html
#   ./tools/go-live.sh --rollback → restore the previous index.html
#
# The current SPA page is never deleted: the first run copies it to
# index-spa-backup.html so `--rollback` can put it straight back.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${1:-}" == "--rollback" ]]; then
  [[ -f index-spa-backup.html ]] || { echo "No backup found — nothing to roll back."; exit 1; }
  cp index-spa-backup.html index.html
  echo "✔ Rolled back to the previous index.html"
  exit 0
fi

[[ -f home-v2.html ]] || { echo "home-v2.html is missing."; exit 1; }
[[ -f index-spa-backup.html ]] || cp index.html index-spa-backup.html
cp home-v2.html index.html
echo "✔ New home page published as index.html"
echo "  previous page kept at index-spa-backup.html (rollback: ./tools/go-live.sh --rollback)"
echo "  remember to deploy home-v2.css, home-v2.js and catalog.js alongside it."
