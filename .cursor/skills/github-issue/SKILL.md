---
name: github-issue
description: Fix a GitHub issue on this repo and mark it fixed on GitHub. Use when working a visitor report, user-report, or any issue number; when opening the PR that finishes that issue; or when a fix is already on master but the issue was never closed with Fixes #N.
---

# Issue GitHub — la marquer réglée

Le mécanisme classique est celui de GitHub, pas un pack de skills tiers. Une pull request mergée qui contient `Fixes #N` ferme l’issue et la lie. Les skills Cursor `new-branch-and-pr` et `review-and-ship` s’arrêtent à l’ouverture de la PR : elles ne posent pas ce mot. Ce skill ajoute seulement cette étape.

Ne pas importer `gh-issue-management`, `issue-flow` ou `skill-github-flow`. Ils ajoutent un plan approuvé, des sous-issues et un tableau de projet que ce dépôt n’utilise pas.

## Déclencheur

- Une issue à traiter (`user-report`, bug, ou numéro cité dans la demande).
- Une PR qui termine cette issue.
- Une issue encore ouverte (ou fermée à la main) alors que le correctif est déjà sur `master`.

## Avant de coder

1. Lire l’issue (`gh issue view N`) : demande, labels, commentaires.
2. `idea` ou `to-validate` sans un oui explicite de Master : ne pas implémenter, ne pas fermer.
3. L’issue #95 (chantier) est une liste. On ne la ferme pas parce qu’une ligne a été faite.
4. Vérifier sur `master` si la demande est déjà dans la page. Un simple lien croisé depuis une PR ne prouve pas que c’est réglé.

## Pendant le correctif

Branche et PR comme d’habitude. Dans le corps de la PR, une ligne par issue vraiment terminée :

```
Fixes #110
```

`Fixes`, `Closes` et `Resolves` sont équivalents. GitHub ferme l’issue au merge, pas à l’ouverture de la PR. Écrire le numéro seulement pour une issue que cette PR termine. Une issue citée comme contexte se note sans ce mot (`voir #95`).

## Déjà sur master, issue pas liée

Si le correctif est déjà mergé et que la PR n’a pas dit `Fixes #N` :

1. Commenter l’issue : numéro de PR, ce qui est en place sur la page.
2. Fermer : `gh issue close N --reason completed --comment "…"`.
3. Ne pas fermer si la page actuelle ne correspond plus à la demande.

## Ce dépôt, septembre 2026

Fait correctement : la PR #109 contient `Fixes #106`, `Fixes #107`, `Fixes #108`. GitHub a fermé les trois au merge.

Fait dans le code, pas marqué : la PR #119 (commit `2cdd281`, 2026-09-23) applique des signalements sans aucun `Fixes #`. Les issues sont restées ouvertes six jours, puis fermées à la main le 2026-09-29 sans nommer la PR.

| Issue | Demande | Où c’est sur `master` |
| --- | --- | --- |
| #110 | 4A = durée, 4B = autonomie en dessous ; durée 0 masque la colonne | `docs/DESIGN.md`, durée à 0 |
| #112 | Crans 0 → 3 jours (5 min, 15 min, …, 1 jour et quart) | `RESERVE_STOPS` dans `assets/app.js` |
| #114 | « Efficacité de l’installation », unité kWh/kWc/An | Boîte en bas de 1B |
| #115 | Déneigement à 100 % par défaut | `DEFAULT_DENEIGEMENT = 1` |
| #118 | Cartes 4A, 4B, 5 et 6 bleues, même intensité que le vert | `.theme-blue` |

#117 n’est pas réglée. #119 avait le détail en haut et le total dans `.result-keep-green`. Le commit `15babb8` a retiré cette classe : la boîte du total suit le bleu de la carte 6. Ne pas la fermer.

## Garde-fous

- Un cross-reference GitHub n’est pas une fermeture.
- Ne pas fermer une issue `idea` / `to-validate`.
- Ne pas réécrire l’historique d’une PR déjà mergée pour y ajouter `Fixes #N` : commenter et fermer.
- Le jeton d’agent ne lit pas toujours les issues. `gh` doit avoir un token avec Issues en lecture-écriture (`GH_TOKEN` ou `GITHUB_TOKEN`).
