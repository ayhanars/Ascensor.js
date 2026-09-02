import * as THREE from "three";

/**
 * Independent top/bottom edge chamfers for an extruded shape — distinct from
 * `roundCorners.ts`'s corner-radius fillet, which softens the 2D outline's
 * *corners*. A bevel instead cuts a flat 45°-ish taper into the *top or
 * bottom rim* of every edge, all the way around — the classic print-quality
 * trick for reducing overhangs/elephant's foot or just softening a hard
 * edge, and it can be set independently per side.
 *
 * This intentionally does not reuse `THREE.ExtrudeGeometry`'s own
 * `bevelEnabled` option: that bevel is always symmetric (identical on both
 * ends) and — per its own source — *expands* the wall outward from the cap
 * face rather than chamfering it inward, which is the opposite of what a
 * print-oriented "smooth this edge" control should do. This is a
 * purpose-built, much simpler version of the same technique (ear-clip
 * triangulated caps + ruled side walls between stacked contour rings),
 * using a single straight chamfer segment per active side instead of a
 * curved multi-segment fillet, with the movement-vector math for offsetting
 * a contour ported from `ExtrudeGeometry`'s internal `getBevelVec`.
 */

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
 * Builds an extruded, capped solid from `shapes`, with an optional straight
 * chamfer at the bottom (`z=0`) and/or top (`z=depth`) rim. A 0 amount on
 * either side degenerates to a plain (unbeveled) extrusion.
 */
export function buildBeveledExtrudeGeometry(
  shapes: THREE.Shape[],
  depth: number,
  bevelBottom: number,
  bevelTop: number,
): THREE.BufferGeometry {
  let bottom = Math.max(0, bevelBottom);
  let top = Math.max(0, bevelTop);
  // The two chamfers eat into the same depth budget from either end — never
  // let them overlap past the middle.
  const maxTotal = depth * 0.98;
  if (bottom + top > maxTotal) {
    const scale = maxTotal / (bottom + top);
    bottom *= scale;
    top *= scale;
  }

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
  pushRing(0, bottom > 0 ? -bottom : 0);
  if (bottom > 0) pushRing(bottom, 0);
  if (top > 0) pushRing(depth - top, 0);
  pushRing(depth, top > 0 ? -top : 0);

  for (const shape of shapes) {
    const extracted = shape.extractPoints(1);
    const contour = forceWinding(extracted.shape, true);
    const holes = extracted.holes.map((h) => forceWinding(h, false));

    mergeOverlappingPoints(contour);
    holes.forEach(mergeOverlappingPoints);
    if (contour.length < 3) continue;

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
