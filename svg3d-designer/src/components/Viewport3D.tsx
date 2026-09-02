import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, GizmoHelper, GizmoViewport } from "@react-three/drei";
import * as THREE from "three";
import { useSceneStore } from "../state/store";
import type { ResolvedTheme } from "../state/theme";
import { buildAssemblyGroup, computeVisibleBounds } from "../geometry/extrude";

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

function Assembly() {
  const layers = useSceneStore((s) => s.layers);
  const rootIds = useSceneStore((s) => s.rootIds);
  const selection = useSceneStore((s) => s.selection);
  const wireframe = useSceneStore((s) => s.wireframe);
  const selectLayer = useSceneStore((s) => s.selectLayer);

  const group = useMemo(
    () => buildAssemblyGroup(layers, rootIds, { respectVisibility: true }),
    [layers, rootIds],
  );

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

  // Click-to-select, with a movement threshold so an orbit/pan drag that
  // happens to end up over a mesh doesn't get mistaken for a click.
  const pointerDownInfo = useRef<{ x: number; y: number; layerId?: string } | null>(null);

  return (
    <primitive
      object={group}
      rotation={DISPLAY_ROTATION}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        pointerDownInfo.current = { x: e.clientX, y: e.clientY, layerId: e.object.userData.layerId };
      }}
      onPointerUp={(e: ThreeEvent<PointerEvent>) => {
        const down = pointerDownInfo.current;
        pointerDownInfo.current = null;
        if (!down?.layerId) return;
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
        e.stopPropagation();
        const additive = e.nativeEvent.shiftKey || e.nativeEvent.metaKey || e.nativeEvent.ctrlKey;
        selectLayer(down.layerId, additive);
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
  const rootIds = useSceneStore((s) => s.rootIds);
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
