# Signalements visiteurs (L1)

Les visiteurs n’ont **pas** besoin d’un compte GitHub. Le footer ouvre une modale (description requise, nom optionnel). Le navigateur POSTe vers un **proxy HTTPS create-only** ; le token reste côté serveur.

## Review Fred

1. Filtrer : [Issues `label:user-report`](https://github.com/Trizam/solutionera-calculateur-solaire-staging/issues?q=label%3Auser-report)
2. Lire **Bug** + **Nom** + **Contexte**
3. Prioriser **toi-même** avec `P0` / `P1` / `P2`
4. Labels auto : `user-report` + `bug`

## Client (Pages)

`index.html` :

```html
<meta name="bug-report-endpoint" content="https://solutionera-bug-report.smooth-search.workers.dev" />
```

Aussi accepté : `window.__BUG_REPORT_ENDPOINT__` (jamais un token).

POST JSON :

```json
{
  "bug": "…",
  "name": "",
  "honeypot": "",
  "openedAt": 1234567890,
  "context": {
    "url": "…",
    "mode": "webi|full",
    "version": "0.2",
    "userAgent": "…",
    "timestamp": "ISO",
    "calc": {}
  }
}
```

Sans endpoint joignable : **« Signalement temporairement indisponible »**.

## Proxy create-only

Le proxy valide : honeypot vide, `bug` ≥ 10 caractères, nom optionnel. Puis **uniquement** `POST /repos/…/issues` (labels `user-report`, `bug` ; corps `## Bug` / `## Nom` / `## Contexte`). CORS : `https://trizam.github.io` (+ localhost).

Secret serveur : `BUG_REPORT_GITHUB_TOKEN` (Issues: write sur ce repo). **Jamais** dans le HTML.

### Cloudflare Worker (préféré)

Déployé : `https://solutionera-bug-report.smooth-search.workers.dev`

```bash
npx wrangler secret put BUG_REPORT_GITHUB_TOKEN
npx wrangler deploy
```

Entrée : `functions/bug-report.js` + `wrangler.toml`. Après un preview `--temporary`, **claimer** le compte Cloudflare pour garder l’URL.

### Netlify Function `api/bug-report`

Source : `api/bug-report.mjs` (re-export `netlify/functions/bug-report.mjs`).

```bash
# Site env : BUG_REPORT_GITHUB_TOKEN
npx netlify deploy --prod
```

URL typique : `https://<site>.netlify.app/api/bug-report`

## Action GitHub (test coordinateur)

`.github/workflows/bug-report.yml` — `workflow_dispatch` seulement.  
`github-token: ${{ secrets.BUG_REPORT_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}` + `permissions.issues: write`.  
Le job n’appelle que `github.rest.issues.create`.

## Anti-spam L1

Honeypot (200 ignoré), délai ≥ 2 s, description ≥ 10 caractères, nom optionnel, pas de double-envoi.
