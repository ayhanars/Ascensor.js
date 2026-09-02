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

// Shared across every selected mesh — a cheap outline: a copy of the same
// geometry, parented to the original mesh so it inherits its exact
// transform, widened in X/Y only (same height in Z). Our print pieces are
// flat and viewed mostly from above, so the classic "enlarge + backface-
// cull" shell trick doesn't work here — the dominant visible surface *is*
// the top face, so BackSide culls exactly the part that needs to show, and
// a uniformly-enlarged FrontSide shell just covers the object instead of
// framing it. Keeping the outline's top face at exactly the same height as
// the original's makes them coplanar wherever they overlap — resolved with
// polygonOffset (the standard fix for two coplanar surfaces, rather than a
// geometric Z-nudge, which either z-fights or needs a big-enough gap to be
// reliable) so the original always wins there and shows its own color
// untouched; past its footprint — the rim — there's nothing else at that
// pixel, so the widened outline's top face shows through as a clean
// colored margin.
const SELECTION_OUTLINE_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0x4f46e5,
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: 4,
  polygonOffsetUnits: 4,
});
const SELECTION_OUTLINE_SCALE_XY = 1.15;

function Assembly() {
  const layers = useSceneStore((s) => s.layers);
  const rootIds = useSceneStore((s) => s.rootIds);
  const selection = useSceneStore((s) => s.selection);
  const wireframe = useSceneStore((s) => s.wireframe);

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
    const outlines: THREE.Mesh[] = [];
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && selectedSet.has(obj.userData.layerId)) {
        const mesh = obj as THREE.Mesh;
        const outline = new THREE.Mesh(mesh.geometry, SELECTION_OUTLINE_MATERIAL);
        // Our shape geometry is built in absolute local coordinates (an
        // SVG's own coordinate space), so a mesh's own origin (0,0,0) is
        // rarely anywhere near its visual center. Scaling this outline from
        // the origin would shift it sideways instead of framing the shape —
        // scale it around the geometry's own bounding-box center instead.
        mesh.geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        mesh.geometry.boundingBox?.getCenter(center);
        const kXY = SELECTION_OUTLINE_SCALE_XY;
        outline.position.set(center.x * (1 - kXY), center.y * (1 - kXY), 0);
        outline.scale.set(kXY, kXY, 1);
        mesh.add(outline);
        outlines.push(outline);
      }
    });
    return () => {
      for (const outline of outlines) outline.removeFromParent();
    };
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
