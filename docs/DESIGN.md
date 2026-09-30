# Règles de design — Calculateur solaire

Ce fichier est la **seule** copie de ces règles. `index.html`, `assets/app.js`, `assets/styles.css` et les notes d’édition ne font que renvoyer ici. On ne recopie pas le texte.

Ces règles s’appliquent à chaque modification de la page. Le public lit une estimation pédagogique. Ce n’est pas une soumission.

## 1. Boîte verte de résultat

Toute réponse principale s’affiche dans la famille verte (fond `--green-soft`, chiffre en `--green-dark`).

- Une boîte `.result-pill` = une réponse. Le chiffre est grand, l’unité en dessous, le libellé au-dessus. Production, consommation du jour, réserve et temps de remplissage utilisent cette boîte.
- Le trio de la carte valeur reste des `.card-kpi` : même famille, format plus petit.
- Le coût total du projet : deux boîtes `.card-kpi` (panneaux, batteries), puis une boîte `.result-pill` verte (`.tone-green`). Ces indicateurs ne remplacent pas ce chiffre. La carte 6 reste bleue.
- Ne pas inventer une autre couleur de résultat. Le thème vert est celui de la page. Le thème bleu se pose avec `.theme-blue` sur une carte.

## 2. Hauteur des cartes et flèche

Deux hauteurs, selon le type de boîte.

- Une grande carte (`.block`, case du plateau) prend la hauteur de son contenu. Le voisin ne l’étire pas. Sur le grand écran, chaque case du `.board` reste à cette hauteur (`align-self: start`), y compris 1A et 1B. Le statut de grille en bas de 1B ne garde pas de ligne vide une fois la grille prête.
- Les boîtes vertes côte à côte ont toujours la même hauteur : celle de la plus haute de la rangée. Ça vaut pour une paire `.result-pair` (`.result-pill`) et pour le trio `.cards` (`.card-kpi`). La rangée étire (`align-items: stretch`). Dans une paire, le texte est centré. Dans le trio, le chiffre reste en haut.
- Le plafond des économies (`.surplus-alert`) est un drapeau jaune sous le trio, comme la note de neige. Il n’apparaît que si la production dépasse la consommation. Le texte est à gauche, en graisse normale, avec un titre en gras. Il ne rentre pas dans la carte du milieu et n’allonge pas les trois boîtes.
- Mesurage net et le jour de décembre sont les deux boîtes de la rangée, à la même hauteur. La note de neige (`.autonomy-snow`) reste sous ce jour. Elle n’allonge pas Mesurage net. En pile étroite (≤ 520px) elle passe sous les deux. Ce jour n’est pas étiré à la hauteur de 4A.
- La flèche `.flow-arrow` est dans la carte de remplissage. Au grand écran elle est centrée (`top: 50%`) dans l’espace entre les deux colonnes. En pile étroite elle est masquée.
- Curseur : reprendre `.slider-row`. La valeur de gauche (`.slider-val-left`) a exactement la hauteur du pouce (`--slider-hit`, 44px) et son centre est aligné sur la ligne du pouce.

## 2 bis. Verrou — rangée Mesurage net / Autonomie / Temps pour remplir

