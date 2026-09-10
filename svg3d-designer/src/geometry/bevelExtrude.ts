import * as THREE from "three";
import * as polygonClipping from "polygon-clipping";
import { roundContour } from "./roundCorners";

/**
 * Independent top/bottom edge bevels for an extruded shape — distinct from
 * `roundCorners.ts`'s corner-radius fillet, which softens the 2D outline's
 * *corners*. A bevel instead rounds over the *top or bottom rim* of every
 * edge, all the way around — the classic print-quality trick for reducing
 * overhangs/elephant's foot or just softening a hard edge, and it can be
 * set independently per side.
 *
 * This intentionally does not reuse `THREE.ExtrudeGeometry`'s own
 * `bevelEnabled` option: that bevel is always symmetric (identical on both
 * ends) and — per its own source — *expands* the wall outward from the cap
 * face rather than chamfering it inward, which is the opposite of what a
 * print-oriented "smooth this edge" control should do. This is a
 * purpose-built, much simpler version of the same technique (ear-clip
 * triangulated caps + ruled side walls between stacked contour rings), with
 * the movement-vector math for offsetting a contour ported from
 * `ExtrudeGeometry`'s internal `getBevelVec`.
 *
 * Each active side is a quarter-round curve (the same shape as Blender's
 * Bevel modifier at a high segment count) subdivided into
 * `BEVEL_CURVE_SEGMENTS` straight facets — not one straight 45°-style cut.
 * A single flat facet per side reads as an obviously faceted "cut corner";
 * enough small facets approximating a curve reads as a smooth, rounded
 * edge instead, the same "Segments" lever a 3D modeler would reach for.
 */

/** How many straight facets approximate each active bevel's quarter-round
 * curve. Low enough to stay cheap on complex imported SVGs, high enough
 * that the facets blend into a visibly smooth curve rather than reading as
 * a chamfer. */
const BEVEL_CURVE_SEGMENTS = 10;

/**
 * `getBevelVec` gives every polygon vertex exactly ONE offset direction —
 * correct for a flat edge (a straight wall's whole length shares that one
 * perpendicular), but at a sharp corner it collapses the round bevel curve
 * down to a single mitered point: the corner vertex still sweeps through
 * the same z/inset values as every other ring, just along one straight
 * diagonal instead of an actual arc, so the smoothly-rounded edges meet at
 * a hard, faceted corner instead of blending into it (three.js's own
 * `ExtrudeGeometry` bevel has this exact same limitation, for the same
 * reason). Rounding each corner into a short arc of extra points BEFORE
 * computing movement vectors gives the corner several slightly-different
 * offset directions instead of one, so it sweeps out a real curve — the
 * same fix a "round join" polygon-offset algorithm (e.g. Clipper's
 * jtRound) uses. Sized off the bevel amount itself so a barely-there bevel
 * doesn't over-round the shape and a big one gets a corner that actually
 * matches its wall curve; segment count is low since this is a subtle
 * assist, not the shape's own visible corner-radius feature.
 */
const BEVEL_CORNER_ROUNDING_FRACTION = 0.5;
const BEVEL_CORNER_SEGMENTS = 6;

/** How much of a region's own narrowest half-width a bevel may safely use
 * before its offset contour risks folding past the opposite wall (see the
 * self-intersection guard below). Exported so a caller that deliberately
 * wants a bevel to reach all the way to a full, self-supporting dome (e.g.
 * the Dimple tool pressing a smooth recess into another shape) can ask for
 * that same safe maximum directly instead of guessing at a value. */
export const BEVEL_SELF_INTERSECTION_SAFETY = 0.85;

// Above this squared length, a computed miter vector is treated as blown
// up rather than trusted — see the fallback below. The two "normal"
// branches of getBevelVec both settle on exactly 2 (or less) by
// construction, so anything meaningfully past that is already outside
// what a healthy corner ever produces, not just "a sharp one."
const BEVEL_VEC_MAX_LENSQ = 8;

/**
 * A simple, always-numerically-stable offset direction for a corner —
 * the normalized average of each adjacent edge's own perpendicular,
 * without trying to compute the exact miter length a sharp corner would
 * ideally get. Used only as a fallback (see getBevelVec) when the real
 * miter computation comes out degenerate, so it trades a little precision
 * at that one corner (very slightly under-mitered instead of exact) for
 * never producing a wildly wrong or unbounded vertex.
 */
