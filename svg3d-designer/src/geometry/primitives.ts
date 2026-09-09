import type { PenAnchor, PenAnchorType, Point2 } from "../types";

/** Regular N-gon, point-up, in an arbitrary local unit circle of radius 1
 * centered at the origin. Normalize with `normalizeToBounds` before use —
 * every shape's local points are expected to start at (0,0) in the
 * bottom-left of their own bounding box, the same convention every other
 * shape-creation path (rect, circle) already follows. */
export function regularPolygonPoints(sides: number, segments = sides): Point2[] {
  return Array.from({ length: segments }, (_, i) => {
    const a = -Math.PI / 2 + (i / segments) * Math.PI * 2;
    return { x: Math.cos(a), y: Math.sin(a) };
  });
}

/** A 2*points-vertex star, alternating outer (r=1) and inner
 * (r=innerRatio) vertices, point-up. Same unit-circle/normalize
 * convention as `regularPolygonPoints`. */
export function starPolygonPoints(points: number, innerRatio: number): Point2[] {
  const n = points * 2;
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const r = i % 2 === 0 ? 1 : innerRatio;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
}

/**
 * Remaps an arbitrary point set into the [0,w] x [0,h] box every shape's
 * local geometry is expected to occupy (the bottom-left corner of the
 * bounding box is the shape's own local origin — the same convention a
 * freshly-created rect or circle already follows, and what makes
 * `transform.x/y` mean "this shape's real corner position"). Used both for
 * initial shape creation and for regenerating an existing shape's outline
 * (e.g. changing a polygon's side count) without moving or resizing it —
 * the box passed in is the shape's OWN current raw bounds, so its visible
 * mm size stays exactly what it was before regenerating.
 */
export function normalizeToBounds(points: Point2[], w: number, h: number): Point2[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  return points.map((p) => ({
    x: ((p.x - minX) / spanX) * w,
    y: ((p.y - minY) / spanY) * h,
  }));
}

// Matches the SVG importer's own curve tessellation (see svg/parse.ts's
// CURVE_SEGMENTS) closely enough to look consistent, but a bit finer since
// a hand-drawn pen curve is often one long smooth arc rather than the many
// short bezier pieces an SVG path typically breaks a curve into.
const PEN_CURVE_SEGMENTS = 24;

/** Standard cubic bezier evaluation, sampled at `segments` even steps from
 * (and including) `p0` through `p3`. */
function cubicBezierPoints(p0: Point2, p1: Point2, p2: Point2, p3: Point2, segments: number): Point2[] {
  const pts: Point2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    pts.push({
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    });
  }
  return pts;
}

/**
 * Flattens a closed loop of Pen tool anchors into an ordinary polygon
 * outline — one straight or curved segment between each consecutive pair
 * of anchors (wrapping from the last anchor back to the first to close the
 * loop), tessellating any segment that has a handle on either end into a
 * real cubic bezier via `cubicBezierPoints`. A segment with no handle on
 * EITHER end is a plain straight line (both control points would sit
 * exactly on their anchors anyway, so there's no point spending segments
 * tessellating it) — this is what lets a path mix straight "corner"
 * anchors and curved "smooth" ones exactly like Illustrator/Figma/
 * Photoshop's pen tool does. Needs at least 3 anchors to form a real
 * outline, matching the ordinary polygon convention every other shape's
 * points already follow (no repeated closing point).
 */
export function flattenPenAnchors(anchors: PenAnchor[]): Point2[] {
  if (anchors.length < 3) return anchors.map((a) => ({ x: a.x, y: a.y }));

  const pts: Point2[] = [{ x: anchors[0].x, y: anchors[0].y }];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const b = anchors[(i + 1) % anchors.length];
    if (!a.handleOut && !b.handleIn) {
      pts.push({ x: b.x, y: b.y });
      continue;
    }
    const c1 = a.handleOut ?? { x: a.x, y: a.y };
    const c2 = b.handleIn ?? { x: b.x, y: b.y };
    const curvePts = cubicBezierPoints(a, c1, c2, b, PEN_CURVE_SEGMENTS);
    for (let k = 1; k < curvePts.length; k++) pts.push(curvePts[k]);
  }
  // The loop above walks all the way back to anchors[0] to close it (the
  // wrap-around segment), which duplicates the seed point already pushed
  // at the start — drop it to keep the no-repeated-closing-point
  // convention every other shape's points already follow.
  pts.pop();
  return pts;
}

