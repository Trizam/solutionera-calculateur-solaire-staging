# Signalements visiteurs (L1)

Les visiteurs du calculateur n’ont **pas** besoin d’un compte GitHub. Le pied de page ouvre une modale (2 champs) ; un petit proxy crée une Issue sur `Trizam/solutionera-calculateur-solaire-staging`.

## Review Fred

1. Filtrer : [Issues `label:user-report`](https://github.com/Trizam/solutionera-calculateur-solaire-staging/issues?q=label%3Auser-report)
2. Lire **Bug** + **Correction souhaitée** + **Contexte (auto)** (URL, `mode`, version, `calc()`, UA, horodatage)
3. Prioriser **toi-même** avec `P0` / `P1` / `P2` (le formulaire ne pose jamais P*)
4. Labels automatiques : `user-report` + `bug`

## Déploiement du proxy (token jamais dans le JS public)

Secret : **`BUG_REPORT_GITHUB_TOKEN`** — PAT fine-grained **Issues: write** sur ce repo uniquement (ou classic `public_repo`).

Puis coller l’URL HTTPS du proxy dans `index.html` :

```html
<meta name="bug-report-endpoint" content="https://TON-WORKER.workers.dev" />
```

ou, avant `app.js` : `window.__BUG_REPORT_ENDPOINT__ = "https://…";`

### Cloudflare Worker (préféré)

```bash
# secret
npx wrangler secret put BUG_REPORT_GITHUB_TOKEN
# deploy (wrangler.toml → functions/bug-report.js)
npx wrangler deploy
```

CORS déjà limité à `https://trizam.github.io` (+ localhost pour tests).

### Netlify Function

```bash
npx netlify deploy --prod
# Site env : BUG_REPORT_GITHUB_TOKEN
```

Endpoint typique : `https://<site>/.netlify/functions/bug-report`

### Alternative : GitHub Action

`repository_dispatch` type **`calculateur-bug`**. Le `client_payload` est le même JSON que le POST (bug, correction, openedAt, hp, context).  
Workflow : `.github/workflows/bug-report.yml` → `node api/create-issue-from-dispatch.mjs`.  
Le token de l’Action (`GITHUB_TOKEN`) suffit si le workflow tourne dans ce repo.

## Anti-spam L1

- Honeypot : champ caché ; s’il est rempli → 200 ignoré, pas d’Issue
- Délai ≥ 2 s après ouverture de la modale
- Bug ≥ 10 caractères ; correction obligatoire
- Double-envoi désactivé côté client

## Fallback

Si le proxy n’est pas configuré ou GitHub échoue, la modale propose un **mailto** (`hello@solutionera.com`) avec le texte saisi.
