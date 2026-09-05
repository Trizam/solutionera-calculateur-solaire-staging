# WEBINAR_RUNBOOK — Calculateur Solaire (staging)

**Audience :** ops / animateur webinar  
**App :** Calculateur Solaire version 0.2 staging  
**Repo git :** `Trizam/solutionera-calculateur-solaire-staging` (GH Pages)  
**Date :** 2026-09-05 (America/Toronto)

---

## URLs

| Rôle | URL |
|------|-----|
| **Primary (à utiliser en live)** | https://trizam.github.io/solutionera-calculateur-solaire-staging/ |
| **jsDelivr mirror (assets / secours fichiers)** | `https://cdn.jsdelivr.net/gh/Trizam/solutionera-calculateur-solaire-staging@master/` |

### Pattern jsDelivr

Préfixe fixe :

```text
https://cdn.jsdelivr.net/gh/Trizam/solutionera-calculateur-solaire-staging@master/
```

Exemples :

- `…/index.html`
- `…/assets/styles.css`
- `…/assets/app.js`
- `…/assets/quebec-full-grid.json`

**Important — pas de miroir HTML navigable :**  
`curl -I` sur `…/index.html` → **200** mais `Content-Type: text/plain` (+ `X-Content-Type-Options: nosniff`). Le navigateur n’affiche **pas** l’app.  
La racine `…/@master/` renvoie la **page listing CDN** jsDelivr, pas `index.html` de l’app.  
→ **Ne pas** mettre de lien « Miroir » dans le footer staging. Utiliser jsDelivr seulement pour pré-warm / téléchargement d’assets si Pages est en panne.

---

## Cache (GitHub Pages / Fastly)

Sur le primary, les réponses HTML/CSS/JS portent typiquement :

```text
cache-control: max-age=600
via: 1.1 varnish
x-served-by: cache-…   (Fastly edge)
```

**Implication webinar :** après un push, attendre jusqu’à **~10 minutes** (ou forcer un hard refresh / URL cache-bust) avant de compter sur le contenu frais partout. Pré-warmer l’edge **avant** le live.

---

## Pré-warm (avant le webinar)

Exécuter **15–30 min avant** le début, depuis un réseau stable :

```bash
# Depuis la racine du repo staging-static :
./prewarm.sh
```

Ou manuellement (primary + assets) :

```bash
BASE=https://trizam.github.io/solutionera-calculateur-solaire-staging
for u in \
  "$BASE/" \
  "$BASE/index.html" \
  "$BASE/assets/styles.css" \
  "$BASE/assets/app.js" \
  "$BASE/assets/quebec-full-grid.json" \
  "$BASE/favicon.ico" \
  "$BASE/favicon.png"
do
  curl -sS -o /dev/null -w "%{http_code} %{url_effective}\n" -L "$u"
done
```

Optionnel — peupler aussi le CDN jsDelivr (fichiers, pas l’UI) :

```bash
JSD=https://cdn.jsdelivr.net/gh/Trizam/solutionera-calculateur-solaire-staging@master
for u in \
  "$JSD/index.html" \
  "$JSD/assets/styles.css" \
  "$JSD/assets/app.js" \
  "$JSD/assets/quebec-full-grid.json"
do
  curl -sS -o /dev/null -w "%{http_code} %{url_effective}\n" -L "$u"
done
```

Attendu : **200** sur chaque URL primary. Si non-200 sur primary → ne pas démarrer le live sur cette URL.

---

## Smoke defaults — persona **Analyste**

Ouvrir le primary, laisser les valeurs par défaut de la page (ou les rétablir) :

| Champ | Défaut staging |
|-------|----------------|
| Superficie | **40 m²** |
| Inclinaison | **30°** |
| Orientation | **180° (Sud)** |
| Utilisation surface | **80 %** |
| Déneigement (d) | **20 %** |
| Prix au watt | **3,00 $/W** |
| Taxes | **ON** (TPS+TVQ ≈ 14,975 %) |
| LogisVert | **ON** (si admissible) |
| Tarif marginal | **0,11142 $/kWh** |

### Check financier Analyste (réf. `smoke-test.mjs`)

Pour **6,5 kW** à **3 $/W** (capacité typique dérivée de 40 m² × 80 % × densitéité panneaux) :

- HT = 6,5 × 1000 × 3 = **19 500 $**
- TTC ≈ HT × 1,14975
- Subv = min(1000×6,5, 40 % HT) = **6 500 $**
- **Coût réel ≈ 15 920,76 $** (taxé − subv.)

Grille : cellule **S / 30°** (`180` azimut, tilt `30`) → `ac_annual` ≈ **1254,8064** kWh/kW·an (`assets/quebec-full-grid.json`, 168 cellules).

Local : `node smoke-test.mjs` → doit afficher **SMOKE OK**.

---

## Pendant le live

1. Partager **uniquement** l’URL primary GH Pages.
2. Hard refresh (Cmd/Ctrl+Shift+R) si un participant voit une vieille version (cache 600 s).
3. Si Pages tombe : expliquer le fallback assets via jsDelivr ; **ne pas** promettre une UI miroir tant que `index.html` est servi en `text/plain`.
4. Bug report : lien `!` / « Signale un bug » dans le footer de l’app.

---

## Fichiers liés

- `prewarm.sh` — curl index + css + js + grille (+ favicons)
- `smoke-test.mjs` — régression Analyste / grille / W-by-tilt
- Ce runbook : `docs/WEBINAR_RUNBOOK.md`
