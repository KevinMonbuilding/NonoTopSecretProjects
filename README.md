# craquelure_organique.jsx

Script ExtendScript pour Adobe Illustrator qui génère un réseau de craquelures organiques (effet mosaïque / Voronoï) par-dessus un coloriage vectoriel.

## Avant / Après

| Avant | Après |
|-------|-------|
| ![Avant](BEFORE.png) | ![Après](AFTER.png) |

## Utilisation

1. Ouvrez votre fichier `.ai` dans Adobe Illustrator
2. `File > Scripts > Other Script...`
3. Sélectionnez `craquelure_organique.jsx`
4. Attendez quelques secondes — un layer `"Craquelures"` apparaît automatiquement **au-dessus** de votre dessin

Le script est ré-exécutable : il vide le layer `Craquelures` avant de régénérer.

## Paramètres

Tous les paramètres sont configurables en tête du script :

| Paramètre | Défaut | Description |
|-----------|--------|-------------|
| `CELL_SIZE_MIN` | `25` | Taille minimum des cellules (pt) |
| `CELL_SIZE_MAX` | `65` | Taille maximum des cellules (pt) |
| `CELL_SIZE_AVG` | `40` | Taille moyenne de la grille de base (pt) |
| `SEED_REMOVAL` | `0.30` | Fraction de graines supprimées aléatoirement (0–1) — crée des cellules plus grandes |
| `JITTER` | `0.65` | Perturbation aléatoire des graines (0 = grille pure, 1 = max chaos) |
| `WOBBLE_AMP` | `0.30` | Amplitude des courbes organiques (fraction de la longueur du segment) |
| `WOBBLE_SUBDIV` | `2` | Nombre de subdivisions par arête (plus = plus ondulé) |
| `STROKE_R/G/B` | `100, 180, 220` | Couleur du trait en RGB (défaut : bleu clair) |
| `STROKE_WIDTH` | `0.5` | Épaisseur du trait en points |
| `DRAW_MARGIN` | `10` | Marge autour de la bounding box du dessin (pt) |
| `LAYER_NAME` | `"Craquelures"` | Nom du layer créé dans le document |

## Comment ça marche (v5)

1. **Détection du dessin** : le script calcule la bounding box de tous les éléments visibles (hors layer Craquelures) et limite les craquelures à cette zone + marge. Les craquelures ne couvrent plus tout le canvas.
2. **Grille variable** : graines placées sur une grille avec jitter, puis ~30% des graines sont supprimées aléatoirement. Les cellules voisines absorbent l'espace → tailles naturellement variables.
3. **Voronoï** : pour chaque graine, calcul de la cellule de Voronoï par intersection de demi-plans (Sutherland-Hodgman) avec les voisins proches (lookup grille ±4 cellules).
4. **Clipping** : chaque cellule est clippée contre la zone de dessin via 4 demi-plans explicites (gauche, droite, haut, bas).
5. **Courbes organiques** : les arêtes droites sont subdivisées et les points intermédiaires sont décalés perpendiculairement de manière aléatoire, avec des handles Bézier lisses. Résultat : des lignes ondulées naturelles, pas des traits droits.
6. **Layer dédié** : toutes les cellules sont placées dans le layer `"Craquelures"`, envoyé **au-dessus** de tous les autres layers.

## Performance

La recherche de voisins utilise un index de grille (±4 cellules) au lieu d'une recherche O(n²). Pour un A4 avec `CELL_SIZE_AVG=40` :
- ~380 graines actives (après suppression), ~15 voisins testés par graine
- Génération en quelques secondes

## Historique des versions

| Version | Algorithme | Résultat |
|---------|-----------|----------|
| v1 | Triangulation (connect close neighbors) | Diagonales longues, pas de cellules fermées |
| v2 | Bisectrices perpendiculaires | Lignes hors artboard, cellules pas fermées |
| v3 | Voronoï + Sutherland-Hodgman polygon clip | Bug d'enroulement, cellules hors artboard |
| v4 | Voronoï + 4 demi-plans explicites | Cellules correctes, mais trop régulières et traits droits |
| v5 | Voronoï + tailles variables + courbes organiques + clipping dessin | **Version actuelle** |

## Prérequis

- Adobe Illustrator (toute version supportant ExtendScript)
- Un document `.ai` ouvert
