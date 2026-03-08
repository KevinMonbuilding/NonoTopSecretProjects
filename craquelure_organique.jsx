// =============================================================
// craquelure_organique.jsx  –  v11  (True clip mask)
//
// v11 changes:
//  - detectFrameRect() now returns the actual pathItem object
//  - Bounds computed from visibleBounds (includes stroke visually)
//  - Clip mask = duplicate of the REAL frame pathItem, not a
//    hand-crafted rectangle. Pixel-perfect alignment guaranteed.
//
// v10: strokeWidth/2 inset on reconstructed clip rect
// v9:  grp.clipped = true with hand-crafted clip rect
// v8:  detectFrameRect() + fallback to getDrawingBounds()
//
// Usage : File > Scripts > Other Script… > craquelure_organique.jsx
// =============================================================

// -------- PARAMÈTRES --------
var CELL_SIZE_AVG = 40;   // Taille moyenne pour la grille de base (pt)
var SEED_REMOVAL  = 0.30; // Fraction de graines supprimées (0-1) pour varier les tailles
var JITTER        = 0.65; // Perturbation aléatoire (0 = grille pure, 1 = max chaos)
var WOBBLE_AMP    = 0.25; // Amplitude des courbes organiques (fraction de la longueur du segment)
var WOBBLE_SUBDIV = 2;    // Subdivisions par arête (plus = plus de courbes)
var STROKE_R      = 100;
var STROKE_G      = 180;
var STROKE_B      = 220;
var STROKE_WIDTH  = 0.5;
var LAYER_NAME    = "Craquelures";
var DRAW_MARGIN   = 0;    // Marge autour de la bounding box du dessin (pt) — 0 = strictement dans le dessin
// ----------------------------

// Global clip bounds — set by main(), used by drawOrganicEdge()
var CLIP_XMIN, CLIP_XMAX, CLIP_YMIN, CLIP_YMAX;

if (app.documents.length === 0) {
    alert("Aucun document ouvert.");
} else {
    main();
}

// ============================================================
// Simple seeded pseudo-random number generator (LCG)
// Compatible with ExtendScript (ES3). Returns a function
// that produces deterministic values in [0,1).
// ============================================================
function seededRandom(seed) {
    var s = Math.abs(seed | 0) + 1;
    return function() {
        // Linear congruential generator (Numerical Recipes)
        s = (s * 1664525 + 1013904223) & 0x7FFFFFFF;
        return s / 0x7FFFFFFF;
    };
}

// ============================================================
// Generate a deterministic hash from two 2D points (edge endpoints).
// We round coordinates to avoid floating-point mismatch, and
// always order the two points the same way so A→B == B→A.
// ============================================================
function edgeKey(ax, ay, bx, by) {
    // Round to 2 decimal places to avoid float issues
    var x1 = Math.round(ax * 100);
    var y1 = Math.round(ay * 100);
    var x2 = Math.round(bx * 100);
    var y2 = Math.round(by * 100);

    // Canonical order: smaller x first, then smaller y
    if (x1 > x2 || (x1 === x2 && y1 > y2)) {
        var tmp;
        tmp = x1; x1 = x2; x2 = tmp;
        tmp = y1; y1 = y2; y2 = tmp;
    }
    return x1 + "," + y1 + "," + x2 + "," + y2;
}

// Deterministic seed from an edge key string
function hashString(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return h;
}

