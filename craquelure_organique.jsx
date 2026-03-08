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
    // Dans l'espace interne d'Illustrator, Y est positif vers le HAUT,
    // donc "top" est un Y plus grand (moins négatif) que "bottom".
    // Exemple pour un A4 : rect = [0, 0, 595, -842]
    //   left=0, top=0, right=595, bottom=-842
    //   W = 595 - 0   = 595  (positif ✓)
    //   H = 0 - (-842) = 842  (positif ✓)
    var ab   = doc.artboards[doc.artboards.getActiveArtboardIndex()];
    var rect = ab.artboardRect;   // [left, top, right, bottom]
    var abLeft   = rect[0];
    var abTop    = rect[1];
    var abRight  = rect[2];
    var abBottom = rect[3];
    var W = abRight  - abLeft;    // largeur  (toujours positif)
    var H = abTop    - abBottom;  // hauteur  (positif car top > bottom en valeur algébrique)

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

    // Placer le layer sous tous les autres EN PREMIER,
    // avant de vider son contenu — l'index de doc.layers peut changer
    // après des suppressions, ce qui rendrait le move() imprévisible.
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

    // Vider le layer avant régénération pour éviter l'accumulation
    // lors de relances successives sur le même document.
    // On sauvegarde l'état locked/visible pour le restaurer après.
    var wasLocked  = craqLayer.locked;
    var wasVisible = craqLayer.visible;
    craqLayer.locked  = false;
    craqLayer.visible = true;
    while (craqLayer.pageItems.length > 0) {
        craqLayer.pageItems[0].remove();
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

    // Points supplémentaires sur les 4 bords pour couvrir les marges.
    // On les rentre d'une demi-MAX_DIST vers l'intérieur pour éviter que
    // les handles Bézier débordent hors de l'artboard.
    var margin = MAX_DIST * 0.5;
    var edgeCount = Math.round(Math.sqrt(NUM_POINTS) * 2);
    for (var e = 0; e < edgeCount; e++) {
        var t = (e + 0.5) / edgeCount;
        var ex = abLeft   + margin + t * (W - 2 * margin);
        var ey = abBottom + margin + t * (H - 2 * margin);
        pts.push({ x: ex,       y: abTop    - margin }); // bord haut
        pts.push({ x: ex,       y: abBottom + margin }); // bord bas
        pts.push({ x: abLeft  + margin, y: ey });         // bord gauche
        pts.push({ x: abRight - margin, y: ey });         // bord droit
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
        craqLayer.locked  = wasLocked;
        craqLayer.visible = wasVisible;
        alert(
            "Aucune courbe générée.\n\n" +
            "MAX_DIST (" + MAX_DIST + " pt) est probablement trop petit\n" +
            "par rapport à la taille du document.\n\n" +
            "Essayez d'augmenter MAX_DIST ou NUM_POINTS."
        );
        return;
    }

    // Restaurer l'état locked/visible d'origine
    craqLayer.locked  = wasLocked;
    craqLayer.visible = wasVisible;

    alert(
        "Craquelures générées avec succès !\n\n" +
        "• " + pathCount + " courbes tracées\n" +
        "• " + totalPts + " points de base utilisés\n" +
        "• Layer : \"" + LAYER_NAME + "\" (en dessous de tous les autres)\n\n" +
        "Astuce : si le réseau est trop dense ou trop lâche,\n" +
        "ajustez NUM_POINTS et MAX_DIST en tête du script."
    );
}
