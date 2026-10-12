import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

interface Props {
  glbUrl: string | null;
  selected: string | null;
  onSelect: (name: string | null) => void;
  triangles: number | null;
}

/** Walks up from a picked mesh to the GLB top-level node, which is the Blender object = "part". */
function topLevelName(obj: THREE.Object3D, root: THREE.Object3D): string | null {
  let cur: THREE.Object3D | null = obj;
  while (cur && cur.parent && cur.parent !== root) cur = cur.parent;
  return cur && cur !== root ? cur.name : null;
}

export default function Viewer({ glbUrl, selected, onSelect, triangles }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    model: THREE.Group | null;
    raycaster: THREE.Raycaster;
    fit: () => void;
  } | null>(null);
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(selected);
  selectedRef.current = selected;

  // scene setup, once
  useEffect(() => {
    const el = mountRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x15171c);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    camera.position.set(6, 4, 6);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(5, 10, 4);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x99bbff, 0.6);
    fill.position.set(-6, 3, -4);
    scene.add(fill);
    const grid = new THREE.GridHelper(40, 40, 0x3a3f4b, 0x262a33);
    scene.add(grid);

    const raycaster = new THREE.Raycaster();
    const fit = () => {
      const model = sceneRef.current?.model;
      if (!model) return;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const radius = Math.max(size.length() / 2, 0.1);
      controls.target.copy(center);
      const dir = new THREE.Vector3(1, 0.65, 1).normalize();
      camera.position.copy(center).addScaledVector(dir, radius * 2.4);
      camera.near = radius / 100;
      camera.far = radius * 100;
      camera.updateProjectionMatrix();
      grid.position.y = box.min.y;
      controls.update();
    };
    sceneRef.current = { scene, camera, renderer, controls, model: null, raycaster, fit };

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let raf = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

  // load model when url changes
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    if (s.model) {
      s.scene.remove(s.model);
      s.model = null;
    }
    setError(null);
    if (!glbUrl) return;
    setLoading(true);
    let cancelled = false;
    new GLTFLoader().load(
      glbUrl + (glbUrl.includes("?") ? "&" : "?") + "t=" + Date.now(),
      (gltf) => {
        if (cancelled || !sceneRef.current) return;
        const model = gltf.scene;
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.userData.baseMaterial = m.material;
          }
        });
        sceneRef.current.model = model;
        sceneRef.current.scene.add(model);
        sceneRef.current.fit();
        applyHighlight(model, selectedRef.current, null);
        setLoading(false);
      },
      undefined,
      (e) => {
        if (cancelled) return;
        setLoading(false);
        setError(`Could not load model: ${(e as Error).message ?? e}`);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [glbUrl]);

  // highlight selection / hover
  useEffect(() => {
    const model = sceneRef.current?.model;
    if (model) applyHighlight(model, selected, hover?.name ?? null);
  }, [selected, hover]);

  const pick = (ev: React.PointerEvent): string | null => {
    const s = sceneRef.current;
    if (!s?.model) return null;
    const rect = s.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    s.raycaster.setFromCamera(ndc, s.camera);
    const hit = s.raycaster.intersectObject(s.model, true)[0];
    return hit ? topLevelName(hit.object, s.model) : null;
  };

  const downPos = useRef<{ x: number; y: number } | null>(null);

  return (
    <div className="viewer">
      <div
        ref={mountRef}
        className="viewer-canvas"
        onPointerMove={(ev) => {
          const name = pick(ev);
          setHover(name ? { name, x: ev.nativeEvent.offsetX, y: ev.nativeEvent.offsetY } : null);
        }}
        onPointerLeave={() => setHover(null)}
        onPointerDown={(ev) => (downPos.current = { x: ev.clientX, y: ev.clientY })}
        onPointerUp={(ev) => {
          const d = downPos.current;
          if (!d || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 4 || ev.button !== 0) return;
          onSelect(pick(ev));
        }}
      />
      {hover && (
        <div className="viewer-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {hover.name} · click to refine
        </div>
      )}
      <div className="viewer-toolbar">
        <button onClick={() => sceneRef.current?.fit()} title="Reset camera">⟲ fit</button>
        {selected && <button onClick={() => onSelect(null)}>✕ {selected}</button>}
      </div>
      <div className="viewer-status">
        {loading && "loading model…"}
        {error && <span className="err">{error}</span>}
        {!loading && !error && glbUrl && `${triangles ?? "?"} triangles · drag to orbit, scroll to zoom, right-drag to pan · click a part to refine it`}
        {!glbUrl && !loading && "no model yet"}
      </div>
    </div>
  );
}

const highlightMat = new THREE.MeshStandardMaterial({ color: 0x4f8cff, emissive: 0x1b3a80, roughness: 0.6 });
const hoverMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x444444, roughness: 0.6 });

function applyHighlight(model: THREE.Group, selected: string | null, hovered: string | null) {
  for (const part of model.children) {
    const state = part.name === selected ? "sel" : part.name === hovered ? "hover" : "none";
    part.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const base = m.userData.baseMaterial as THREE.Material | THREE.Material[] | undefined;
      if (!base) return;
      m.material = state === "sel" ? highlightMat : state === "hover" ? hoverMat : base;
    });
  }
}
