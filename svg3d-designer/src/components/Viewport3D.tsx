import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, GizmoHelper, GizmoViewport } from "@react-three/drei";
import * as THREE from "three";
import { beginGesture, endGesture, useActivePlateRootIds, useSceneStore, type TrackedSceneSlice } from "../state/store";
import type { ResolvedTheme } from "../state/theme";
import { buildAssemblyGroup, computeVisibleBounds } from "../geometry/extrude";
import { flattenForDisplay } from "../state/sceneUtils";

/** Never participates in raycasting — used for the selection-decoration
 * handles/edges so they can't silently swallow a click meant for whatever
 * geometry they happen to be sitting in front of. */
function disableRaycast(obj: THREE.Object3D) {
  obj.raycast = () => {};
}

// Display-only rotation: our data model treats Z as "up" (extrusion axis),
// matching how a print bed and slicer see the model. Three's default
// camera/orbit convention treats Y as up, so we rotate just the preview
// scene graph to match — the exporter builds from the same assembly
// function but never applies this rotation, so what's exported always
// matches the real (Z-up) geometry.
const DISPLAY_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0];

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}

function CameraRig({ resetSignal }: { resetSignal: number }) {
  const { camera, gl } = useThree();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drei's
  // OrbitControls ref type doesn't resolve cleanly against three's here;
  // all we use is `.target`, `.update()` and `.mouseButtons`, all stable
  // across versions.
  const controlsRef = useRef<any>(null);
  const bed = useSceneStore((s) => s.document.bed);

  useEffect(() => {
    const target = new THREE.Vector3(bed.width / 2, 0, bed.depth / 2);
    const dist = Math.max(bed.width, bed.depth, 60) * 1.4;
    camera.position.set(target.x + dist * 0.7, dist * 0.65, target.z + dist * 0.9);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(target);
      controls.update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  // Space+drag pans, matching the 2D canvas and Figma's own convention —
  // left-drag alone still orbits, since that's OrbitControls' own default.
  useEffect(() => {
    const canvas = gl.domElement;

    function setPanMode(on: boolean) {
      const controls = controlsRef.current;
      if (!controls) return;
      controls.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
      canvas.style.cursor = on ? "grab" : "";
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" || e.repeat || isEditableTarget(e.target)) return;
      e.preventDefault();
      setPanMode(true);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      setPanMode(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [gl]);

  return <OrbitControls ref={controlsRef} makeDefault />;
}

function PrintBed() {
  const bed = useSceneStore((s) => s.document.bed);
  const showGrid = useSceneStore((s) => s.showGrid);
  const size = Math.max(bed.width, bed.depth);

  return (
    <group position={[bed.width / 2, 0, bed.depth / 2]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[bed.width, bed.depth]} />
        <meshStandardMaterial color="#f2f2f2" />
      </mesh>
      {showGrid && (
        <gridHelper args={[size, Math.max(4, Math.round(size / 10))]} position={[0, 0.01, 0]} />
      )}
    </group>
  );
}

// Figma-style selection indicator, adapted to 3D: a thin bounding-box
// wireframe plus a small solid handle marker at each of the box's 8
// corners (Figma's 2D corner handles, extended to a 3D box's corners).
const SELECTION_LINE_MATERIAL = new THREE.LineBasicMaterial({ color: 0x4f46e5, toneMapped: false });
const SELECTION_HANDLE_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x4f46e5, toneMapped: false });

// Two mesh surfaces this close together (in mm along the ray) count as a
// depth tie rather than "genuinely closer" — big enough to absorb float
// error on exactly-coplanar geometry, small enough to never mask a real,
// deliberate stack (e.g. from Auto-Stack, which always leaves a real gap).
const DEPTH_TIE_EPSILON = 0.01;

function Assembly() {
  const layers = useSceneStore((s) => s.layers);
  const rootIds = useActivePlateRootIds();
  const selection = useSceneStore((s) => s.selection);
  const wireframe = useSceneStore((s) => s.wireframe);
  const setSelection = useSceneStore((s) => s.setSelection);
  const setLayerTransform = useSceneStore((s) => s.setLayerTransform);

  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see
  // CameraRig's controlsRef: only `.enabled` is used here, stable across
  // drei/three versions. `makeDefault` on OrbitControls (in CameraRig)
  // registers the instance in R3F's shared store, so it's reachable here
  // without prop-drilling.
  const controls = useThree((s) => s.controls) as any;
  const controlsRef = useRef(controls);
  controlsRef.current = controls;

  const group = useMemo(
    () => buildAssemblyGroup(layers, rootIds, { respectVisibility: true, showHoleOverlays: true }),
    [layers, rootIds],
  );

  // Paint order — later index = added/painted later = "in front" for two
  // otherwise-tied (coplanar, unstacked) shapes, matching how the 2D canvas
  // already resolves overlapping clicks (later DOM siblings paint on top
  // and receive the event first). Raw 3D-depth raycasting alone would
  // instead deterministically favor whichever mesh the group happened to
  // traverse first — in practice, almost always the oldest/background
  // layer — so a small decorative shape sitting flush on a base could never
  // be clicked at all.
  const paintOrderIndex = useMemo(() => {
    const order = flattenForDisplay(layers, rootIds);
    const map = new Map<string, number>();
    order.forEach((row, i) => map.set(row.id, i));
    return map;
  }, [layers, rootIds]);

  useEffect(() => {
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.wireframe = wireframe;
      }
    });
  }, [group, wireframe]);

  useEffect(() => {
    const selectedSet = new Set(selection);
    const extras: THREE.Object3D[] = [];
    const disposables: { dispose: () => void }[] = [];

    group.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh || !selectedSet.has(obj.userData.layerId)) return;
      const mesh = obj as THREE.Mesh;
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox;
      if (!box) return;

      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);

      const boxGeom = new THREE.BoxGeometry(
        Math.max(size.x, 0.001),
        Math.max(size.y, 0.001),
        Math.max(size.z, 0.001),
      );
      const edgesGeom = new THREE.EdgesGeometry(boxGeom);
      boxGeom.dispose();
      const edges = new THREE.LineSegments(edgesGeom, SELECTION_LINE_MATERIAL);
      edges.position.copy(center);
      disableRaycast(edges);
      mesh.add(edges);
      extras.push(edges);
      disposables.push(edgesGeom);

      const handleSize = Math.min(3, Math.max(0.6, size.length() * 0.06));
      const handleGeom = new THREE.BoxGeometry(handleSize, handleSize, handleSize);
      disposables.push(handleGeom);
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            const handle = new THREE.Mesh(handleGeom, SELECTION_HANDLE_MATERIAL);
            handle.position.set(x, y, z);
            disableRaycast(handle);
            mesh.add(handle);
            extras.push(handle);
          }
        }
      }
    });

    return () => {
      for (const obj of extras) obj.removeFromParent();
      for (const d of disposables) d.dispose();
    };
  }, [group, selection]);

  // Click-to-select AND drag-to-move, for whatever is currently selected —
  // single shape, multiple shapes (shift-clicked, no grouping required), or
  // a group. Dragging is resolved against a horizontal plane at world Y=0
  // (matching the print bed / data z=0), raycast from the pointer each
  // move. Because our data model extrudes along Z but the preview group is
  // rotated -90° about X (see DISPLAY_ROTATION) to show Z as "up", a delta
  // on this plane's world X/Z axes maps directly to a delta on the data
  // model's x/y axes (world X -> data x, world Z -> data y) — derived from
  // that same rotation and how extrude.ts builds local positions/points.
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const dragPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  function raycastToPlane(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const point = new THREE.Vector3();
    return raycaster.ray.intersectPlane(dragPlane, point) ? point : null;
  }

  const dragRef = useRef<{
    ids: string[];
    originals: Record<string, { x: number; y: number }>;
    startPoint: THREE.Vector3;
    startClientX: number;
    startClientY: number;
    moved: boolean;
    snapshot: TrackedSceneSlice;
    layerId: string;
    additive: boolean;
    /** True when the click landed on a shape that was already part of the
     * current (possibly multi-shape) selection — the selection is kept
     * as-is for the drag (so the whole thing moves together, matching
     * Figma), and only collapsed down to just this shape if pointerup
     * finds the pointer never actually moved. */
    keptSelection: boolean;
  } | null>(null);

  useEffect(() => {
    function onWindowPointerMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      if (Math.abs(e.clientX - drag.startClientX) + Math.abs(e.clientY - drag.startClientY) > 2) {
        drag.moved = true;
      }
      const point = raycastToPlane(e.clientX, e.clientY);
      if (!point) return;
      const deltaX = point.x - drag.startPoint.x;
      const deltaY = point.z - drag.startPoint.z;
      for (const [id, orig] of Object.entries(drag.originals)) {
        setLayerTransform(id, { x: orig.x + deltaX, y: orig.y + deltaY });
      }
    }

    function onWindowPointerUp() {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) return;
      if (controlsRef.current) controlsRef.current.enabled = true;
      endGesture(drag.snapshot, drag.moved);
      if (!drag.moved && !drag.additive && drag.keptSelection) {
        setSelection([drag.layerId]);
      }
    }

    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);
    return () => {
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <primitive
      object={group}
      rotation={DISPLAY_ROTATION}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        // Resolve the *intended* target ourselves rather than trusting R3F's
        // default nearest-hit: among every mesh hit at this pointer position
        // within DEPTH_TIE_EPSILON of the closest one, prefer the one
        // painted latest (see paintOrderIndex above). A genuinely closer
        // object (outside the tie band) still always wins, unaffected.
        let layerId: string | undefined;
        let bestDist = Infinity;
        let bestOrder = -1;
        for (const hit of e.intersections) {
          const id = hit.object.userData.layerId as string | undefined;
          if (!id) continue;
          if (hit.distance < bestDist - DEPTH_TIE_EPSILON) {
            bestDist = hit.distance;
            bestOrder = paintOrderIndex.get(id) ?? -1;
            layerId = id;
          } else if (hit.distance < bestDist + DEPTH_TIE_EPSILON) {
            const order = paintOrderIndex.get(id) ?? -1;
            if (order > bestOrder) {
              bestOrder = order;
              layerId = id;
            }
            bestDist = Math.min(bestDist, hit.distance);
          }
        }
        if (!layerId) return;

        const additive = e.nativeEvent.shiftKey || e.nativeEvent.metaKey || e.nativeEvent.ctrlKey;
        let dragIds: string[];
        let keptSelection = false;
        if (additive) {
          const nextSelection = selection.includes(layerId)
            ? selection.filter((s) => s !== layerId)
            : [...selection, layerId];
          setSelection(nextSelection);
          dragIds = nextSelection;
        } else if (selection.includes(layerId)) {
          dragIds = selection;
          keptSelection = true;
        } else {
          setSelection([layerId]);
          dragIds = [layerId];
        }

        const startPoint = raycastToPlane(e.clientX, e.clientY);
        if (!startPoint) return;

        if (controlsRef.current) controlsRef.current.enabled = false;
        const originals: Record<string, { x: number; y: number }> = {};
        for (const id of dragIds) {
          const layer = layers[id];
          if (layer) originals[id] = { x: layer.transform.x, y: layer.transform.y };
        }
        dragRef.current = {
          ids: dragIds,
          originals,
          startPoint,
          startClientX: e.clientX,
          startClientY: e.clientY,
          moved: false,
          // The whole drag — however many pointermove events it produces —
          // should collapse into a single undo step.
          snapshot: beginGesture(),
          layerId,
          additive,
          keptSelection,
        };
      }}
    />
  );
}

