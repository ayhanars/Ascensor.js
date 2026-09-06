import * as THREE from "three";
import type { Layer, ShapeLayer, ShapeRegion, Transform2D } from "../types";
import { roundRegions } from "./roundCorners";
import { buildBeveledExtrudeGeometry } from "./bevelExtrude";
import { subtractHoles } from "./holeSubtraction";

/**
 * The stored scene data uses the SVG document's own coordinate convention
 * (Y grows downward, as in `d="..."`). Three.js/print-bed space uses Y
 * growing "back" across the bed with Z as up. We convert once here by
 * negating Y — consistently for every leaf point *and* every node's
 * translation/rotation — which keeps the whole tree mathematically
 * equivalent to a single mirrored view of the original 2D scene (see
 * geometry engine notes). Never apply a negative-scale node instead: that
 * would flip triangle winding/normals and corrupt exported meshes.
 */
function applyLayerTransform(object: THREE.Object3D, t: Transform2D): void {
  object.position.set(t.x, -t.y, t.z);
  // Full 3-axis orientation (roll = Z/t.rotation, pitch = X/t.rotationX, yaw =
  // Y/t.rotationY), composed as Euler angles in the original SVG-space
  // convention, then mirrored into this Y-flipped space. For the reflection
  // M = diag(1,-1,1) used above, conjugating ANY rotation's quaternion
  // (w,x,y,z) by M works out to simply negating x and z — this generalizes
  // the old Z-only code's "negate the angle" rule (set rotationX/rotationY to
  // 0 and this produces the exact same quaternion as the previous
  // `rotation.z = -rotation` line did).
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(t.rotationX),
    THREE.MathUtils.degToRad(t.rotationY),
    THREE.MathUtils.degToRad(t.rotation),
    "XYZ",
  );
  const q = new THREE.Quaternion().setFromEuler(euler);
  object.quaternion.set(-q.x, q.y, -q.z, q.w);
  // Scale never touches Z: a layer's thickness is always real, absolute
  // millimeters, unaffected by any XY scaling applied to it or a parent.
  object.scale.set(t.scaleX, t.scaleY, 1);
}

function regionsToThreeShapes(regions: ShapeRegion[]): THREE.Shape[] {
  return regions.map((region) => {
    const shape = new THREE.Shape();
    region.outer.points.forEach((p, i) => {
      if (i === 0) shape.moveTo(p.x, -p.y);
      else shape.lineTo(p.x, -p.y);
    });
    shape.closePath();
    for (const hole of region.holes) {
      const path = new THREE.Path();
      hole.points.forEach((p, i) => {
        if (i === 0) path.moveTo(p.x, -p.y);
        else path.lineTo(p.x, -p.y);
      });
      path.closePath();
      shape.holes.push(path);
    }
    return shape;
  });
}

interface CachedGeometryEntry {
  regions: ShapeLayer["regions"];
  cornerRadius: number;
  extrusionDepth: number;
  bevelBottom: number;
  bevelTop: number;
  indentBottom: number;
  indentTop: number;
  geometry: THREE.BufferGeometry;
}

/**
 * Keyed by layer id rather than the layer object itself — every store
 * update replaces the whole `layers` map (and every layer object in it,
 * even ones nothing touched), so object-identity caching would miss on
 * every single edit. Only the handful of fields that actually feed
 * geometry construction are compared; regions is checked by reference
 * (it's only ever replaced wholesale — a corner-radius/import edit — not
 * mutated in place), so dragging one shape's bevel/indent slider no
 * longer silently rebuilds every OTHER shape's geometry too on each
 * pointer-move event, which is what made those sliders feel laggy: this
 * function is what both the 3D viewport and the floating-shape/auto-stack
 * Z-range math call for every visible shape, every render.
 */
const geometryCache = new Map<string, CachedGeometryEntry>();

