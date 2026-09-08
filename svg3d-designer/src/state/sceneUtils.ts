import * as THREE from "three";
import type { Layer, Point2, ShapeLayer, ShapeRegion, Transform2D } from "../types";
import { differenceRegions, regionsArea, regionsIntersectionArea, unionRegions } from "../geometry/booleanOps";
import { applyLayerTransform, buildExtrudeGeometry } from "../geometry/extrude";
import { trueMinRingWidth } from "./thinFeatureTopology";

export const IDENTITY_TRANSFORM: Transform2D = {
  x: 0,
  y: 0,
  z: 0,
  rotation: 0,
  rotationX: 0,
  rotationY: 0,
  scaleX: 1,
  scaleY: 1,
};

export function isShapeLayer(layer: Layer | undefined): layer is ShapeLayer {
  return !!layer && layer.type === "shape";
}

/** True if `ancestorId` is `id` itself, or is somewhere up its parent chain. */
export function isAncestorOrSelf(layers: Record<string, Layer>, ancestorId: string, id: string): boolean {
  let cur: Layer | undefined = layers[id];
  while (cur) {
    if (cur.id === ancestorId) return true;
    cur = cur.parentId ? layers[cur.parentId] : undefined;
  }
  return false;
}

/** Walks up to the outermost ancestor (a rootIds member) — clicking any
 * shape inside a group should select/move the whole group as one unit,
 * the same way Figma treats a click on a group's member as a click on the
 * group itself unless you've double-clicked in to edit it individually. */
export function getTopLevelId(layers: Record<string, Layer>, id: string): string {
  let result = id;
  let cur = layers[id];
  while (cur?.parentId) {
    result = cur.parentId;
    cur = layers[cur.parentId];
  }
  return result;
}

/**
 * Resolves what a click on `rawId` should actually select, given what's
 * currently selected — Figma's "click to select the group, click again to
 * step inside it" behavior, generalized to any nesting depth: a fresh
 * click always lands on the outermost group, and each subsequent click on
 * the same target descends exactly one level further into it (through as
 * many nested sub-groups as there are), until you reach the leaf shape.
 * Clicking somewhere unrelated to the current drill path resets to the
 * top level for that new target, same as a fresh click.
 */
export function stepIntoOnClick(
  layers: Record<string, Layer>,
  currentSelectionId: string | undefined,
  rawId: string,
): string {
  if (!currentSelectionId) return getTopLevelId(layers, rawId);
  if (currentSelectionId === rawId) return rawId; // already drilled to the leaf
  // Walk up from rawId; the node one step below wherever we hit
  // currentSelectionId is exactly one level deeper — descend there.
  let child = rawId;
  let cur = layers[rawId];
  while (cur) {
    if (cur.parentId === currentSelectionId) return child;
    if (!cur.parentId) break;
    child = cur.parentId;
    cur = layers[cur.parentId];
  }
  // currentSelectionId isn't an ancestor of rawId at all — unrelated click.
  return getTopLevelId(layers, rawId);
}

/** Composes a layer's local transform with all of its ancestors'. */
export function getWorldTransform(
  layers: Record<string, Layer>,
  id: string,
): Transform2D {
  const chain: Layer[] = [];
  let cur: Layer | undefined = layers[id];
  while (cur) {
    chain.unshift(cur);
    cur = cur.parentId ? layers[cur.parentId] : undefined;
  }

  let x = 0;
  let y = 0;
  let z = 0;
  let rotation = 0;
  let rotationX = 0;
  let rotationY = 0;
  let scaleX = 1;
  let scaleY = 1;

  for (const layer of chain) {
    const t = layer.transform;
    // Apply parent's rotation/scale to the child's local offset first.
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const localX = t.x * scaleX;
    const localY = t.y * scaleY;
    const rotatedX = localX * cos - localY * sin;
    const rotatedY = localX * sin + localY * cos;
    x += rotatedX;
    y += rotatedY;
    // Z is a simple stacking height, independent of the 2D rotation/scale
    // that only ever happens around/within the print bed's XY plane.
    z += t.z;
    rotation += t.rotation;
    // The 3D-only tilt axes (see Transform2D) aren't meaningful composed
    // into a single flattened world value the way x/y/z/rotation are —
    // every caller of getWorldTransform is a 2D-canvas/alignment/drag
    // concern that only ever reasons about the print bed's XY plane and
    // the Z-axis "spin" — so this is a best-effort additive carry-through
    // (matching how rotation itself accumulates), not a true composed
    // orientation; nothing here currently reads it.
    rotationX += t.rotationX;
    rotationY += t.rotationY;
    scaleX *= t.scaleX;
    scaleY *= t.scaleY;
  }

  return { x, y, z, rotation, rotationX, rotationY, scaleX, scaleY };
}

