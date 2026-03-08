// =============================================================
// craquelure_organique.jsx
// Ajoute un réseau de craquelures organiques (effet mosaïque/voronoï)
// sur le document Illustrator actif.
//
// Usage : File > Scripts > Other Script... > craquelure_organique.jsx
// =============================================================

// ------- PARAMETRES (modifiez ces valeurs selon vos besoins) -------

var NUM_POINTS   = 400;    // Nombre de points de base (densité du réseau)
var MAX_DIST     = 70;     // Distance max (en pt) entre deux points pour les relier
var STROKE_R     = 100;    // Couleur trait - Rouge  (0-255)
var STROKE_G     = 180;    // Couleur trait - Vert   (0-255)
var STROKE_B     = 220;    // Couleur trait - Bleu   (0-255)
var STROKE_WIDTH = 0.5;    // Épaisseur du trait (en pt)
var CURVE_NOISE  = 12;     // Amplitude de déformation des courbes de Bézier (en pt)
var LAYER_NAME   = "Craquelures"; // Nom du layer créé

// -------------------------------------------------------------------

if (app.documents.length === 0) {
    alert("Aucun document ouvert.\nOuvrez votre fichier .ai avant de lancer ce script.");
} else {
    main();
}

function main() {
    var doc = app.activeDocument;

    // --- Dimensions de l'artboard actif ---
    // On utilise artboardRect plutôt que doc.width/doc.height :
    // doc.width/height donne les dimensions globales du document,
    // ce qui est faux si le document contient plusieurs artboards.
    //
    // artboardRect = [left, top, right, bottom] en coordonnées Illustrator.
    // Dans l'espace interne d'Illustrator :
    //   - Origine = coin bas-gauche du document
    //   - X positif = vers la droite
    //   - Y positif = vers le haut
    // Donc : left < right, et top > bottom (top est le bord supérieur = Y plus grand)
    var ab   = doc.artboards[doc.artboards.getActiveArtboardIndex()];
    var rect = ab.artboardRect;   // [left, top, right, bottom]
    var abLeft   = rect[0];
    var abTop    = rect[1];
    var abRight  = rect[2];
    var abBottom = rect[3];
    var W = abRight  - abLeft;    // largeur  (positif)
    var H = abTop    - abBottom;  // hauteur  (positif, car top > bottom)

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

    // Vider le layer avant régénération pour éviter l'accumulation
    // lors de relances successives sur le même document.
    craqLayer.locked = false;
    craqLayer.visible = true;
    while (craqLayer.pageItems.length > 0) {
        craqLayer.pageItems[0].remove();
    }

    // Placer le layer sous tous les autres.
    // On cherche le layer le plus bas qui n'est PAS "Craquelures".
    var bottomLayer = null;
    for (var bi = doc.layers.length - 1; bi >= 0; bi--) {
        if (doc.layers[bi].name !== LAYER_NAME) {
            bottomLayer = doc.layers[bi];
            break;
        }
    }
    if (bottomLayer !== null) {
        craqLayer.move(bottomLayer, ElementPlacement.PLACEAFTER);
    }

    // --- Générer les points aléatoires sur l'artboard ---
    // Les coordonnées sont en espace Illustrator :
    //   x : de abLeft à abRight
    //   y : de abBottom à abTop
    var pts = [];
    for (var p = 0; p < NUM_POINTS; p++) {
        pts.push({
            x: abLeft   + Math.random() * W,
            y: abBottom + Math.random() * H
        });
    }

    // Points supplémentaires sur les 4 bords pour couvrir les marges
    var edgeCount = Math.round(Math.sqrt(NUM_POINTS) * 2);
    for (var e = 0; e < edgeCount; e++) {
        var t = (e + 0.5) / edgeCount;
        pts.push({ x: abLeft  + t * W, y: abTop    });  // bord haut
        pts.push({ x: abLeft  + t * W, y: abBottom });  // bord bas
        pts.push({ x: abLeft,          y: abBottom + t * H }); // bord gauche
        pts.push({ x: abRight,         y: abBottom + t * H }); // bord droit
    }

    var totalPts = pts.length;

    // --- Créer le groupe dans le layer ---
    var grp = craqLayer.groupItems.add();

    // --- Relier les points proches par des courbes de Bézier ---
    // j = i+1 : chaque paire traitée une seule fois (pas de doublons A→B / B→A)
    var pathCount = 0;

    for (var i = 0; i < totalPts; i++) {
        var pi = pts[i];
        for (var j = i + 1; j < totalPts; j++) {
            var pj = pts[j];

            var dx = pj.x - pi.x;
            var dy = pj.y - pi.y;
            var dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > MAX_DIST) continue;

            // Vecteur unitaire le long du segment
            var ux = dx / dist;
            var uy = dy / dist;

            // Vecteur perpendiculaire unitaire
            var perpX = -uy;
            var perpY =  ux;

            // Handle cp1 : à 1/3 du segment + déviation perp. aléatoire
            var noise1 = (Math.random() - 0.5) * 2 * CURVE_NOISE;
            var cp1x = pi.x + ux * dist * 0.33 + perpX * noise1;
            var cp1y = pi.y + uy * dist * 0.33 + perpY * noise1;

            // Handle cp2 : à 2/3 du segment + déviation perp. indépendante
            var noise2 = (Math.random() - 0.5) * 2 * CURVE_NOISE;
            var cp2x = pi.x + ux * dist * 0.67 + perpX * noise2;
            var cp2y = pi.y + uy * dist * 0.67 + perpY * noise2;

            // Créer le PathItem dans le groupe
            var path = grp.pathItems.add();
            path.stroked     = true;
            path.filled      = false;
            path.strokeWidth = STROKE_WIDTH;
            path.closed      = false;

            // Nouvelle instance RGBColor par path — évite les bugs de référence
            // partagée sur certaines versions d'Illustrator
            var c = new RGBColor();
            c.red   = STROKE_R;
            c.green = STROKE_G;
            c.blue  = STROKE_B;
            path.strokeColor = c;

            // Ancre de départ
            var sp = path.pathPoints.add();
            sp.anchor         = [pi.x, pi.y];
            sp.leftDirection  = [pi.x, pi.y];   // pas de courbe en amont
            sp.rightDirection = [cp1x, cp1y];
            sp.pointType      = PointType.CORNER;

            // Ancre d'arrivée
            var ep = path.pathPoints.add();
            ep.anchor         = [pj.x, pj.y];
            ep.leftDirection  = [cp2x, cp2y];
            ep.rightDirection = [pj.x, pj.y];   // pas de courbe en aval
            ep.pointType      = PointType.CORNER;

            pathCount++;
        }
    }

    // Supprimer le groupe s'il est vide (MAX_DIST trop petit)
    if (pathCount === 0) {
        grp.remove();
        alert(
            "Aucune courbe générée.\n\n" +
            "MAX_DIST (" + MAX_DIST + " pt) est probablement trop petit\n" +
            "par rapport à la taille du document.\n\n" +
            "Essayez d'augmenter MAX_DIST ou NUM_POINTS."
        );
        return;
    }

    alert(
        "Craquelures générées avec succès !\n\n" +
        "• " + pathCount + " courbes tracées\n" +
        "• " + totalPts + " points de base utilisés\n" +
        "• Layer : \"" + LAYER_NAME + "\" (en dessous de tous les autres)\n\n" +
        "Astuce : si le réseau est trop dense ou trop lâche,\n" +
        "ajustez NUM_POINTS et MAX_DIST en tête du script."
    );
}
