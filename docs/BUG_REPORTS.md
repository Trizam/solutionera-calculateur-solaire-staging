# Signalements visiteurs (L1)

Les visiteurs n’ont **pas** besoin d’un compte GitHub (ceux qui en ont un peuvent le lier une fois, voir plus bas). Le lien du footer et le bouton insecte en bas à gauche ouvrent le signalement (description requise, nom optionnel). Dans cette fenêtre, Command+Entrée ou Ctrl+Entrée envoie. Après un envoi réussi, la fenêtre se ferme et une pastille « Done » avec une coche reste une seconde. Sur un écran d’au moins 900px, la fenêtre flotte en bas à gauche et la page reste utilisable. Sur un plus petit écran, c’est la même feuille pleine page que les autres fenêtres. Le bouton insecte et cette fenêtre passent au-dessus des fenêtres ⓘ : on peut signaler un bug pendant qu’une aide est ouverte, sans la fermer (règle : `docs/DESIGN.md` § 1 quinquies). Le navigateur POSTe vers un **proxy HTTPS create-only** ; le token reste côté serveur.

## Review Fred

1. Filtrer : [Issues `label:user-report`](https://github.com/Trizam/solutionera-calculateur-solaire-staging/issues?q=label%3Auser-report)
2. Lire **Bug** + **Nom** + **Contexte**
3. Prioriser **toi-même** avec `P0` / `P1` / `P2`
4. Labels auto : `user-report` + `bug`

## Marquer comme réglé

GitHub ferme l’issue au merge si le corps de la pull request contient `Fixes #N` (aussi `Closes` / `Resolves`). Une PR qui cite le numéro sans ce mot laisse l’issue ouverte.

La PR #109 l’a fait (`Fixes #106`, `#107`, `#108`). La PR #119 a appliqué #110, #112, #114, #115 et #118 sans ce mot : elles sont restées ouvertes jusqu’à une fermeture manuelle.

Dans ce dépôt : `.cursor/rules/mark-issue-done.mdc`. Partout (Cursor cloud, ordinateur, Grok Bot) : Team Rule du tableau de bord, portée sur Cursor et Grok Bot. Détail : `.cursor/skills/github-issue/SKILL.md`. Une issue `idea` ou `to-validate` ne se ferme pas tant que Master n’a pas dit oui. #95 (chantier) ne se ferme pas comme un bug.

## Client (Pages)

`index.html` :

```html
<meta name="bug-report-endpoint" content="https://solutionera-bug-report.fred-435.workers.dev" />
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

Déployé : `https://solutionera-bug-report.fred-435.workers.dev`

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

## Identité GitHub optionnelle (« Envoyé comme @moi »)

Par défaut l’issue est **ouverte par le compte bot** du site (token `BUG_REPORT_GITHUB_TOKEN`). Un visiteur qui a un compte GitHub peut, **une seule fois par navigateur**, cliquer « Signer avec mon compte GitHub » sous le champ nom : un popup GitHub s’ouvre (instantané s’il est déjà connecté et a déjà autorisé), se referme, et tous ses signalements suivants sont **ouverts en son nom**. Sinon rien ne change : aucun clic de plus, envoi direct via le bot.

Ce que fait le proxy :

| Route | Rôle |
|---|---|
| `GET /auth/config` | `{ github: true/false }` — la page n’affiche la ligne que si l’OAuth est configuré |
| `GET /auth/github/start?return_to=…&mode=popup\|redirect` | 302 vers GitHub (state chiffré + cookie nonce, `return_to` limité aux origines CORS) |
| `GET /auth/github/callback?code&state` | échange le code, lit `/user`, renvoie une **session chiffrée** (AES-GCM, 180 j) au popup via `postMessage` ; sans popup, retour sur la page avec `#bug-report-session=…` |
| `POST /` avec en-tête `X-Bug-Report-Session` | crée l’issue avec le token **du visiteur**, puis le bot pose les labels (`user-report`, `bug` — GitHub les ignore pour un non-collaborateur). Token révoqué → **repli bot** + `session: "expired"` (la page oublie la session) |

Le token du visiteur ne vit **que** dans la session chiffrée ; la page ne stocke qu’un blob opaque (`localStorage.bugReportGithub`). Rien d’autre n’est demandé à GitHub (scope `public_repo` pour une OAuth App classique).

### Mise en place (une fois)

1. GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App
   - Homepage URL : `https://trizam.github.io/solutionera-calculateur-solaire-staging/`
   - Authorization callback URL : `https://solutionera-bug-report.fred-435.workers.dev/auth/github/callback`
2. Secrets du Worker + déploiement + vérification, en une commande (demande le Client ID et le Client Secret, génère le secret de session) :

```bash
./scripts/setup-github-oauth.sh
```

Équivalent à la main :

```bash
npx wrangler secret put GITHUB_OAUTH_CLIENT_ID
npx wrangler secret put GITHUB_OAUTH_CLIENT_SECRET
npx wrangler secret put BUG_REPORT_SESSION_SECRET   # chaîne aléatoire longue (ex. openssl rand -hex 32)
npx wrangler deploy
curl https://solutionera-bug-report.fred-435.workers.dev/auth/config   # → {"ok":true,"github":true}
```

Optionnel : `GITHUB_OAUTH_SCOPE` (défaut `public_repo`). Avec une **GitHub App** (Issues: write sur ce repo seulement, « Request user authorization (OAuth) during installation », expiration des tokens désactivée) mettre `GITHUB_OAUTH_SCOPE=""`.

Netlify : mêmes variables d’environnement ; `netlify.toml` route `/auth/*` vers la même fonction.

Sans ces secrets, `/auth/config` répond `github: false` et la ligne n’apparaît pas — le formulaire reste exactement comme avant.

## Action GitHub (test coordinateur)

`.github/workflows/bug-report.yml` — `workflow_dispatch` seulement.  
`github-token: ${{ secrets.BUG_REPORT_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}` + `permissions.issues: write`.  
Le job n’appelle que `github.rest.issues.create`.

## Anti-spam L1

Honeypot (200 ignoré), délai ≥ 2 s, description ≥ 10 caractères, nom optionnel, pas de double-envoi.