export function isEffectivelyVisible(
  layers: Record<string, Layer>,
  id: string,
): boolean {
  let cur: Layer | undefined = layers[id];
  while (cur) {
    if (!cur.visible) return false;
    cur = cur.parentId ? layers[cur.parentId] : undefined;
  }
  return true;
}

export function isEffectivelyLocked(
  layers: Record<string, Layer>,
  id: string,
): boolean {
  let cur: Layer | undefined = layers[id];
  while (cur) {
    if (cur.locked) return true;
    cur = cur.parentId ? layers[cur.parentId] : undefined;
  }
  return false;
}

/** All shape-layer descendants of a layer (or itself, if it's a shape layer). */
export function collectShapeLayers(
  layers: Record<string, Layer>,
  id: string,
): ShapeLayer[] {
  const layer = layers[id];
  if (!layer) return [];
  if (layer.type === "shape") return [layer];
  const result: ShapeLayer[] = [];
  for (const childId of layer.children) {
    result.push(...collectShapeLayers(layers, childId));
  }
  return result;
}

export function collectAllDescendantIds(
  layers: Record<string, Layer>,
  id: string,
): string[] {
  const layer = layers[id];
  if (!layer || layer.type !== "group") return [];
  const result: string[] = [];
  for (const childId of layer.children) {
    result.push(childId, ...collectAllDescendantIds(layers, childId));
  }
  return result;
}

/** Flattened, depth-annotated list of layers in display order, for the layer panel. */
export interface FlatLayerRow {
  id: string;
  depth: number;
}

export function flattenForDisplay(
  layers: Record<string, Layer>,
  rootIds: string[],
  depth = 0,
): FlatLayerRow[] {
  const rows: FlatLayerRow[] = [];
  for (const id of rootIds) {
    const layer = layers[id];
    if (!layer) continue;
    rows.push({ id, depth });
    if (layer.type === "group") {
      rows.push(...flattenForDisplay(layers, layer.children, depth + 1));
    }
  }
  return rows;
}

/** Applies a Transform2D (scale, then rotate, then translate) to a point. */
export function applyTransform2D(p: Point2, t: Transform2D): Point2 {
  const sx = p.x * t.scaleX;
  const sy = p.y * t.scaleY;
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: sx * cos - sy * sin + t.x,
    y: sx * sin + sy * cos + t.y,
  };
}

/** Inverse of applyTransform2D: given a point already in `t`'s target
 * space, returns the point in `t`'s source space that produced it —
 * un-translate, un-rotate, un-scale, in that order. Used to take a shape's
 * points baked to world space (e.g. for a boolean union across differently
 * -transformed sources) and re-express them relative to a specific parent,
 * so the result doesn't get that parent's transform applied a second time
 * when it renders as one of that parent's children. */
export function invertTransform2D(p: Point2, t: Transform2D): Point2 {
  const dx = p.x - t.x;
  const dy = p.y - t.y;
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: (dx * cos + dy * sin) / t.scaleX,
    y: (-dx * sin + dy * cos) / t.scaleY,
  };
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

