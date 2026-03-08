// =============================================================
// craquelure_organique.jsx  –  v3  (Voronoï + Sutherland-Hodgman)
//
// Génère un réseau de cellules Voronoï clippées sur l'artboard.
// Chaque cellule est un polygone FERMÉ → mosaïque/craquelure propre.
//
// Usage : File > Scripts > Other Script… > craquelure_organique.jsx
// =============================================================

// -------- PARAMÈTRES --------
var CELL_SIZE    = 40;    // Distance entre graines (pt) — taille des cellules
var JITTER       = 0.55;  // Perturbation aléatoire (0 = grille pure, 1 = max chaos)
var STROKE_R     = 100;
var STROKE_G     = 180;
var STROKE_B     = 220;
var STROKE_WIDTH = 0.5;
var LAYER_NAME   = "Craquelures";
// ----------------------------

if (app.documents.length === 0) {
    alert("Aucun document ouvert.");
} else {
    main();
}

// ============================================================
// MAIN
// ============================================================
function main() {
    var doc = app.activeDocument;

    // --- Artboard bounds ---
    var ab      = doc.artboards[doc.artboards.getActiveArtboardIndex()];
    var rect    = ab.artboardRect; // [left, top, right, bottom]
    var abL = rect[0], abT = rect[1], abR = rect[2], abB = rect[3];
    // Note: in Illustrator coords, abT > abB (Y grows upward internally,
    // but artboardRect stores [L, T, R, B] where T is numerically larger)
    var W = abR - abL;
    var H = abT - abB; // positive

    // --- Layer management ---
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

    // --- Seed grid (with padding so edge cells are fully formed) ---
    var pad  = CELL_SIZE * 2;
    var cols = Math.ceil((W + 2 * pad) / CELL_SIZE) + 1;
    var rows = Math.ceil((H + 2 * pad) / CELL_SIZE) + 1;
    var seeds = [];

    for (var row = 0; row < rows; row++) {
        for (var col = 0; col < cols; col++) {
            var bx = abL - pad + col * CELL_SIZE;
            var by = abB - pad + row * CELL_SIZE;
            var sx = bx + (Math.random() - 0.5) * 2 * CELL_SIZE * JITTER;
            var sy = by + (Math.random() - 0.5) * 2 * CELL_SIZE * JITTER;
            seeds.push({ x: sx, y: sy, col: col, row: row });
        }
    }

    // --- Build stroke color once ---
    var strokeCol = new RGBColor();
    strokeCol.red   = STROKE_R;
    strokeCol.green = STROKE_G;
    strokeCol.blue  = STROKE_B;

    // --- Artboard as initial clipping polygon (slightly inset to avoid hairlines on border) ---
    var INS = 0; // inset in pt — 0 = flush with artboard edge
    var artboardPoly = [
        { x: abL + INS, y: abB + INS },
        { x: abR - INS, y: abB + INS },
        { x: abR - INS, y: abT - INS },
        { x: abL + INS, y: abT - INS }
    ];

    var grp = craqLayer.groupItems.add();
    var cellCount = 0;

    // Big initial polygon for each cell (much larger than any possible cell)
    var BIG = (W + H) * 2;

    for (var si = 0; si < seeds.length; si++) {
        var s = seeds[si];

        // Skip seeds that are far outside artboard + padding (won't produce visible cells)
        if (s.x < abL - pad - CELL_SIZE || s.x > abR + pad + CELL_SIZE) continue;
        if (s.y < abB - pad - CELL_SIZE || s.y > abT + pad + CELL_SIZE) continue;

        // Start with a large bounding square centred on the seed
        var poly = [
            { x: s.x - BIG, y: s.y - BIG },
            { x: s.x + BIG, y: s.y - BIG },
            { x: s.x + BIG, y: s.y + BIG },
            { x: s.x - BIG, y: s.y + BIG }
        ];

        // --- Clip by half-plane for each neighbour seed ---
        // Only consider seeds within a reasonable distance (2.5 * CELL_SIZE)
        var searchRadius = CELL_SIZE * 3.5;
        var searchRadiusSq = searchRadius * searchRadius;

        for (var ni = 0; ni < seeds.length; ni++) {
            if (ni === si) continue;
            var n = seeds[ni];
            var dx = n.x - s.x;
            var dy = n.y - s.y;
            var distSq = dx * dx + dy * dy;
            if (distSq > searchRadiusSq) continue;

            // Half-plane: keep points closer to s than to n
            // Boundary: perpendicular bisector of [s, n]
            // Normal pointing FROM s TOWARD n: (dx, dy)/dist
            // A point p is in the half-plane (on s's side) if:
            //   dot(p - mid, (n - s)) <= 0
            // i.e.  (p.x - mx)*dx + (p.y - my)*dy <= 0
            var mx = (s.x + n.x) * 0.5;
            var my = (s.y + n.y) * 0.5;

            poly = sutherlandHodgmanHalfPlane(poly, mx, my, dx, dy);
            if (poly.length < 3) break; // degenerate cell — skip
        }

        if (poly.length < 3) continue;

        // --- Clip against artboard ---
        poly = sutherlandHodgmanPolygon(poly, artboardPoly);
        if (poly.length < 3) continue;

        // --- Draw closed polygon ---
        drawPolygon(grp, poly, strokeCol);
        cellCount++;
    }

    craqLayer.locked  = wasLocked;
    craqLayer.visible = wasVisible;

    alert(
        "Craquelures générées !\n\n" +
        "• " + cellCount + " cellules dessinées\n" +
        "• Grille " + cols + " × " + rows + " = " + seeds.length + " graines\n\n" +
        "Ajustez CELL_SIZE pour changer la taille des cellules."
    );
}