// ============================================================
// MAIN
// ============================================================
function main() {
    var doc = app.activeDocument;

    // --- Detect the drawing frame (largest closed pathItem) ---
    var boundsMethod = "frame";
    var frameResult  = detectFrameRect(doc);  // {bounds, item, typename} or null

    var drawBounds = frameResult ? frameResult.bounds : null;

    // Fallback: use all-content bounding box if no frame found
    if (!drawBounds) {
        boundsMethod = "allContent";
        drawBounds = getDrawingBounds(doc);
    }

    if (!drawBounds) {
        alert("Aucun contenu visible trouvé dans le document (hors layer Craquelures).");
        return;
    }

    // Use visibleBounds from the detected item (includes stroke).
    // drawBounds is already from visibleBounds if frameResult exists.
    // No manual inset needed — visibleBounds IS the outer edge of the stroke,
    // so the interior (where we want to draw) is already correct.
    var xMin = drawBounds.xMin;
    var xMax = drawBounds.xMax;
    var yMin = drawBounds.yMin;
    var yMax = drawBounds.yMax;

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

    // Store in globals for drawOrganicEdge clamping
    CLIP_XMIN = xMin;
    CLIP_XMAX = xMax;
    CLIP_YMIN = yMin;
    CLIP_YMAX = yMax;

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

    var wasLocked  = craqLayer.locked;
    var wasVisible = craqLayer.visible;
    craqLayer.locked  = false;
    craqLayer.visible = true;

    if (doc.layers.length > 1 && doc.layers[0] !== craqLayer) {
        craqLayer.zOrder(ZOrderMethod.BRINGTOFRONT);
    }
    while (craqLayer.pageItems.length > 0) {
        craqLayer.pageItems[0].remove();
    }

    // --- Seed grid with variable density ---
    var pad  = CELL_SIZE_AVG * 3;
    var cols = Math.ceil((W + 2 * pad) / CELL_SIZE_AVG) + 1;
    var rows = Math.ceil((H + 2 * pad) / CELL_SIZE_AVG) + 1;
    var seeds = [];

    var grid = [];
    for (var gr = 0; gr < rows; gr++) {
        grid[gr] = [];
        for (var gc = 0; gc < cols; gc++) {
            grid[gr][gc] = null;
        }
    }

    for (var row = 0; row < rows; row++) {
        for (var col = 0; col < cols; col++) {
            var isBorder = (row <= 1 || row >= rows - 2 || col <= 1 || col >= cols - 2);
            if (!isBorder && Math.random() < SEED_REMOVAL) {
                continue;
            }

            var bx = xMin - pad + col * CELL_SIZE_AVG;
            var by = yMin - pad + row * CELL_SIZE_AVG;
            var jitterScale = CELL_SIZE_AVG * JITTER;
            var sx = bx + (Math.random() - 0.5) * 2 * jitterScale;
            var sy = by + (Math.random() - 0.5) * 2 * jitterScale;

            var seed = { x: sx, y: sy, col: col, row: row, idx: seeds.length };
            seeds.push(seed);
            grid[row][col] = seed;
        }
    }

    var GRID_SEARCH = 4;

    // --- Build stroke color once ---
    var strokeCol = new RGBColor();
    strokeCol.red   = STROKE_R;
    strokeCol.green = STROKE_G;
    strokeCol.blue  = STROKE_B;

    var grp = craqLayer.groupItems.add();

    // Big initial polygon for each cell
    var BIG = (W + H) * 2;

    // ============================================================
    // PHASE 1: Compute all Voronoï cells (as polygon vertex arrays)
    // ============================================================
    var cells = [];

    for (var si = 0; si < seeds.length; si++) {
        var s = seeds[si];

        var poly = [
            { x: s.x - BIG, y: s.y - BIG },
            { x: s.x + BIG, y: s.y - BIG },
            { x: s.x + BIG, y: s.y + BIG },
            { x: s.x - BIG, y: s.y + BIG }
        ];

        var rMin = Math.max(0, s.row - GRID_SEARCH);
        var rMax = Math.min(rows - 1, s.row + GRID_SEARCH);
        var cMin = Math.max(0, s.col - GRID_SEARCH);
        var cMax = Math.min(cols - 1, s.col + GRID_SEARCH);

        for (var nr = rMin; nr <= rMax; nr++) {
            for (var nc = cMin; nc <= cMax; nc++) {
                if (nr === s.row && nc === s.col) continue;
                var nb = grid[nr][nc];
                if (!nb) continue;

                var dx = nb.x - s.x;
                var dy = nb.y - s.y;
                var mx = (s.x + nb.x) * 0.5;
                var my = (s.y + nb.y) * 0.5;

                poly = clipHalfPlane(poly, mx, my, dx, dy);
                if (poly.length < 3) break;
            }
            if (poly.length < 3) break;
        }

        if (poly.length < 3) { cells.push(null); continue; }

        // Clip against drawing bounding box
        poly = clipHalfPlane(poly, xMin, 0,    -1,  0);
        if (poly.length >= 3) poly = clipHalfPlane(poly, xMax, 0,     1,  0);
        if (poly.length >= 3) poly = clipHalfPlane(poly, 0,    yMin,  0, -1);
        if (poly.length >= 3) poly = clipHalfPlane(poly, 0,    yMax,  0,  1);

        if (poly.length < 3) { cells.push(null); continue; }

        cells.push(poly);
    }

    // ============================================================
    // PHASE 2: Extract unique edges from all cells, deduplicate
    // ============================================================
    var drawnEdges = {};  // key → true (already drawn)
    var edgeCount = 0;

    for (var ci = 0; ci < cells.length; ci++) {
        var cell = cells[ci];
        if (!cell) continue;

        var nv = cell.length;
        for (var ei = 0; ei < nv; ei++) {
            var ea = cell[ei];
            var eb = cell[(ei + 1) % nv];

            var key = edgeKey(ea.x, ea.y, eb.x, eb.y);

            if (drawnEdges[key]) continue;  // already drawn by neighbor cell
            drawnEdges[key] = true;

            // Draw this edge once, with deterministic wobble
            drawOrganicEdge(grp, ea, eb, strokeCol, key);
            edgeCount++;
        }
    }

    // ============================================================
    // PHASE 3: Native Illustrator clip mask using the REAL frame
    // pathItem (duplicated into the group as frontmost element).
    // This is pixel-perfect — no hand-crafted rectangle needed.
    // ============================================================
    if (frameResult && frameResult.item) {
        // Duplicate the actual frame path into the group, then bring to front
        var clipShape = frameResult.item.duplicate(grp);
        clipShape.stroked = false;
        clipShape.filled  = false;
        clipShape.zOrder(ZOrderMethod.BRINGTOFRONT);
        clipShape.clippingPath = true;
    } else {
        // Fallback: build a rectangle from computed bounds
        var clipRect = grp.pathItems.add();
        clipRect.stroked = false;
        clipRect.filled  = false;
        clipRect.setEntirePath([
            [xMin, yMax],
            [xMax, yMax],
            [xMax, yMin],
            [xMin, yMin]
        ]);
        clipRect.closed = true;
        clipRect.clippingPath = true;
        clipRect.zOrder(ZOrderMethod.BRINGTOFRONT);
    }
    grp.clipped = true;

    craqLayer.locked  = wasLocked;
    craqLayer.visible = wasVisible;

    var cellCount = 0;
    for (var cc = 0; cc < cells.length; cc++) {
        if (cells[cc]) cellCount++;
    }

    alert(
        "Craquelures v11 generees !\n\n" +
        "  " + cellCount + " cellules\n" +
        "  " + edgeCount + " aretes uniques dessinees\n" +
        "  Grille " + cols + " x " + rows + " (" + seeds.length + " graines actives)\n\n" +
        "  Detection: " + (boundsMethod === "frame"
            ? "CADRE DETECTE (" + (frameResult ? frameResult.typename : "?") + ")"
            : "FALLBACK (bounding box globale)") + "\n" +
        "  Clip: " + (frameResult && frameResult.item ? "DUPLIQUE du cadre reel" : "rectangle de secours") + "\n" +
        "  Bounds dessin: [" + Math.round(drawBounds.xMin) + ", " + Math.round(drawBounds.yMin) +
                         ", " + Math.round(drawBounds.xMax) + ", " + Math.round(drawBounds.yMax) + "]\n" +
        "  Artboard:      [" + Math.round(abXMin) + ", " + Math.round(abYMin) +
                         ", " + Math.round(abXMax) + ", " + Math.round(abYMax) + "]\n" +
        "  Clip final:    [" + Math.round(xMin) + ", " + Math.round(yMin) +
                         ", " + Math.round(xMax) + ", " + Math.round(yMax) + "]\n\n" +
        "Ajustez CELL_SIZE_AVG, SEED_REMOVAL, WOBBLE_AMP pour varier le rendu."
    );
}

