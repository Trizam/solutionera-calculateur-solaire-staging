# Signalements visiteurs (L1)

Les visiteurs n’ont **pas** besoin d’un compte GitHub. Le pied de page ouvre une modale (2 champs). Quand le proxy HTTP est en place, un POST crée une Issue.

## Review Fred

1. Filtrer : [Issues `label:user-report`](https://github.com/Trizam/solutionera-calculateur-solaire-staging/issues?q=label%3Auser-report)
2. Lire **Bug** + **Correction souhaitée** + **Contexte (auto)**
3. Prioriser **toi-même** avec `P0` / `P1` / `P2` (jamais auto)
4. Labels auto : `user-report` + `bug`

## Client POST (UI)

Endpoint = `meta[name="bug-report-endpoint"]` dans `index.html` (vide tant que le coordinateur n’a pas collé l’URL).

```json
{
  "bug": "...",
  "correction": "...",
  "honeypot": "",
  "openedAt": 1234567890,
  "context": {
    "url": "...",
    "mode": "webi|full",
    "version": "0.2",
    "userAgent": "...",
    "timestamp": "ISO",
    "calc": {}
  }
}
```

Si la meta est vide : **« Signalement temporairement indisponible »** (pas de mailto).

## Action GitHub (test Cash / fallback)

`.github/workflows/bug-report.yml`

- `repository_dispatch` type `calculateur-bug` (`client_payload` = même JSON)
- `workflow_dispatch` inputs : `bug`, `correction`, `context_json`
- Crée l’Issue avec `GITHUB_TOKEN` (`actions/github-script`) + labels `user-report`, `bug`

## Proxy HTTP (coordinateur, follow-up)

Secret `BUG_REPORT_GITHUB_TOKEN` (Issues write). Puis remplir la meta :

```html
<meta name="bug-report-endpoint" content="https://TON-WORKER.workers.dev" />
```

Cloudflare : `npx wrangler secret put BUG_REPORT_GITHUB_TOKEN` puis `npx wrangler deploy`.  
Netlify : env du site + `/.netlify/functions/bug-report`.

## Anti-spam L1

Honeypot (200 ignoré), délai ≥ 2 s, bug ≥ 10 caractères, pas de double-envoi.
