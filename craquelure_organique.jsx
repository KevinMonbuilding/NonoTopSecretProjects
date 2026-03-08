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

    // Placer le layer en dessous de tous les autres.
    // On cherche le layer le plus bas qui n'est PAS notre layer.
    var bottomLayer = null;
    for (var i = doc.layers.length - 1; i >= 0; i--) {
        if (doc.layers[i].name !== LAYER_NAME) {
            bottomLayer = doc.layers[i];
            break;
        }
    }
    if (bottomLayer !== null) {
        craqLayer.move(bottomLayer, ElementPlacement.PLACEAFTER);
    }
    // Si bottomLayer est null, on est le seul layer — on reste en place.

    // --- Couleur du trait ---
    var strokeColor = new RGBColor();
    strokeColor.red   = STROKE_R;
    strokeColor.green = STROKE_G;
    strokeColor.blue  = STROKE_B;

    // --- Générer les points aléatoires sur la page ---
    // Espace Illustrator : origine en haut-gauche du artboard,
    // X positif vers la droite, Y négatif vers le bas.
    var pts = [];
    for (var p = 0; p < NUM_POINTS; p++) {
        pts.push({
            x:  Math.random() * W,
            y: -(Math.random() * H)
        });
    }

    // Points supplémentaires sur les 4 bords pour que le réseau atteigne les marges
    var edgeCount = Math.round(Math.sqrt(NUM_POINTS) * 2);
    for (var e = 0; e < edgeCount; e++) {
        var t = (e + 0.5) / edgeCount;   // +0.5 pour éviter les coins en double
        pts.push({ x: t * W,  y:  0    });   // bord haut
        pts.push({ x: t * W,  y: -H    });   // bord bas
        pts.push({ x: 0,      y: -(t * H) }); // bord gauche
        pts.push({ x: W,      y: -(t * H) }); // bord droit
    }

    var totalPts = pts.length;

    // --- Créer le groupe directement dans le layer ---
    var grp = craqLayer.groupItems.add();

    // --- Relier les points proches par des courbes de Bézier ---
    // j = i+1 garantit que chaque paire n'est traitée qu'une seule fois (pas de doublons)
    var pathCount = 0;

    for (var i = 0; i < totalPts; i++) {
        var pi = pts[i];
        for (var j = i + 1; j < totalPts; j++) {
            var pj = pts[j];

            var dx = pj.x - pi.x;
            var dy = pj.y - pi.y;
            var dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > MAX_DIST) continue;

            // --- Points de contrôle Bézier organiques ---
            //
            // Approche : un handle par ancre, situé à 1/3 du segment
            // avec une déviation perpendiculaire aléatoire indépendante.
            // Cela produit une vraie courbe S/C asymétrique plutôt que
            // deux handles symétriques pointant vers le même milieu.
            //
            // Vecteur unitaire le long du segment
            var ux = dx / dist;
            var uy = dy / dist;

            // Vecteur perpendiculaire unitaire
            var px = -uy;
            var py =  ux;

            // Handle du point de départ (à ~1/3 du segment + déviation perp.)
            var noise1 = (Math.random() - 0.5) * 2 * CURVE_NOISE;
            var cp1x = pi.x + ux * dist * 0.33 + px * noise1;
            var cp1y = pi.y + uy * dist * 0.33 + py * noise1;

            // Handle du point d'arrivée (à ~2/3 du segment + déviation perp. indépendante)
            var noise2 = (Math.random() - 0.5) * 2 * CURVE_NOISE;
            var cp2x = pi.x + ux * dist * 0.67 + px * noise2;
            var cp2y = pi.y + uy * dist * 0.67 + py * noise2;

            // --- Créer le PathItem directement dans le groupe ---
            // (grp.pathItems.add() est la seule façon fiable en ExtendScript
            //  d'ajouter un path dans un groupe — path.move() après coup est instable)
            var path = grp.pathItems.add();
            path.stroked     = true;
            path.filled      = false;
            path.strokeColor = strokeColor;
            path.strokeWidth = STROKE_WIDTH;
            path.closed      = false;

            // Point de départ
            var sp = path.pathPoints.add();
            sp.anchor        = [pi.x, pi.y];
            sp.leftDirection = [pi.x, pi.y];  // handle gauche = ancre (pas de courbe en amont)
            sp.rightDirection = [cp1x, cp1y]; // handle droit → vers l'intérieur du segment
            sp.pointType     = PointType.CORNER;

            // Point d'arrivée
            var ep = path.pathPoints.add();
            ep.anchor        = [pj.x, pj.y];
            ep.leftDirection = [cp2x, cp2y];  // handle gauche ← depuis l'intérieur du segment
            ep.rightDirection = [pj.x, pj.y]; // handle droit = ancre (pas de courbe en aval)
            ep.pointType     = PointType.CORNER;

            pathCount++;
        }
    }

    // --- Résultat ---
    alert(
        "Craquelures générées avec succès !\n\n" +
        "• " + pathCount + " courbes tracées\n" +
        "• " + totalPts + " points de base utilisés\n" +
        "• Layer : \"" + LAYER_NAME + "\" (en dessous de tous les autres)\n\n" +
        "Astuce : si le réseau est trop dense ou trop lâche,\n" +
        "ajustez NUM_POINTS et MAX_DIST en tête du script."
    );
}
