import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Progress animation. Starts as a globe of tiny dots with a scanning band. As soon as the server
 * reports a live vertex sample from Blender, the dots morph into it, bottom to top, and keep
 * morphing as the model grows. Nothing here costs tokens: the sample comes from the Blender
 * socket, not from the agent.
 */
const COUNT = 6000;
const TARGET_H = 2.3;

function globe(count: number): Float32Array {
  const out = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = golden * i;
    out[i * 3] = Math.cos(a) * r * 1.35;
    out[i * 3 + 1] = y * 1.35 + 1.45;
    out[i * 3 + 2] = Math.sin(a) * r * 1.35;
  }
  return out;
}

/** Blender Z-up sample -> Y-up targets, normalized to a fixed height and spread over COUNT dots. */
function fromSample(points: number[], count: number): Float32Array {
  const n = Math.floor(points.length / 3);
  const out = new Float32Array(count * 3);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = points[i * 3], y = points[i * 3 + 2], z = -points[i * 3 + 1];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const sx = maxX - minX, sy = maxY - minY, sz = maxZ - minZ;
  const s = TARGET_H / Math.max(sy, sx * 0.8, sz * 0.8, 0.001);
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const jitter = n < count ? 0.02 : 0;
  for (let k = 0; k < count; k++) {
    const i = k < n ? k : Math.floor(Math.random() * n);
    const x = points[i * 3], y = points[i * 3 + 2], z = -points[i * 3 + 1];
    out[k * 3] = (x - cx) * s + (Math.random() - 0.5) * jitter;
    out[k * 3 + 1] = (y - minY) * s + (Math.random() - 0.5) * jitter;
    out[k * 3 + 2] = (z - cz) * s + (Math.random() - 0.5) * jitter;
  }
  return out;
}

const ease = (x: number) => 1 - Math.pow(1 - x, 3);

export default function ParticleScene({ livePoints }: { livePoints: number[] | null }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<number[] | null>(null);
  const liveVersion = useRef(0);
  useEffect(() => {
    liveRef.current = livePoints;
    liveVersion.current++;
  }, [livePoints]);

  useEffect(() => {
    const el = mountRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1016);
    scene.fog = new THREE.Fog(0x0d1016, 7, 13);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const grid = new THREE.GridHelper(12, 24, 0x222a3d, 0x171c28);
    grid.position.y = -0.01;
    scene.add(grid);

    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const from = globe(COUNT);
    let to = globe(COUNT);
    positions.set(from);
    const seeds = new Float32Array(COUNT);
    const order = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) seeds[i] = Math.random() * Math.PI * 2;

    let morphStart = -1; // seconds, -1 = idle
    let seenVersion = 0;
    let haveModel = false;
    const MORPH = 2.8;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: 0.024, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    scene.add(new THREE.Points(geo, mat));

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const cGlobeA = new THREE.Color(0x2f6fe0), cGlobeB = new THREE.Color(0x9fd0ff);
    const cModelA = new THREE.Color(0x3b82f6), cModelB = new THREE.Color(0xe6f2ff), cBand = new THREE.Color(0xffffff);
    const tmp = new THREE.Color();

    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      // new live sample -> start a morph from wherever the dots are now
      if (liveVersion.current !== seenVersion && liveRef.current && liveRef.current.length >= 6) {
        seenVersion = liveVersion.current;
        from.set(positions);
        to = fromSample(liveRef.current, COUNT);
        // build bottom-up with a little noise
        for (let i = 0; i < COUNT; i++) order[i] = THREE.MathUtils.clamp(to[i * 3 + 1] / TARGET_H + (Math.random() - 0.5) * 0.12, 0, 1);
        morphStart = t;
        haveModel = true;
      }
      const pos = geo.attributes.position.array as Float32Array;
      const col = geo.attributes.color.array as Float32Array;
      const ang = -0.6 + t * 0.1;
      const band = ((t * 0.35) % 1.4) - 0.2; // scanning band position on the globe (normalized height)
      for (let i = 0; i < COUNT; i++) {
        const s = seeds[i];
        let x: number, y: number, z: number;
        if (morphStart >= 0) {
          const p = ease(THREE.MathUtils.clamp(((t - morphStart) / MORPH) * 1.25 - order[i] * 0.25, 0, 1));
          x = from[i * 3] + (to[i * 3] - from[i * 3]) * p;
          y = from[i * 3 + 1] + (to[i * 3 + 1] - from[i * 3 + 1]) * p;
          z = from[i * 3 + 2] + (to[i * 3 + 2] - from[i * 3 + 2]) * p;
          if (t - morphStart > MORPH + 0.5) morphStart = -1; // settled: positions now equal `to`
        } else if (haveModel) {
          x = to[i * 3]; y = to[i * 3 + 1]; z = to[i * 3 + 2];
        } else {
          // idle globe: slow spin and a breathing radius
          const gx = from[i * 3], gy = from[i * 3 + 1] - 1.45, gz = from[i * 3 + 2];
          const ca = Math.cos(t * 0.25), sa = Math.sin(t * 0.25);
          const breathe = 1 + Math.sin(t * 1.1 + s) * 0.012;
          x = (gx * ca - gz * sa) * breathe; z = (gx * sa + gz * ca) * breathe; y = gy * breathe + 1.45;
        }
        // tiny shimmer so settled dots still feel alive
        const sh = Math.sin(t * 2.2 + s) * 0.003;
        pos[i * 3] = x + sh; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z + sh;
        // colors: globe gradient with a bright scanning band; model gradient by height
        if (!haveModel) {
          const h = (y - 0.1) / 2.7;
          tmp.copy(cGlobeA).lerp(cGlobeB, THREE.MathUtils.clamp(h, 0, 1));
          const d = Math.abs(h - band);
          if (d < 0.05) tmp.lerp(cBand, 1 - d / 0.05);
        } else {
          tmp.copy(cModelA).lerp(cModelB, THREE.MathUtils.clamp(y / TARGET_H, 0, 1));
        }
        col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      camera.position.set(Math.cos(ang) * 5.6, 2.5 + Math.sin(t * 0.3) * 0.2, Math.sin(ang) * 5.6);
      camera.lookAt(0, 1.2, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="particle-scene" />;
}
