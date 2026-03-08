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
4. Attendez quelques secondes — un layer `"Craquelures"` apparaît automatiquement sous votre dessin

Le script est ré-exécutable : il vide le layer `Craquelures` avant de régénérer.

## Paramètres

Tous les paramètres sont configurables en tête du script :

| Paramètre | Défaut | Description |
|-----------|--------|-------------|
| `CELL_SIZE` | `40` | Distance entre graines (pt) — contrôle la taille des cellules |
| `JITTER` | `0.55` | Perturbation aléatoire des graines (0 = grille pure, 1 = max chaos) |
| `STROKE_R/G/B` | `100, 180, 220` | Couleur du trait en RGB (défaut : bleu clair) |
| `STROKE_WIDTH` | `0.5` | Épaisseur du trait en points |
| `LAYER_NAME` | `"Craquelures"` | Nom du layer créé dans le document |

## Comment ça marche

1. Le script génère une grille de graines avec perturbation aléatoire (jitter) sur l'artboard + une zone de padding
2. Pour chaque graine, il calcule sa **cellule de Voronoï** en intersectant les demi-plans perpendiculaires bisectrices avec chaque voisin (algorithme de Sutherland-Hodgman)
3. Chaque cellule est ensuite **clippée contre les bords de l'artboard** (4 demi-plans explicites : gauche, droite, haut, bas)
4. Les cellules résultantes sont dessinées comme des polygones fermés (`closed = true`) avec stroke bleu clair et sans remplissage
5. Toutes les cellules sont placées dans un layer dédié `"Craquelures"`, envoyé sous les layers existants

## Performance

La recherche de voisins utilise un index de grille (±3 cellules) au lieu d'une recherche O(n²). Pour un A4 avec `CELL_SIZE=40` :
- ~540 graines, ~15 voisins testés par graine
- Génération en quelques secondes

Augmenter `CELL_SIZE` pour des cellules plus grandes (et un script plus rapide).
Diminuer `CELL_SIZE` pour un réseau plus dense (plus lent).

## Prérequis

- Adobe Illustrator (toute version supportant ExtendScript)
- Un document `.ai` ouvert
