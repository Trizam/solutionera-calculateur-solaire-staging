# Règles de design — Calculateur solaire

Ce fichier est la **seule** copie de ces règles. `index.html`, `assets/app.js`, `assets/styles.css` et les notes d’édition ne font que renvoyer ici. On ne recopie pas le texte.

Ces règles s’appliquent à chaque modification de la page. Le public lit une estimation pédagogique. Ce n’est pas une soumission.

## 1. Boîte verte de résultat

Toute réponse principale s’affiche dans la famille verte (fond `--green-soft`, chiffre en `--green-dark`).

- Une boîte `.result-pill` = une réponse. Le chiffre est grand, l’unité en dessous, le libellé au-dessus. Production, consommation du jour, réserve et temps de remplissage utilisent cette boîte.
- Tarif marginal HQ (issue #165) : champ texte, virgule décimale, deux chiffres après la virgule (au centième de cent). Défaut 12,81 ¢/kWh. La molette bouge de 0,01 ¢. Le tableau ⓘ garde les paliers officiels à trois décimales (12,811) ; le champ, lui, s’écrit 12,81.
- Le trio de la carte valeur reste des `.card-kpi` : même famille, format plus petit.
- Le coût total du projet : deux boîtes `.card-kpi` (panneaux en vert, batteries en bleu), puis une boîte `.result-pill` en dégradé du vert au bleu (`.tone-blend`, issue #167) : on voit qu’elle tient les deux. Ces indicateurs ne remplacent pas ce chiffre. La carte 6 reste bleue.
- Ne pas inventer une autre couleur de résultat. Le thème vert est celui de la page. Le thème bleu se pose avec `.theme-blue` sur une carte.

## 2. Hauteur des cartes et flèche

Deux hauteurs, selon le type de boîte.

- Une grande carte (`.block`, case du plateau) prend la hauteur de son contenu. Le voisin ne l’étire pas. Sur le grand écran, chaque case du `.board` reste à cette hauteur (`align-self: start`). 1A et 1B forment une seule case (`.slot-roof`) qui, comme 4A–4B, s’appuie sur la rangée centrale (voir § 2 bis). Le statut de grille en bas de 1B ne garde pas de ligne vide une fois la grille prête.
- Les boîtes vertes côte à côte ont toujours la même hauteur : celle de la plus haute de la rangée. Ça vaut pour une paire `.result-pair` (`.result-pill`) et pour le trio `.cards` (`.card-kpi`). La rangée étire (`align-items: stretch`). Dans une paire, le texte est centré. Dans le trio, le chiffre reste en haut.
- Le plafond des économies (`.surplus-alert`) est un drapeau jaune sous le trio, comme la note de neige. Il n’apparaît que si la production dépasse la consommation, et jamais quand « Je suis 100 % autonome » est coché (issue #159) : en pleine autonomie, produire plus n’est pas un défaut. Le texte est à gauche, en graisse normale, avec un titre en gras. Il ne rentre pas dans la carte du milieu et n’allonge pas les trois boîtes.
- Mesurage net et le jour de décembre sont les deux boîtes de la rangée, à la même hauteur. La note de neige (`.autonomy-snow`) reste sous ce jour. Elle ne s’affiche qu’à la personne qui a coché « Je suis 100 % autonome » et qui ne déneige pas à 100 % avec des panneaux non verticaux (issue #162). Elle n’allonge pas Mesurage net. En pile étroite (≤ 520px) elle passe sous les deux. Ce jour n’est pas étiré à la hauteur de 4A.
- La flèche `.flow-arrow` est dans la carte de remplissage. Au grand écran elle est centrée (`top: 50%`) dans l’espace entre les deux colonnes. En pile étroite elle est masquée.
- Curseur : reprendre `.slider-row`. La valeur de gauche (`.slider-val-left`) a exactement la hauteur du pouce (`--slider-hit`, 44px) et son centre est aligné sur la ligne du pouce.

## 2 bis. Verrou — rangée Mesurage net / Autonomie / Temps pour remplir

**Verrouillé (issue #151).** Aucune demande, présente ou future, ne modifie cette règle, sauf une demande qui nomme précisément ce verrou.

- Au grand écran, Mesurage net, Autonomie (jour de décembre) et la boîte « Temps pour remplir » sont toujours sur la même rangée, à la même hauteur. La boîte « Temps pour remplir » est la référence.
- 4A et 4B ne s’accrochent pas en haut de la page. Elles sont posées juste au-dessus de « Temps pour remplir » (`.slot-need { align-self: end; }`). Si 4A–4B raccourcissent, le vide va au-dessus d’elles, pas sous elles.
- 1A et 1B font de même de l’autre côté (issue #170) : la case `.slot-roof` est posée sur Mesurage net / Autonomie (`align-self: end`). Si la colonne verte est plus haute, la bleue descend s’appuyer sur « Temps pour remplir » ; si la bleue est plus haute, la verte descend s’appuyer sur Mesurage net / Autonomie. Les deux colonnes touchent toujours l’axe central.
- Exception nommée par Fred (issues #179, #180) : tant que la consommation du jour de 4A est à zéro, 4B, « Temps pour remplir », 5 et 6 sont masqués (`html[data-need="off"] .need-only`). 4A seule flotte alors dans la rangée Mesurage net / Autonomie, centrée en hauteur avec cette rangée (`.slot-need { grid-row: fill; align-self: center; }` et `.slot-yield { align-self: center; }` : la rangée prend la hauteur de 4A, les deux centres coïncident). La petite flèche reste entre les deux colonnes (`.flow-arrow-need` dans `#sec-yield`, visible seulement quand `data-need="off"` ; la flèche de « Temps pour remplir » disparaît avec cette carte). Dans 4A, la coche « Je suis 100 % autonome » (et la note décembre, sous le curseur) attend aussi ce moment ; le tableau au-dessus du curseur suit le curseur en direct (issue #173), ce qui ne déplace pas le pouce. Le basculement se fait quand on relâche le curseur (`change`), jamais pendant le glissement : la carte sous le pouce ne bouge pas. Dès qu’il y a une charge, la rangée verrouillée revient telle quelle.

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

Les drapeaux portent `.theme-yellow` : la note de neige, la bannière de surplus (rachat HQ), la consommation annuelle trop basse face à 4A, le remplissage qui dépasse 3 jours, et l’avertissement quand la réserve ne se remplit pas. Fond jaune clair, texte foncé, même douceur que les boîtes verte et bleue.

- Chaque drapeau porte `data-flag="Nom du problème"`. Il reçoit un petit triangle jaune « i » (`.flag-mark`) en haut à droite.
- Tant qu’au moins un drapeau est visible, une petite boîte jaune fixe (`#flagDock`) flotte juste au-dessus de la boîte « Retour » (§ 1 quater), bord droit sur bord droit : les bulles jaunes et la boîte « Retour » forment une pile droite, alignée à droite (issue #181). Le script `yearsFloat` écrit `right`, `bottom` et `max-width` de la bulle à chaque mise à jour de « Retour », y compris pendant le glissement des colonnes sur le téléphone. Un drapeau : son nom. Plusieurs : leur nombre, à côté du triangle.
- Survol (ordinateur) ou toucher (mobile) : la liste des drapeaux s’ouvre. Un clic amène au drapeau, qui s’intensifie un instant (`.is-flag-focus`).
- Masqué en mode webi et à l’impression.
- Remplissage (issue #175). Plus de 3 jours : drapeau jaune « Ça commence à être long pour remplir. » La réserve ne se remplit pas : « Vous produisez moins d’énergie que vous en consommez en autonomie. » Ce dernier passe au rouge (`.theme-red`, triangle rouge) seulement si « Je suis 100 % autonome » est coché ; la boîte du coin le suit. Sinon il reste jaune.

## 1 quinquies. Bulle bug au-dessus de tout (issue #166)

La bulle bug (`#bugFab`) et la feuille bug (`#bugModal`) sont une couche à part, au-dessus des feuilles ⓘ (`z-index` 1100 et 1200 contre 1000).

- Une feuille ⓘ ouverte ne rend pas la bulle inerte : on peut signaler un bug en regardant la feuille. La feuille bug s’ouvre alors par-dessus, sans fermer la feuille ⓘ ; la fermer ramène à la feuille ⓘ.
- Sur ordinateur, la feuille bug ancrée en bas à gauche reste ouverte quand on ouvre un ⓘ de la page ; la feuille ⓘ s’ouvre dessous.
- Chaque bouton « Fermer » / « Compris » ferme sa propre feuille (`closeModal(id)`). Échap ferme la feuille du dessus. La tabulation reste dans les feuilles ouvertes et la bulle tant que la page est tenue.

## 1 quater. Boîte « Retour » qui flotte (issue #147)

Une seule petite boîte (`#yearsPinBar` › `.years-pin-card`) : « Retour » et les années. Elle est fixe à l’écran, en bas.

- Son bord droit est calé sur le bord droit des cartes vertes, quelques pixels à l’intérieur (`0,4rem`). Sur le téléphone elle suit la colonne verte pendant le glissement ; quand la colonne bleue est devant, elle reste visible à gauche, au-dessus du recoin vert, à droite de la bulle bug.
- Quand la boîte « Retour » de la carte 3 monte jusqu’à elle, elle glisse dessus, prend sa taille et s’y fond (`.is-docked`, opacité 0). La carte reçoit une lueur brève (`.is-years-landed`). Pas de fondu enchaîné à vide : on voit où elle est allée.
- Quand cette boîte quitte l’écran (par le bas ou par le haut), la petite boîte en ressort et revient flotter, avec le même mouvement.
- La géométrie (`transform`, `width`, `height`) est écrite par le script (`yearsFloat` dans `assets/app.js`) ; la transition CSS dessine le mouvement. `prefers-reduced-motion` coupe la transition.
- L’épingle (carte 3, coin gauche ; petite boîte, à droite) montre ou masque cette boîte. Masquée en mode webi et à l’impression.

## 3 bis. ⓘ « Comment c’est calculé » (issue #140)

Chaque boîte de résultat (`.result-pill`, `.card-kpi`) porte `.has-info` et un petit ⓘ en haut à droite (`.result-info-btn`, `data-result-info="clé"`). Les lignes « Total estimé » des cartes 2 et 5 ont le même ⓘ : sur la carte 2 il est juste à gauche du montant, sur la carte 5 à droite du titre.

- Le ⓘ ouvre la feuille partagée `#fieldInfoModal` avec un tableau (`.calc-table`) : chaque donnée, sa valeur, son origine. Trois origines, avec une légende en tête : **Ta donnée** (vert), **Hypothèse standard** (jaune doux), **Calculé** (neutre).
- Sous le tableau : la formule, le **résultat** en précision complète, puis **l’arrondi affiché dans la boîte**. Ensuite les hypothèses (panneau générique 2 m² / 400 W, 0,20 kWc/m², PVWatts avec 14 % de pertes, loi des deux chiffres).
- Les spécifications vivent dans `RESULT_INFO` (`assets/app.js`), une fonction par clé, alimentée par `calc()`. Une nouvelle boîte = une nouvelle clé, pas un nouveau gabarit HTML.
- Dans la boîte des années (carte 3), le ⓘ a le coin droit ; l’épingle prend le coin gauche.
- Sur la ligne « Total estimé (coût réel) » de la carte 2, le ⓘ est dans `.line-total-amt`, juste à gauche du montant. La carte 5 garde le sien à droite du titre.

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
| Besoin **4A** | Quels appareils je veux en autonomie ? | Curseur de 0 à « maison pleinement autonome », sans repère sur la piste (issue #169). Le tableau Usage / kWh/j est au-dessus du curseur, du plus léger au plus lourd ; il s’arrête à la thermopompe (30 kWh/j), pas de ligne « Chauffage ». À zéro, pas de tableau ni de ligne « Autre consommation » ; dès le premier cran, « Téléphone » et « Autre consommation » apparaissent, et la ligne libre reste ensuite (issue #173). La coche « 100 % autonome » et le reste de la colonne bleue attendent le relâchement du curseur (§ 2 bis) |
| Durée **4B** | Pendant combien de temps je veux cette autonomie | Sous 4A, dans la colonne bleue. Piste sans repère (issue #171). Phrase avec la flèche : « → Secours jusqu’à 12 h. Autonomie de maison dès 1 jour. » (issue #172) |
| Remplissage | Temps pour remplir | Surplus de décembre seulement, boîte bleue, flèche centrée. Toujours en jours (une décimale sous 10 jours). Sous la boîte : heures de plein soleil par jour en décembre (production du jour ÷ kWc), selon orientation, inclinaison et déneigement. Au-dessus de 3 jours, drapeau jaune. Si ça ne se remplit pas, la notice devient rouge quand « 100 % autonome » est coché (issue #175) |
| Coût **2** | Combien coûte le solaire ? | Le détail (sous-total, taxes, subvention, total). Pas d’équation « W × $/W » sur la carte. Le ⓘ de « Total estimé (coût réel) » est juste à gauche du montant |
| Batterie **5** | Combien coûtent les batteries ? | Carte bleue, comme la carte 2 : curseur du prix en $/kWh de batterie (100–500, issue #168), case « Inclure les taxes » (cochée), case figée « Non admissible à la subvention ». Détail : sous-total HT, taxes, subvention 0 $, total estimé pour l’autonomie |
| Retour **3** | Valeur des panneaux | Trio `.card-kpi`. La petite boîte qui flotte dit « Retour », comme la boîte. Elle se pose dans la boîte des années quand celle-ci arrive à l’écran, et en ressort quand elle le quitte (§ 1 quater) |
| Total **6** | Coût total du projet | Carte bleue. Deux boîtes `.card-kpi` (panneaux en vert `.theme-green`, batteries en bleu), puis le total dans une boîte `.result-pill` en dégradé vert → bleu (`.tone-blend`, issue #167). Le retour des panneaux est dans l’autre colonne |

Pastilles déjà en place à gauche : **1A** (toit), **1B** (production).

Crochet « Ma toiture a plusieurs versants » en bas à droite de 1B, décoché par défaut, visible en mode webi. Il disparaît une fois coché : on revient au versant unique en retirant les versants jusqu’au dernier, qui reprend alors les champs de 1A et 1B. Coché : 1A ne garde que la localisation. 1B devient le tableau des versants, avec la densité au-dessus (une seule valeur pour toute la toiture). Colonnes : superficie (m² / pi² dans l’en-tête), orientation, inclinaison, déneigement. Dans ce tableau, les chiffres sont centrés dans leur boîte et l’orientation s’écrit court, « 180° (S) », « 135° (SE) », « 15° » (issue #164) ; le menu de 1B garde « 180° (Sud) ». Le déneigement est un menu 0 %, 25 %, 50 %, 75 %, 100 % (défaut 100 %). Quatre versants au maximum. Sous chaque rangée : panneaux, kWc, efficacité. Le total additionne les panneaux, les kWc, les kWh/an et les kWh/j de décembre. L’efficacité du total est pondérée par les kWc. Le coût, le retour et l’autonomie partent de ces sommes. Décochée, 1A et 1B restent le versant unique.

La colonne de gauche porte le solaire : toit, production, mesurage et jour de décembre, coût, retour. La colonne de droite est bleue et reste affichée : 4A, 4B, remplissage, batteries, total. Chaque carte garde la hauteur de son contenu. Les deux boîtes vertes du rendement ont la même hauteur.

La consommation du jour est le curseur (0 à 40 kWh/j) plus la ligne libre. Les neuf premiers usages restent l’échelle hors réseau et s’arrêtent à 6,3 kWh/j. Le chauffe-eau entre à 18 kWh/j. Elle ne vient pas de la facture annuelle. La consommation annuelle sert aux économies et au retour des panneaux. Le total du jour s’écrit en kWh/j.

Réserve (kWh) = consommation du jour × durée. Tant que cette consommation est nulle, 4B, le remplissage, les batteries et le total sont masqués (§ 2 bis). Coût des batteries = nombre de modules × 16,1 kWh × prix en $/kWh, plus taxes si la case de la carte 5 est cochée (défaut). Un module Volthium fait 16,1 kWh. Le nombre de modules est l’arrondi de la réserve ÷ 16,1, et au moins 1 dès qu’il y a une réserve. 33 kWh, c’est deux modules. LogisVert ne couvre pas les batteries (subvention 0 $).

Case « Je suis 100 % autonome » en 4A : cochée, la consommation annuelle de la carte 3 = 365 × le total par jour de 4A. Le champ est grisé, avec la note « ce chiffre est figé ». Décochée, si 365 × le total par jour dépasse la consommation annuelle saisie, un drapeau jaune sous le champ donne le minimum à inscrire. Total du projet = coût réel des panneaux + coût des batteries. Le retour ne compte que les panneaux.

Prix batterie (issue #168) : curseur en $/kWh de batterie, 100–500 $, pas de 10, défaut 300. Un module de 16,1 kWh coûte 16,1 × ce prix. Le curseur n’est pas le prix d’un module. Durée : crans aucune, 5 min, 15 min, 30 min, 45 min, 1 h, 2 h, 4 h, 6 h, 8 h, 12 h, 1 jour, 1 jour et quart, 1 jour et demi, 2 jours, 2 jours et demi, 3 jours. Défaut : 1 jour. Déneigement : défaut 100 %. Durée à aucune : pas de durée, pas de batterie. La phrase occupe le trou à droite du coût et du retour. Le remplissage, les batteries et le total sont masqués. 4A et le curseur de durée restent. Un cran plus haut, cette suite revient en entier.

Prix au watt : curseur 1,00–4,50 $/W, pas de 0,05, défaut 3,00. Sous 2,50 $/W, une bulle jaune dit que le prix est peut-être surprenant. 2,50 $/W est le bas réaliste.

Pastille en bas de 1B : « Efficacité de l’installation », unité kWh/kWc/An. Le rappel dit « selon l’orientation, l’inclinaison et le déneigement ».

La puissance de 1A s’écrit en watts-crête (6,4 kWc → 6 400 Wc). Le jour de décembre s’écrit « kWh / j en décembre ». Sous l’inclinaison : 45° donne généralement le maximum de production. La molette sur le tarif marginal fait bouger les décimales (pas de 0,01 ¢). La note « brouillon » du prix batterie ne s’affiche que si « Afficher les notes d’édition » est coché. Dans le menu des villes, la région suit le nom en léger et s’efface avant le productible si la ligne déborde. Le texte du chiffre de droite vit dans l’aide ⓘ de la localisation.

L’URL de partage contient le scénario de toiture (ville, superficie, unité, densité, orientation, inclinaison, déneigement, prix au watt, taxes, subvention, consommation annuelle, tarif) plus la consommation du jour (kWh/j), la ligne libre, la durée de réserve, le prix des batteries (`battKwh`, $/kWh ; un ancien `battPrice` par module est converti) et leurs taxes. Plusieurs versants : `multi=1` et `pans=` (m², azimut, inclinaison, déneigement, séparés par `:`, rangées séparées par `;`).

En mode webi, tout ce qui porte `.mode-full-only` est masqué : la colonne bleue, le coût, le retour, la consommation du jour, la réserve, le remplissage, la batterie, le total. Le kWh/j de décembre reste à côté de Mesurage Net, en vert.
