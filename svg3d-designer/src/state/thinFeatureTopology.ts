import type { Point2 } from "../types";

// Measures a ring's REAL local material thickness by a direct topological
// test — not by how close two boundary SAMPLE POINTS happen to land — so it
// can't be fooled the way point-proximity search can be.
//
// A point-pair "closest boundary point" search (the earlier approach here)
// measures the Euclidean distance between two points on the outline. For a
// CURVED outline that's a poor proxy for material thickness: two points on
// the SAME gently curving wall (a rounded corner, a tapering tip, a curled
// stroke) can land close together in space without there being two
// genuinely separate walls with material pinched between them at all. Every
// attempt to patch that with smarter windows, turn-angle checks, or
// tangent-direction tests (see git history) ran into the same wall: a
// tapering tip and a genuinely thin bridge can produce near-identical local
// proximity signatures on a plain boundary description.
//
// The textbook-correct distinction is topological, not proximity-based: at
// a GENUINE thin bridge, removing a small disk of material at that point
// severs the shape into two separate pieces — there's no other route
// around, that's what "thin bridge" means. At a tapering tip or a curling
// stroke's own tightest curve, removing a small disk there does NOT
// disconnect anything; the rest of the shape's material is still whole,
// just with a slightly smaller bite taken out of one edge. This directly
// answers the print-relevant question too: does failing to print two
// distinct walls here actually break the part into two pieces.
//
// Implementation: rasterize the ring's interior onto a grid, then for each
// candidate pinch point, remove a disk of the safety-threshold's diameter
// centered there and check (via a bounded flood fill) whether the point
// just past the disk on one side can still reach the point just past it on
// the other side through the remaining material. If it can't, this is a
// genuine bottleneck; if it can (there's a way around, even a curved one),
// it isn't — regardless of how close together the two boundary SAMPLE
// points that first flagged this location happened to be.

interface RasterField {
  inside: Uint8Array;
  cols: number;
  rows: number;
  minX: number;
  minY: number;
  cellSize: number;
}

function cellIndex(field: RasterField, c: number, r: number): number {
  return r * field.cols + c;
}

/** Rasterizes a closed ring's interior via horizontal scanline fill. */
function rasterize(ringPoints: Point2[], cellSize: number): RasterField {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of ringPoints) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const pad = cellSize * 2;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const cols = Math.max(1, Math.ceil((maxX - minX) / cellSize));
  const rows = Math.max(1, Math.ceil((maxY - minY) / cellSize));
  const inside = new Uint8Array(cols * rows);
  const field: RasterField = { inside, cols, rows, minX, minY, cellSize };

  const n = ringPoints.length;
  for (let r = 0; r < rows; r++) {
    const y = minY + (r + 0.5) * cellSize;
    const xs: number[] = [];
    for (let s = 0; s < n; s++) {
      const a = ringPoints[s], b = ringPoints[(s + 1) % n];
      if (a.y > y === b.y > y) continue;
      const t = (y - a.y) / (b.y - a.y);
      xs.push(a.x + t * (b.x - a.x));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - minX) / cellSize - 0.5));
      const c1 = Math.min(cols - 1, Math.floor((xs[k + 1] - minX) / cellSize - 0.5));
      for (let c = c0; c <= c1; c++) inside[cellIndex(field, c, r)] = 1;
    }
  }
  return field;
}

// 4-connected, not 8: an 8-connected traversal can slip diagonally past a
// barrier that's only one cell wide (the classic raster "diagonal gap"
// problem) — which is exactly what a circular cut disk produces at any x
// position other than its exact center, since the disk only fully spans a
// corridor's width at a single point. With 4-connectivity a single row of
// cut cells is a real barrier, matching how a straight cut actually
// severs material; two regions touching only at a diagonal corner point
// (zero area) aren't real connected material anyway, so this is the
// geometrically correct choice here, not just a bug workaround.
const NEIGHBORS_4: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
];

/** With a disk of `diameterMM` removed centered at `mid`, are `seedA` and
 * `seedB` (points on either side of the candidate pinch) still connected
 * through the remaining material? Bounded flood fill, capped by
 * `maxSteps` — generous enough to route around into a wider body, but
 * bounded so an unrelated distant part of a large shape can't blow up the
 * search. */
