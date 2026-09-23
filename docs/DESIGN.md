# Règles de design — Calculateur solaire

Ce fichier est la **seule** copie de ces règles. `index.html`, `assets/app.js`, `assets/styles.css` et les notes d’édition ne font que renvoyer ici. On ne recopie pas le texte.

Ces règles s’appliquent à chaque modification de la page. Le public lit une estimation pédagogique. Ce n’est pas une soumission.

## 1. Boîte verte de résultat

Toute réponse principale s’affiche dans la famille verte (fond `--green-soft`, chiffre en `--green-dark`).

- Une boîte `.result-pill` = une réponse. Le chiffre est grand, l’unité en dessous, le libellé au-dessus. Production, consommation du jour, réserve et temps de remplissage utilisent cette boîte.
- Le trio de la carte valeur reste des `.card-kpi` : même famille, format plus petit.
- Le coût total du projet est le chiffre vert `.project-total .kpi`. Les lignes `.breakdown` expliquent. Elles ne remplacent pas ce chiffre.
- Ne pas inventer une autre couleur de résultat.

## 2. Hauteur des cartes et flèche

La hauteur d’une carte vient de **son** contenu. Un voisin à gauche ou à droite ne l’étire pas.

- Dans une rangée de pairs (`.result-pair`, `.cards`), `align-items: start`. Le surplus descend. Il n’augmente pas la carte d’à côté.
- Sur le grand écran, le plateau `.board` place les cartes par `data-slot`. Chaque case reste à la hauteur de son contenu (`align-self: start`).
- La flèche `.flow-arrow` est dans la carte de remplissage. Au grand écran elle est centrée (`top: 50%`) dans l’espace entre les deux colonnes. En pile étroite elle est masquée.
- Curseur : reprendre `.slider-row`. La valeur de gauche (`.slider-val-left`) a exactement la hauteur du pouce (`--slider-hit`, 44px) et son centre est aligné sur la ligne du pouce.

## 3. Loi des deux chiffres

**Affichage seulement.** Tous les calculs gardent la précision complète.

Par défaut, chaque **résultat** montré au public a au plus **deux chiffres significatifs** (`sig2Round`, `fmtSig2`, `fmtMoneySig2`, via `fmtShown` et `fmtShownMoney`) :

- 14 230 → 14 000
- 15 675 $ → 16 000 $
- 46,6 kWh → 47 kWh
- 12,53 → 13

Ce qui ne passe pas par cette loi :

- La valeur d’un champ que la personne est en train de régler (curseur, superficie, tarif saisi, Wh d’un appareil). Elle doit voir le chiffre qu’elle a choisi.
- Un compte d’objets déjà entier (nombre de panneaux).

La boîte verte montre l’arrondi du **vrai** total, pas la somme des lignes déjà arrondies. Deux lignes arrondies peuvent donc ne pas retomber pile sur le total. C’est voulu.

## 4. Case « Je veux les détails »

Case `#showDetails`, visible dans les deux modes d’affichage. Décochée par défaut.

- Cochée : les résultats s’affichent en précision de lecture (dollars au cent, kWh avec décimales). Les calculs ne changent pas.
- Le choix est une préférence d’affichage (`localStorage`, clé `solar-details`), pas un paramètre du scénario dans l’URL.

## 5. Où vivent les règles

Les règles durables sont seulement dans ce fichier.

- Le commentaire en tête de `index.html` pointe vers ce fichier. Il ne répète pas les règles.
- Le panneau `#editorNotes`, ouvert par la case « Afficher les notes d’édition », contient le chantier ouvert. Préférence `localStorage`, clé `solar-notes`. On n’y recopie pas ces règles.
- « À retenir » reste le rappel pour la personne qui estime son projet.

## 6. Plateau

Ordre étroit = ordre du HTML. Au grand écran (≥ 1100px, hors mode webi), la grille est : taille | besoin, production | besoin, rendement | remplissage, coût | batterie, retour | total.

| Emplacement | Question | Réponse |
| --- | --- | --- |
| Taille / production | Toit, panneaux, orientation | Boîtes vertes déjà en place |
| Rendement | Mesurage net et autonomie de décembre | Paire de boîtes vertes |
| Besoin | Combien consommez-vous par jour ? | Somme des appareils, boîte verte en kWh/j |
| Réserve | Combien de jours de réserve voulez-vous ? | Durée 0 à 3 jours, boîte verte en kWh |
| Remplissage | Temps pour remplir | Surplus de décembre seulement, boîte verte, flèche centrée |
| Coût | Combien coûte le solaire ? | Équation `W × $/W`, puis le détail |
| Batterie | Prix au kWh installé | Ligne de coût, pas une seconde boîte |
| Retour | Valeur des panneaux | Trio `.card-kpi` |
| Total | Coût total du projet | Panneaux (coût réel) + batteries, chiffre vert |

La consommation du jour est la somme des curseurs d’appareils et des lignes perso. Elle ne vient pas de la facture annuelle. La consommation annuelle sert aux économies et au retour des panneaux.

Réserve (kWh) = consommation du jour × durée. Coût des batteries = réserve × prix $/kWh, sans taxes. LogisVert reste sur les panneaux. Total du projet = coût réel des panneaux + coût des batteries. Le retour ne compte que les panneaux.

Prix batterie : curseur 600–1 800 $/kWh, pas de 50, défaut 1 200. Durée : 0 à 72 h, pas de 0,25 h, défaut 24 h (1 jour). Durée nulle = pas de batterie.

L’URL de partage ne contient que le scénario de toiture (superficie, unité, densité, orientation, inclinaison, déneigement, prix au watt, taxes, subvention, consommation annuelle, tarif). La durée de réserve, le prix des batteries et les appareils n’y vont pas.

En mode webi, tout ce qui porte `.mode-full-only` est masqué : coût, retour, consommation du jour, réserve, remplissage, batterie, total.
