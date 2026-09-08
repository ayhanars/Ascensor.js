import type { Point2 } from "../types";

// SVGLoader's own tessellation cuts every bezier curve into the SAME fixed
// number of straight segments (see CURVE_SEGMENTS in parse.ts), regardless
// of how long or how tightly that specific curve actually bends — a short,
// nearly-straight curve gets exactly as many points as a long, complex one.
// That's what makes an imported shape's point density an accident of how
// its original bezier curves happened to be cut up, not a reflection of the
// shape's real geometric complexity — nothing like a native rectangle or
// circle, which only ever has as many points as it actually needs. Points
// this close (mm) to the straight line between their neighbors carry no
// real shape information and are dropped; a genuinely detailed stretch of
// outline (tight curves, real fine detail) keeps far more points than this
// on its own, since removing any of them would visibly bend the outline
// by more than this tolerance. Comfortably below the 0.5mm thin-feature
// safety threshold, so this can only ever remove tessellation noise, never
// erase a real, deliberately-thin design detail.
const SIMPLIFY_TOLERANCE_MM = 0.02;

function pointSegmentDistance(p: Point2, a: Point2, b: Point2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 0 ? (apx * abx + apy * aby) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  return Math.hypot(p.x - cx, p.y - cy);
}

/** Standard recursive Douglas-Peucker over an OPEN chain — endpoints are
 * always kept, an interior point is kept only if the chain can't be
 * straight-lined past it within `toleranceMM`. */
function douglasPeucker(points: Point2[], toleranceMM: number): Point2[] {
  if (points.length <= 2) return points;
  const a = points[0];
  const b = points[points.length - 1];
  let maxDist = -1;
  let maxIdx = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointSegmentDistance(points[i], a, b);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist > toleranceMM) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), toleranceMM);
    const right = douglasPeucker(points.slice(maxIdx), toleranceMM);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

/**
 * Simplifies a CLOSED ring (a shape's outer contour, or one of its holes)
 * down to only the points that actually carry shape information, at
 * `SIMPLIFY_TOLERANCE_MM`. Douglas-Peucker is defined for an open chain —
 * a ring is split into two open chains at its two farthest-apart points
 * (a simple, robust anchor choice; doesn't need to be perfectly optimal)
 * so both "halves" of the outline get simplified independently, then
 * rejoined without duplicating the shared anchor points.
 */
export function simplifyClosedRing(points: Point2[]): Point2[] {
  const n = points.length;
  if (n <= 4) return points;

  let maxDistSq = -1;
  let ia = 0;
  let ib = 1;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      const d = dx * dx + dy * dy;
      if (d > maxDistSq) {
        maxDistSq = d;
        ia = i;
        ib = j;
      }
    }
  }

  const chain1: Point2[] = [];
  for (let k = ia; k !== ib; k = (k + 1) % n) chain1.push(points[k]);
  chain1.push(points[ib]);

  const chain2: Point2[] = [];
  for (let k = ib; k !== ia; k = (k + 1) % n) chain2.push(points[k]);
  chain2.push(points[ia]);

  const simplified1 = douglasPeucker(chain1, SIMPLIFY_TOLERANCE_MM);
  const simplified2 = douglasPeucker(chain2, SIMPLIFY_TOLERANCE_MM);
  const result = simplified1.slice(0, -1).concat(simplified2.slice(0, -1));
  return result.length >= 3 ? result : points;
}