function expandBounds(b: Bounds | null, p: Point2): Bounds {
  if (!b) return { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
  return {
    minX: Math.min(b.minX, p.x),
    minY: Math.min(b.minY, p.y),
    maxX: Math.max(b.maxX, p.x),
    maxY: Math.max(b.maxY, p.y),
  };
}

/** World-space (document mm) bounding box of a layer and, for groups, all its descendants. */
export function getLayerWorldBounds(
  layers: Record<string, Layer>,
  id: string,
): Bounds | null {
  const shapeLayers = collectShapeLayers(layers, id);
  let bounds: Bounds | null = null;
  for (const shapeLayer of shapeLayers) {
    const world = getWorldTransform(layers, shapeLayer.id);
    for (const region of shapeLayer.regions) {
      for (const pt of region.outer.points) {
        bounds = expandBounds(bounds, applyTransform2D(pt, world));
      }
    }
  }
  return bounds;
}

/** Union of getLayerWorldBounds across several layers (e.g. the current selection). */
export function getMultiLayerWorldBounds(
  layers: Record<string, Layer>,
  ids: string[],
): Bounds | null {
  let bounds: Bounds | null = null;
  for (const id of ids) {
    const b = getLayerWorldBounds(layers, id);
    if (!b) continue;
    bounds = bounds
      ? {
          minX: Math.min(bounds.minX, b.minX),
          minY: Math.min(bounds.minY, b.minY),
          maxX: Math.max(bounds.maxX, b.maxX),
          maxY: Math.max(bounds.maxY, b.maxY),
        }
      : b;
  }
  return bounds;
}

/** A shape's own untransformed bounding box (its raw `regions` points, no
 * scale/rotation/translation applied) — the basis for "set this shape to a
 * specific real-world size" actions, since the actual on-screen/printed
 * size is this local box scaled by the layer's own transform. */
export function getLocalShapeBounds(shape: ShapeLayer): Bounds | null {
  let bounds: Bounds | null = null;
  for (const region of shape.regions) {
    for (const pt of region.outer.points) {
      bounds = expandBounds(bounds, pt);
    }
  }
  return bounds;
}

/**
 * A shape's real LOCAL Z extent — [0, extrusionDepth] for a plain box.
 * Edge bevel only ever rounds the rim (its curve is clamped to stay within
 * [0, extrusionDepth], never past it), so this is currently always the
 * plain box range, but it reuses the real extrude geometry (rather than
 * re-deriving the ring math and its own width/depth safety clamps here) so
 * this can never drift out of sync with what actually gets built and
 * printed if a future edge treatment ever does bulge past that range.
 */
export function getLocalShapeZRange(shape: ShapeLayer): { min: number; max: number } {
  const geometry = buildExtrudeGeometry(shape);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  return box ? { min: box.min.z, max: box.max.z } : { min: 0, max: shape.extrusionDepth };
}

/**
 * A shape's real WORLD-space Z extent — where its actual geometry (not its
 * nominal transform.z / extrusionDepth) truly begins and ends once dressed
 * up with bevel. `transform.rotation` (Z-roll) never tilts a shape's Z
 * bounds, but `rotationX`/`rotationY` (pitch/yaw) — on this shape or any
 * ancestor group — absolutely can: a tilted shape's lowest/highest point is
 * no longer just its untilted local range shifted by transform.z.
 */
export function getShapeWorldZRange(
  layers: Record<string, Layer>,
  id: string,
): { min: number; max: number } | null {
  const layer = layers[id];
  if (!isShapeLayer(layer)) return null;

  const chain: Layer[] = [];
  let cur: Layer | undefined = layer;
  while (cur) {
    chain.unshift(cur);
    cur = cur.parentId ? layers[cur.parentId] : undefined;
  }

  const hasTilt = chain.some((l) => l.transform.rotationX !== 0 || l.transform.rotationY !== 0);
  if (!hasTilt) {
    // Fast path for the overwhelmingly common case: with no pitch/yaw
    // anywhere in the chain, Z is a simple additive stack (see
    // getWorldTransform) and this shape's own local range just slides
    // up/down by that amount — no need to touch its geometry at all.
    const worldZ = getWorldTransform(layers, id).z;
    const local = getLocalShapeZRange(layer);
    return { min: worldZ + local.min, max: worldZ + local.max };
  }

  // Walk the real nested transform chain — exactly like buildAssemblyGroup
  // does for rendering/export — so a pitch/yaw tilt anywhere in it lands
  // this shape's geometry in the same place it would in the printed mesh,
  // then read off the true min/max Z from the actual (tilted) vertices.
  let parent: THREE.Object3D = new THREE.Group();
  for (const l of chain) {
    const node = new THREE.Group();
    applyLayerTransform(node, l.transform);
    parent.add(node);
    parent = node;
  }
  parent.updateMatrixWorld(true);

  const geometry = buildExtrudeGeometry(layer);
  const position = geometry.getAttribute("position");
  const v = new THREE.Vector3();
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < position.count; i++) {
    v.set(position.getX(i), position.getY(i), position.getZ(i));
    v.applyMatrix4(parent.matrixWorld);
    if (v.z < min) min = v.z;
    if (v.z > max) max = v.z;
  }
  return { min, max };
}

