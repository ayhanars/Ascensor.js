import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon as PCMultiPolygon, Ring as PCRing } from "polygon-clipping";
import type { ShapeRegion } from "../types";

export function regionsToMultiPolygon(regions: ShapeRegion[]): PCMultiPolygon {
  return regions.map((region) => [
    region.outer.points.map((p): [number, number] => [p.x, p.y]),
    ...region.holes.map((hole) => hole.points.map((p): [number, number] => [p.x, p.y])),
  ]);
}

function ringArea(ring: PCRing): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Real area of a MultiPolygon (each polygon's outer ring minus its holes),
 * not its bounding box — used to tell how much of a shape is genuinely
 * supported by whatever's beneath it, vs. just bbox-adjacent. */
export function multiPolygonArea(mp: PCMultiPolygon): number {
  let total = 0;
  for (const polygon of mp) {
    total += ringArea(polygon[0]);
    for (const hole of polygon.slice(1)) total -= ringArea(hole);
  }
  return Math.max(0, total);
}

export function regionsArea(regions: ShapeRegion[]): number {
  return multiPolygonArea(regionsToMultiPolygon(regions));
}

/**
 * Real polygon intersection area between two shapes' regions — unlike a
 * bounding-box overlap test, this is zero whenever the shapes' actual
 * outlines don't overlap even if their rectangular bounding boxes do (e.g.
 * two circles near the same corner, or an L-shaped part). `a` and `b` must
 * already be in the same coordinate space (bake each shape's world
 * transform into its points before calling this).
 */
export function regionsIntersectionArea(a: ShapeRegion[], b: ShapeRegion[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  try {
    return multiPolygonArea(polygonClipping.intersection(regionsToMultiPolygon(a), regionsToMultiPolygon(b)));
  } catch {
    // Degenerate/self-intersecting input — treat as "doesn't overlap"
    // rather than let a boolean-ops edge case crash auto-stack.
    return 0;
  }
}

function multiPolygonToRegions(mp: PCMultiPolygon): ShapeRegion[] {
  return mp.map((polygon) => ({
    outer: { points: polygon[0].map(([x, y]) => ({ x, y })) },
    holes: polygon.slice(1).map((ring) => ({ points: ring.map(([x, y]) => ({ x, y })) })),
  }));
}

/**
 * Boolean-combines several already-separate operands (each operand is its
 * own region set — unlike unionRegions, which flattens everything into one
 * combined shape, these three keep the operands distinct because subtract/
 * intersect/exclude are NOT symmetric across an arbitrary flat list the way
 * union is: subtract needs to know which operand is the subject and which
 * are being cut away, matching Figma's own boolean-operation semantics.
 */
export function differenceRegions(operands: ShapeRegion[][]): ShapeRegion[] {
  if (operands.length === 0) return [];
  if (operands.length === 1) return operands[0];
  const [subject, ...clips] = operands.map(regionsToMultiPolygon);
  return multiPolygonToRegions(polygonClipping.difference(subject, ...clips));
}

export function intersectionRegions(operands: ShapeRegion[][]): ShapeRegion[] {
  if (operands.length === 0) return [];
  if (operands.length === 1) return operands[0];
  const [first, ...rest] = operands.map(regionsToMultiPolygon);
  return multiPolygonToRegions(polygonClipping.intersection(first, ...rest));
}

export function xorRegions(operands: ShapeRegion[][]): ShapeRegion[] {
  if (operands.length === 0) return [];
  if (operands.length === 1) return operands[0];
  const [first, ...rest] = operands.map(regionsToMultiPolygon);
  return multiPolygonToRegions(polygonClipping.xor(first, ...rest));
}

/**
 * Combines regions with a real boolean union (like Figma's Union, not
 * Exclude): overlapping shapes fill solid instead of canceling out. Used
 * by "merge layers" so two overlapping circles become one solid blob, not
 * a ring where they overlapped.
 */
export function unionRegions(regions: ShapeRegion[]): ShapeRegion[] {
  if (regions.length <= 1) return regions;
  const result = polygonClipping.union(regionsToMultiPolygon(regions));
  return multiPolygonToRegions(result);
}
