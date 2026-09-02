import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
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

function CameraRig({ resetSignal }: { resetSignal: number }) {
  const { camera } = useThree();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drei's
  // OrbitControls ref type doesn't resolve cleanly against three's here;
  // all we use is `.target` and `.update()`, both stable across versions.
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

function Assembly() {
  const layers = useSceneStore((s) => s.layers);
  const rootIds = useSceneStore((s) => s.rootIds);
  const selection = useSceneStore((s) => s.selection);

  const group = useMemo(
    () => buildAssemblyGroup(layers, rootIds, { respectVisibility: true }),
    [layers, rootIds],
  );

  useEffect(() => {
    const selectedSet = new Set(selection);
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const selected = selectedSet.has(mesh.userData.layerId);
        mat.emissive = new THREE.Color(selected ? 0x4f46e5 : 0x000000);
        mat.emissiveIntensity = selected ? 0.35 : 0;
      }
    });
  }, [group, selection]);

  return <primitive object={group} rotation={DISPLAY_ROTATION} />;
}

interface Props {
  resetSignal: number;
  theme: ResolvedTheme;
}

export function Viewport3D({ resetSignal, theme }: Props) {
  const layers = useSceneStore((s) => s.layers);
  const rootIds = useSceneStore((s) => s.rootIds);
  const bed = useSceneStore((s) => s.document.bed);
  const bgColor = theme === "dark" ? "#232326" : "#e8e8e8";

  const bounds = useMemo(() => computeVisibleBounds(layers, rootIds), [layers, rootIds]);
  // Our data model extrudes along Z (the print-bed "up" axis) — see
  // Viewport3D's DISPLAY_ROTATION note. computeVisibleBounds is built from
  // the same un-rotated assembly as the exporter, so bounds.max.z is the
  // model's real print height, not bounds.max.y.
  const heightWarning = bounds.max.z > bed.height + 0.001;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Canvas shadows camera={{ fov: 40, near: 0.1, far: 5000 }}>
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
