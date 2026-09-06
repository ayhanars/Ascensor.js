import * as THREE from "three";
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

interface Ring {
  z: number;
  /** Signed inset passed to `offsetRing` — negative shrinks the outer
   * contour (and correspondingly grows each hole), which is what a chamfer
   * cutting material away from the rim needs. */
  offset: number;
}

/**
 * Builds an extruded, capped solid from `shapes`, with an optional rounded
 * bevel at the bottom (`z=0`) and/or top (`z=depth`) rim, and/or an Indent
 * — a whole-face concave dent or convex bulge, real printable geometry of
 * this same solid rather than a rim treatment or a cut against another
 * shape. A 0 amount on a given side/feature degenerates to a plain
 * (untouched) cap for that side. Indent and bevel don't compose on the
 * same face (both start from that face's rim) — indent wins whenever it's
 * nonzero, per the field's own doc comment on `ShapeLayer`.
 */
export function buildBeveledExtrudeGeometry(
  shapes: THREE.Shape[],
  depth: number,
  bevelBottom: number,
  bevelTop: number,
  indentBottom = 0,
  indentTop = 0,
): THREE.BufferGeometry {
  const bottomIsIndent = indentBottom !== 0;
  const topIsIndent = indentTop !== 0;

  let bottomMag = bottomIsIndent ? Math.abs(indentBottom) : Math.max(0, bevelBottom);
  let topMag = topIsIndent ? Math.abs(indentTop) : Math.max(0, bevelTop);
  // The two caps' treatments eat into the same depth budget from either
  // end — never let them overlap past the middle. (A convex Indent that
  // bulges outward doesn't actually need this shape's own depth at all,
  // but sizing it the same way regardless of direction is simplest and
  // always safe.)
  const maxTotal = depth * 0.98;
  if (bottomMag + topMag > maxTotal) {
    const scale = maxTotal / (bottomMag + topMag);
    bottomMag *= scale;
    topMag *= scale;
  }

  // A thin shape (a slim rectangle, a single stroke of an imported font
  // glyph) can only safely take a bevel/indent up to about half its own
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
  const bottom = bottomMag;
  const top = topMag;

  // This geometry is built as flat-shaded triangles (no shared/indexed
  // vertices, so computeVertexNormals can't smooth across facet
  // boundaries) — a fixed segment count that reads as smooth for a small
  // rim bevel (a fraction of a mm) turns into visibly faceted banding once
  // the curve's own radius grows to Indent-sized amounts (several mm),
  // since each facet's real-world size scales with the radius it's
  // approximating. Scaling the segment count with the actual magnitude
  // keeps facets small in absolute terms regardless of how big the curve is.
  const curveSegments = Math.min(48, Math.max(BEVEL_CURVE_SEGMENTS, Math.round(Math.max(bottom, top) * 3)));

  const positions: number[] = [];
  const uvs: number[] = [];

  function pushVertex(p: THREE.Vector2, z: number) {
    positions.push(p.x, p.y, z);
    uvs.push(p.x, p.y);
  }

  function pushTri(a: THREE.Vector2, az: number, b: THREE.Vector2, bz: number, c: THREE.Vector2, cz: number) {
    pushVertex(a, az);
    pushVertex(b, bz);
    pushVertex(c, cz);
  }

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
  if (bottomIsIndent) {
    // Indent, unlike a bevel, keeps the *rim* exactly where an untouched
    // face would be (offset=0, z=0) — matching the plain wall it continues
    // from with no discontinuity — and moves the *center* instead, sweeping
    // the same quarter-circle arc as the bevel curves above, just paired
    // with z the other way round. Positive indentBottom presses the center
    // up into the material (concave, so z rises as the ring insets);
    // negative pushes it down and out instead (a convex bulge, z falls).
    // Always pushed rim-first: buildWalls handles a wall segment whose z
    // falls just as correctly as one whose z rises (see its own comment),
    // so there's no need to reorder the sweep to force ascending z the way
    // an earlier, wrong version of this did — that "fix" itself broke the
    // shape, by making the wall taper in and back out around a phantom
    // extra ring instead of staying straight up to the real rim.
    const sign = Math.sign(indentBottom);
    for (let i = 0; i <= curveSegments; i++) {
      const t = i / curveSegments;
      const angle = (t * Math.PI) / 2;
      pushRing(sign * bottom * Math.sin(angle), -bottom * (1 - Math.cos(angle)));
    }
  } else if (bottom > 0) {
    for (let i = 0; i <= curveSegments; i++) {
      const t = i / curveSegments;
      const angle = (t * Math.PI) / 2;
      pushRing(bottom * (1 - Math.cos(angle)), bottom * (Math.sin(angle) - 1));
    }
  } else {
    pushRing(0, 0);
  }

  if (topIsIndent) {
    // Mirror of the bottom Indent case: the rim stays at the face's
    // untouched height (offset=0, z=depth) — matching the plain wall
    // below it with no discontinuity — and the center moves instead, down
    // into the material for a positive indentTop (concave) or up and out
    // for negative (a convex bulge). Always pushed rim-first, same
    // reasoning as bottom's Indent block above.
    const sign = Math.sign(indentTop);
    for (let i = 0; i <= curveSegments; i++) {
      const t = i / curveSegments;
      const angle = (t * Math.PI) / 2;
      pushRing(depth - sign * top * Math.sin(angle), -top * (1 - Math.cos(angle)));
    }
  } else if (top > 0) {
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

    // ---- Side walls: ruled quads between every pair of consecutive rings ----
    function buildWalls(ringsXY: THREE.Vector2[][]) {
      const n = ringsXY[0].length;
      let i = n;
      while (--i >= 0) {
        const j = i;
        let k = i - 1;
        if (k < 0) k = n - 1;
        for (let r = 0; r < rings.length - 1; r++) {
          const a = ringsXY[r][j];
          const b = ringsXY[r][k];
          const c = ringsXY[r + 1][k];
          const d = ringsXY[r + 1][j];
          const az = rings[r].z;
          const bz = rings[r].z;
          const cz = rings[r + 1].z;
          const dz = rings[r + 1].z;
          pushTri(a, az, b, bz, d, dz);
          pushTri(b, bz, c, cz, d, dz);
        }
      }
    }

    buildWalls(contourRings);
    holeRings.forEach(buildWalls);

    // ---- Caps: ear-clip triangulate the bottom-most and top-most rings ----
    const bottomRingXY = contourRings[0];
    const bottomHolesXY = holeRings.map((hr) => hr[0]);
    const bottomFaces = THREE.ShapeUtils.triangulateShape(bottomRingXY, bottomHolesXY);
    const bottomFlat = [bottomRingXY, ...bottomHolesXY].flat();
    const bottomZ = rings[0].z;
    for (const face of bottomFaces) {
      pushTri(bottomFlat[face[2]], bottomZ, bottomFlat[face[1]], bottomZ, bottomFlat[face[0]], bottomZ);
    }

    const topIdx = rings.length - 1;
    const topRingXY = contourRings[topIdx];
    const topHolesXY = holeRings.map((hr) => hr[topIdx]);
    const topFaces = THREE.ShapeUtils.triangulateShape(topRingXY, topHolesXY);
    const topFlat = [topRingXY, ...topHolesXY].flat();
    const topZ = rings[topIdx].z;
    for (const face of topFaces) {
      pushTri(topFlat[face[0]], topZ, topFlat[face[1]], topZ, topFlat[face[2]], topZ);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}
