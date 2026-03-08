// =============================================================
// craquelure_organique.jsx
// Génère un réseau de craquelures organiques (effet mosaïque/voronoï)
// en traçant les perpendiculaires bisectrices entre points voisins.
//
// Usage : File > Scripts > Other Script... > craquelure_organique.jsx
// =============================================================

// ------- PARAMETRES -------

var CELL_SIZE    = 35;    // Distance entre les graines (pt). Contrôle la taille des cellules.
var JITTER       = 0.4;   // Perturbation des points (0=grille parfaite, 1=max chaos)
var BISECT_LEN   = 0.6;   // Longueur de la bisectrice en fraction de CELL_SIZE
var STROKE_R     = 100;
var STROKE_G     = 180;
var STROKE_B     = 220;
var STROKE_WIDTH = 0.5;
var CURVE_NOISE  = 5;     // Déformation Bézier des bisectrices (pt)
var LAYER_NAME   = "Craquelures";

// --------------------------

if (app.documents.length === 0) {
    alert("Aucun document ouvert.");
} else {
    main();
}

function main() {
    var doc = app.activeDocument;

    var ab       = doc.artboards[doc.artboards.getActiveArtboardIndex()];
    var rect     = ab.artboardRect; // [left, top, right, bottom]
    var abLeft   = rect[0];
    var abTop    = rect[1];
    var abRight  = rect[2];
    var abBottom = rect[3];
    var W = abRight - abLeft;
    var H = abTop   - abBottom; // positif car top > bottom algébriquement

    // --- Layer ---
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
    craqLayer.zOrder(ZOrderMethod.SENDTOBACK);

    var wasLocked  = craqLayer.locked;
    var wasVisible = craqLayer.visible;
    craqLayer.locked  = false;
    craqLayer.visible = true;
    while (craqLayer.pageItems.length > 0) {
        craqLayer.pageItems[0].remove();
    }

    // --- Grille de graines perturbée ---
    // On déborde légèrement hors de l'artboard pour que les cellules
    // de bord soient complètes (pas de bords ouverts).
    var pad  = CELL_SIZE * 1.5;
    var cols = Math.ceil((W + 2 * pad) / CELL_SIZE) + 1;
    var rows = Math.ceil((H + 2 * pad) / CELL_SIZE) + 1;
    var pts  = [];

    for (var row = 0; row < rows; row++) {
        for (var col = 0; col < cols; col++) {
            var bx = abLeft   - pad + col * CELL_SIZE;
            var by = abBottom - pad + row * CELL_SIZE;
            var x  = bx + (Math.random() - 0.5) * 2 * CELL_SIZE * JITTER;
            var y  = by + (Math.random() - 0.5) * 2 * CELL_SIZE * JITTER;
            pts.push({ x: x, y: y });
        }
    }

    var totalPts = pts.length;
    var halfLen  = CELL_SIZE * BISECT_LEN * 0.5;

    var grp = craqLayer.groupItems.add();
    var pathCount = 0;
    var drawn = {};

    // --- Pour chaque paire de voisins de grille, tracer la bisectrice ---
    // On itère sur la grille et on relie chaque cellule à ses voisins
    // droite, haut, diagonale-haut-droite, diagonale-haut-gauche.
    // Cela couvre toutes les paires sans doublons.
    var neighbors = [
        { dc: 1, dr: 0 },   // droite
        { dc: 0, dr: 1 },   // haut
        { dc: 1, dr: 1 },   // diagonale haut-droite
        { dc: -1, dr: 1 }   // diagonale haut-gauche
    ];

    for (var row = 0; row < rows; row++) {
        for (var col = 0; col < cols; col++) {
            var i  = row * cols + col;
            var pi = pts[i];

            for (var ni = 0; ni < neighbors.length; ni++) {
                var nc = col + neighbors[ni].dc;
                var nr = row + neighbors[ni].dr;
                if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;

                var j  = nr * cols + nc;
                var pj = pts[j];

                // Milieu du segment
                var mx = (pi.x + pj.x) * 0.5;
                var my = (pi.y + pj.y) * 0.5;

                // Ignorer si le milieu est trop loin de l'artboard
                if (mx < abLeft - pad * 0.3 || mx > abRight  + pad * 0.3 ||
                    my < abBottom - pad * 0.3 || my > abTop + pad * 0.3) continue;

                var dx   = pj.x - pi.x;
                var dy   = pj.y - pi.y;
                var dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 1) continue;

                // Vecteur perpendiculaire normalisé (= direction de la bisectrice)
                var px = -dy / dist;
                var py =  dx / dist;

                // Extrémités de la bisectrice
                var ax = mx + px * halfLen;
                var ay = my + py * halfLen;
                var bx2 = mx - px * halfLen;
                var by2 = my - py * halfLen;

                // Points de contrôle Bézier : légère déviation perpendiculaire à la bisectrice
                // (c'est-à-dire dans la direction du segment original)
                var ux = dx / dist;
                var uy = dy / dist;
                var n1 = (Math.random() - 0.5) * 2 * CURVE_NOISE;
                var n2 = (Math.random() - 0.5) * 2 * CURVE_NOISE;
                var cp1x = ax  * 0.67 + bx2 * 0.33 + ux * n1;
                var cp1y = ay  * 0.67 + by2 * 0.33 + uy * n1;
                var cp2x = ax  * 0.33 + bx2 * 0.67 + ux * n2;
                var cp2y = ay  * 0.33 + by2 * 0.67 + uy * n2;

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
                sp.anchor         = [ax, ay];
                sp.leftDirection  = [ax, ay];
                sp.rightDirection = [cp1x, cp1y];
                sp.pointType      = PointType.CORNER;

                var ep = path.pathPoints.add();
                ep.anchor         = [bx2, by2];
                ep.leftDirection  = [cp2x, cp2y];
                ep.rightDirection = [bx2, by2];
                ep.pointType      = PointType.CORNER;

                pathCount++;
            }
        }
    }

    if (pathCount === 0) {
        grp.remove();
        craqLayer.locked  = wasLocked;
        craqLayer.visible = wasVisible;
        alert("Aucune courbe générée.");
        return;
    }

    craqLayer.locked  = wasLocked;
    craqLayer.visible = wasVisible;

    alert(
        "Craquelures générées !\n\n" +
        "• " + pathCount + " bisectrices tracées\n" +
        "• Grille " + cols + " × " + rows + " = " + totalPts + " points\n\n" +
        "Ajustez CELL_SIZE pour changer la taille des cellules."
    );
}
