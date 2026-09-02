import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import type { Layer, ShapeLayer } from "../types";

/**
 * A shape marked `isHole` isn't printed as its own solid — it's a cutting
 * tool. This does the actual cut: a real 3D boolean subtraction (via
 * three-bvh-csg, not a 2D-only trick) of every hole's extruded volume from
 * every solid it overlaps, so the result is a genuine cavity or
 * through-hole — usable for magnet wells, screw holes, etc. — that follows
 * the hole shape's own Z position and depth independently of the solid's.
 *
 * Mutates `root` in place: each affected solid mesh is replaced by its
 * post-subtraction result (re-parented directly under `root`, since a CSG
 * result comes out in a single flattened frame — see the matrixWorld note
 * below — so there's no clean way to keep it nested under its original
 * parent group). Hole meshes themselves are left as translucent preview-
 * only overlays when `showHoleOverlays` is set, and removed entirely
 * otherwise (STL export always uses `showHoleOverlays: false` — a hole is
 * never itself printable material).
 */

const HOLE_OVERLAY_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xef4444,
  transparent: true,
  opacity: 0.35,
  roughness: 0.6,
  metalness: 0,
  depthWrite: false,
});

interface MeshEntry {
  mesh: THREE.Mesh;
  layerId: string;
  box: THREE.Box3;
}

export function subtractHoles(
  root: THREE.Group,
  layers: Record<string, Layer>,
  options: { showHoleOverlays: boolean },
): void {
  const solids: MeshEntry[] = [];
  const holes: MeshEntry[] = [];

  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const layer = layers[mesh.userData.layerId as string] as ShapeLayer | undefined;
    if (!layer) return;
    const entry: MeshEntry = { mesh, layerId: layer.id, box: new THREE.Box3().setFromObject(mesh) };
    (layer.isHole ? holes : solids).push(entry);
  });

  if (holes.length === 0) return;

  const evaluator = new Evaluator();
  evaluator.useGroups = false;

  for (const solid of solids) {
    const overlapping = holes.filter((h) => h.box.intersectsBox(solid.box));
    if (overlapping.length === 0) continue;

    let geometry = solid.mesh.geometry;
    let matrixWorld = solid.mesh.matrixWorld.clone();
    let result: Brush | null = null;
    for (const hole of overlapping) {
      const brushA = new Brush(geometry);
      brushA.matrixWorld.copy(matrixWorld);
      const brushB = new Brush(hole.mesh.geometry);
      brushB.matrixWorld.copy(hole.mesh.matrixWorld);
      result = evaluator.evaluate(brushA, brushB, SUBTRACTION) as Brush;
      geometry = result.geometry;
      // evaluate() re-derives the result's own matrixWorld from brush A's,
      // so this is a no-op in practice — kept for clarity/robustness in
      // case the exact frame ever changes across a chained subtraction.
      matrixWorld = result.matrixWorld.clone();
    }
    if (!result) continue;

    result.geometry.computeVertexNormals();
    result.material = solid.mesh.material;
    result.name = solid.mesh.name;
    result.userData.layerId = solid.layerId;
    result.castShadow = solid.mesh.castShadow;
    result.receiveShadow = solid.mesh.receiveShadow;

    solid.mesh.removeFromParent();
    root.add(result);
  }

  for (const hole of holes) {
    if (options.showHoleOverlays) {
      hole.mesh.material = HOLE_OVERLAY_MATERIAL;
    } else {
      hole.mesh.removeFromParent();
    }
  }
}
