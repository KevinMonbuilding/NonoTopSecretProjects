// =============================================================
// craquelure_organique.jsx
// Ajoute un réseau de craquelures organiques (effet mosaïque/voronoï)
// sur le document Illustrator actif.
//
// Usage : File > Scripts > Other Script... > craquelure_organique.jsx
// =============================================================

// ------- PARAMETRES (modifiez ces valeurs selon vos besoins) -------

var NUM_POINTS    = 600;   // Nombre de points (densité du réseau)
var CELL_SIZE     = 40;    // Taille approximative des cellules en pt (~14mm sur A4)
var MAX_NEIGHBORS = 3;     // Nombre max de voisins auxquels relier chaque point
var STROKE_R      = 100;   // Couleur trait - Rouge  (0-255)
var STROKE_G      = 180;   // Couleur trait - Vert   (0-255)
var STROKE_B      = 220;   // Couleur trait - Bleu   (0-255)
var STROKE_WIDTH  = 0.5;   // Épaisseur du trait (en pt)
var CURVE_NOISE   = 8;     // Amplitude de déformation des courbes de Bézier (en pt)
var LAYER_NAME    = "Craquelures"; // Nom du layer créé

// -------------------------------------------------------------------

if (app.documents.length === 0) {
    alert("Aucun document ouvert.\nOuvrez votre fichier .ai avant de lancer ce script.");
} else {
    main();
}

