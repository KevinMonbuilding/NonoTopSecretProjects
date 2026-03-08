// =============================================================
// craquelure_organique.jsx  –  v5  (Organic Voronoï)
//
// Generates a network of Voronoï cells clipped to the drawing
// bounding box. Edges are organically curved (Bézier wobble),
// cell sizes vary randomly for a natural craquelure look.
//
// Usage : File > Scripts > Other Script… > craquelure_organique.jsx
// =============================================================

// -------- PARAMÈTRES --------
var CELL_SIZE_MIN = 25;   // Taille minimum des cellules (pt)
var CELL_SIZE_MAX = 65;   // Taille maximum des cellules (pt)
var CELL_SIZE_AVG = 40;   // Taille moyenne pour la grille de base
var SEED_REMOVAL  = 0.30; // Fraction de graines supprimées (0-1) pour varier les tailles
var JITTER        = 0.65; // Perturbation aléatoire (0 = grille pure, 1 = max chaos)
var WOBBLE_AMP    = 0.30; // Amplitude des courbes organiques (fraction de la longueur du segment)
var WOBBLE_SUBDIV = 2;    // Subdivisions par arête (plus = plus de courbes)
var STROKE_R      = 100;
var STROKE_G      = 180;
var STROKE_B      = 220;
var STROKE_WIDTH  = 0.5;
var LAYER_NAME    = "Craquelures";
var DRAW_MARGIN   = 10;   // Marge autour de la bounding box du dessin (pt)
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

    // --- Compute drawing bounding box (all visible content except Craquelures) ---
    var drawBounds = getDrawingBounds(doc);
    if (!drawBounds) {
        alert("Aucun contenu visible trouvé dans le document (hors layer Craquelures).");
        return;
    }

    // Add margin
    var xMin = drawBounds.xMin - DRAW_MARGIN;
    var xMax = drawBounds.xMax + DRAW_MARGIN;
    var yMin = drawBounds.yMin - DRAW_MARGIN;
    var yMax = drawBounds.yMax + DRAW_MARGIN;

    // Also clamp to artboard so we never exceed it
    var ab   = doc.artboards[doc.artboards.getActiveArtboardIndex()];
    var rect = ab.artboardRect;
    var abXMin = Math.min(rect[0], rect[2]);
    var abXMax = Math.max(rect[0], rect[2]);
    var abYMin = Math.min(rect[1], rect[3]);
    var abYMax = Math.max(rect[1], rect[3]);

    xMin = Math.max(xMin, abXMin);
    xMax = Math.min(xMax, abXMax);
    yMin = Math.max(yMin, abYMin);
    yMax = Math.min(yMax, abYMax);

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

    // --- Seed grid with variable density ---
    // Base grid at CELL_SIZE_AVG, then randomly remove seeds + add extra jitter
    var pad  = CELL_SIZE_MAX * 2;
    var cols = Math.ceil((W + 2 * pad) / CELL_SIZE_AVG) + 1;
    var rows = Math.ceil((H + 2 * pad) / CELL_SIZE_AVG) + 1;
    var seeds = [];

    // Build a 2D grid index for fast neighbor lookup
    // Because we remove seeds, grid cells can be null
    var grid = [];
    for (var gr = 0; gr < rows; gr++) {
        grid[gr] = [];
        for (var gc = 0; gc < cols; gc++) {
            grid[gr][gc] = null;
        }
    }

    for (var row = 0; row < rows; row++) {
        for (var col = 0; col < cols; col++) {
            // Random removal for size variation (but keep border seeds)
            var isBorder = (row <= 1 || row >= rows - 2 || col <= 1 || col >= cols - 2);
            if (!isBorder && Math.random() < SEED_REMOVAL) {
                continue; // skip → neighbor cells will grow larger
            }

            var bx = xMin - pad + col * CELL_SIZE_AVG;
            var by = yMin - pad + row * CELL_SIZE_AVG;

            // Variable jitter: random between CELL_SIZE_MIN and CELL_SIZE_MAX influence
            var jitterScale = CELL_SIZE_AVG * JITTER;
            var sx = bx + (Math.random() - 0.5) * 2 * jitterScale;
            var sy = by + (Math.random() - 0.5) * 2 * jitterScale;

            var seed = { x: sx, y: sy, col: col, row: row, idx: seeds.length };
            seeds.push(seed);
            grid[row][col] = seed;
        }
    }

    // Build flat list of seeds with grid coordinates for neighbor lookup
    // Since some grid cells are null, we need a wider search radius
    var GRID_SEARCH = 4; // wider because of removed seeds

    // --- Build stroke color once ---
    var strokeCol = new RGBColor();
    strokeCol.red   = STROKE_R;
    strokeCol.green = STROKE_G;
    strokeCol.blue  = STROKE_B;

    var grp = craqLayer.groupItems.add();
    var cellCount = 0;

    // Big initial polygon for each cell
    var BIG = (W + H) * 2;

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
        var rMin = Math.max(0, s.row - GRID_SEARCH);
        var rMax = Math.min(rows - 1, s.row + GRID_SEARCH);
        var cMin = Math.max(0, s.col - GRID_SEARCH);
        var cMax = Math.min(cols - 1, s.col + GRID_SEARCH);

        for (var nr = rMin; nr <= rMax; nr++) {
            for (var nc = cMin; nc <= cMax; nc++) {
                if (nr === s.row && nc === s.col) continue;
                var nb = grid[nr][nc];
                if (!nb) continue; // removed seed

                var dx = nb.x - s.x;
                var dy = nb.y - s.y;
                var mx = (s.x + nb.x) * 0.5;
                var my = (s.y + nb.y) * 0.5;

                poly = clipHalfPlane(poly, mx, my, dx, dy);
                if (poly.length < 3) break;
            }
            if (poly.length < 3) break;
        }

        if (poly.length < 3) continue;

        // --- Clip against drawing bounding box using 4 explicit half-planes ---
        poly = clipHalfPlane(poly, xMin, 0,    -1,  0);   // left
        if (poly.length >= 3) poly = clipHalfPlane(poly, xMax, 0,     1,  0);   // right
        if (poly.length >= 3) poly = clipHalfPlane(poly, 0,    yMin,  0, -1);   // bottom
        if (poly.length >= 3) poly = clipHalfPlane(poly, 0,    yMax,  0,  1);   // top

        if (poly.length < 3) continue;

        // --- Draw closed polygon with organic curves ---
        drawOrganicPolygon(grp, poly, strokeCol);
        cellCount++;
    }

    craqLayer.locked  = wasLocked;
    craqLayer.visible = wasVisible;

    alert(
        "Craquelures v5 generees !\n\n" +
        "  " + cellCount + " cellules dessinees\n" +
        "  Grille " + cols + " x " + rows + " (" + seeds.length + " graines actives)\n" +
        "  Zone dessin: [" + Math.round(xMin) + ", " + Math.round(yMin) +
                       ", " + Math.round(xMax) + ", " + Math.round(yMax) + "]\n\n" +
        "Ajustez CELL_SIZE_MIN/MAX, SEED_REMOVAL, WOBBLE_AMP pour varier le rendu."
    );
}