**Verrouillé (issue #151).** Aucune demande, présente ou future, ne modifie cette règle, sauf une demande qui nomme précisément ce verrou.

- Au grand écran, Mesurage net, Autonomie (jour de décembre) et la boîte « Temps pour remplir » sont toujours sur la même rangée, à la même hauteur. La boîte « Temps pour remplir » est la référence.
- 4A et 4B ne s’accrochent pas en haut de la page. Elles sont posées juste au-dessus de « Temps pour remplir » (`.slot-need { align-self: end; }`). Si 4A–4B raccourcissent, le vide va au-dessus d’elles, pas sous elles.

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
- Le remplissage est une boîte bleu clair. Le total du projet est une boîte verte, sous les deux indicateurs panneaux et batteries.

## 1 ter. Thème jaune

Les drapeaux portent `.theme-yellow` : la note de neige, la bannière de surplus (rachat HQ), la consommation annuelle trop basse face à 4A, et l’avertissement quand la réserve ne se remplit pas. Fond jaune clair, texte foncé, même douceur que les boîtes verte et bleue.

- Chaque drapeau porte `data-flag="Nom du problème"`. Il reçoit un petit triangle jaune « i » (`.flag-mark`) en haut à droite.
- Tant qu’au moins un drapeau est visible, une petite boîte jaune fixe (`#flagDock`) flotte au-dessus de « Retour ». Un drapeau : son nom. Plusieurs : leur nombre, à côté du triangle.
- Survol (ordinateur) ou toucher (mobile) : la liste des drapeaux s’ouvre. Un clic amène au drapeau, qui s’intensifie un instant (`.is-flag-focus`).
- Masqué en mode webi et à l’impression.

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

Deux colonnes. Colonne solaire : taille, production, rendement, coût, retour. Colonne autonomie : 4A, 4B, remplissage, batteries, total.

Au grand écran (≥ 1100px, hors mode webi), la grille est : taille | 4A–4B, production | 4A–4B, rendement | remplissage, coût | batterie, retour | total. Les enveloppes `.col` ne font pas de boîte (`display: contents`), pour que chaque case garde sa place.

Sous 1100px, en mode complet, les deux colonnes restent côte à côte. On commence sur la colonne solaire, avec un recoin de la colonne bleue visible à droite. Un coup rapide vers la gauche amène la colonne bleue et laisse voir un recoin de la colonne verte à gauche. Le doigt qui reste posé et glisse lentement s’arrête là où il se lève, y compris entre les deux. Le mode webi ne montre pas ce couloir : 1A, 1B et le rendement restent en pile.

| Emplacement | Question | Réponse |
| --- | --- | --- |
| Taille / production | Toit, panneaux, orientation | Boîtes vertes déjà en place |
| Rendement | Mesurage net et le jour de décembre | Paire de boîtes vertes, à gauche, même hauteur. La neige reste sous le jour |
| Besoin **4A** | Quels appareils je veux | Curseur de 0 à « maison pleinement autonome ». Repère « appareils de base » à 6,3 kWh/j, repère « chauffage » à 18. Le tableau Usage / kWh/j est au-dessus du curseur, du plus léger au plus lourd. Ligne libre conservée. Sans appareil, pas de bande vide |
| Durée **4B** | Pendant combien de temps je veux cette autonomie | Sous 4A, dans la colonne bleue. Secours jusqu’à 12 h. Autonomie de maison dès 1 jour, cran marqué « maison » |
| Remplissage | Temps pour remplir | Surplus de décembre seulement, boîte bleue, flèche centrée. Toujours en jours (une décimale sous 10 jours). Sous la boîte : heures de plein soleil par jour en décembre (production du jour ÷ kWc), selon orientation, inclinaison et déneigement |
| Coût **2** | Combien coûte le solaire ? | Équation `W × $/W`, puis le détail |
| Batterie **5** | Combien coûtent les batteries ? | Carte bleue, comme la carte 2 : case « Inclure les taxes » (cochée), case figée « Non admissible à la subvention ». Détail : sous-total HT, taxes, subvention 0 $, total estimé pour l’autonomie |
| Retour **3** | Valeur des panneaux | Trio `.card-kpi`. L’épingle dit « Retour », comme la boîte. Elle se masque tant que la boîte des années est à l’écran, sans perdre l’état épinglé |
| Total **6** | Coût total du projet | Carte bleue. Deux boîtes `.card-kpi` (panneaux en vert `.theme-green`, batteries en bleu), puis le total dans une boîte `.result-pill` verte (`.tone-green`). Le retour des panneaux est dans l’autre colonne |

Pastilles déjà en place à gauche : **1A** (toit), **1B** (production).

Case « Ma toiture a plusieurs versants », décochée par défaut, visible en mode webi. Cochée : 1A ne garde que la localisation. 1B devient le tableau des versants, avec la densité au-dessus (une seule valeur pour toute la toiture). Colonnes : superficie (m² / pi² dans l’en-tête), orientation, inclinaison, déneigement. Le déneigement est un menu 0 %, 25 %, 50 %, 75 %, 100 % (défaut 100 %). Quatre versants au maximum. Sous chaque rangée : panneaux, kWc, efficacité. Le total additionne les panneaux, les kWc, les kWh/an et les kWh/j de décembre. L’efficacité du total est pondérée par les kWc. Le coût, le retour et l’autonomie partent de ces sommes. Décochée, 1A et 1B restent le versant unique.

La colonne de gauche porte le solaire : toit, production, mesurage et jour de décembre, coût, retour. La colonne de droite est bleue et reste affichée : 4A, 4B, remplissage, batteries, total. Chaque carte garde la hauteur de son contenu. Les deux boîtes vertes du rendement ont la même hauteur.

La consommation du jour est le curseur (0 à 40 kWh/j) plus la ligne libre. Les neuf premiers usages restent l’échelle hors réseau et s’arrêtent à 6,3 kWh/j. Le chauffe-eau entre à 18 kWh/j. Elle ne vient pas de la facture annuelle. La consommation annuelle sert aux économies et au retour des panneaux. Le total du jour s’écrit en kWh/j.

Réserve (kWh) = consommation du jour × durée. Tant que cette consommation est nulle, la boîte réserve de 4B dit « Aucune réserve » / « à remplir ». Coût des batteries = nombre de modules × prix du module, plus taxes si la case de la carte 5 est cochée (défaut). Un module Volthium fait 16,1 kWh. Le nombre de modules est l’arrondi de la réserve ÷ 16,1, et au moins 1 dès qu’il y a une réserve. 33 kWh, c’est deux modules. LogisVert ne couvre pas les batteries (subvention 0 $).

Case « Je suis 100 % autonome » en 4A : cochée, la consommation annuelle de la carte 3 = 365 × le total par jour de 4A. Le champ est grisé, avec la note « ce chiffre est figé ». Décochée, si 365 × le total par jour dépasse la consommation annuelle saisie, un drapeau jaune sous le champ donne le minimum à inscrire. Total du projet = coût réel des panneaux + coût des batteries. Le retour ne compte que les panneaux.

Prix batterie : curseur du prix d’un module, 2 400–7 200 $, pas de 100, défaut 4 800. Durée : crans aucune, 5 min, 15 min, 30 min, 45 min, 1 h, 2 h, 4 h, 6 h, 8 h, 12 h, 1 jour, 1 jour et quart, 1 jour et demi, 2 jours, 2 jours et demi, 3 jours. Défaut : 1 jour. Déneigement : défaut 100 %. Durée à aucune : pas de durée, pas de batterie. La phrase occupe le trou à droite du coût et du retour. Le remplissage, les batteries et le total sont masqués. 4A et le curseur de durée restent. Un cran plus haut, cette suite revient en entier.

Prix au watt : curseur 1,00–4,50 $/W, pas de 0,05, défaut 3,00. Sous 2,50 $/W, une bulle jaune dit que le prix est peut-être surprenant. 2,50 $/W est le bas réaliste.

Pastille en bas de 1B : « Efficacité de l’installation », unité kWh/kWc/An. Le rappel dit « selon l’orientation, l’inclinaison et le déneigement ».

La puissance de 1A s’écrit en watts-crête (6,4 kWc → 6 400 Wc). Le jour de décembre s’écrit « kWh / j en décembre ». Sous l’inclinaison : 45° donne généralement le maximum de production. La molette sur le tarif marginal fait bouger les décimales (pas de 0,001 ¢). La note « brouillon » du prix batterie ne s’affiche que si « Afficher les notes d’édition » est coché. Dans le menu des villes, la région suit le nom en léger et s’efface avant le productible si la ligne déborde. Le texte du chiffre de droite vit dans l’aide ⓘ de la localisation.

L’URL de partage contient le scénario de toiture (ville, superficie, unité, densité, orientation, inclinaison, déneigement, prix au watt, taxes, subvention, consommation annuelle, tarif) plus la consommation du jour (kWh/j), la ligne libre, la durée de réserve, le prix et les taxes des batteries. Plusieurs versants : `multi=1` et `pans=` (m², azimut, inclinaison, déneigement, séparés par `:`, rangées séparées par `;`).

En mode webi, tout ce qui porte `.mode-full-only` est masqué : la colonne bleue, le coût, le retour, la consommation du jour, la réserve, le remplissage, la batterie, le total. Le kWh/j de décembre reste à côté de Mesurage Net, en vert.