function isConnectedThroughGap(
  field: RasterField,
  mid: Point2,
  diameterMM: number,
  seedA: Point2,
  seedB: Point2,
  maxSteps: number,
): boolean {
  const { inside, cols, rows, minX, minY, cellSize } = field;
  const radius = diameterMM / 2;
  const radiusSq = radius * radius;

  const isOpen = (c: number, r: number): boolean => {
    if (c < 0 || c >= cols || r < 0 || r >= rows) return false;
    if (!inside[cellIndex(field, c, r)]) return false;
    const cx = minX + (c + 0.5) * cellSize, cy = minY + (r + 0.5) * cellSize;
    const dx = cx - mid.x, dy = cy - mid.y;
    return dx * dx + dy * dy > radiusSq;
  };

  const toCell = (p: Point2): [number, number] => [
    Math.round((p.x - minX) / cellSize - 0.5),
    Math.round((p.y - minY) / cellSize - 0.5),
  ];
  function nearestOpen(c: number, r: number): [number, number] | null {
    if (isOpen(c, r)) return [c, r];
    for (let rad = 1; rad <= 6; rad++) {
      for (let dc = -rad; dc <= rad; dc++) {
        for (let dr = -rad; dr <= rad; dr++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
          if (isOpen(c + dc, r + dr)) return [c + dc, r + dr];
        }
      }
    }
    return null;
  }

  const [ac, ar] = toCell(seedA);
  const [bc, br] = toCell(seedB);
  const start = nearestOpen(ac, ar);
  const goal = nearestOpen(bc, br);
  if (!start || !goal) return false;

  // A `Set<string>` keyed by template-literal "c,r" strings used to track
  // visited cells here — for a fine raster (RASTER_CELL_SIZE_MM=0.03mm) over
  // even a modest shape, that's millions of string allocations/hashes per
  // flood fill, called up to ~13x per candidate pinch point (the fast test
  // plus a 12-step binary search). Measured directly: this alone froze the
  // tab for 30+ seconds on a single real beveled crescent. A flat
  // `Uint8Array` indexed exactly like `field.inside` (same `cellIndex`) does
  // the identical visited-tracking with plain integer arithmetic instead —
  // same algorithm, same result, no allocation-per-cell cost.
  const visited = new Uint8Array(cols * rows);
  const startIdx = cellIndex(field, start[0], start[1]);
  const goalIdx = cellIndex(field, goal[0], goal[1]);
  visited[startIdx] = 1;
  let frontier: number[] = [startIdx];
  let steps = 0;
  while (frontier.length && steps < maxSteps) {
    const next: number[] = [];
    for (const idx of frontier) {
      if (idx === goalIdx) return true;
      const c = idx % cols;
      const r = (idx - c) / cols;
      for (const [dc, dr] of NEIGHBORS_4) {
        const nc = c + dc, nr = r + dr;
        if (!isOpen(nc, nr)) continue;
        const nIdx = cellIndex(field, nc, nr);
        if (visited[nIdx]) continue;
        visited[nIdx] = 1;
        next.push(nIdx);
      }
    }
    frontier = next;
    steps++;
  }
  return visited[goalIdx] === 1;
}

interface Candidate {
  i: number;
  j: number;
  mid: Point2;
  seedA: Point2;
  seedB: Point2;
  rawWidth: number;
}

function closestPointOnSegment(p: Point2, a: Point2, b: Point2): Point2 {
  const abx = b.x - a.x, aby = b.y - a.y, apx = p.x - a.x, apy = p.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 0 ? (apx * abx + apy * aby) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + abx * t, y: a.y + aby * t };
}

const DUPLICATE_POINT_EPSILON_MM = 1e-6;

function dedupeClosedRing(points: Point2[]): Point2[] {
  const out: Point2[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < DUPLICATE_POINT_EPSILON_MM) continue;
    out.push(p);
  }
  if (
    out.length > 3 &&
    Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) < DUPLICATE_POINT_EPSILON_MM
  ) {
    out.pop();
  }
  return out;
}

// A vertex-based search only ever finds candidates AT existing points — for
// a sparse, straight-edged shape (a native rectangle has just 4 corners,
// same for anything drawn with this app's own rect/circle tools) the
// TRUE thinnest cross-section commonly sits strictly BETWEEN two vertices,
// somewhere along a long straight edge, and a purely vertex-based search
// can miss it entirely (every candidate it finds clamps to a corner, which
// can have "wiggle room" to dodge a cut through a wider region just beyond
// that corner — exactly the false-negative this densification prevents).
// Inserting extra colinear points along an edge doesn't change the
// polygon's shape at all (they sit exactly on the existing straight line),
// so this is free of any geometric approximation cost. Capped per edge so
// one absurdly long edge on a huge shape can't blow up the candidate count.
const MAX_CANDIDATE_EDGE_MM = 0.5;
const MAX_INSERTED_POINTS_PER_EDGE = 60;

