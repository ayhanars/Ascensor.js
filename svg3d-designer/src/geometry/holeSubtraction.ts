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
 *
 * This whole module gets called again on every render that touches
 * `layers` at all — Assembly rebuilds its whole scene graph from scratch
 * on any change, not just ones relevant to a given cut — so the actual
 * CSG boolean (real mesh-boolean math, not cheap, and noticeably less
 * cheap for a finely-tessellated tool like the Dimple one) is cached per
 * solid layer and only re-run when that solid's or its holes' own
 * geometry/position actually changed, rather than on every unrelated edit
 * anywhere else in the scene.
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

/**
 * Everything about a shape that its extruded geometry and world position
 * actually depend on — cheap to compare, and stable (by reference for
 * `regions`, by value for the rest) across renders where nothing relevant
 * changed. Used to skip re-running the expensive CSG boolean below for a
 * solid/hole pair whose geometry and position are unchanged from the last
 * time this ran, which is the overwhelmingly common case: every OTHER
 * edit anywhere else in the scene (dragging an unrelated shape, tweaking
 * an unrelated color) still produces a brand-new `layers` object and so
 * still re-triggers this whole function on every affected render.
 */
interface GeometrySignature {
  regions: unknown;
  cornerRadius: number;
  extrusionDepth: number;
  bevelBottom: number;
  bevelTop: number;
  matrixWorld: number[];
}

function signatureOf(layer: ShapeLayer, mesh: THREE.Mesh): GeometrySignature {
  return {
    regions: layer.regions,
    cornerRadius: layer.cornerRadius,
    extrusionDepth: layer.extrusionDepth,
    bevelBottom: layer.bevelBottom,
    bevelTop: layer.bevelTop,
    matrixWorld: mesh.matrixWorld.toArray(),
  };
}

function signaturesEqual(a: GeometrySignature, b: GeometrySignature): boolean {
  if (a.regions !== b.regions) return false;
  if (a.cornerRadius !== b.cornerRadius) return false;
  if (a.extrusionDepth !== b.extrusionDepth) return false;
  if (a.bevelBottom !== b.bevelBottom) return false;
  if (a.bevelTop !== b.bevelTop) return false;
  for (let i = 0; i < a.matrixWorld.length; i++) {
    if (a.matrixWorld[i] !== b.matrixWorld[i]) return false;
  }
  return true;
}

interface CacheEntry {
  solidSig: GeometrySignature;
  holeSigs: { id: string; sig: GeometrySignature }[];
  geometry: THREE.BufferGeometry;
}

/** One cached post-subtraction result per solid layer id, across calls —
 * this module is a singleton, so the cache just lives for the app's
 * lifetime and is pruned of anything no longer a cut solid on every call. */
const resultCache = new Map<string, CacheEntry>();

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

  if (holes.length === 0) {
    resultCache.clear();
    return;
  }

  const evaluator = new Evaluator();
  evaluator.useGroups = false;

  for (const solid of solids) {
    const overlapping = holes.filter((h) => h.box.intersectsBox(solid.box));
    if (overlapping.length === 0) {
      resultCache.delete(solid.layerId);
      continue;
    }

    const solidLayer = layers[solid.layerId] as ShapeLayer;
    const solidSig = signatureOf(solidLayer, solid.mesh);
    const holeSigs = overlapping
      .map((h) => ({ id: h.layerId, sig: signatureOf(layers[h.layerId] as ShapeLayer, h.mesh) }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const cached = resultCache.get(solid.layerId);
    const isCacheHit =
      !!cached &&
      signaturesEqual(cached.solidSig, solidSig) &&
      cached.holeSigs.length === holeSigs.length &&
      cached.holeSigs.every((c, i) => c.id === holeSigs[i].id && signaturesEqual(c.sig, holeSigs[i].sig));

    let resultGeometry: THREE.BufferGeometry;
    if (cached && isCacheHit) {
      resultGeometry = cached.geometry;
    } else {
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
      resultGeometry = result.geometry;
      resultCache.set(solid.layerId, { solidSig, holeSigs, geometry: resultGeometry });
    }

    const resultMesh = new THREE.Mesh(resultGeometry, solid.mesh.material);
    resultMesh.name = solid.mesh.name;
    resultMesh.userData.layerId = solid.layerId;
    resultMesh.castShadow = solid.mesh.castShadow;
    resultMesh.receiveShadow = solid.mesh.receiveShadow;
    // The evaluator's output geometry is expressed in brushA's *local*
    // frame, not baked into world space — the matrixWorld note above is
    // about the Brush's own (discarded) matrixWorld property, not the
    // vertex data. Since resultMesh is re-parented straight under `root`
    // (which had an identity transform at the time these matrixWorld
    // values were captured), decomposing the solid's original matrixWorld
    // onto it reproduces the exact same placement — for a root-level solid
    // that's just its own transform, and for one nested inside a group it
    // correctly folds in every ancestor group's offset too, since
    // matrixWorld already accumulates the whole chain. Skipping this left
    // every cut solid sitting at the scene origin instead of where it
    // actually was.
    solid.mesh.matrixWorld.decompose(resultMesh.position, resultMesh.quaternion, resultMesh.scale);

    solid.mesh.removeFromParent();
    root.add(resultMesh);
  }

  const currentSolidIds = new Set(solids.map((s) => s.layerId));
  for (const key of resultCache.keys()) {
    if (!currentSolidIds.has(key)) resultCache.delete(key);
  }

  for (const hole of holes) {
    if (options.showHoleOverlays) {
      hole.mesh.material = HOLE_OVERLAY_MATERIAL;
    } else {
      hole.mesh.removeFromParent();
    }
  }
}
