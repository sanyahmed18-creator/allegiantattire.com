#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Publish the new home page (or roll back).
#
#   ./tools/go-live.sh            → index.html becomes the new home page
#   ./tools/go-live.sh --rollback → put the previous page back
#
# The existing single-page app (Design Lab, admin, product pages) is never
# thrown away: on the first run it is copied to spa.html, so every feature
# stays reachable at /spa.html while the new home page takes "/".
#
# Files that must be deployed next to index.html:
#   home-v2.css · home-v2.js · catalog.js · logo.png · spa.html
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${1:-}" == "--rollback" ]]; then
  [[ -f index-spa-backup.html ]] || { echo "No backup found — nothing to roll back."; exit 1; }
  cp index-spa-backup.html index.html
  rm -f spa.html
  echo "✔ Rolled back. index.html is the previous page again."
  exit 0
fi

[[ -f home-v2.html ]] || { echo "home-v2.html is missing."; exit 1; }

if [[ ! -f index-spa-backup.html ]]; then
  cp index.html index-spa-backup.html     # first run: remember the original
  cp index.html spa.html                  # …and keep it reachable at /spa.html
  echo "· existing app kept at spa.html (Design Lab, admin, product pages)"
fi

cp home-v2.html index.html
echo "✔ New home page published as index.html"
echo "  rollback: ./tools/go-live.sh --rollback"
echo "  deploy alongside it: home-v2.css home-v2.js catalog.js logo.png spa.html"
