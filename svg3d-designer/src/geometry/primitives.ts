import type { PenAnchor, Point2 } from "../types";

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