/**
 * Applies a handle drag to one side of an anchor, mirroring onto the other
 * side according to the anchor's type — the single place this math lives so
 * both the in-progress draft (updatePenAnchorHandle) and a finished path's
 * Edit Path mode (updatePenShapeAnchorHandle) behave identically:
 *  - `independent` (Alt/Option held): the dragged handle moves completely on
 *    its own and the anchor is demoted to "corner" (the classic Illustrator/
 *    Figma "break the handles apart" gesture).
 *  - type "corner": handles are already independent, so just move the one
 *    being dragged — no mirroring.
 *  - type "smooth": the other handle stays collinear (opposite angle through
 *    the anchor) but keeps ITS OWN existing length.
 *  - type "symmetric": the other handle stays collinear AND matches the
 *    dragged handle's length exactly.
 */
export function applyPenHandleDrag(
  anchor: PenAnchor,
  which: "handleIn" | "handleOut",
  point: Point2,
  independent: boolean,
): PenAnchor {
  const other = which === "handleOut" ? "handleIn" : "handleOut";
  if (independent) {
    return { ...anchor, type: "corner", [which]: point };
  }
  if (anchor.type === "corner") {
    return { ...anchor, [which]: point };
  }
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  let otherLen = len;
  if (anchor.type === "smooth") {
    const existing = anchor[other];
    otherLen = existing ? Math.hypot(existing.x - anchor.x, existing.y - anchor.y) : len;
  }
  const mirrored = { x: anchor.x - ux * otherLen, y: anchor.y - uy * otherLen };
  return { ...anchor, [which]: point, [other]: mirrored };
}

/**
 * Converts anchor `index` of `anchors` to `type`, deriving new handle
 * positions when switching TO a curved type ("smooth"/"symmetric") from an
 * anchor that doesn't have both handles collinear yet:
 *  - Switching to "corner" never moves anything — corner just means
 *    "handles are allowed to disagree," not "handles are removed," so
 *    whatever handleIn/handleOut already exist (including neither) are
 *    left exactly as they are.
 *  - Switching to "smooth"/"symmetric" with both handles already present
 *    keeps their existing lengths (smooth) or averages them (symmetric),
 *    and re-aims them along the bisector direction so they end up
 *    collinear through the anchor.
 *  - With only one handle (or neither), the tangent direction is taken
 *    from whichever handle exists, or else from the line between this
 *    anchor's neighbors — the same "curve should roughly follow the path"
 *    default a freshly click-dragged anchor gets — at a modest default
 *    length (a third of the shorter adjacent segment) so the new handles
 *    are visible and adjustable rather than zero-length.
 */
export function applySetAnchorType(anchors: PenAnchor[], index: number, type: PenAnchorType): PenAnchor[] {
  const anchor = anchors[index];
  if (!anchor || anchor.type === type) {
    if (!anchor) return anchors;
    const next = [...anchors];
    next[index] = { ...anchor, type };
    return next;
  }
  if (type === "corner") {
    const next = [...anchors];
    next[index] = { ...anchor, type };
    return next;
  }

  const prev = anchors[(index - 1 + anchors.length) % anchors.length];
  const nextAnchor = anchors[(index + 1) % anchors.length];

  let ux: number;
  let uy: number;
  let lenIn: number;
  let lenOut: number;

  if (anchor.handleOut || anchor.handleIn) {
    const outVec = anchor.handleOut
      ? { x: anchor.handleOut.x - anchor.x, y: anchor.handleOut.y - anchor.y }
      : anchor.handleIn
        ? { x: anchor.x - anchor.handleIn.x, y: anchor.y - anchor.handleIn.y }
        : { x: 1, y: 0 };
    const outLen = Math.hypot(outVec.x, outVec.y) || 1;
    ux = outVec.x / outLen;
    uy = outVec.y / outLen;
    lenOut = anchor.handleOut ? Math.hypot(anchor.handleOut.x - anchor.x, anchor.handleOut.y - anchor.y) : outLen;
    lenIn = anchor.handleIn ? Math.hypot(anchor.handleIn.x - anchor.x, anchor.handleIn.y - anchor.y) : outLen;
  } else {
    const dx = nextAnchor.x - prev.x;
    const dy = nextAnchor.y - prev.y;
    const dist = Math.hypot(dx, dy) || 1;
    ux = dx / dist;
    uy = dy / dist;
    const segOut = Math.hypot(nextAnchor.x - anchor.x, nextAnchor.y - anchor.y);
    const segIn = Math.hypot(anchor.x - prev.x, anchor.y - prev.y);
    lenOut = Math.min(segOut, segIn) / 3 || 1;
    lenIn = lenOut;
  }

  if (type === "symmetric") {
    const avgLen = (lenIn + lenOut) / 2;
    lenIn = avgLen;
    lenOut = avgLen;
  }

  const next = [...anchors];
  next[index] = {
    ...anchor,
    type,
    handleOut: { x: anchor.x + ux * lenOut, y: anchor.y + uy * lenOut },
    handleIn: { x: anchor.x - ux * lenIn, y: anchor.y - uy * lenIn },
  };
  return next;
}
