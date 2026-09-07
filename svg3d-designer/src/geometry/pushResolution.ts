import type { Layer, ShapeRegion } from "../types";
import { getWorldRegions, isAncestorOrSelf, isShapeLayer } from "../state/sceneUtils";
import { regionsIntersectionArea } from "./booleanOps";

const OVERLAP_EPSILON = 1e-6;
// How many rounds of "does the shape I just pushed now overlap someone
// else" to resolve — bounded so a long chain of touching objects can't
// turn one drag into an unbounded cascade, while still handling the
// common case (pushing B, which nudges into C) in one drag step.
const MAX_PASSES = 4;
// Binary-search iterations for the push distance along a fixed direction —
// 24 halvings gets well under a micron of slack for any real-world object
// size, plenty for a print-scale document.
const SEARCH_ITERATIONS = 24;

function translateRegions(regions: ShapeRegion[], dx: number, dy: number): ShapeRegion[] {
  const move = (pts: { x: number; y: number }[]) => pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  return regions.map((r) => ({
    outer: { points: move(r.outer.points) },
    holes: r.holes.map((h) => ({ points: move(h.points) })),
  }));
}

/**
 * How far `obstacle` needs to move along the unit direction (dirX,dirY)
 * before it no longer overlaps `mover` — 0 if it's already clear. Grows
 * the search bound geometrically first (rather than guessing one fixed
 * cap) so it works regardless of how big the shapes involved are, then
 * binary-searches within whatever bound cleared it.
 */
function findClearDistance(
  mover: ShapeRegion[],
  obstacle: ShapeRegion[],
  dirX: number,
  dirY: number,
): number {
  const overlaps = (d: number) => regionsIntersectionArea(mover, translateRegions(obstacle, dirX * d, dirY * d)) > OVERLAP_EPSILON;
  if (!overlaps(0)) return 0;
  let hi = 1;
  while (overlaps(hi)) {
    hi *= 2;
    if (hi > 1e7) break; // pathological input guard — never actually reached for real documents
  }
  let lo = hi / 2;
  for (let i = 0; i < SEARCH_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (overlaps(mid)) lo = mid;
    else hi = mid;
  }
  return hi;
}

export interface PushUpdate {
  id: string;
  x: number;
  y: number;
}

/**
 * Given a set of shapes that just moved (their CURRENT position in
 * `layers` already reflects where the drag put them), finds every other
 * top-level, unlocked, visible, non-hole shape whose real outline — not
 * just its bounding box — now overlaps one of the movers, and pushes it
 * out of the way along the drag's own direction. Nested/grouped shapes
 * are left alone (pushing would need to fight the group's own transform);
 * everything else that's a plain sibling on the same plate is fair game.
 * Resolves a few rounds deep so a short chain of touching objects each
 * gets nudged once, not left half-overlapping.
 */
export function resolvePushes(
  layers: Record<string, Layer>,
  candidateIds: string[],
  movedIds: string[],
  dirX: number,
  dirY: number,
): PushUpdate[] {
  const dirLen = Math.hypot(dirX, dirY);
  if (dirLen < 1e-9) return [];
  const ux = dirX / dirLen;
  const uy = dirY / dirLen;

  const movedSet = new Set(movedIds);
  const pushedPositions = new Map<string, { x: number; y: number }>();

  // The shapes actually being dragged never move again during this
  // resolution — only the obstacles being pushed do — so this stays fixed
  // across every pass; each obstacle's own "what do I need to clear"
  // set is built fresh per obstacle below instead (see baseMoverRegions).
  const baseMoverRegions: ShapeRegion[] = movedIds.flatMap((id) => getWorldRegions(layers, id));

  const obstacles = candidateIds.filter((id) => {
    if (movedSet.has(id)) return false;
    const layer = layers[id];
    if (!isShapeLayer(layer)) return false;
    if (layer.parentId !== null) return false; // only plain top-level siblings
    if (layer.locked || !layer.visible || layer.isHole) return false;
    // Never push something the drag is itself an ancestor/descendant of
    // (can't happen for top-level-only candidates, but stay defensive).
    return !movedIds.some((m) => isAncestorOrSelf(layers, m, id) || isAncestorOrSelf(layers, id, m));
  });

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let anyPushed = false;
    for (const id of obstacles) {
      const layer = layers[id];
      if (!isShapeLayer(layer)) continue;
      const already = pushedPositions.get(id);
      const currentRegions = already
        ? translateRegions(getWorldRegions(layers, id), already.x - layer.transform.x, already.y - layer.transform.y)
        : getWorldRegions(layers, id);
      // What this one obstacle needs to clear: the original movers, plus
      // every OTHER obstacle already pushed this call (so a chain — A
      // pushes B, B's new spot now overlaps C — resolves within the
      // loop) — but never this same obstacle's own just-pushed position.
      // Including that would mean checking it for overlap against
      // itself: 100% self-overlap, no matter how far it had already
      // moved, which forced another huge "escape" push every single
      // pass — this was the actual cause of objects rocketing away.
      const othersPushed = Array.from(pushedPositions.entries())
        .filter(([otherId]) => otherId !== id)
        .flatMap(([otherId, pos]) => {
          const otherLayer = layers[otherId];
          return isShapeLayer(otherLayer)
            ? translateRegions(getWorldRegions(layers, otherId), pos.x - otherLayer.transform.x, pos.y - otherLayer.transform.y)
            : [];
        });
      const avoidRegions = [...baseMoverRegions, ...othersPushed];
      const distance = findClearDistance(avoidRegions, currentRegions, ux, uy);
      if (distance <= 0) continue;
      const base = already ?? { x: layer.transform.x, y: layer.transform.y };
      pushedPositions.set(id, { x: base.x + ux * distance, y: base.y + uy * distance });
      anyPushed = true;
    }
    if (!anyPushed) break;
  }

  return Array.from(pushedPositions.entries()).map(([id, pos]) => ({ id, x: pos.x, y: pos.y }));
}
