import type { Layer, Point2, ShapeLayer, ShapeRegion, Transform2D } from "../types";
import { regionsArea, regionsIntersectionArea, unionRegions } from "../geometry/booleanOps";
import { buildExtrudeGeometry } from "../geometry/extrude";

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
 * A shape's real LOCAL Z extent — [0, extrusionDepth] for a plain box, but
 * not always: Edge bevel only ever rounds the rim (its curve is clamped to
 * stay within [0, extrusionDepth], never past it), while Indent's *convex*
 * case (a negative indentBottom/indentTop) genuinely bulges past that
 * range — a convex bottom bulge dips below local z=0, a convex top bulge
 * rises above local z=extrusionDepth. Reuses the real extrude geometry
 * (rather than re-deriving the ring math and its own width/depth safety
 * clamps here) so this can never drift out of sync with what actually gets
 * built and printed.
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
 * up with bevel/indent. `transform.rotation` is always around Z alone (see
 * Transform2D), so it never tilts a shape's Z bounds — only the shape's own
 * local vertical shaping and its world Z translation matter here.
 */
export function getShapeWorldZRange(
  layers: Record<string, Layer>,
  id: string,
): { min: number; max: number } | null {
  const layer = layers[id];
  if (!isShapeLayer(layer)) return null;
  const worldZ = getWorldTransform(layers, id).z;
  const local = getLocalShapeZRange(layer);
  return { min: worldZ + local.min, max: worldZ + local.max };
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

// How close two Z heights (mm) need to be to count as "the same surface" —
// loose enough to absorb the rounding a display-unit round-trip (mm<->in)
// can introduce, tight enough to never treat two genuinely different
// stacking heights as the same one.
const Z_ALIGN_EPSILON_MM = 0.01;

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
      // transform.z+extrusionDepth — a shape with a convex (bulging)
      // Indent can genuinely touch, or clear, a surface at a Z the naive
      // box-based math would miss entirely.
      const zRange = getShapeWorldZRange(layers, id) ?? { min: 0, max: layer.extrusionDepth };
      return { id, layer, regions, area: regionsArea(regions), z: zRange.min, topZ: zRange.max };
    })
    .filter((item) => !item.layer.isHole && item.area > 1e-6);

  const critical: string[] = [];
  const partial: string[] = [];
  for (const item of info) {
    if (item.z <= Z_ALIGN_EPSILON_MM) continue;
    const supporters = info.filter((o) => o.id !== item.id && Math.abs(o.topZ - item.z) < Z_ALIGN_EPSILON_MM);
    if (supporters.length === 0) {
      critical.push(item.id);
      continue;
    }
    const supportUnion = unionRegions(supporters.flatMap((s) => s.regions));
    const supportedArea = regionsIntersectionArea(item.regions, supportUnion);
    if (supportedArea < item.area * PARTIAL_CONTACT_FRACTION) critical.push(item.id);
    else if (supportedArea < item.area * FULLY_SUPPORTED_FRACTION) partial.push(item.id);
  }
  return { critical, partial };
}