export function buildExtrudeGeometry(layer: ShapeLayer): THREE.BufferGeometry {
  const bevelBottom = layer.bevelBottom ?? 0;
  const bevelTop = layer.bevelTop ?? 0;
  const indentBottom = layer.indentBottom ?? 0;
  const indentTop = layer.indentTop ?? 0;

  const cached = geometryCache.get(layer.id);
  if (
    cached &&
    cached.regions === layer.regions &&
    cached.cornerRadius === layer.cornerRadius &&
    cached.extrusionDepth === layer.extrusionDepth &&
    cached.bevelBottom === bevelBottom &&
    cached.bevelTop === bevelTop &&
    cached.indentBottom === indentBottom &&
    cached.indentTop === indentTop
  ) {
    return cached.geometry;
  }

  const shapes = regionsToThreeShapes(roundRegions(layer.regions, layer.cornerRadius));
  const depth = Math.max(0.05, layer.extrusionDepth);

  const geometry =
    bevelBottom > 0 || bevelTop > 0 || indentBottom !== 0 || indentTop !== 0
      ? buildBeveledExtrudeGeometry(shapes, depth, bevelBottom, bevelTop, indentBottom, indentTop)
      : (() => {
          const g = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments: 1 });
          g.computeVertexNormals();
          return g;
        })();

  geometryCache.set(layer.id, {
    regions: layer.regions,
    cornerRadius: layer.cornerRadius,
    extrusionDepth: layer.extrusionDepth,
    bevelBottom,
    bevelTop,
    indentBottom,
    indentTop,
    geometry,
  });
  return geometry;
}

export interface AssemblyOptions {
  /** Skip layers hidden via visibility (used for both preview and export). */
  respectVisibility?: boolean;
  /**
   * When true (3D preview only — never for STL export), a shape marked as
   * a hole is kept in the output as a translucent overlay after its volume
   * has been cut from whatever it overlaps, so the negative space stays
   * visible while editing. Defaults to false: a hole is a cutting tool,
   * not printable material, so by default it's cut and then removed.
   */
  showHoleOverlays?: boolean;
}

/**
 * Rebuilds the full 3D scene graph from the layer tree. Mirrors the layer
 * tree 1:1 so parent transforms compose naturally through Object3D's own
 * matrix math — this function is the single place both the 3D viewport and
 * the STL exporter get their geometry from, so what you see is always
 * exactly what gets exported.
 */
export function buildAssemblyGroup(
  layers: Record<string, Layer>,
  rootIds: string[],
  options: AssemblyOptions = {},
): THREE.Group {
  const respectVisibility = options.respectVisibility ?? true;

  function build(id: string): THREE.Object3D | null {
    const layer = layers[id];
    if (!layer) return null;
    if (respectVisibility && !layer.visible) return null;

    if (layer.type === "group") {
      const group = new THREE.Group();
      group.name = layer.name;
      group.userData.layerId = layer.id;
      applyLayerTransform(group, layer.transform);
      for (const childId of layer.children) {
        const child = build(childId);
        if (child) group.add(child);
      }
      if (group.children.length === 0) return null;
      return group;
    }

    const geometry = buildExtrudeGeometry(layer);
    const material = new THREE.MeshStandardMaterial({
      color: layer.color,
      roughness: 0.6,
      metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = layer.name;
    mesh.userData.layerId = layer.id;
    applyLayerTransform(mesh, layer.transform);
    return mesh;
  }

  const root = new THREE.Group();
  root.name = "scene-root";
  for (const id of rootIds) {
    const child = build(id);
    if (child) root.add(child);
  }
  root.updateMatrixWorld(true);
  subtractHoles(root, layers, { showHoleOverlays: options.showHoleOverlays ?? false });
  return root;
}

/** Bounding box (mm) of everything currently visible, in world space. */
export function computeVisibleBounds(
  layers: Record<string, Layer>,
  rootIds: string[],
): THREE.Box3 {
  const group = buildAssemblyGroup(layers, rootIds, { respectVisibility: true });
  const box = new THREE.Box3().setFromObject(group);
  return box;
}