function safeFallbackVec(vPrevX: number, vPrevY: number, vPrevLen: number, vNextX: number, vNextY: number, vNextLen: number): THREE.Vector2 {
  const perpPrevX = -vPrevY / vPrevLen;
  const perpPrevY = vPrevX / vPrevLen;
  const perpNextX = -vNextY / vNextLen;
  const perpNextY = vNextX / vNextLen;
  const sumX = perpPrevX + perpNextX;
  const sumY = perpPrevY + perpNextY;
  const sumLen = Math.hypot(sumX, sumY);
  // The two edges point their perpendiculars in exactly opposite
  // directions (a true 180° spike/notch) — any one consistent
  // perpendicular is as reasonable a choice as another there.
  if (sumLen < 1e-9) return new THREE.Vector2(perpPrevX, perpPrevY);
  return new THREE.Vector2(sumX / sumLen, sumY / sumLen);
}

function getBevelVec(inPt: THREE.Vector2, inPrev: THREE.Vector2, inNext: THREE.Vector2): THREE.Vector2 {
  let v_trans_x: number, v_trans_y: number, shrink_by: number;

  const v_prev_x = inPt.x - inPrev.x;
  const v_prev_y = inPt.y - inPrev.y;
  const v_next_x = inNext.x - inPt.x;
  const v_next_y = inNext.y - inPt.y;

  const v_prev_lensq = v_prev_x * v_prev_x + v_prev_y * v_prev_y;
  const collinear0 = v_prev_x * v_next_y - v_prev_y * v_next_x;

  if (Math.abs(collinear0) > Number.EPSILON) {
    const v_prev_len = Math.sqrt(v_prev_lensq);
    const v_next_len = Math.sqrt(v_next_x * v_next_x + v_next_y * v_next_y);

    const ptPrevShift_x = inPrev.x - v_prev_y / v_prev_len;
    const ptPrevShift_y = inPrev.y + v_prev_x / v_prev_len;
    const ptNextShift_x = inNext.x - v_next_y / v_next_len;
    const ptNextShift_y = inNext.y + v_next_x / v_next_len;

    const sf =
      ((ptNextShift_x - ptPrevShift_x) * v_next_y - (ptNextShift_y - ptPrevShift_y) * v_next_x) /
      (v_prev_x * v_next_y - v_prev_y * v_next_x);

    v_trans_x = ptPrevShift_x + v_prev_x * sf - inPt.x;
    v_trans_y = ptPrevShift_y + v_prev_y * sf - inPt.y;

    const v_trans_lensq = v_trans_x * v_trans_x + v_trans_y * v_trans_y;
    // A shape built by unioning several overlapping circles (a mane, a
    // cluster of petals) routinely creates a seam where the two edges
    // meeting at a vertex point in nearly the same direction — a razor-
    // sharp spike or notch. The "exact miter" formula above divides by
    // essentially that same near-zero angle, and floating-point precision
    // loss can make its result wildly, arbitrarily large (or NaN) right
    // when it should just be a big-but-bounded number — verified directly
    // against a real design: a single corrupted vertex there was enough to
    // blow a triangle covering nearly a third of the whole shape's own
    // area into the exported mesh, with hundreds of winding conflicts
    // alongside it. Falling back to the always-stable perpendicular
    // average instead of trusting a blown-up "exact" result is what
    // actually fixes that, regardless of which upstream step (a corner-
    // rounding pass, a boolean union, a manual edit) produced the sharp
    // vertex in the first place.
    if (!Number.isFinite(v_trans_lensq) || v_trans_lensq > BEVEL_VEC_MAX_LENSQ) {
      return safeFallbackVec(v_prev_x, v_prev_y, v_prev_len, v_next_x, v_next_y, v_next_len);
    }
    if (v_trans_lensq <= 2) {
      return new THREE.Vector2(v_trans_x, v_trans_y);
    }
    shrink_by = Math.sqrt(v_trans_lensq / 2);
  } else {
    // Collinear edges (a straight run, or a spike back on itself).
    let direction_eq = false;
    if (v_prev_x > Number.EPSILON) {
      if (v_next_x > Number.EPSILON) direction_eq = true;
    } else if (v_prev_x < -Number.EPSILON) {
      if (v_next_x < -Number.EPSILON) direction_eq = true;
    } else if (Math.sign(v_prev_y) === Math.sign(v_next_y)) {
      direction_eq = true;
    }

    if (direction_eq) {
      v_trans_x = -v_prev_y;
      v_trans_y = v_prev_x;
      shrink_by = Math.sqrt(v_prev_lensq);
    } else {
      v_trans_x = v_prev_x;
      v_trans_y = v_prev_y;
      shrink_by = Math.sqrt(v_prev_lensq / 2);
    }
  }

  // Same safety net as above, covering the collinear branch too — an edge
  // that's short enough to be numerically shaky (but not short enough for
  // mergeOverlappingPoints to have already dropped it) can make shrink_by
  // itself unstable.
  if (shrink_by < 1e-9 || !Number.isFinite(v_trans_x / shrink_by) || !Number.isFinite(v_trans_y / shrink_by)) {
    const v_prev_len = Math.sqrt(v_prev_lensq);
    const v_next_len = Math.hypot(v_next_x, v_next_y);
    return safeFallbackVec(v_prev_x, v_prev_y, v_prev_len || 1, v_next_x, v_next_y, v_next_len || 1);
  }
  return new THREE.Vector2(v_trans_x / shrink_by, v_trans_y / shrink_by);
}