/** A shape's own regions (including its holes), with the layer's full
 * world transform baked into every point — its real printed footprint in
 * document space, not just its bounding box. Used wherever an actual
 * polygon overlap/support check is needed (e.g. auto-stack), since two
 * shapes' bounding boxes can overlap while their real outlines don't. */
export function getWorldRegions(layers: Record<string, Layer>, id: string): ShapeRegion[] {
  const layer = layers[id];
  if (!isShapeLayer(layer)) return [];
  const world = getWorldTransform(layers, id);
  return layer.regions.map((region) => ({
    outer: { points: region.outer.points.map((p) => applyTransform2D(p, world)) },
    holes: region.holes.map((h) => ({ points: h.points.map((p) => applyTransform2D(p, world)) })),
  }));
}

// How close two Z heights (mm) need to be to count as touching — loose
// enough to absorb the rounding a display-unit round-trip (mm<->cm<->in,
// or just typing a value) can introduce, tight enough to never treat two
// genuinely different stacking heights as the same one.
const Z_ALIGN_EPSILON_MM = 0.05;

/**
 * A shape's world regions with whatever any `isHole` layer clears away at
 * its own TOP surface subtracted out — what something resting on top of it
 * can actually land on. `subtractHoles` (holeSubtraction.ts) does a real 3D
 * CSG cut of every hole from every solid it geometrically overlaps, but
 * that only ever touches the built THREE geometry — the 2D `regions` this
 * shape's support/floating checks (auto-stack, the floating-shape warning,
 * fixFloatingLayers) all read from is never updated to match, so without
 * this a hole cut clean through a shape is invisible to every one of them:
 * they still see the shape's full, uncut footprint as solid support. A
 * shallow pocket that never reaches this shape's own top Z leaves the top
 * surface untouched (nothing rests inside a pocket that stops below the
 * surface it's cut from), so only a hole whose own Z range actually
 * reaches (or passes through) this shape's top counts — whether the hole
 * continues on through the bottom or stops right there makes no
 * difference from above.
 *
 * `topZOverride` lets a caller supply the shape's real current top Z
 * directly instead of having it re-derived from `layers[id].transform` —
 * needed by auto-stack, which computes a shape's brand-new Z within the
 * same pass that then asks what it can support, before that new Z has
 * been written back into `layers` for getShapeWorldZRange to see.
 */
