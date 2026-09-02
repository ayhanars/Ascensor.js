import type { Contour, Point2, ShapeRegion } from "../types";

/**
 * Replaces every vertex of a closed polygon with a tangent-circle fillet of
 * up to `radius` mm, tessellated into straight segments. This is the one
 * place "corner radius" is computed — the 2D preview, the 3D mesh, and the
 * STL export all consume its output, so what you see is always what
 * extrudes and exports.
 *
 * Each corner's fillet is independently clamped to at most half the length
 * of its two adjacent edges, so neighboring fillets can never overlap or
 * cross — the same safe-clamp strategy used for rounded-rectangle corners,
 * generalized to arbitrary polygons (convex or reflex).
 */
function roundContour(points: Point2[], radius: number, segments: number): Point2[] {
  if (radius <= 0 || points.length < 3) return points;

  const n = points.length;
  const out: Point2[] = [];

  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const cur = points[i];
    const next = points[(i + 1) % n];

    const toPrev = { x: prev.x - cur.x, y: prev.y - cur.y };
    const toNext = { x: next.x - cur.x, y: next.y - cur.y };
    const lenPrev = Math.hypot(toPrev.x, toPrev.y);
    const lenNext = Math.hypot(toNext.x, toNext.y);
    if (lenPrev < 1e-9 || lenNext < 1e-9) {
      out.push(cur);
      continue;
    }

    const v1 = { x: toPrev.x / lenPrev, y: toPrev.y / lenPrev };
    const v2 = { x: toNext.x / lenNext, y: toNext.y / lenNext };

    const dot = Math.max(-1, Math.min(1, v1.x * v2.x + v1.y * v2.y));
    const theta = Math.acos(dot); // interior angle at this vertex, 0..pi
    const halfAngle = theta / 2;

    const tMax = Math.min(lenPrev, lenNext) / 2;
    const tWanted = radius / Math.tan(halfAngle || 1e-9);
    const t = Math.min(tWanted, tMax);

    if (!Number.isFinite(t) || t < 1e-6) {
      out.push(cur);
      continue;
    }

    const tangentA = { x: cur.x + v1.x * t, y: cur.y + v1.y * t };
    const tangentB = { x: cur.x + v2.x * t, y: cur.y + v2.y * t };

    const bisector = { x: v1.x + v2.x, y: v1.y + v2.y };
    const bisectorLen = Math.hypot(bisector.x, bisector.y);
    const cosHalf = Math.cos(halfAngle);
    if (bisectorLen < 1e-9 || cosHalf < 1e-9) {
      out.push(cur);
      continue;
    }
    const distToCenter = t / cosHalf;
    const center = {
      x: cur.x + (bisector.x / bisectorLen) * distToCenter,
      y: cur.y + (bisector.y / bisectorLen) * distToCenter,
    };

    const a0 = Math.atan2(tangentA.y - center.y, tangentA.x - center.x);
    const a1 = Math.atan2(tangentB.y - center.y, tangentB.x - center.x);
    let delta = a1 - a0;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta <= -Math.PI) delta += Math.PI * 2;

    const rActual = t * Math.tan(halfAngle);
    const steps = Math.max(1, Math.round(segments * (Math.abs(delta) / Math.PI)));

    for (let s = 0; s <= steps; s++) {
      const a = a0 + (delta * s) / steps;
      out.push({
        x: center.x + Math.cos(a) * rActual,
        y: center.y + Math.sin(a) * rActual,
      });
    }
  }

  return out;
}

// STL is a real polygon mesh, not a shading trick — an under-tessellated
// fillet doesn't just look faceted on screen, it prints faceted too. 32
// gives a 90° corner ~16 straight segments (~5.6° each), plenty smooth at
// typical print scale without ballooning triangle counts on complex
// imported SVGs with many corners.
const ARC_SEGMENTS_PER_HALF_TURN = 32;

export function roundRegions(regions: ShapeRegion[], radius: number): ShapeRegion[] {
  if (radius <= 0) return regions;
  const round = (c: Contour): Contour => ({
    points: roundContour(c.points, radius, ARC_SEGMENTS_PER_HALF_TURN),
  });
  return regions.map((region) => ({
    outer: round(region.outer),
    holes: region.holes.map(round),
  }));
}
