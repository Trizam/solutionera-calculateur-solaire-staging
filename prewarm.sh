#!/usr/bin/env bash
# Pré-warm Fastly/GitHub Pages (+ optionnel jsDelivr) avant un webinar.
# Usage: ./prewarm.sh
set -euo pipefail

PRIMARY="${PRIMARY:-https://trizam.github.io/solutionera-calculateur-solaire-staging}"
JSD="${JSD:-https://cdn.jsdelivr.net/gh/Trizam/solutionera-calculateur-solaire-staging@master}"
FAIL=0

hit() {
  local label="$1" url="$2"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" -L --max-time 30 "$url" || echo "000")
  printf "%s  %s  %s\n" "$code" "$label" "$url"
  if [[ "$code" != "200" && "$code" != "304" ]]; then
    FAIL=1
  fi
}

echo "== Primary (GH Pages / Fastly, max-age≈600) =="
hit "index/"   "$PRIMARY/"
hit "index"    "$PRIMARY/index.html"
hit "css"      "$PRIMARY/assets/styles.css"
hit "js"       "$PRIMARY/assets/app.js"
hit "grid"     "$PRIMARY/assets/quebec-full-grid.json"
hit "favicon"  "$PRIMARY/favicon.ico"
hit "favicon.png" "$PRIMARY/favicon.png"

echo
echo "== jsDelivr (assets only; index.html = text/plain, not a UI mirror) =="
hit "jsd-index" "$JSD/index.html"
hit "jsd-css"   "$JSD/assets/styles.css"
hit "jsd-js"    "$JSD/assets/app.js"
hit "jsd-grid"  "$JSD/assets/quebec-full-grid.json"

echo
if [[ "$FAIL" -ne 0 ]]; then
  echo "prewarm: FAIL — investigate non-200 responses before going live"
  exit 1
fi
echo "prewarm: OK"