// ============================================================
// Compute bounding box of all visible content EXCEPT the
// Craquelures layer. Returns {xMin, yMin, xMax, yMax} or null.
// ============================================================
function getDrawingBounds(doc) {
    var hasContent = false;
    var bxMin =  1e12;
    var byMin =  1e12;
    var bxMax = -1e12;
    var byMax = -1e12;

    for (var li = 0; li < doc.layers.length; li++) {
        var lay = doc.layers[li];
        if (lay.name === LAYER_NAME) continue;
        if (!lay.visible) continue;

        for (var pi = 0; pi < lay.pageItems.length; pi++) {
            var item = lay.pageItems[pi];
            if (item.hidden) continue;

            // geometricBounds = [left, top, right, bottom]
            // In Illustrator: top > bottom (Y goes up)
            var gb = item.geometricBounds;
            var iLeft   = gb[0];
            var iTop    = gb[1];
            var iRight  = gb[2];
            var iBottom = gb[3];

            var ixMin = Math.min(iLeft, iRight);
            var ixMax = Math.max(iLeft, iRight);
            var iyMin = Math.min(iTop, iBottom);
            var iyMax = Math.max(iTop, iBottom);

            if (ixMin < bxMin) bxMin = ixMin;
            if (iyMin < byMin) byMin = iyMin;
            if (ixMax > bxMax) bxMax = ixMax;
            if (iyMax > byMax) byMax = iyMax;

            hasContent = true;
        }
    }

    if (!hasContent) return null;

    return { xMin: bxMin, yMin: byMin, xMax: bxMax, yMax: byMax };
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
// Draw a closed polygon with ORGANIC Bézier curves
//
// Strategy: for each edge of the polygon, subdivide into
// WOBBLE_SUBDIV segments and add random perpendicular offset
// to the Bézier control handles. This creates wavy, natural-
// looking edges while keeping vertices connected.
// ============================================================
function drawOrganicPolygon(container, poly, strokeCol) {
    var nVerts = poly.length;
    if (nVerts < 3) return;

    // Build the full list of points: subdivide each edge
    var allPts = []; // each entry: {x, y, isVertex}

    for (var i = 0; i < nVerts; i++) {
        var a = poly[i];
        var b = poly[(i + 1) % nVerts];

        var edgeLen = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));

        // Determine how many subdivisions based on edge length
        var subdiv = WOBBLE_SUBDIV;
        if (edgeLen < 8) subdiv = 0;       // very short edges: no subdivision
        else if (edgeLen < 20) subdiv = 1;  // short edges: 1 subdivision

        // Push the starting vertex
        allPts.push({ x: a.x, y: a.y, isVertex: true, edgeLen: edgeLen });

        // Push intermediate subdivision points (not the last one = next vertex)
        for (var s = 1; s <= subdiv; s++) {
            var t = s / (subdiv + 1);
            var mx = a.x + t * (b.x - a.x);
            var my = a.y + t * (b.y - a.y);

            // Add random perpendicular offset for organic feel
            var perpX = -(b.y - a.y);
            var perpY =  (b.x - a.x);
            var perpLen = Math.sqrt(perpX * perpX + perpY * perpY);
            if (perpLen > 0.001) {
                perpX /= perpLen;
                perpY /= perpLen;
            }

            // Random offset: amplitude proportional to edge length
            var amp = edgeLen * WOBBLE_AMP / (subdiv + 1);
            var offset = (Math.random() - 0.5) * 2 * amp;

            mx += perpX * offset;
            my += perpY * offset;

            allPts.push({ x: mx, y: my, isVertex: false, edgeLen: edgeLen });
        }
    }

    // Now draw the path with smooth Bézier handles at subdivision points
    // and corner handles at original vertices
    var path = container.pathItems.add();
    path.stroked     = true;
    path.filled      = false;
    path.strokeWidth = STROKE_WIDTH;
    path.strokeColor = strokeCol;
    path.closed      = true;

    var nPts = allPts.length;

    for (var pi = 0; pi < nPts; pi++) {
        var pp = path.pathPoints.add();
        var pt = [allPts[pi].x, allPts[pi].y];
        pp.anchor = pt;

        if (allPts[pi].isVertex) {
            // Original polygon vertex: slight smooth handles for organic corners
            // Compute handle direction from prev to next point
            var prevIdx = (pi - 1 + nPts) % nPts;
            var nextIdx = (pi + 1) % nPts;
            var prev = allPts[prevIdx];
            var next = allPts[nextIdx];

            var handleLen = Math.min(allPts[pi].edgeLen * 0.15, 8);
            // Smooth handle direction: from prev toward next
            var hx = next.x - prev.x;
            var hy = next.y - prev.y;
            var hLen = Math.sqrt(hx * hx + hy * hy);
            if (hLen > 0.001) {
                hx = hx / hLen * handleLen;
                hy = hy / hLen * handleLen;
            } else {
                hx = 0;
                hy = 0;
            }

            pp.leftDirection  = [pt[0] - hx, pt[1] - hy];
            pp.rightDirection = [pt[0] + hx, pt[1] + hy];
            pp.pointType      = PointType.SMOOTH;
        } else {
            // Subdivision point: smooth Bézier with organic handles
            var prevIdx2 = (pi - 1 + nPts) % nPts;
            var nextIdx2 = (pi + 1) % nPts;
            var prev2 = allPts[prevIdx2];
            var next2 = allPts[nextIdx2];

            // Handle length proportional to distance to neighbors
            var dPrev = Math.sqrt((pt[0] - prev2.x) * (pt[0] - prev2.x) + (pt[1] - prev2.y) * (pt[1] - prev2.y));
            var dNext = Math.sqrt((pt[0] - next2.x) * (pt[0] - next2.x) + (pt[1] - next2.y) * (pt[1] - next2.y));
            var handleL = Math.min(dPrev * 0.35, 12);
            var handleR = Math.min(dNext * 0.35, 12);

            // Direction: smooth spline through prev → current → next
            var shx = next2.x - prev2.x;
            var shy = next2.y - prev2.y;
            var shLen = Math.sqrt(shx * shx + shy * shy);
            if (shLen > 0.001) {
                shx /= shLen;
                shy /= shLen;
            } else {
                shx = 0;
                shy = 0;
            }

            pp.leftDirection  = [pt[0] - shx * handleL, pt[1] - shy * handleL];
            pp.rightDirection = [pt[0] + shx * handleR, pt[1] + shy * handleR];
            pp.pointType      = PointType.SMOOTH;
        }
    }
}
