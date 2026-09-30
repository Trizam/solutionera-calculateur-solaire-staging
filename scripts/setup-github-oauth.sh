#!/usr/bin/env bash
# Branche l'identité GitHub optionnelle des signalements sur le Worker Cloudflare.
# Prérequis : une OAuth App GitHub (voir docs/BUG_REPORTS.md) et `npx wrangler login` déjà fait.
# Usage : ./scripts/setup-github-oauth.sh            (demande Client ID + Client Secret)
#         GITHUB_OAUTH_CLIENT_ID=… GITHUB_OAUTH_CLIENT_SECRET=… ./scripts/setup-github-oauth.sh
set -euo pipefail
cd "$(dirname "$0")/.."

WORKER_URL="${WORKER_URL:-https://solutionera-bug-report.fred-435.workers.dev}"

if [[ -z "${GITHUB_OAUTH_CLIENT_ID:-}" ]]; then
  read -r -p "Client ID de l'OAuth App GitHub : " GITHUB_OAUTH_CLIENT_ID
fi
if [[ -z "${GITHUB_OAUTH_CLIENT_SECRET:-}" ]]; then
  read -r -s -p "Client Secret (saisie masquée) : " GITHUB_OAUTH_CLIENT_SECRET
  echo
fi
if [[ -z "$GITHUB_OAUTH_CLIENT_ID" || -z "$GITHUB_OAUTH_CLIENT_SECRET" ]]; then
  echo "Client ID et Client Secret sont requis." >&2
  exit 1
fi

if [[ -z "${BUG_REPORT_SESSION_SECRET:-}" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    BUG_REPORT_SESSION_SECRET="$(openssl rand -hex 32)"
  else
    BUG_REPORT_SESSION_SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  fi
fi

echo "== Secrets du Worker =="
printf '%s' "$GITHUB_OAUTH_CLIENT_ID" | npx wrangler secret put GITHUB_OAUTH_CLIENT_ID
printf '%s' "$GITHUB_OAUTH_CLIENT_SECRET" | npx wrangler secret put GITHUB_OAUTH_CLIENT_SECRET
printf '%s' "$BUG_REPORT_SESSION_SECRET" | npx wrangler secret put BUG_REPORT_SESSION_SECRET

echo
echo "== Déploiement =="
npx wrangler deploy

echo
echo "== Vérification =="
cfg="$(curl -sS --max-time 20 "$WORKER_URL/auth/config" || true)"
echo "$WORKER_URL/auth/config → $cfg"
if [[ "$cfg" == *'"github":true'* ]]; then
  echo "OK — le lien « Signer avec mon compte GitHub » apparaîtra dans la fiche bug."
else
  echo "Le Worker ne rapporte pas github:true — vérifie que le déploiement a bien pris cette branche." >&2
  exit 1
fi