// ============================================================
// SUTHERLAND-HODGMAN — clip polygon against a single half-plane
//
// The half-plane is defined by:
//   A point M = (mx, my) on the boundary
//   A normal direction (nx, ny) pointing OUTWARD (outside = excluded side)
//
// "Inside" = dot(p - M, N) <= 0
// ============================================================
function sutherlandHodgmanHalfPlane(poly, mx, my, nx, ny) {
    // nx, ny here is the direction FROM seed s TO neighbour n,
    // so "outside" = on n's side, "inside" = on s's side (dot <= 0).
    var output = [];
    var len = poly.length;
    if (len === 0) return output;

    for (var i = 0; i < len; i++) {
        var cur  = poly[i];
        var next = poly[(i + 1) % len];

        var dCur  = (cur.x  - mx) * nx + (cur.y  - my) * ny;
        var dNext = (next.x - mx) * nx + (next.y - my) * ny;

        var curInside  = dCur  <= 0;
        var nextInside = dNext <= 0;

        if (curInside) {
            output.push(cur);
        }
        if (curInside !== nextInside) {
            // Edge crosses the boundary — compute intersection
            var t = dCur / (dCur - dNext);
            output.push({
                x: cur.x + t * (next.x - cur.x),
                y: cur.y + t * (next.y - cur.y)
            });
        }
    }
    return output;
}

// ============================================================
// SUTHERLAND-HODGMAN — clip polygon against another convex polygon
// (applies one half-plane per edge of the clip polygon)
// ============================================================
function sutherlandHodgmanPolygon(subjectPoly, clipPoly) {
    var output = subjectPoly.slice();
    var clipLen = clipPoly.length;

    for (var ci = 0; ci < clipLen; ci++) {
        if (output.length === 0) break;

        var A = clipPoly[ci];
        var B = clipPoly[(ci + 1) % clipLen];

        // Edge AB, interior is to the LEFT of AB
        // Normal pointing RIGHT (outward for a CCW polygon) = (B.y-A.y, -(B.x-A.x))... 
        // Actually we want the inward normal. For a CCW polygon the interior is to
        // the left of each directed edge A→B.
        // Left normal of (B-A): (-dy, dx) where dx=B.x-A.x, dy=B.y-A.y
        // But S-H uses the "cut away outside" logic, so outward normal = (dy, -dx):
        var edgeDx = B.x - A.x;
        var edgeDy = B.y - A.y;
        // Outward normal (right of directed edge, for CCW polygon = exterior side):
        var outNx =  edgeDy;
        var outNy = -edgeDx;

        output = sutherlandHodgmanHalfPlane(output, A.x, A.y, outNx, outNy);
    }
    return output;
}

// ============================================================
// Draw a closed polygon as an Illustrator pathItem
// ============================================================
function drawPolygon(container, poly, strokeCol) {
    var path = container.pathItems.add();
    path.stroked     = true;
    path.filled      = false;
    path.strokeWidth = STROKE_WIDTH;
    path.strokeColor = strokeCol;
    path.closed      = true;

    for (var i = 0; i < poly.length; i++) {
        var pp = path.pathPoints.add();
        var pt = [poly[i].x, poly[i].y];
        pp.anchor        = pt;
        pp.leftDirection = pt;
        pp.rightDirection = pt;
        pp.pointType     = PointType.CORNER;
    }
}