export function getWorldSupportRegions(
  layers: Record<string, Layer>,
  id: string,
  topZOverride?: number,
): ShapeRegion[] {
  const own = getWorldRegions(layers, id);
  const topZ = topZOverride ?? getShapeWorldZRange(layers, id)?.max;
  if (topZ === undefined) return own;

  const clips: ShapeRegion[][] = [];
  for (const hole of Object.values(layers)) {
    if (!isShapeLayer(hole) || !hole.isHole || hole.id === id) continue;
    const holeZRange = getShapeWorldZRange(layers, hole.id);
    if (!holeZRange) continue;
    if (holeZRange.max < topZ - Z_ALIGN_EPSILON_MM) continue; // doesn't reach the top surface
    if (holeZRange.min > topZ + Z_ALIGN_EPSILON_MM) continue; // sits entirely above it — no overlap
    const holeRegions = getWorldRegions(layers, hole.id);
    if (regionsIntersectionArea(own, holeRegions) < 1e-9) continue;
    clips.push(holeRegions);
  }
  if (clips.length === 0) return own;
  return differenceRegions([own, ...clips]);
}

// Above this fraction of a shape's own footprint being supported, it's
// considered fully attached (not worth flagging at all). Below
// PARTIAL_CONTACT_FRACTION, there's no meaningful contact — it's genuinely
// floating and will fail to print. In between (a real but partial contact,
// like an ear or mustache resting on a small sliver of the head beneath it)
// it's flagged as a softer, dismissible warning rather than a hard error.
const FULLY_SUPPORTED_FRACTION = 0.98;
const PARTIAL_CONTACT_FRACTION = 0.03;

export interface FloatingSeverities {
  /** No real support at all — will fail to print; always shown, never dismissible. */
  critical: string[];
  /** Some genuine contact area but not fully supported — likely fine in
   * practice (a small attached feature), shown as a softer warning the
   * user can dismiss once acknowledged. */
  partial: string[];
}

/**
 * Which currently-placed shapes are, right now, NOT fully supported by
 * whatever they're resting on — read-only, unlike autoStackLayers (which
 * also repositions everything): this checks each shape's REAL current Z
 * against every other shape's real current footprint, so it reflects
 * wherever things actually are on screen, whether they got there via
 * Auto-Stack, a manual Z edit, or a drag. A shape sitting on the bed
 * (world Z ~0) is always considered supported.
 */
export function computeFloatingLayerSeverities(
  layers: Record<string, Layer>,
  rootIds: string[],
): FloatingSeverities {
  const order = flattenForDisplay(layers, rootIds)
    .map((r) => r.id)
    .filter((id) => isShapeLayer(layers[id]));

  const info = order
    .map((id) => {
      const layer = layers[id] as ShapeLayer;
      const regions = getWorldRegions(layers, id);
      // The real geometric bottom/top, not the nominal transform.z /
      // transform.z+extrusionDepth — kept via getShapeWorldZRange rather
      // than assumed, so this can't drift out of sync with what actually
      // gets built.
      const zRange = getShapeWorldZRange(layers, id) ?? { min: 0, max: layer.extrusionDepth };
      return { id, layer, regions, area: regionsArea(regions), z: zRange.min, topZ: zRange.max };
    })
    .filter((item) => !item.layer.isHole && item.area > 1e-6);

  const critical: string[] = [];
  const partial: string[] = [];
  for (const item of info) {
    if (item.z <= Z_ALIGN_EPSILON_MM) continue;
    // A shape "supports" item's bottom whenever the supporter's own
    // material actually spans item's bottom Z — not just when the two
    // happen to line up EXACTLY. That single test covers every physical
    // arrangement that should count as real contact: sitting flush on
    // the surface below (supporter's top ≈ item's bottom), embedded some
    // distance into it (supporter's top is genuinely ABOVE item's bottom,
    // because item's bottom is buried inside it), or resting on a
    // shape several layers down after skipping over one that never
    // actually touched it (that skipped shape simply fails this same
    // test and is correctly not counted). Only a supporter that starts
    // ABOVE item's own bottom (o.z > item.z), or whose top ends BELOW
    // it with a real gap (o.topZ < item.z), fails to make contact —
    // exactly the "floating" case this function exists to catch.
    const supporters = info.filter(
      (o) => o.id !== item.id && o.z <= item.z + Z_ALIGN_EPSILON_MM && o.topZ >= item.z - Z_ALIGN_EPSILON_MM,
    );
    if (supporters.length === 0) {
      critical.push(item.id);
      continue;
    }
    const supportUnion = unionRegions(supporters.flatMap((s) => getWorldSupportRegions(layers, s.id)));
    const supportedArea = regionsIntersectionArea(item.regions, supportUnion);
    if (supportedArea < item.area * PARTIAL_CONTACT_FRACTION) critical.push(item.id);
    else if (supportedArea < item.area * FULLY_SUPPORTED_FRACTION) partial.push(item.id);
  }
  return { critical, partial };
}