/** Ported from `ExtrudeGeometry`'s `mergeOverlappingPoints`: drops
 * index-adjacent points that are (near-)coincident, which would otherwise
 * make `getBevelVec` divide by a zero-length edge. */
function mergeOverlappingPoints(points: THREE.Vector2[]): void {
  const THRESHOLD_SQ = 1e-20;
  let prevPos = points[0];
  for (let i = 1; i <= points.length; i++) {
    const currentIndex = i % points.length;
    const currentPos = points[currentIndex];
    const dx = currentPos.x - prevPos.x;
    const dy = currentPos.y - prevPos.y;
    const distSq = dx * dx + dy * dy;
    const scale = Math.max(Math.abs(currentPos.x), Math.abs(currentPos.y), Math.abs(prevPos.x), Math.abs(prevPos.y));
    if (distSq <= THRESHOLD_SQ * scale * scale) {
      points.splice(currentIndex, 1);
      i--;
      continue;
    }
    prevPos = currentPos;
  }
}

function computeMovements(points: THREE.Vector2[]): THREE.Vector2[] {
  const n = points.length;
  const out: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    out.push(getBevelVec(points[i], prev, next));
  }
  return out;
}

/** Forces a ring to a specific winding. `getBevelVec`'s "shift left while
 * walking" convention only points outward for a clockwise contour — verified
 * empirically (a CW square's movement vectors point away from center) —
 * so every contour must be normalized to clockwise, and every hole to
 * counter-clockwise (its opposite), before computing movements. */
function forceWinding(points: THREE.Vector2[], clockwise: boolean): THREE.Vector2[] {
  const isCW = THREE.ShapeUtils.isClockWise(points);
  return isCW === clockwise ? points.slice() : points.slice().reverse();
}

function offsetRing(points: THREE.Vector2[], movements: THREE.Vector2[], amount: number): THREE.Vector2[] {
  if (amount === 0) return points;
  return points.map((p, i) => new THREE.Vector2(p.x + movements[i].x * amount, p.y + movements[i].y * amount));
}

