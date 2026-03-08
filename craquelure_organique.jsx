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

// Vérifie qu'un document est ouvert
if (app.documents.length === 0) {
    alert("Aucun document ouvert.\nOuvrez votre fichier .ai avant de lancer ce script.");
} else {
    main();
}

function main() {
    var doc = app.activeDocument;

    // Dimensions du document (en points Illustrator)
    var W = doc.width;
    var H = doc.height;

    // --- Créer ou récupérer le layer "Craquelures" ---
    var craqLayer = null;
    for (var i = 0; i < doc.layers.length; i++) {
        if (doc.layers[i].name === LAYER_NAME) {
            craqLayer = doc.layers[i];
            break;
        }
    }
    if (!craqLayer) {
        craqLayer = doc.layers.add();
        craqLayer.name = LAYER_NAME;
    }

    // Placer le layer en dessous de tous les autres
    // (index 0 = layer du dessus dans Illustrator)
    // On le déplace à la dernière position
    craqLayer.move(doc.layers[doc.layers.length - 1], ElementPlacement.PLACEAFTER);

    // --- Couleur du trait ---
    var strokeColor = new RGBColor();
    strokeColor.red   = STROKE_R;
    strokeColor.green = STROKE_G;
    strokeColor.blue  = STROKE_B;

    // --- Générer les points aléatoires sur la page ---
    // Dans l'espace Illustrator : origine en haut-gauche, Y croissant vers le bas
    // Les coordonnées doc vont de (0,0) à (W, -H) en interne (Y négatif vers le bas)
    var pts = [];
    for (var p = 0; p < NUM_POINTS; p++) {
        pts.push({
            x: Math.random() * W,
            y: -(Math.random() * H)   // Y négatif = vers le bas dans l'espace Illustrator
        });
    }

    // Ajouter des points sur les bords pour que le réseau atteigne les marges
    var edgeCount = Math.round(Math.sqrt(NUM_POINTS) * 2);
    for (var e = 0; e < edgeCount; e++) {
        var t = e / edgeCount;
        pts.push({ x: t * W,  y: 0 });          // bord haut
        pts.push({ x: t * W,  y: -H });          // bord bas
        pts.push({ x: 0,      y: -(t * H) });    // bord gauche
        pts.push({ x: W,      y: -(t * H) });    // bord droit
    }

    var totalPts = pts.length;

    // --- Grouper toutes les lignes ---
    var grp = craqLayer.groupItems.add();

    // --- Relier les points proches par des courbes de Bézier ---
    var drawn = {};  // éviter les doublons A→B / B→A

    for (var i = 0; i < totalPts; i++) {
        var pi = pts[i];
        for (var j = i + 1; j < totalPts; j++) {
            var pj = pts[j];

            var dx = pj.x - pi.x;
            var dy = pj.y - pi.y;
            var dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > MAX_DIST) continue;

            // Calculer les points de contrôle Bézier avec bruit perpendiculaire
            var mx = (pi.x + pj.x) / 2;
            var my = (pi.y + pj.y) / 2;

            // Vecteur perpendiculaire normalisé
            var nx = -dy / dist;
            var ny =  dx / dist;

            // Déformation aléatoire (positive ou négative)
            var noise = (Math.random() - 0.5) * 2 * CURVE_NOISE;
            var cpx = mx + nx * noise;
            var cpy = my + ny * noise;

            // Deuxième déformation indépendante pour cp2 (asymétrie)
            var noise2 = (Math.random() - 0.5) * 2 * CURVE_NOISE;
            var cp2x = mx + nx * noise2;
            var cp2y = my + ny * noise2;

            // Créer le PathItem (courbe cubique de Bézier)
            var path = craqLayer.pathItems.add();
            path.stroked    = true;
            path.filled     = false;
            path.strokeColor = strokeColor;
            path.strokeWidth = STROKE_WIDTH;

            // Point de départ
            var sp = path.pathPoints.add();
            sp.anchor        = [pi.x, pi.y];
            sp.leftDirection  = [pi.x, pi.y];
            sp.rightDirection = [cpx,  cpy];
            sp.pointType     = PointType.SMOOTH;

            // Point d'arrivée
            var ep = path.pathPoints.add();
            ep.anchor        = [pj.x, pj.y];
            ep.leftDirection  = [cp2x, cp2y];
            ep.rightDirection = [pj.x, pj.y];
            ep.pointType     = PointType.SMOOTH;

            path.closed = false;

            // Déplacer dans le groupe
            path.move(grp, ElementPlacement.PLACEATEND);
        }
    }

    // --- Résultat ---
    alert(
        "Craquelures générées avec succès !\n\n" +
        "• " + totalPts + " points de base\n" +
        "• Layer : \"" + LAYER_NAME + "\" (en dessous de tous les autres)\n\n" +
        "Vous pouvez ajuster les paramètres en tête du script\n" +
        "et relancer pour un résultat différent."
    );
}