/**
 * Groups shape layers into clusters of ones that actually, physically touch
 * — real XY polygon overlap AND a real Z overlap/touch, not just "both
 * happen to be part of the same document." Two shapes with no geometric
 * relationship at all (a stray duplicate sitting somewhere else on the bed,
 * unrelated to everything else) end up in their own separate cluster.
 *
 * This is what a multi-part 3MF export uses to decide what to weld into one
 * rigid object (see threemf.ts): bundling everything in the document into a
 * single object regardless of whether it's geometrically connected is what
 * originally fixed shapes scattering apart in a slicer's arrange step, but
 * it overcorrects for a design that contains a genuinely separate, floating
 * island (by design, or — just as often — a leftover duplicate) — a slicer
 * evaluating "is every part of this one object properly connected/
 * supported" will flag that island as a floating region or an empty-layer
 * gap, even though each cluster on its own would print completely fine.
 * Exporting one object per real cluster keeps the original anti-scatter fix
 * for shapes that belong together while no longer falsely gluing unrelated
 * ones into the same object.
 */
export function computeConnectedClusters(layers: Record<string, Layer>, rootIds: string[]): string[][] {
  const ids = flattenForDisplay(layers, rootIds)
    .map((r) => r.id)
    .filter((id) => isShapeLayer(layers[id]) && !(layers[id] as ShapeLayer).isHole);

  const info = ids.map((id) => ({
    id,
    regions: getWorldRegions(layers, id),
    zRange: getShapeWorldZRange(layers, id) ?? { min: 0, max: 0 },
  }));

  const parent = new Map(ids.map((id) => [id, id]));
  function find(x: string): string {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  }
  function union(a: string, b: string): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (let i = 0; i < info.length; i++) {
    for (let j = i + 1; j < info.length; j++) {
      const a = info[i];
      const b = info[j];
      const zTouches = a.zRange.min <= b.zRange.max + Z_ALIGN_EPSILON_MM && b.zRange.min <= a.zRange.max + Z_ALIGN_EPSILON_MM;
      if (!zTouches) continue;
      if (regionsIntersectionArea(a.regions, b.regions) < 1e-6) continue;
      union(a.id, b.id);
    }
  }

  const clusters = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    const list = clusters.get(root);
    if (list) list.push(id);
    else clusters.set(root, [id]);
  }
  return Array.from(clusters.values());
}

// Below this local width (mm), two genuinely separate stretches of a
// shape's own outline are close enough that a standard nozzle can't
// reliably lay down two distinct walls between them — the bridge either
// merges into a near-zero-width sliver or gets dropped outright at slice
// time, most visibly at the first layer (which commonly prints with a
// WIDER line than the rest, for bed adhesion, so a connection that
// survives everywhere else can vanish there specifically). A modest safety
// margin above a typical 0.4mm nozzle's own minimum.
const MIN_SAFE_LOCAL_WIDTH_MM = 0.5;