function densifyRing(points: Point2[]): Point2[] {
  const n = points.length;
  const out: Point2[] = [];
  for (let k = 0; k < n; k++) {
    const a = points[k];
    const b = points[(k + 1) % n];
    out.push(a);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const segments = Math.min(MAX_INSERTED_POINTS_PER_EDGE + 1, Math.ceil(len / MAX_CANDIDATE_EDGE_MM));
    for (let s = 1; s < segments; s++) {
      const t = s / segments;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

// Cheap point-pair search: a lower-bound filter that finds candidate pinch
// LOCATIONS (any two boundary points closer than `cutoffMM`, excluding
// points on the same local curve via the same arc-length-derived index
// window used before). This can't be trusted as the final width — see the
// module doc — but it's a fast, safe way to find WHERE to run the real
// topological test: true material thickness at any point can't be less
// than the closest two sample points found there.
const PINCH_ARC_EXCLUDE_MM = 1.5;

// The cut disk tested can be as large as minSafeWidthMM in diameter (radius
// minSafeWidthMM/2), so a seed placed exactly AT the boundary point that
// first flagged a pinch (only ~rawWidth away from its center) can itself
// end up swallowed by a larger test cut, forcing a fallback search whose
// outcome isn't a clean "is the corridor severed" answer any more. Walking
// the seed further out along the RING itself (still exactly on the
// boundary, just further from the pinch) keeps it reliably outside any cut
// this module ever tests, without needing to guess a "corridor direction"
// that curved shapes don't really have.
//
// The walk distance matters: too short and it's still swallowed by a large
// test cut; too long and it can walk clean past a SHORT thin feature's own
// extent into whatever wider region sits beyond both its ends, landing
// both seeds in the same lobe regardless of direction and making the test
// trivially "connected" no matter what the cut does. Walking by a small,
// fixed REAL arc-length distance -- just enough to clear the largest
// tested radius, not a fixed index count -- avoids overshooting a short
// feature while still using barely more resolution than the ring already
// has (points are at most MAX_CANDIDATE_EDGE_MM apart after densifying).
function walkAwayFrom(points: Point2[], fromIdx: number, mid: Point2, targetDistMM: number): Point2 {
  const n = points.length;
  function walk(dir: 1 | -1): Point2 {
    let idx = fromIdx;
    let acc = 0;
    for (let steps = 0; steps < n && acc < targetDistMM; steps++) {
      const next = (idx + dir + n) % n;
      acc += Math.hypot(points[next].x - points[idx].x, points[next].y - points[idx].y);
      idx = next;
    }
    return points[idx];
  }
  const forward = walk(1);
  const backward = walk(-1);
  const dForward = Math.hypot(forward.x - mid.x, forward.y - mid.y);
  const dBackward = Math.hypot(backward.x - mid.x, backward.y - mid.y);
  // Walking "toward" the far side by index doesn't always mean walking
  // away from the pinch in space once the ring curves, so pick whichever
  // direction actually ends up farther from the pinch center.
  return dForward >= dBackward ? forward : backward;
}

function findCandidates(points: Point2[], cutoffMM: number, seedWalkDistMM: number): { all: Candidate[]; n: number } {
  const n = points.length;
  let perimeter = 0;
  for (let k = 0; k < n; k++) {
    perimeter += Math.hypot(points[(k + 1) % n].x - points[k].x, points[(k + 1) % n].y - points[k].y);
  }
  const avgSegmentLength = perimeter / n;
  const indexWindow =
    avgSegmentLength > 0 ? Math.max(1, Math.round(PINCH_ARC_EXCLUDE_MM / avgSegmentLength)) : 1;

  const all: Candidate[] = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    let best = Infinity;
    let bestClosest: Point2 | null = null;
    let bestJ = -1;
    let bestJAnchor = -1;
    for (let j = 0; j < n; j++) {
      if (j === i || (j + 1) % n === i) continue;
      const j1 = (j + 1) % n;
      const dIndexJ = Math.min((j - i + n) % n, (i - j + n) % n);
      const dIndexJ1 = Math.min((j1 - i + n) % n, (i - j1 + n) % n);
      if (Math.min(dIndexJ, dIndexJ1) < indexWindow) continue;
      const a = points[j], b = points[j1];
      const closest = closestPointOnSegment(p, a, b);
      const d = Math.hypot(closest.x - p.x, closest.y - p.y);
      if (d < best) {
        best = d;
        bestClosest = closest;
        bestJ = j;
        bestJAnchor = dIndexJ <= dIndexJ1 ? j : j1;
      }
    }
    if (bestClosest && best < cutoffMM) {
      const mid = { x: (p.x + bestClosest.x) / 2, y: (p.y + bestClosest.y) / 2 };
      const seedA = walkAwayFrom(points, i, mid, seedWalkDistMM);
      const seedB = walkAwayFrom(points, bestJAnchor, mid, seedWalkDistMM);
      all.push({ i, j: bestJ, mid, seedA, seedB, rawWidth: best });
    }
  }
  return { all, n };
}

// Several point-pair candidates commonly cluster around the SAME local
// pinch region (each nearby boundary point re-finds a near-identical
// closest partner). Collapsing each cluster to its single worst
// representative avoids re-running the (much more expensive) topological
// test redundantly dozens of times over what's really one location.
const CLUSTER_INDEX_WINDOW = 4;

function clusterCandidates(all: Candidate[], n: number): Candidate[] {
  const clusters: Candidate[][] = [];
  for (const cand of all) {
    let placed = false;
    for (const cl of clusters) {
      const rep = cl[0];
      const di = Math.min((cand.i - rep.i + n) % n, (rep.i - cand.i + n) % n);
      const dj = Math.min((cand.j - rep.j + n) % n, (rep.j - cand.j + n) % n);
      if (di < CLUSTER_INDEX_WINDOW && dj < CLUSTER_INDEX_WINDOW) {
        cl.push(cand);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([cand]);
  }
  return clusters.map((cl) => cl.reduce((worst, c) => (c.rawWidth < worst.rawWidth ? c : worst)));
}

const RASTER_CELL_SIZE_MM = 0.03;

/**
 * The ring's true minimum local material width, verified topologically —
 * NOT the raw closest-boundary-point distance. Returns `Infinity` if
 * nothing on the ring is thinner than `minSafeWidthMM`; a `< minSafeWidthMM`
 * result is the width of a location proven to be a genuine bottleneck
 * (cutting it there actually disconnects the shape).
 */
export function trueMinRingWidth(rawPoints: Point2[], minSafeWidthMM: number): number {
  const deduped = dedupeClosedRing(rawPoints);
  if (deduped.length < 4) return Infinity;
  // Densify BEFORE anything else — inserted points sit exactly on the
  // existing straight edges, so this changes nothing about the shape
  // itself, only how thoroughly candidate search can see it.
  const points = densifyRing(deduped);
  const n = points.length;

  // Generous cutoff: true width at a location can never be smaller than the
  // closest two boundary samples found there, so filtering candidates by a
  // cutoff comfortably above the safety threshold can't miss a genuine
  // bottleneck.
  const cutoffMM = Math.max(minSafeWidthMM * 3, 1.5);
  const { all } = findCandidates(points, cutoffMM, minSafeWidthMM);
  if (all.length === 0) return Infinity;

  const representatives = clusterCandidates(all, n);
  const field = rasterize(points, RASTER_CELL_SIZE_MM);
  const maxSteps = Math.min(6000, Math.ceil((field.cols + field.rows) * 3));

  let globalMin = Infinity;
  for (const c of representatives) {
    // Fast path: a single test at the safety threshold settles the common
    // (safe) case without needing a precise width at all.
    if (isConnectedThroughGap(field, c.mid, minSafeWidthMM, c.seedA, c.seedB, maxSteps)) continue;
    // Confirmed genuinely thin here -- binary search a precise value only
    // for the (rare) candidates that actually need one, for display.
    let lo = 0, hi = minSafeWidthMM;
    for (let iter = 0; iter < 12; iter++) {
      const mid = (lo + hi) / 2;
      if (isConnectedThroughGap(field, c.mid, mid, c.seedA, c.seedB, maxSteps)) lo = mid;
      else hi = mid;
    }
    const trueWidth = (lo + hi) / 2;
    if (trueWidth < globalMin) globalMin = trueWidth;
  }
  return globalMin;
}
