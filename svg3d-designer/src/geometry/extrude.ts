import * as THREE from "three";
import type { Layer, ShapeLayer, ShapeRegion, Transform2D } from "../types";
import { roundRegions } from "./roundCorners";
import { buildBeveledExtrudeGeometry } from "./bevelExtrude";

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
  object.rotation.z = THREE.MathUtils.degToRad(-t.rotation);
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

export function buildExtrudeGeometry(layer: ShapeLayer): THREE.BufferGeometry {
  const shapes = regionsToThreeShapes(roundRegions(layer.regions, layer.cornerRadius));
  const depth = Math.max(0.05, layer.extrusionDepth);
  const bevelBottom = layer.bevelBottom ?? 0;
  const bevelTop = layer.bevelTop ?? 0;

  if (bevelBottom > 0 || bevelTop > 0) {
    return buildBeveledExtrudeGeometry(shapes, depth, bevelBottom, bevelTop);
  }

  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geometry.computeVertexNormals();
  return geometry;
}

export interface AssemblyOptions {
  /** Skip layers hidden via visibility (used for both preview and export). */
  respectVisibility?: boolean;
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
