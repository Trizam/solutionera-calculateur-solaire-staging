# Règles de design — Calculateur solaire

Ce fichier est la **seule** copie de ces règles. `index.html`, `assets/app.js`, `assets/styles.css` et les notes d’édition ne font que renvoyer ici. On ne recopie pas le texte.

Ces règles s’appliquent à chaque modification de la page. Le public lit une estimation pédagogique. Ce n’est pas une soumission.

## 1. Boîte verte de résultat

Toute réponse principale s’affiche dans la famille verte (fond `--green-soft`, chiffre en `--green-dark`).

- Une boîte `.result-pill` = une réponse. Le chiffre est grand, l’unité en dessous, le libellé au-dessus. Production, consommation du jour, réserve et temps de remplissage utilisent cette boîte.
- Le trio de la carte valeur reste des `.card-kpi` : même famille, format plus petit.
- Le coût total du projet est une boîte `.result-pill` sous le détail. Les lignes `.breakdown` (panneaux, batteries) sont au-dessus. Elles ne remplacent pas ce chiffre. Sur la carte 6, cette boîte suit le thème bleu.
- Ne pas inventer une autre couleur de résultat. Le thème vert est celui de la page. Le thème bleu se pose avec `.theme-blue` sur une carte.

## 2. Hauteur des cartes et flèche

Deux hauteurs, selon le type de boîte.

- Une grande carte (`.block`, case du plateau) prend la hauteur de son contenu. Le voisin ne l’étire pas. Sur le grand écran, chaque case du `.board` reste à cette hauteur (`align-self: start`), y compris 1A et 1B. Le statut de grille en bas de 1B ne garde pas de ligne vide une fois la grille prête.
- Les boîtes vertes côte à côte ont toujours la même hauteur : celle de la plus haute de la rangée. Ça vaut pour une paire `.result-pair` (`.result-pill`) et pour le trio `.cards` (`.card-kpi`). La rangée étire (`align-items: stretch`). Dans une paire, le texte est centré. Dans le trio, le chiffre reste en haut.
- Le plafond des économies (`.kpi-note`) est un drapeau jaune sous le trio, comme la note de neige. Le texte est centré, en graisse normale. Il ne rentre pas dans la carte du milieu et n’allonge pas les trois boîtes.
- Mesurage net et le jour de décembre sont les deux boîtes de la rangée, à la même hauteur. La note de neige (`.autonomy-snow`) reste sous ce jour. Elle n’allonge pas Mesurage net. En pile étroite (≤ 520px) elle passe sous les deux. Ce jour n’est pas étiré à la hauteur de 4A.
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
- L’efficacité de l’installation en bas de 1B (kWh/kWc/An). Elle suit l’entier du menu des villes, pour qu’on compare le même chiffre après orientation, inclinaison et déneigement.

La boîte verte montre l’arrondi du **vrai** total, pas la somme des lignes déjà arrondies. Deux lignes arrondies peuvent donc ne pas retomber pile sur le total. C’est voulu.

La réserve en kWh est plus fine que les crans de durée : sous 100 kWh elle s’affiche au centième (au millième sous 0,1). Le mot à gauche du curseur reste le nom du cran.

## 1 bis. Thème bleu

Les cartes **4A**, **4B**, le remplissage, **5** et **6** portent `.theme-blue`. Même intensité, même transparence, même typo que le thème vert — seulement la teinte change, pour l’autonomie.

- La carte reste blanche, comme à gauche. Seule la teinte change : titre, pastille et curseur en bleu foncé, boîtes de réponse en bleu clair.
- La réserve est une boîte bleu clair, chiffre bleu foncé, comme les boîtes vertes.
- Le remplissage et le total sont des boîtes bleu clair, comme les autres réponses de la colonne de droite.

## 1 ter. Thème jaune

Les drapeaux portent `.theme-yellow` : la note de neige, le plafond des économies, et l’avertissement quand la réserve ne se remplit pas. Fond jaune clair, texte foncé, même douceur que les boîtes verte et bleue.

## 4. Case « Je veux les détails »

Case `#showDetails`, en bas de page avec « Afficher les notes d’édition ». Visible dans les deux modes d’affichage. Décochée par défaut.

- Cochée : les résultats s’affichent en précision de lecture (dollars au cent, kWh avec décimales). Les calculs ne changent pas.
- Le choix est une préférence d’affichage (`localStorage`, clé `solar-details`), pas un paramètre du scénario dans l’URL.

## 5. Où vivent les règles

Les règles durables sont seulement dans ce fichier.