function minLocalRingWidth(points: Point2[], minSafeWidthMM: number): number {
  return trueMinRingWidth(points, minSafeWidthMM);
}

export interface ThinFeatureWarning {
  id: string;
  minWidthMM: number;
}

/**
 * Which shapes have a local feature narrower than a safe printable width
 * somewhere in their own outline — see minLocalRingWidth (backed by
 * trueMinRingWidth, a topological "does cutting material here actually
 * disconnect the shape" test, not a boundary-point-proximity guess).
 * Checked in world space (so a shape's own scale is accounted for), across
 * every ring (a region's outer contour and each of its holes) a shape has.
 *
 * Scoped to within a single ring at a time — two DIFFERENT rings on the
 * same shape (say, a hole passing close to the outer edge) can still form
 * a real thin wall this doesn't catch; the far more common case, and the
 * one this was built directly against, is two stretches of one and the
 * same outer contour pinching close together (an intricate outline —
 * a mane, foliage, lettering — folding back near itself).
 */
// The topological check behind minLocalRingWidth (rasterize + flood-fill)
// is genuinely expensive — real multi-shape projects have measured in the
// low seconds for a single full pass — so this is cached per shape rather
// than redone on every call. Editing one shape's position, rotation, color,
// or anything else that leaves its OWN geometry untouched shouldn't pay to
// re-rasterize every OTHER shape in the project too, and the store already
// treats a layer's `regions` as replace-not-mutate (a plain `transform`
// edit spreads the layer but keeps the same `regions` array reference), so
// identity comparison is a reliable "did this shape's actual outline
// change" signal. Translation and rotation don't change any pairwise
// distance in the shape's own outline (they're isometries), so only the
// regions reference and the world SCALE (which does stretch distances)
// need to be part of the cache key — position/rotation changes elsewhere
// in the tree, including a parent's, are safe to ignore here.
interface ThinFeatureCacheEntry {
  regions: ShapeRegion[];
  scaleX: number;
  scaleY: number;
  minSafeWidthMM: number;
  minWidth: number;
}
const thinFeatureCache = new Map<string, ThinFeatureCacheEntry>();

export function computeThinFeatureWarnings(
  layers: Record<string, Layer>,
  rootIds: string[],
  minSafeWidthMM: number = MIN_SAFE_LOCAL_WIDTH_MM,
): ThinFeatureWarning[] {
  const ids = flattenForDisplay(layers, rootIds)
    .map((r) => r.id)
    .filter((id) => isShapeLayer(layers[id]) && !(layers[id] as ShapeLayer).isHole);

  const liveIds = new Set(ids);
  for (const cachedId of thinFeatureCache.keys()) {
    if (!liveIds.has(cachedId)) thinFeatureCache.delete(cachedId);
  }

  const warnings: ThinFeatureWarning[] = [];
  for (const id of ids) {
    const layer = layers[id] as ShapeLayer;
    const { scaleX, scaleY } = getWorldTransform(layers, id);
    const cached = thinFeatureCache.get(id);
    let minWidth: number;
    if (
      cached &&
      cached.regions === layer.regions &&
      cached.scaleX === scaleX &&
      cached.scaleY === scaleY &&
      cached.minSafeWidthMM === minSafeWidthMM
    ) {
      minWidth = cached.minWidth;
    } else {
      const regions = getWorldRegions(layers, id);
      minWidth = Infinity;
      for (const region of regions) {
        minWidth = Math.min(minWidth, minLocalRingWidth(region.outer.points, minSafeWidthMM));
        for (const hole of region.holes) minWidth = Math.min(minWidth, minLocalRingWidth(hole.points, minSafeWidthMM));
      }
      thinFeatureCache.set(id, { regions: layer.regions, scaleX, scaleY, minSafeWidthMM, minWidth });
    }
    if (minWidth < minSafeWidthMM) warnings.push({ id, minWidthMM: minWidth });
  }
  return warnings;
}
