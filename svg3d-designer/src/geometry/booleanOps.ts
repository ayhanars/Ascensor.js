import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon as PCMultiPolygon } from "polygon-clipping";
import type { ShapeRegion } from "../types";

function regionsToMultiPolygon(regions: ShapeRegion[]): PCMultiPolygon {
  return regions.map((region) => [
    region.outer.points.map((p): [number, number] => [p.x, p.y]),
    ...region.holes.map((hole) => hole.points.map((p): [number, number] => [p.x, p.y])),
  ]);
}

function multiPolygonToRegions(mp: PCMultiPolygon): ShapeRegion[] {
  return mp.map((polygon) => ({
    outer: { points: polygon[0].map(([x, y]) => ({ x, y })) },
    holes: polygon.slice(1).map((ring) => ({ points: ring.map(([x, y]) => ({ x, y })) })),
  }));
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
