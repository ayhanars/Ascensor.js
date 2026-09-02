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
