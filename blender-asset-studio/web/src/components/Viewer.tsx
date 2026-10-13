import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

const MAX_MODEL_LIGHTS = 16;

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
    modelLights: THREE.Light[];
    applyMode: (night: boolean) => void;
  } | null>(null);
  const [night, setNight] = useState(false);
  const nightRef = useRef(false);
  nightRef.current = night;
  const [lightCount, setLightCount] = useState(0);
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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    // soft studio reflections, generated locally (no network)
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 0.6);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(5, 10, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);
    const fill = new THREE.DirectionalLight(0x99bbff, 0.4);
    fill.position.set(-6, 3, -4);
    scene.add(fill);
    const grid = new THREE.GridHelper(40, 40, 0x3a3f4b, 0x262a33);
    scene.add(grid);
    // invisible ground that only shows the model's shadow
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.35 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // bloom for lamps and glowing materials, used in night mode only
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.35, 0.92);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const dayBg = new THREE.Color(0x15171c), nightBg = new THREE.Color(0x07080b);
    const applyMode = (isNight: boolean) => {
      hemi.intensity = isNight ? 0.06 : 0.6;
      sun.intensity = isNight ? 0.12 : 2.2;
      fill.intensity = isNight ? 0.04 : 0.4;
      scene.environmentIntensity = isNight ? 0.06 : 0.7;
      scene.background = isNight ? nightBg : dayBg;
      renderer.toneMappingExposure = isNight ? 0.9 : 1.0;
      for (const l of sceneRef.current?.modelLights ?? []) l.visible = isNight;
    };

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
      ground.position.set(center.x, box.min.y + 0.002, center.z);
      ground.scale.setScalar(radius * 8);
      // key light and its shadow frustum follow the model
      sun.position.copy(center).add(new THREE.Vector3(radius * 1.5, radius * 3, radius * 1.2));
      sun.target.position.copy(center);
      const cam = sun.shadow.camera;
      cam.left = cam.bottom = -radius * 1.6;
      cam.right = cam.top = radius * 1.6;
      cam.near = 0.05;
      cam.far = radius * 10;
      cam.updateProjectionMatrix();
      controls.update();
    };
    sceneRef.current = { scene, camera, renderer, controls, model: null, raycaster, fit, modelLights: [], applyMode };
    applyMode(false);

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bloom.resolution.set(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let raf = 0;
    const loop = () => {
      controls.update();
      if (nightRef.current) composer.render();
      else renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      composer.dispose();
      envTex.dispose();
      pmrem.dispose();
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
    s.modelLights = [];
    setLightCount(0);
    setError(null);
    if (!glbUrl) return;
    setLoading(true);
    let cancelled = false;
    new GLTFLoader().load(
      glbUrl + (glbUrl.includes("?") ? "&" : "?") + "t=" + Date.now(),
      (gltf) => {
        if (cancelled || !sceneRef.current) return;
        const model = gltf.scene;
        const lights: THREE.Light[] = [];
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.userData.baseMaterial = m.material;
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            const transparent = mats.some((x) => x.transparent || (x as THREE.MeshStandardMaterial).opacity < 1);
            m.castShadow = !transparent;
            m.receiveShadow = true;
          }
          const l = o as THREE.Light;
          if (l.isLight) {
            l.castShadow = false;
            lights.push(l);
          }
        });
        // keep the brightest lamps only, so big scenes stay fast
        lights.sort((a, b) => b.intensity - a.intensity);
        // Exported lamp strengths are physical and often far too strong for a small model seen
        // from outside. Scale them so the brightest gives a soft pool of light at a quarter of
        // the model's size; their ratios to each other stay as authored.
        const bounds = new THREE.Box3().setFromObject(model);
        const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 0.1);
        const ref = lights.find((l) => (l as THREE.PointLight).isPointLight || (l as THREE.SpotLight).isSpotLight);
        if (ref && ref.intensity > 0) {
          const target = 6 * (radius * 0.25) ** 2; // candela for ~6 lux at r/4
          const k = Math.min(1, target / ref.intensity);
          for (const l of lights) if (!(l as THREE.DirectionalLight).isDirectionalLight) l.intensity *= k;
        }
        lights.slice(MAX_MODEL_LIGHTS).forEach((l) => l.parent?.remove(l));
        sceneRef.current.modelLights = lights.slice(0, MAX_MODEL_LIGHTS);
        setLightCount(sceneRef.current.modelLights.length);
        sceneRef.current.model = model;
        sceneRef.current.scene.add(model);
        sceneRef.current.fit();
        // a model with lamps opens in night mode so they are noticed
        const startNight = sceneRef.current.modelLights.length > 0;
        setNight(startNight);
        sceneRef.current.applyMode(startNight);
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

  useEffect(() => {
    sceneRef.current?.applyMode(night);
  }, [night]);

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
        <button
          onClick={() => setNight((n) => !n)}
          title={night ? "Switch to daylight" : lightCount ? `Night: show the ${lightCount} lamp${lightCount === 1 ? "" : "s"} and glowing materials` : "Night: show glowing materials (this model has no lamps)"}
        >
          {night ? "☾ night" : "☀ day"}{lightCount > 0 ? ` · ${lightCount}` : ""}
        </button>
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