// ============================================================
// Compute bounding box of all visible content EXCEPT the
// Craquelures layer. Uses layer.pageItems (top-level) which
// already includes groups with their full bounds. Also walks
// sublayers recursively.
// Returns {xMin, yMin, xMax, yMax} or null.
// ============================================================
function getDrawingBounds(doc) {
    var hasContent = false;
    var bxMin =  1e12;
    var byMin =  1e12;
    var bxMax = -1e12;
    var byMax = -1e12;

    function processLayer(lay) {
        if (lay.name === LAYER_NAME) return;
        if (!lay.visible) return;

        // Process items on this layer
        for (var pi = 0; pi < lay.pageItems.length; pi++) {
            var item = lay.pageItems[pi];
            if (item.hidden) continue;
            // Skip items that are themselves layers (sublayers show as pageItems too sometimes)
            if (item.typename === "Layer") continue;

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

        // Recurse into sublayers
        for (var si = 0; si < lay.layers.length; si++) {
            processLayer(lay.layers[si]);
        }
    }

    for (var li = 0; li < doc.layers.length; li++) {
        processLayer(doc.layers[li]);
    }

    if (!hasContent) return null;
    return { xMin: bxMin, yMin: byMin, xMax: bxMax, yMax: byMax };
}

// ============================================================
// Detect the drawing frame: find the largest CLOSED pathItem
// in the document (excluding the Craquelures layer).
//
// Uses visibleBounds (outer edge of stroke) for the clip region.
// Returns { bounds:{xMin,yMin,xMax,yMax}, item, typename } or null.
// ============================================================
function detectFrameRect(doc) {
    var bestArea = 0;
    var bestBounds = null;
    var bestItem = null;
    var bestTypename = null;

    // Artboard area for the 30% threshold check
    var ab   = doc.artboards[doc.artboards.getActiveArtboardIndex()];
    var rect = ab.artboardRect;
    var abW  = Math.abs(rect[2] - rect[0]);
    var abH  = Math.abs(rect[3] - rect[1]);
    var abArea = abW * abH;

    function checkPath(p) {
        if (p.hidden) return;
        if (!p.closed) return;

        // Use visibleBounds — outer edge of stroke, what you actually see
        var vb;
        try { vb = p.visibleBounds; } catch(e) { vb = p.geometricBounds; }

        var left   = Math.min(vb[0], vb[2]);
        var right  = Math.max(vb[0], vb[2]);
        var top    = Math.max(vb[1], vb[3]);
        var bottom = Math.min(vb[1], vb[3]);

        var area = (right - left) * (top - bottom);

        if (area > bestArea) {
            bestArea     = area;
            bestItem     = p;
            bestTypename = p.typename;
            bestBounds   = { xMin: left, xMax: right, yMin: bottom, yMax: top };
        }
    }

    function walkItems(container) {
        for (var i = 0; i < container.pathItems.length; i++) {
            checkPath(container.pathItems[i]);
        }
        for (var g = 0; g < container.groupItems.length; g++) {
            walkItems(container.groupItems[g]);
        }
        for (var c = 0; c < container.compoundPathItems.length; c++) {
            var cp = container.compoundPathItems[c];
            if (cp.hidden) continue;
            for (var pi = 0; pi < cp.pathItems.length; pi++) {
                checkPath(cp.pathItems[pi]);
            }
        }
    }

    function walkLayer(lay) {
        if (lay.name === LAYER_NAME) return;
        if (!lay.visible) return;
        walkItems(lay);
        for (var si = 0; si < lay.layers.length; si++) {
            walkLayer(lay.layers[si]);
        }
    }

    for (var li = 0; li < doc.layers.length; li++) {
        walkLayer(doc.layers[li]);
    }

    // Safety: frame must cover at least 30% of artboard
    if (bestBounds && bestArea >= abArea * 0.30) {
        return { bounds: bestBounds, item: bestItem, typename: bestTypename };
    }

    return null;
}

// ============================================================
// SUTHERLAND-HODGMAN — clip polygon against a single half-plane
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
// Clamp a point [x, y] to the global clip bounds
// ============================================================
function clampPt(pt) {
    return [
        Math.max(CLIP_XMIN, Math.min(CLIP_XMAX, pt[0])),
        Math.max(CLIP_YMIN, Math.min(CLIP_YMAX, pt[1]))
    ];
}

// ============================================================
// Draw a SINGLE edge as an organic Bézier curve.
//
// Uses a deterministic PRNG seeded from the edge key so
// the same edge always gets the same wobble — no double lines.
// ============================================================
function drawOrganicEdge(container, ptA, ptB, strokeCol, key) {
    var edgeLen = Math.sqrt((ptB.x - ptA.x) * (ptB.x - ptA.x) + (ptB.y - ptA.y) * (ptB.y - ptA.y));

    // Determine subdivisions based on edge length
    var subdiv = WOBBLE_SUBDIV;
    if (edgeLen < 8)  subdiv = 0;
    else if (edgeLen < 20) subdiv = 1;

    // Deterministic random from edge key
    var rng = seededRandom(hashString(key));

    // Perpendicular direction
    var perpX = -(ptB.y - ptA.y);
    var perpY =  (ptB.x - ptA.x);
    var perpLen = Math.sqrt(perpX * perpX + perpY * perpY);
    if (perpLen > 0.001) {
        perpX /= perpLen;
        perpY /= perpLen;
    }

    // Build list of points along the edge
    var pts = [];
    pts.push({ x: ptA.x, y: ptA.y });

    for (var s = 1; s <= subdiv; s++) {
        var t = s / (subdiv + 1);
        var mx = ptA.x + t * (ptB.x - ptA.x);
        var my = ptA.y + t * (ptB.y - ptA.y);

        var amp = edgeLen * WOBBLE_AMP / (subdiv + 1);
        var offset = (rng() - 0.5) * 2 * amp;

        mx += perpX * offset;
        my += perpY * offset;

        // Clamp to clip bounds so wobble never escapes
        mx = Math.max(CLIP_XMIN, Math.min(CLIP_XMAX, mx));
        my = Math.max(CLIP_YMIN, Math.min(CLIP_YMAX, my));

        pts.push({ x: mx, y: my });
    }

    pts.push({ x: ptB.x, y: ptB.y });

    // Draw the path
    var path = container.pathItems.add();
    path.stroked     = true;
    path.filled      = false;
    path.strokeWidth = STROKE_WIDTH;
    path.strokeColor = strokeCol;
    path.closed      = false;  // open path — single edge, not a polygon

    var nPts = pts.length;

    for (var pi = 0; pi < nPts; pi++) {
        var pp = path.pathPoints.add();
        var pt = clampPt([pts[pi].x, pts[pi].y]);
        pp.anchor = pt;

        if (pi === 0 || pi === nPts - 1) {
            // Endpoints: smooth handles toward the interior
            var neighborIdx = (pi === 0) ? 1 : nPts - 2;
            var nb = pts[neighborIdx];

            var hx = nb.x - pt[0];
            var hy = nb.y - pt[1];
            var hLen = Math.sqrt(hx * hx + hy * hy);
            var handleLen = Math.min(hLen * 0.3, 10);

            if (hLen > 0.001) {
                hx = hx / hLen * handleLen;
                hy = hy / hLen * handleLen;
            } else {
                hx = 0;
                hy = 0;
            }

            if (pi === 0) {
                pp.leftDirection  = pt;  // no handle on the outside
                pp.rightDirection = clampPt([pt[0] + hx, pt[1] + hy]);
            } else {
                pp.leftDirection  = clampPt([pt[0] - hx, pt[1] - hy]);
                pp.rightDirection = pt;  // no handle on the outside
            }
            pp.pointType = PointType.SMOOTH;
        } else {
            // Interior subdivision point: smooth Bézier
            var prev = pts[pi - 1];
            var next = pts[pi + 1];

            var dPrev = Math.sqrt((pt[0] - prev.x) * (pt[0] - prev.x) + (pt[1] - prev.y) * (pt[1] - prev.y));
            var dNext = Math.sqrt((pt[0] - next.x) * (pt[0] - next.x) + (pt[1] - next.y) * (pt[1] - next.y));
            var handleL = Math.min(dPrev * 0.35, 12);
            var handleR = Math.min(dNext * 0.35, 12);

            // Direction: smooth spline through prev → current → next
            var shx = next.x - prev.x;
            var shy = next.y - prev.y;
            var shLen = Math.sqrt(shx * shx + shy * shy);
            if (shLen > 0.001) {
                shx /= shLen;
                shy /= shLen;
            } else {
                shx = 0;
                shy = 0;
            }

            pp.leftDirection  = clampPt([pt[0] - shx * handleL, pt[1] - shy * handleL]);
            pp.rightDirection = clampPt([pt[0] + shx * handleR, pt[1] + shy * handleR]);
            pp.pointType      = PointType.SMOOTH;
        }
    }
}