- Le commentaire en tête de `index.html` pointe vers ce fichier. Il ne répète pas les règles.
- Le panneau `#editorNotes`, ouvert par la case « Afficher les notes d’édition », contient le chantier ouvert. Préférence `localStorage`, clé `solar-notes`. On n’y recopie pas ces règles.
- « À retenir » reste le rappel pour la personne qui estime son projet.

## 6. Plateau

Ordre étroit = ordre du HTML. Au grand écran (≥ 1100px, hors mode webi), deux colonnes : toit | 4A–4B, production | 4A–4B, mesurage et jour de décembre | remplissage, coût | batterie, retour | total. La colonne de droite est bleue.

| Emplacement | Question | Réponse |
| --- | --- | --- |
| Taille / production | Toit, panneaux, orientation | Boîtes vertes déjà en place |
| Rendement | Mesurage net et le jour de décembre | Paire de boîtes vertes, à gauche, même hauteur. La neige reste sous le jour |
| Besoin **4A** | Quels appareils je veux | Curseur de 0 à « maison pleinement autonome ». Repère « appareils de base » à 6,3 kWh/j, repère « chauffage » à 18. Le plus lourd en haut. Ligne libre conservée. Sans appareil, pas de bande vide |
| Durée **4B** | Pendant combien de temps je veux cette autonomie | Sous 4A, dans la colonne bleue. Secours jusqu’à 12 h. Autonomie de maison dès 1 jour, cran marqué « maison » |
| Remplissage | Temps pour remplir | Surplus de décembre seulement, boîte bleue, flèche centrée |
| Coût **2** | Combien coûte le solaire ? | Équation `W × $/W`, puis le détail |
| Batterie **5** | Combien coûtent les batteries ? | Carte bleue, ligne de coût |
| Retour **3** | Valeur des panneaux | Trio `.card-kpi`. L’épingle dit « Retour », comme la boîte. Elle se masque tant que la boîte des années est à l’écran, sans perdre l’état épinglé |
| Total **6** | Coût total du projet | Carte bleue. Détail en haut, boîte `.result-pill` en bas. Au grand écran, le retour à gauche. En pile, le retour des panneaux, plus haut |

Pastilles déjà en place à gauche : **1A** (toit), **1B** (production).

La colonne de gauche porte le solaire : toit, production, mesurage et jour de décembre, coût, retour. La colonne de droite est bleue et reste affichée : 4A, 4B, remplissage, batteries, total. Chaque carte garde la hauteur de son contenu. Les deux boîtes vertes du rendement ont la même hauteur.

La consommation du jour est le curseur (0 à 40 kWh/j) plus la ligne libre. Les neuf premiers usages restent l’échelle hors réseau et s’arrêtent à 6,3 kWh/j. Le chauffe-eau entre à 18 kWh/j. Elle ne vient pas de la facture annuelle. La consommation annuelle sert aux économies et au retour des panneaux. Le total du jour s’écrit en kWh/j.

Réserve (kWh) = consommation du jour × durée. Tant que cette consommation est nulle, la boîte réserve de 4B dit « Aucune réserve » / « à remplir ». Coût des batteries = réserve × prix $/kWh, sans taxes. LogisVert reste sur les panneaux. Total du projet = coût réel des panneaux + coût des batteries. Le retour ne compte que les panneaux.

Prix batterie : curseur 600–1 800 $/kWh, pas de 50, défaut 1 200. Durée : crans aucune, 5 min, 15 min, 30 min, 45 min, 1 h, 2 h, 4 h, 6 h, 8 h, 12 h, 1 jour, 1 jour et quart, 1 jour et demi, 2 jours, 2 jours et demi, 3 jours. Défaut : 1 jour. Déneigement : défaut 100 %. Durée à aucune : pas de durée, pas de batterie. La phrase occupe le trou à droite du coût et du retour. Le remplissage, les batteries et le total sont masqués. 4A et le curseur de durée restent. Un cran plus haut, cette suite revient en entier.

Pastille en bas de 1B : « Efficacité de l’installation », unité kWh/kWc/An.

L’URL de partage contient le scénario de toiture (ville, superficie, unité, densité, orientation, inclinaison, déneigement, prix au watt, taxes, subvention, consommation annuelle, tarif) plus la consommation du jour (kWh/j) et la ligne libre. La durée de réserve et le prix des batteries n’y vont pas.

En mode webi, tout ce qui porte `.mode-full-only` est masqué : la colonne bleue, le coût, le retour, la consommation du jour, la réserve, le remplissage, la batterie, le total. Le kWh/j de décembre reste à côté de Mesurage Net, en vert.