function shoelaceArea(points: THREE.Vector2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * A per-vertex offset (see offsetRing) is a simple, cheap approximation of
 * a true polygon inset — correct as long as the requested amount never
 * pushes two non-adjacent parts of the outline past each other. Detecting
 * that directly (rather than trying to bound it analytically, which is
 * exactly what the bounding-box width cap above already attempts and can
 * still miss for an irregular outline) means actually re-deriving what the
 * offset ring's TRUE area is: `polygon-clipping`'s boolean-op sweep line
 * resolves self-intersections as part of its normal algorithm regardless
 * of whether the input was a valid simple polygon to begin with, so
 * running the naive offset ring through a self-union and comparing its
 * area to the naive ring's own raw shoelace area is a reliable signal —
 * they match for a clean offset, and diverge once folding has happened
 * (the folded-over region's signed area cancels against itself in the raw
 * sum but not in the unioned result).
 *
 * That area check alone still isn't enough: a ring can be a perfectly
 * valid simple polygon by that test and still break the specific
 * triangulator the real caps are built with (`THREE.ShapeUtils.
 * triangulateShape`, an ear-clipper) once two non-adjacent stretches of
 * the outline pinch close enough together without literally crossing —
 * exactly what a crescent's own inward-offset waist does. Verified
 * directly against that real shape: the union-area check above reported
 * its offset ring simple, and `triangulateShape` then produced a single
 * "ear" bigger than the ring's own total area — only possible if some of
 * its output triangles overlap, which is invalid regardless of whether
 * the boundary itself self-intersects. Re-deriving the ring's area a
 * SECOND way — summing the actual triangles the real cap-building code
 * will use — catches that failure mode directly instead of trusting a
 * proxy that doesn't fully cover it.
 */
function isRingSimple(points: THREE.Vector2[]): boolean {
  if (points.length < 3) return true;
  const raw = shoelaceArea(points);
  if (raw < 1e-9) return true; // already collapsed either way — nothing further to protect here
  const ring = points.map((p): [number, number] => [p.x, p.y]);
  let repaired: polygonClipping.MultiPolygon;
  try {
    repaired = polygonClipping.union([ring]);
  } catch {
    return false; // couldn't even evaluate it — treat as unsafe rather than risk exporting it
  }
  let repairedArea = 0;
  for (const polygon of repaired) repairedArea += shoelaceArea(polygon[0].map(([x, y]) => new THREE.Vector2(x, y)));
  if (Math.abs(repairedArea - raw) >= raw * 0.01) return false;

  let triangulated: number[][];
  try {
    triangulated = THREE.ShapeUtils.triangulateShape(points, []);
  } catch {
    return false;
  }
  let triSum = 0;
  for (const [ia, ib, ic] of triangulated) {
    const a = points[ia];
    const b = points[ib];
    const c = points[ic];
    triSum += Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
  }
  return Math.abs(triSum - raw) < raw * 0.01;
}

/** Binary-searches the largest inset in [0, candidateMax] that still keeps
 * `rawContour` offset by that amount a simple, non-self-intersecting ring —
 * see isRingSimple. Tests the actual INWARD chamfer direction a bevel cap
 * is built with (a negative offset — see `Ring.offset`'s doc below), not
 * an outward grow: an outward offset of a cusp or thin spike is nearly
 * always safe (the ring only gets bigger), so testing that direction
 * instead of the inward shrink a cap ring actually uses left this check
 * passing amounts that then folded the ring in on itself once actually
 * built — verified directly against a real crescent-shaped design, whose
 * inward -1.5mm inset self-intersects at both cusps despite the (wrongly
 * signed) old check reporting a full 1.5mm as safe.
 *
 * Also re-rounds `rawContour` at each candidate amount's own corresponding
 * `BEVEL_CORNER_ROUNDING_FRACTION` radius before testing it, rather than
 * validating the raw, unrounded outline and then actually building from a
 * rounded one this check never looked at — the same real design's cusps
 * still self-intersect at 1.5mm once its own corner-assist rounding is
 * applied first, so skipping that step here was independently enough to
 * let the same failure through even with the sign fixed. Monotonic: a
 * smaller candidate is never less safe than a larger one (a smaller inset
 * folds a ring no more than a bigger one does, and its own smaller
 * corner-assist radius only ever blunts a corner further, which can only
 * help), so a plain binary search converges directly on the boundary. */
function maxSafeInset(rawContour: THREE.Vector2[], candidateMax: number): number {
  function safeAt(amount: number): boolean {
    if (amount <= 0) return true;
    const radius = amount * BEVEL_CORNER_ROUNDING_FRACTION;
    const contour =
      radius > 0
        ? roundContour(rawContour, radius, BEVEL_CORNER_SEGMENTS).map((p) => new THREE.Vector2(p.x, p.y))
        : rawContour;
    const movements = computeMovements(contour);
    return isRingSimple(offsetRing(contour, movements, -amount));
  }
  if (candidateMax <= 0) return candidateMax;
  if (safeAt(candidateMax)) return candidateMax;
  let lo = 0;
  let hi = candidateMax;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (safeAt(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

interface Ring {
  z: number;
  /** Signed inset passed to `offsetRing` — negative shrinks the outer
   * contour (and correspondingly grows each hole), which is what a chamfer
   * cutting material away from the rim needs. */
  offset: number;
}

/**
 * Builds an extruded, capped solid from `shapes`, with an optional rounded
 * bevel at the bottom (`z=0`) and/or top (`z=depth`) rim. A 0 amount on a
 * given side degenerates to a plain (untouched) cap for that side.
 */
export function buildBeveledExtrudeGeometry(
  shapes: THREE.Shape[],
  depth: number,
  bevelBottom: number,
  bevelTop: number,
): THREE.BufferGeometry {
  let bottomMag = Math.max(0, bevelBottom);
  let topMag = Math.max(0, bevelTop);
  // The two caps' bevels eat into the same depth budget from either end —
  // never let them overlap past the middle.
  const maxTotal = depth * 0.98;
  if (bottomMag + topMag > maxTotal) {
    const scale = maxTotal / (bottomMag + topMag);
    bottomMag *= scale;
    topMag *= scale;
  }

  // A thin shape (a slim rectangle, a single stroke of an imported font
  // glyph) can only safely take a bevel up to about half its own
  // narrowest local dimension — insetting the contour further folds it
  // past the opposite wall and flips it inside out, which is what "the
  // shape changes" looks like: a warped or spiky mesh instead of a
  // rounded edge. Scanning every region's own bounding box up front and
  // capping the shared amounts to whatever the thinnest one can take
  // keeps every region's offset rings from ever crossing themselves, at
  // the cost of silently softening a requested amount that was simply too
  // big for that particular shape.
  let minHalfWidth = Infinity;
  for (const shape of shapes) {
    const pts = shape.getPoints(1);
    if (pts.length < 2) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    minHalfWidth = Math.min(minHalfWidth, (maxX - minX) / 2, (maxY - minY) / 2);
  }
  if (Number.isFinite(minHalfWidth)) {
    const widthCap = Math.max(0, minHalfWidth * BEVEL_SELF_INTERSECTION_SAFETY);
    bottomMag = Math.min(bottomMag, widthCap);
    topMag = Math.min(topMag, widthCap);
  }

  // The bbox check above only protects against a shape that's thin
  // EVERYWHERE (a slim rectangle, a font stroke) — it says nothing about a
  // shape with a large overall bounding box but a much thinner LOCAL
  // feature somewhere on its outline (a mane's individual pointed lock, a
  // flower's individual petal tip). Insetting the whole contour by more
  // than such a feature's own local width folds that one spot past itself
  // — its offset ring self-intersects right there — which is exactly what
  // silently deletes real material from just that feature's bottom or top
  // cap: a degenerate/negative-area triangle at the tip that later gets
  // filtered out as junk (see MIN_TRIANGLE_AREA_MM2 in the 3MF exporter),
  // leaving that one bottom-most layer with nothing printable there even
  // though the rest of the shape is fine. Checking every actual region's
  // own contour against the exact offset math used below (rather than
  // trying to estimate local thickness analytically) catches this
  // regardless of how irregular the outline is.
  for (const shape of shapes) {
    const extracted = shape.extractPoints(1);
    const contour = forceWinding(extracted.shape, true);
    mergeOverlappingPoints(contour);
    if (contour.length < 3) continue;
    bottomMag = Math.min(bottomMag, maxSafeInset(contour, bottomMag));
    topMag = Math.min(topMag, maxSafeInset(contour, topMag));
  }

  const bottom = bottomMag;
  const top = topMag;

  // This geometry is built as flat-shaded triangles (no shared/indexed
  // vertices, so computeVertexNormals can't smooth across facet
  // boundaries) — a fixed segment count that reads as smooth for a small
  // rim bevel (a fraction of a mm) turns into visibly faceted banding once
  // the curve's own radius grows to several mm, since each facet's
  // real-world size scales with the radius it's approximating. Scaling the
  // segment count with the actual magnitude keeps facets small in
  // absolute terms regardless of how big the curve is.
  const curveSegments = Math.min(48, Math.max(BEVEL_CURVE_SEGMENTS, Math.round(Math.max(bottom, top) * 3)));

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const rings: Ring[] = [];
  function pushRing(z: number, offset: number) {
    const last = rings[rings.length - 1];
    if (last && Math.abs(last.z - z) < 1e-9) {
      last.offset = offset;
      return;
    }
    rings.push({ z, offset });
  }

  // Quarter-round curve, parameterized 0 (cap-side end) to 1 (wall-side
  // end): `z` sweeps 0..amount, `offset` (the inward inset) sweeps
  // -amount..0, tracing a circular arc of radius `amount` rather than a
  // straight diagonal — the same curve shape a CAD/DCC "round" bevel uses.
  // Standard fillet construction: the arc's center sits inset by `amount`
  // from the sharp corner it replaces, along *each* of the two flat faces
  // being joined — (offset=-amount, z=+amount) for the bottom, (offset=
  // -amount, z=0) for the top measured from its own wall-side origin —
  // tangent to both faces, bulging outward (convex, a normal round-over).
  // Centering the arc on an *endpoint* instead (an earlier, wrong version
  // of this) still hits both endpoints but scoops inward along the way
  // (concave — a cove/inner-bevel look, not a round-over). Verified
  // numerically, not just by eye: both formulas below hold |distance to
  // center - amount| < 1e-6 across the sweep.
  if (bottom > 0) {
    for (let i = 0; i <= curveSegments; i++) {
      const t = i / curveSegments;
      const angle = (t * Math.PI) / 2;
      pushRing(bottom * (1 - Math.cos(angle)), bottom * (Math.sin(angle) - 1));
    }
  } else {
    pushRing(0, 0);
  }

  if (top > 0) {
    for (let i = 0; i <= curveSegments; i++) {
      const t = i / curveSegments;
      const angle = (t * Math.PI) / 2;
      pushRing(depth - top + top * Math.sin(angle), -top * (1 - Math.cos(angle)));
    }
  } else {
    pushRing(depth, 0);
  }

  for (const shape of shapes) {
    const extracted = shape.extractPoints(1);
    let contour = forceWinding(extracted.shape, true);
    let holes = extracted.holes.map((h) => forceWinding(h, false));

    mergeOverlappingPoints(contour);
    holes.forEach(mergeOverlappingPoints);
    if (contour.length < 3) continue;

    // See BEVEL_CORNER_ROUNDING_FRACTION above — gives sharp corners a real
    // curve to sweep through instead of one mitered point.
    const cornerAssistRadius = Math.max(bottom, top) * BEVEL_CORNER_ROUNDING_FRACTION;
    if (cornerAssistRadius > 0) {
      const toVec2 = (pts: THREE.Vector2[]) =>
        roundContour(pts, cornerAssistRadius, BEVEL_CORNER_SEGMENTS).map((p) => new THREE.Vector2(p.x, p.y));
      contour = toVec2(contour);
      holes = holes.map(toVec2);
    }

    const contourMovements = computeMovements(contour);
    const holesMovements = holes.map((h) => computeMovements(h));

    const contourRings = rings.map((r) => offsetRing(contour, contourMovements, r.offset));
    const holeRings = holes.map((h, hi) => rings.map((r) => offsetRing(h, holesMovements[hi], r.offset)));

    // Every (outline point, ring) pair gets exactly ONE vertex, shared by
    // whatever triangles touch it — the wall quad above it, the wall quad
    // below it, and (at the bottom/top ring only) the cap. Sharing a vertex
    // is what lets computeVertexNormals() below actually average normals
    // across it instead of leaving every triangle with its own flat facet
    // normal, which is what made a bevel curve look faceted no matter how
    // many segments approximated it. This only shares vertices
    // going UP the curve (same outline point, increasing ring) and into
    // its cap — never sideways between two different outline points — so a
    // real sharp corner in the shape's own 2D outline (a rectangle's
    // corners, say) still gets its own separate vertices there and stays a
    // crisp edge instead of being smoothed away.
    function buildIndexedColumns(ringsXY: THREE.Vector2[][]): number[][] {
      const columns: number[][] = [];
      for (let r = 0; r < ringsXY.length; r++) {
        const row: number[] = [];
        for (const p of ringsXY[r]) {
          row.push(positions.length / 3);
          positions.push(p.x, p.y, rings[r].z);
          uvs.push(p.x, p.y);
        }
        columns.push(row);
      }
      return columns;
    }

    const contourIdx = buildIndexedColumns(contourRings);
    const holeIdx = holeRings.map(buildIndexedColumns);

    // ---- Side walls: ruled quads between every pair of consecutive rings ----
    // Decides each quad's winding by propagating outward-facing continuity
    // from both caps toward the middle, rather than any single global
    // test. Earlier attempts at a global test all failed once actually
    // checked: reasoning from the ring pair's Z direction alone broke down
    // for a curved bevel (whose curve changes the radial inset at the
    // same time as Z, which a Z-only check can't tell apart); a per-quad
    // reference vector built from that same quad's own four points turned
    // out to be tautological (not actually independent of the thing it
    // was checking).
    //
    // A single anchor-and-walk pass (from the bottom cap, say) turned out
    // to only be reliable once it had a few steps of easy wall to settle
    // into before hitting a genuinely tricky stretch of curve — anchored
    // from the OTHER end instead, that same curve stayed correct
    // throughout, simply because that direction warmed up on easy wall
    // first. Running both directions and, for each ring pair, trusting
    // whichever pass has had more steps to settle (i.e. is currently
    // closer to its own anchor) gets a warm-up on every stretch of curve
    // regardless of which end it's nearest to — a strict improvement over
    // a single-direction anchor, and doesn't regress the way anchoring
    // from the single least-inset ring transition instead (tried and
    // reverted) did — that transition's own normal has essentially no Z
    // component by construction (it's the straightest, most vertical wall
    // around), so it can't actually discriminate which way nearby curved
    // segments should tilt, unlike a cap's normal which always has a
    // strong, unambiguous vertical component to anchor against.
    //
    // The anchor itself has to be each cap's own ACTUAL computed normal
    // (from the exact same triangulation + winding its real cap triangles
    // use) rather than an assumed "always (0,0,±1)" constant: that
    // assumption holds for a lightly-inset cap, but once a bevel's cap
    // ring is inset heavily enough toward the center, nothing guarantees
    // `THREE.ShapeUtils.triangulateShape` still winds it the same
    // rotational sense the un-inset outer contour does.
    function computeCapNormalRef(ringXY: THREE.Vector2[], holesXY: THREE.Vector2[][], z: number, reversed: boolean): THREE.Vector3 {
      const faces = THREE.ShapeUtils.triangulateShape(ringXY, holesXY);
      if (faces.length === 0) return new THREE.Vector3(0, 0, reversed ? -1 : 1);
      const flat = [ringXY, ...holesXY].flat();
      const [fi0, fi1, fi2] = faces[0];
      const order = reversed ? [fi2, fi1, fi0] : [fi0, fi1, fi2];
      const [p0, p1, p2] = order.map((idx) => flat[idx]);
      const v0 = new THREE.Vector3(p0.x, p0.y, z);
      const v1 = new THREE.Vector3(p1.x, p1.y, z);
      const v2 = new THREE.Vector3(p2.x, p2.y, z);
      return new THREE.Vector3().subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v2, v0));
    }
    const bottomCapNormalRef = computeCapNormalRef(
      contourRings[0],
      holeRings.map((hr) => hr[0]),
      rings[0].z,
      true,
    );
    const topCapNormalRef = computeCapNormalRef(
      contourRings[rings.length - 1],
      holeRings.map((hr) => hr[rings.length - 1]),
      rings[rings.length - 1].z,
      false,
    );

    function buildWalls(idxRings: number[][], points: THREE.Vector2[], movements: THREE.Vector2[]) {
      function ringPos(pointIdx: number, ringIdx: number): THREE.Vector3 {
        const p = points[pointIdx];
        const m = movements[pointIdx];
        const rg = rings[ringIdx];
        return new THREE.Vector3(p.x + m.x * rg.offset, p.y + m.y * rg.offset, rg.z);
      }

      const n = idxRings[0].length;
      const numTransitions = rings.length - 1;
      let i = n;
      while (--i >= 0) {
        const j = i;
        let k = i - 1;
        if (k < 0) k = n - 1;

        // A curved quad isn't necessarily planar, so its two triangles can
        // end up tilted enough relative to each other that they need
        // OPPOSITE vertex-swap decisions — deciding both from just one
        // triangle's normal left the other one silently flipped wherever
        // the quad twisted enough for that to matter, so each gets its
        // own independent decision against whatever's trusted.
        function decide(pA: THREE.Vector3, pB: THREE.Vector3, pD: THREE.Vector3, trusted: THREE.Vector3): { flipped: boolean; normal: THREE.Vector3 } {
          const normal = new THREE.Vector3().subVectors(pB, pA).cross(new THREE.Vector3().subVectors(pD, pA));
          if (normal.dot(trusted) >= 0) return { flipped: false, normal };
          normal.negate();
          return { flipped: true, normal };
        }

        const fwd: { flip1: boolean; flip2: boolean }[] = [];
        let trustedFwd = bottomCapNormalRef;
        for (let r = 0; r < numTransitions; r++) {
          const pA = ringPos(j, r);
          const pB = ringPos(k, r);
          const pC = ringPos(k, r + 1);
          const pD = ringPos(j, r + 1);
          const d1 = decide(pA, pB, pD, trustedFwd);
          const d2 = decide(pB, pC, pD, trustedFwd);
          fwd.push({ flip1: d1.flipped, flip2: d2.flipped });
          trustedFwd = d2.normal;
        }

        const bwd: { flip1: boolean; flip2: boolean }[] = new Array(numTransitions);
        let trustedBwd = topCapNormalRef;
        for (let r = numTransitions - 1; r >= 0; r--) {
          const pA = ringPos(j, r);
          const pB = ringPos(k, r);
          const pC = ringPos(k, r + 1);
          const pD = ringPos(j, r + 1);
          // Walking downward, triangle (b,c,d) borders the already-settled
          // ring r+1 side, so it's decided (and trusted) first this time.
          const d2 = decide(pB, pC, pD, trustedBwd);
          const d1 = decide(pA, pB, pD, trustedBwd);
          bwd[r] = { flip1: d1.flipped, flip2: d2.flipped };
          trustedBwd = d1.normal;
        }

        for (let r = 0; r < numTransitions; r++) {
          const stepsFromBottom = r;
          const stepsFromTop = numTransitions - 1 - r;
          const choice = stepsFromBottom <= stepsFromTop ? fwd[r] : bwd[r];

          const a = idxRings[r][j];
          const b = idxRings[r][k];
          const c = idxRings[r + 1][k];
          const d = idxRings[r + 1][j];

          if (choice.flip1) indices.push(a, d, b);
          else indices.push(a, b, d);

          if (choice.flip2) indices.push(b, d, c);
          else indices.push(b, c, d);
        }
      }
    }

    buildWalls(contourIdx, contour, contourMovements);
    holeIdx.forEach((hi, hIdx) => buildWalls(hi, holes[hIdx], holesMovements[hIdx]));

    // ---- Caps: ear-clip triangulate the bottom-most and top-most rings,
    // reusing the SAME vertex indices those rings' walls already created
    // (rather than pushing fresh ones) so the cap is properly stitched
    // into the same smoothing group as the curve it caps off. ----
    const bottomRingXY = contourRings[0];
    const bottomHolesXY = holeRings.map((hr) => hr[0]);
    const bottomFlatIdx = [contourIdx[0], ...holeIdx.map((hi) => hi[0])].flat();
    const bottomFaces = THREE.ShapeUtils.triangulateShape(bottomRingXY, bottomHolesXY);
    for (const face of bottomFaces) {
      indices.push(bottomFlatIdx[face[2]], bottomFlatIdx[face[1]], bottomFlatIdx[face[0]]);
    }

    const topIdx = rings.length - 1;
    const topRingXY = contourRings[topIdx];
    const topHolesXY = holeRings.map((hr) => hr[topIdx]);
    const topFlatIdx = [contourIdx[topIdx], ...holeIdx.map((hi) => hi[topIdx])].flat();
    const topFaces = THREE.ShapeUtils.triangulateShape(topRingXY, topHolesXY);
    for (const face of topFaces) {
      indices.push(topFlatIdx[face[0]], topFlatIdx[face[1]], topFlatIdx[face[2]]);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
