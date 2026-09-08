# Signalements visiteurs (L1)

Les visiteurs n’ont **pas** besoin d’un compte GitHub. Le footer ouvre une modale ; le navigateur crée une Issue via l’API GitHub.

## Review Fred

1. Filtrer : [Issues `label:user-report`](https://github.com/Trizam/solutionera-calculateur-solaire-staging/issues?q=label%3Auser-report)
2. Lire **Bug** + **Nom** + **Contexte (auto)**
3. Prioriser **toi-même** avec `P0` / `P1` / `P2`
4. Labels auto : `user-report` + `bug`

## Auth (coordinateur)

Token **vide dans ce commit**. Follow-up : coller un PAT fine-grained **Issues: write uniquement** sur ce repo dans :

```html
<meta name="bug-report-token" content="github_pat_…" />
```

aussi accepté : `window.__BUG_REPORT_TOKEN__` ou `assets/bug-config.json` (`{ "token": "…" }`, gitignoré — copier `assets/bug-config.example.json`).

Sans token : **« Signalement temporairement indisponible »** (pas de mailto).

## Client → GitHub

`POST https://api.github.com/repos/Trizam/solutionera-calculateur-solaire-staging/issues`  
`Authorization: Bearer <token>`

CORS vérifié (2026-09-08) : preflight `OPTIONS` → `access-control-allow-origin: *` + `access-control-allow-headers: Authorization, Content-Type` + `POST`. Un POST navigateur depuis Pages est OK.

Si le POST Issues échoue, le client tente `repository_dispatch` type `calculateur-bug`. Action : `workflow_dispatch` (`bug`, `name` optionnel, `context_json`).

## Anti-spam L1

Honeypot (pas d’appel API), délai ≥ 2 s, description ≥ 10 caractères, nom optionnel, pas de double-envoi.
