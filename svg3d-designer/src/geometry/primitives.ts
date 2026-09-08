import type { Point2 } from "../types";

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

/** A single-outline arrow pointing in +x, shaft-and-head combined into one
 * closed polygon (no boolean union needed) — proportions expressed as
 * fractions of the eventual bounding box, then normalized like every
 * other shape. */
export function arrowPoints(): Point2[] {
  const shaftHalf = 0.15;
  const headHalf = 0.4;
  const headStart = 0.65;
  return [
    { x: 0, y: -shaftHalf },
    { x: headStart, y: -shaftHalf },
    { x: headStart, y: -headHalf },
    { x: 1, y: 0 },
    { x: headStart, y: headHalf },
    { x: headStart, y: shaftHalf },
    { x: 0, y: shaftHalf },
  ];
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