interface Props {
  resetSignal: number;
  theme: ResolvedTheme;
}

export function Viewport3D({ resetSignal, theme }: Props) {
  const layers = useSceneStore((s) => s.layers);
  const rootIds = useActivePlateRootIds();
  const bed = useSceneStore((s) => s.document.bed);
  const clearSelection = useSceneStore((s) => s.clearSelection);
  const bgColor = theme === "dark" ? "#232326" : "#e8e8e8";

  const bounds = useMemo(() => computeVisibleBounds(layers, rootIds), [layers, rootIds]);
  // Our data model extrudes along Z (the print-bed "up" axis) — see
  // Viewport3D's DISPLAY_ROTATION note. computeVisibleBounds is built from
  // the same un-rotated assembly as the exporter, so bounds.max.z is the
  // model's real print height, not bounds.max.y.
  const heightWarning = bounds.max.z > bed.height + 0.001;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Canvas
        shadows
        camera={{ fov: 40, near: 0.1, far: 5000 }}
        onPointerMissed={() => clearSelection()}
      >
        <color attach="background" args={[bgColor]} />
        <hemisphereLight args={["#ffffff", "#666666", 1.1]} />
        <directionalLight position={[80, 120, 60]} intensity={1.1} castShadow />
        <PrintBed />
        <Assembly />
        <CameraRig resetSignal={resetSignal} />
        <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
          <GizmoViewport />
        </GizmoHelper>
      </Canvas>
      {heightWarning && (
        <div className="canvas-hint" style={{ left: "auto", right: 12, bottom: 12, color: "#9a3412" }}>
          Model exceeds the print bed's max height ({bed.height} mm).
        </div>
      )}
    </div>
  );
}
