# Règles de design — Calculateur solaire

Ces règles s’appliquent à **chaque** modification de la page (`index.html`, `assets/styles.css`, `assets/app.js`). Elles sont répétées dans le commentaire en tête de `index.html` pour qu’une édition du HTML les voie sans ouvrir ce fichier.

Le public lit une estimation pédagogique. Ce n’est pas une soumission.

## 1. Boîte verte de résultat

Toute réponse principale d’une carte s’affiche dans une **boîte verte** `.result-pill` (fond `--green-soft`, chiffre en `--green-dark`).

- Une boîte = une réponse. Le chiffre est grand, l’unité en dessous, le libellé au-dessus.
- Ne pas inventer un autre style de résultat (pas de gros texte nu, pas de pastille d’une autre couleur).
- Les trois indicateurs courts de la carte 3 restent des `.card-kpi` : même famille verte, format plus petit, réservé à ce trio.
- Les lignes `.breakdown` expliquent. Elles ne remplacent pas la boîte verte.

## 2. Hauteur des cartes et ligne centrale

La hauteur d’une carte vient de **son** contenu. Un voisin à gauche ou à droite ne l’étire pas.

- Empiler les cartes dans la colonne (largeur du `.wrap`). Les cartes 4, 5 et 6 sont des sections pleine largeur, reliées par une flèche `.flow-arrow` centrée. L’axe de la flèche est l’axe de la colonne, le même que le centre des cartes.
- Dans une rangée de pairs (`.result-pair`, `.cards`), `align-items: start`. Le surplus (une note, un libellé plus long) descend. Il n’augmente pas la carte d’à côté.
- Curseur : reprendre `.slider-row`. La valeur de gauche (`.slider-val-left`) a exactement la hauteur du pouce (`--slider-hit`, 44px) et son centre est aligné sur la ligne du pouce. Le texte sous la piste (`.slider-meta`) ne grandit pas cette valeur.

## 3. Loi des deux chiffres

**Affichage seulement.** Tous les calculs gardent la précision complète (taxes, kWh, division par 365, etc.).

Par défaut, chaque **résultat** montré au public a au plus **deux chiffres significatifs** (`sig2Round`, `fmtSig2`, `fmtMoneySig2`) :

- 14 230 → 14 000
- 15 675 $ → 16 000 $
- 46,6 kWh → 47 kWh
- 12,53 → 13

Ce qui ne passe pas par cette loi :

- La valeur d’un champ que la personne est en train de régler (curseur, superficie, tarif saisi). Elle doit voir le chiffre qu’elle a choisi.
- Un compte d’objets déjà entier (nombre de panneaux).

La boîte verte montre l’arrondi du **vrai** total, pas la somme des lignes déjà arrondies. Deux lignes arrondies peuvent donc ne pas « retomber » pile sur le total. C’est voulu.

## 4. Case « Je veux les détails »

Case `#showDetails`, visible dans les deux modes d’affichage. Décochée par défaut.

- Cochée : les résultats s’affichent en précision de lecture (dollars au cent, kWh avec décimales). Les calculs ne changent pas — ils étaient déjà complets.
- Le choix est un préférence d’affichage (`localStorage`), pas un paramètre du scénario dans l’URL.

## 5. Notes d’édition

Le flux public ne porte pas le chantier.

- Les règles durables vivent **ici** et dans le commentaire HTML. On ne les cache pas derrière une case.
- Ce qui reste à faire, les hypothèses ouvertes, les rappels de modèle : panneau `#editorNotes`, masqué, ouvert par la case « Afficher les notes d’édition » en bas de page. Préférence `localStorage`.
- « À retenir » reste le rappel pour la personne qui estime son projet. On n’y met pas les notes de travail.

## 6. Cartes

| Carte | Question | Réponse |
| --- | --- | --- |
| 1A / 1B | Toit et production | Boîtes vertes déjà en place |
| 2 | Combien coûte le solaire ? | Équation `W × $/W` puis le détail. Le total affiché suit la loi des deux chiffres |
| 3 | Valeur | Trio `.card-kpi` |
| 4 | Combien de réserve voulez-vous ? | Consommation par jour × jours. Boîte verte en kWh |
| 5 | Combien coûte la batterie ? | Équation `kWh × $/kWh`, puis boîte verte |
| 6 | Combien coûte le projet au total ? | Équation `solaire + batterie` en haut, détail dessous, total dans la boîte verte |

La consommation par jour de la carte 4 suit `consommation annuelle ÷ 365` tant que le champ n’est pas modifié. Le calcul utilise cette division exacte, pas le chiffre arrondi du champ.

Réserve (kWh) = kWh/jour × jours. Coût batterie = réserve × prix $/kWh, taxes si la case de la carte 2 est cochée. LogisVert ne s’applique pas à la batterie. Le total du projet = coût réel du solaire + coût de la batterie.

Prix batterie : curseur pédagogique 600–2 000 $/kWh, défaut 1 200. Jours de réserve : 0–5, pas de 0,5, défaut 1. Zéro jour = pas de batterie.