function main() {
    var doc = app.activeDocument;

    // --- Dimensions de l'artboard actif ---
    // artboardRect = [left, top, right, bottom] en coordonnées Illustrator.
    // Y positif vers le HAUT. Exemple A4 : [0, 0, 595, -842]
    //   W = 595 - 0    = 595  (positif)
    //   H = 0 - (-842) = 842  (positif)
    var ab       = doc.artboards[doc.artboards.getActiveArtboardIndex()];
    var rect     = ab.artboardRect;
    var abLeft   = rect[0];
    var abTop    = rect[1];
    var abRight  = rect[2];
    var abBottom = rect[3];
    var W = abRight - abLeft;
    var H = abTop   - abBottom;

    // --- Créer ou récupérer le layer "Craquelures" ---
    var craqLayer = null;
    for (var li = 0; li < doc.layers.length; li++) {
        if (doc.layers[li].name === LAYER_NAME) {
            craqLayer = doc.layers[li];
            break;
        }
    }
    if (!craqLayer) {
        craqLayer = doc.layers.add();
        craqLayer.name = LAYER_NAME;
    }

    // Placer sous tous les autres layers
    craqLayer.zOrder(ZOrderMethod.SENDTOBACK);

    // Vider le layer (relances successives)
    var wasLocked  = craqLayer.locked;
    var wasVisible = craqLayer.visible;
    craqLayer.locked  = false;
    craqLayer.visible = true;
    while (craqLayer.pageItems.length > 0) {
        craqLayer.pageItems[0].remove();
    }

    // --- Générer les points en grille perturbée ---
    // On utilise une grille régulière + perturbation aléatoire plutôt que
    // des points purement aléatoires. Cela évite les zones vides et les
    // zones trop denses qui produisent un résultat irrégulier visuellement.
    var pts = [];
    var cols = Math.round(W / CELL_SIZE) + 2;
    var rows = Math.round(H / CELL_SIZE) + 2;
    var stepX = W / (cols - 1);
    var stepY = H / (rows - 1);
    var jitter = CELL_SIZE * 0.45; // perturbation max = 45% de la taille de cellule

    for (var row = 0; row < rows; row++) {
        for (var col = 0; col < cols; col++) {
            var x = abLeft   + col * stepX + (Math.random() - 0.5) * 2 * jitter;
            var y = abBottom + row * stepY + (Math.random() - 0.5) * 2 * jitter;
            // Clamp dans l'artboard
            x = Math.max(abLeft, Math.min(abRight, x));
            y = Math.max(abBottom, Math.min(abTop, y));
            pts.push({ x: x, y: y });
        }
    }

    var totalPts = pts.length;

    // --- Construire le graphe de voisinage ---
    // Pour chaque point, on trouve ses MAX_NEIGHBORS plus proches voisins
    // et on trace une courbe vers chacun.
    // On stocke les arêtes déjà tracées pour éviter les doublons.
    var drawn = {};

    var grp = craqLayer.groupItems.add();
    var pathCount = 0;

    for (var i = 0; i < totalPts; i++) {
        var pi = pts[i];

        // Calculer la distance vers tous les autres points et trier
        var dists = [];
        for (var j = 0; j < totalPts; j++) {
            if (j === i) continue;
            var dx = pts[j].x - pi.x;
            var dy = pts[j].y - pi.y;
            dists.push({ idx: j, d: Math.sqrt(dx * dx + dy * dy) });
        }

        // Tri par distance croissante (tri à bulles — ExtendScript n'a pas Array.sort fiable)
        // On utilise un tri par sélection limité aux MAX_NEIGHBORS premiers éléments
        // pour éviter un tri complet O(n²) sur tous les points.
        for (var k = 0; k < MAX_NEIGHBORS && k < dists.length; k++) {
            var minIdx = k;
            for (var m = k + 1; m < dists.length; m++) {
                if (dists[m].d < dists[minIdx].d) minIdx = m;
            }
            // Swap
            var tmp = dists[k];
            dists[k] = dists[minIdx];
            dists[minIdx] = tmp;
        }

        // Tracer vers les MAX_NEIGHBORS voisins les plus proches
        for (var k = 0; k < MAX_NEIGHBORS && k < dists.length; k++) {
            var j = dists[k].idx;

            // Clé unique pour éviter les doublons (A→B = B→A)
            var key = i < j ? (i + "_" + j) : (j + "_" + i);
            if (drawn[key]) continue;
            drawn[key] = true;

            var pj = pts[j];
            var dx = pj.x - pi.x;
            var dy = pj.y - pi.y;
            var dist = dists[k].d;

            // Vecteurs unitaires
            var ux = dx / dist;
            var uy = dy / dist;
            var perpX = -uy;
            var perpY =  ux;

            // Points de contrôle Bézier : cp1 à 1/3, cp2 à 2/3
            // avec déviation perpendiculaire indépendante
            var n1 = (Math.random() - 0.5) * 2 * CURVE_NOISE;
            var n2 = (Math.random() - 0.5) * 2 * CURVE_NOISE;
            var cp1x = pi.x + ux * dist * 0.33 + perpX * n1;
            var cp1y = pi.y + uy * dist * 0.33 + perpY * n1;
            var cp2x = pi.x + ux * dist * 0.67 + perpX * n2;
            var cp2y = pi.y + uy * dist * 0.67 + perpY * n2;

            // Créer la courbe dans le groupe
            var path = grp.pathItems.add();
            path.stroked     = true;
            path.filled      = false;
            path.strokeWidth = STROKE_WIDTH;
            path.closed      = false;

            var c = new RGBColor();
            c.red   = STROKE_R;
            c.green = STROKE_G;
            c.blue  = STROKE_B;
            path.strokeColor = c;

            var sp = path.pathPoints.add();
            sp.anchor         = [pi.x, pi.y];
            sp.leftDirection  = [pi.x, pi.y];
            sp.rightDirection = [cp1x, cp1y];
            sp.pointType      = PointType.CORNER;

            var ep = path.pathPoints.add();
            ep.anchor         = [pj.x, pj.y];
            ep.leftDirection  = [cp2x, cp2y];
            ep.rightDirection = [pj.x, pj.y];
            ep.pointType      = PointType.CORNER;

            pathCount++;
        }
    }

    // Supprimer le groupe si vide
    if (pathCount === 0) {
        grp.remove();
        craqLayer.locked  = wasLocked;
        craqLayer.visible = wasVisible;
        alert("Aucune courbe générée. Vérifiez les paramètres.");
        return;
    }

    craqLayer.locked  = wasLocked;
    craqLayer.visible = wasVisible;

    alert(
        "Craquelures générées !\n\n" +
        "• " + pathCount + " courbes\n" +
        "• " + totalPts + " points (" + cols + " × " + rows + " grille)\n\n" +
        "Pour ajuster : modifiez CELL_SIZE (taille cellules)\n" +
        "et NUM_POINTS ou les dimensions de la grille."
    );
}
