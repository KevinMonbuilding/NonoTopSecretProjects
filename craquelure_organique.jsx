// =============================================================
// craquelure_organique.jsx  –  v4  (Voronoï + Sutherland-Hodgman)
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
    // artboardRect = [left, top, right, bottom]
    // In Illustrator, Y can go either way depending on the document:
    //   Case A: [0, 842, 595, 0]     → top=842 > bottom=0  (Y up)
    //   Case B: [0, 0, 595, -842]    → top=0   > bottom=-842 (Y up, but shifted)
    // In all cases: top > bottom numerically.
    var ab   = doc.artboards[doc.artboards.getActiveArtboardIndex()];
    var rect = ab.artboardRect;
    var abL  = rect[0];
    var abT  = rect[1];
    var abR  = rect[2];
    var abB  = rect[3];

    // Ensure min/max are correct regardless of coordinate system
    var xMin = Math.min(abL, abR);
    var xMax = Math.max(abL, abR);
    var yMin = Math.min(abT, abB);
    var yMax = Math.max(abT, abB);

    var W = xMax - xMin;
    var H = yMax - yMin;

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
    craqLayer.zOrder(ZOrderMethod.BRINGTOFRONT);

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

    // Build a 2D grid index for fast neighbor lookup
    var grid = [];
    for (var gr = 0; gr < rows; gr++) {
        grid[gr] = [];
    }

    for (var row = 0; row < rows; row++) {
        for (var col = 0; col < cols; col++) {
            var bx = xMin - pad + col * CELL_SIZE;
            var by = yMin - pad + row * CELL_SIZE;
            var sx = bx + (Math.random() - 0.5) * 2 * CELL_SIZE * JITTER;
            var sy = by + (Math.random() - 0.5) * 2 * CELL_SIZE * JITTER;
            var seed = { x: sx, y: sy, col: col, row: row, idx: seeds.length };
            seeds.push(seed);
            grid[row][col] = seed;
        }
    }

    // --- Build stroke color once ---
    var strokeCol = new RGBColor();
    strokeCol.red   = STROKE_R;
    strokeCol.green = STROKE_G;
    strokeCol.blue  = STROKE_B;

    var grp = craqLayer.groupItems.add();
    var cellCount = 0;

    // Big initial polygon for each cell (much larger than any possible cell)
    var BIG = (W + H) * 2;

    // Neighbor search radius in grid cells (not points)
    var GRID_SEARCH = 3; // search ±3 cells in the grid

    for (var si = 0; si < seeds.length; si++) {
        var s = seeds[si];

        // Start with a large bounding square centred on the seed
        var poly = [
            { x: s.x - BIG, y: s.y - BIG },
            { x: s.x + BIG, y: s.y - BIG },
            { x: s.x + BIG, y: s.y + BIG },
            { x: s.x - BIG, y: s.y + BIG }
        ];

        // --- Clip by half-plane for each neighbour seed ---
        // Use grid-based lookup: only check seeds within ±GRID_SEARCH cells
        var rMin = Math.max(0, s.row - GRID_SEARCH);
        var rMax = Math.min(rows - 1, s.row + GRID_SEARCH);
        var cMin = Math.max(0, s.col - GRID_SEARCH);
        var cMax = Math.min(cols - 1, s.col + GRID_SEARCH);

        for (var nr = rMin; nr <= rMax; nr++) {
            for (var nc = cMin; nc <= cMax; nc++) {
                if (nr === s.row && nc === s.col) continue;
                var nb = grid[nr][nc];

                var dx = nb.x - s.x;
                var dy = nb.y - s.y;

                // Half-plane: keep points closer to s than to nb
                // Normal pointing FROM s TOWARD nb: (dx, dy)
                // A point p is on s's side if: dot(p - mid, (nb - s)) <= 0
                var mx = (s.x + nb.x) * 0.5;
                var my = (s.y + nb.y) * 0.5;

                poly = clipHalfPlane(poly, mx, my, dx, dy);
                if (poly.length < 3) break;
            }
            if (poly.length < 3) break;
        }

        if (poly.length < 3) continue;

        // --- Clip against artboard using 4 explicit half-planes ---
        // This is winding-order-independent and works regardless of
        // which way Y points in the document.
        //
        // Each half-plane: keep points where dot(p - edgePoint, outwardNormal) <= 0
        //   Left edge:   keep x >= xMin  →  outward normal (-1, 0),  point on edge (xMin, 0)
        //   Right edge:  keep x <= xMax  →  outward normal (+1, 0),  point on edge (xMax, 0)
        //   Bottom edge: keep y >= yMin  →  outward normal (0, -1),  point on edge (0, yMin)
        //   Top edge:    keep y <= yMax  →  outward normal (0, +1),  point on edge (0, yMax)

        poly = clipHalfPlane(poly, xMin, 0,    -1,  0);   // left
        if (poly.length >= 3) poly = clipHalfPlane(poly, xMax, 0,     1,  0);   // right
        if (poly.length >= 3) poly = clipHalfPlane(poly, 0,    yMin,  0, -1);   // bottom
        if (poly.length >= 3) poly = clipHalfPlane(poly, 0,    yMax,  0,  1);   // top

        if (poly.length < 3) continue;

        // --- Draw closed polygon ---
        drawPolygon(grp, poly, strokeCol);
        cellCount++;
    }

    craqLayer.locked  = wasLocked;
    craqLayer.visible = wasVisible;

    alert(
        "Craquelures generees !\n\n" +
        "  " + cellCount + " cellules dessinees\n" +
        "  Grille " + cols + " x " + rows + " = " + seeds.length + " graines\n" +
        "  Artboard: [" + xMin + ", " + yMin + ", " + xMax + ", " + yMax + "]\n\n" +
        "Ajustez CELL_SIZE pour changer la taille des cellules."
    );
}

// ============================================================
// SUTHERLAND-HODGMAN — clip polygon against a single half-plane
//
// Half-plane defined by:
//   A point M = (mx, my) on the boundary line
//   An outward normal (nx, ny) pointing toward the EXCLUDED side
//
// "Inside" = dot(p - M, N) <= 0
// ============================================================
function clipHalfPlane(poly, mx, my, nx, ny) {
    var output = [];
    var len = poly.length;
    if (len === 0) return output;

    for (var i = 0; i < len; i++) {
        var cur  = poly[i];
        var next = poly[(i + 1) % len];

        var dCur  = (cur.x  - mx) * nx + (cur.y  - my) * ny;
        var dNext = (next.x - mx) * nx + (next.y - my) * ny;

        var curInside  = (dCur  <= 0);
        var nextInside = (dNext <= 0);

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
        pp.anchor         = pt;
        pp.leftDirection  = pt;
        pp.rightDirection = pt;
        pp.pointType      = PointType.CORNER;
    }
}
