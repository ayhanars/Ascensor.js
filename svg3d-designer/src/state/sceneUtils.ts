import type { Layer, Point2, ShapeLayer, Transform2D } from "../types";

export const IDENTITY_TRANSFORM: Transform2D = {
  x: 0,
  y: 0,
  z: 0,
  rotation: 0,
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
    scaleX *= t.scaleX;
    scaleY *= t.scaleY;
  }

  return { x, y, z, rotation, scaleX, scaleY };
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
