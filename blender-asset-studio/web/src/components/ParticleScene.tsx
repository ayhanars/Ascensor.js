import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";

/**
 * Progress animation: tiny dots sweep in from a corner and assemble into a sculpture,
 * hold, dissolve, and start again. The sculpture is the parent version's model when there
 * is one, otherwise a small generic building.
 */
const COUNT = 7000;
const ASSEMBLE = 6.5, HOLD = 2.5, DISSOLVE = 2.5, CYCLE = ASSEMBLE + HOLD + DISSOLVE;

function genericBuilding(): THREE.Mesh[] {
  const mat = new THREE.MeshBasicMaterial();
  const meshes: THREE.Mesh[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.updateMatrixWorld();
    meshes.push(m);
  };
  box(2.0, 0.95, 1.4, 0, 0.475, 0); // ground floor
  box(1.7, 0.8, 1.25, 0, 1.35, 0); // first floor
  box(1.9, 0.08, 0.5, 0, 0.98, 0.85); // balcony slab
  // roof prism
  const shape = new THREE.Shape();
  shape.moveTo(-0.95, 1.75);
  shape.lineTo(0.95, 1.75);
  shape.lineTo(0, 2.35);
  shape.closePath();
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: false }), mat);
  roof.position.z = -0.7;
  roof.updateMatrixWorld();
  meshes.push(roof);
  // pergola posts and beam in front
  for (const x of [-0.8, -0.27, 0.27, 0.8]) box(0.06, 0.9, 0.06, x, 0.45, 1.1);
  box(1.75, 0.06, 0.9, 0, 0.92, 0.85);
  return meshes;
}

function surfaceArea(m: THREE.Mesh): number {
  const g = m.geometry;
  const pos = g.attributes.position;
  const idx = g.index;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = idx ? idx.count : pos.count;
  let area = 0;
  for (let i = 0; i < n; i += 3) {
    const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
    a.fromBufferAttribute(pos, ia).applyMatrix4(m.matrixWorld);
    b.fromBufferAttribute(pos, ib).applyMatrix4(m.matrixWorld);
    c.fromBufferAttribute(pos, ic).applyMatrix4(m.matrixWorld);
    area += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return area;
}

function sampleTargets(meshes: THREE.Mesh[], count: number): Float32Array {
  // distribute points by surface area, then normalize the cloud to a fixed height
  const tris = meshes.map(surfaceArea);
  const total = tris.reduce((a, b) => a + b, 0) || 1;
  const out = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  let k = 0;
  meshes.forEach((m, i) => {
    const n = i === meshes.length - 1 ? count - k : Math.round((tris[i] / total) * count);
    const sampler = new MeshSurfaceSampler(m).build();
    for (let j = 0; j < n && k < count; j++, k++) {
      sampler.sample(v);
      v.applyMatrix4(m.matrixWorld);
      out[k * 3] = v.x;
      out[k * 3 + 1] = v.y;
      out[k * 3 + 2] = v.z;
    }
  });
  const box = new THREE.Box3();
  for (let i = 0; i < count; i++) box.expandByPoint(v.set(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = 2.3 / Math.max(size.y, size.x * 0.8, size.z * 0.8, 0.001);
  for (let i = 0; i < count; i++) {
    out[i * 3] = (out[i * 3] - center.x) * s;
    out[i * 3 + 1] = (out[i * 3 + 1] - box.min.y) * s;
    out[i * 3 + 2] = (out[i * 3 + 2] - center.z) * s;
  }
  return out;
}

export default function ParticleScene({ glbUrl }: { glbUrl: string | null }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const targetsRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    const el = mountRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101319);
    scene.fog = new THREE.Fog(0x101319, 6, 12);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);

    const grid = new THREE.GridHelper(12, 24, 0x27304a, 0x1a2030);
    grid.position.y = -0.01;
    scene.add(grid);

    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const baseColors = new Float32Array(COUNT * 3);
    const scatter = new Float32Array(COUNT * 3);
    const starts = new Float32Array(COUNT * 3);
    const keys = new Float32Array(COUNT);
    const seeds = new Float32Array(COUNT);
    const corner = new THREE.Vector3(-3.2, 0.2, 2.6);
    for (let i = 0; i < COUNT; i++) {
      // scattered cloud around the entry corner
      const r = 0.3 + Math.random() * 1.4;
      const a = Math.random() * Math.PI * 2, b = (Math.random() - 0.5) * Math.PI;
      starts[i * 3] = corner.x + r * Math.cos(a) * Math.cos(b);
      starts[i * 3 + 1] = Math.max(0, corner.y + r * Math.sin(b) + 0.4);
      starts[i * 3 + 2] = corner.z + r * Math.sin(a) * Math.cos(b);
      seeds[i] = Math.random() * Math.PI * 2;
      // where each dot drifts to when the sculpture dissolves: up and gently outward
      scatter[i * 3] = (Math.random() - 0.5) * 1.2;
      scatter[i * 3 + 1] = 0.6 + Math.random() * 1.6;
      scatter[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
    }
    let targets = targetsRef.current ?? sampleTargets(genericBuilding(), COUNT);
    const applyTargets = (t: Float32Array) => {
      targets = t;
      // sweep order: distance along the diagonal from the entry corner, plus a little noise
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < COUNT; i++) {
        const k = (t[i * 3] + 3.2) * 0.6 + t[i * 3 + 1] * 0.55 - (t[i * 3 + 2] - 2.6) * 0.45;
        keys[i] = k;
        if (k < min) min = k;
        if (k > max) max = k;
      }
      for (let i = 0; i < COUNT; i++) keys[i] = (keys[i] - min) / (max - min || 1) + (Math.random() - 0.5) * 0.06;
      const cA = new THREE.Color(0x3b82f6), cB = new THREE.Color(0xbfe3ff), cC = new THREE.Color(0xa78bfa);
      const c = new THREE.Color();
      for (let i = 0; i < COUNT; i++) {
        const h = THREE.MathUtils.clamp(t[i * 3 + 1] / 2.3, 0, 1);
        c.copy(cA).lerp(cB, h);
        if (Math.random() < 0.12) c.lerp(cC, 0.6);
        baseColors[i * 3] = c.r;
        baseColors[i * 3 + 1] = c.g;
        baseColors[i * 3 + 2] = c.b;
      }
      colors.set(baseColors);
      geo.attributes.color.needsUpdate = true;
    };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: 0.022, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    applyTargets(targets);

    // when iterating, assemble into the parent version's real model
    let cancelled = false;
    if (glbUrl) {
      new GLTFLoader().load(
        glbUrl,
        (gltf) => {
          if (cancelled) return;
          const meshes: THREE.Mesh[] = [];
          gltf.scene.updateMatrixWorld(true);
          gltf.scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh && m.geometry.attributes.position) meshes.push(m);
          });
          if (meshes.length) applyTargets(sampleTargets(meshes, COUNT));
        },
        undefined,
        () => {},
      );
    }

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      const ph = t % CYCLE;
      let front = 0, dissolve = 0;
      if (ph < ASSEMBLE) front = ph / ASSEMBLE;
      else if (ph < ASSEMBLE + HOLD) front = 1;
      else { front = 1; dissolve = (ph - ASSEMBLE - HOLD) / DISSOLVE; }
      const pos = geo.attributes.position.array as Float32Array;
      const col = geo.attributes.color.array as Float32Array;
      const ang = -0.6 + t * 0.12;
      // the entry corner stays at the camera's front-left, so the arriving dots are always in view
      const ca = Math.cos(ang + 0.9), sa = Math.sin(ang + 0.9);
      for (let i = 0; i < COUNT; i++) {
        const k = keys[i];
        let p = THREE.MathUtils.clamp((front * 1.18 - k) / 0.18, 0, 1);
        p = ease(p);
        const s = seeds[i];
        // drifting swirl while waiting at the corner (corner rotated with the camera)
        const ox = starts[i * 3] + Math.sin(t * 0.9 + s) * 0.25;
        const oz = starts[i * 3 + 2] + Math.cos(t * 0.8 + s) * 0.25;
        const sx = ox * ca - oz * sa;
        const sz = ox * sa + oz * ca;
        const sy = starts[i * 3 + 1] + Math.sin(t * 1.3 + s * 2) * 0.18;
        let x = sx + (targets[i * 3] - sx) * p;
        let y = sy + (targets[i * 3 + 1] - sy) * p;
        let z = sz + (targets[i * 3 + 2] - sz) * p;
        let fade = 1;
        if (dissolve > 0) {
          // dissolve in place: lift off from the bottom up and fade out
          const d = ease(THREE.MathUtils.clamp((dissolve * 1.4 - targets[i * 3 + 1] / 2.3) / 0.4, 0, 1));
          x += scatter[i * 3] * d;
          y += scatter[i * 3 + 1] * d;
          z += scatter[i * 3 + 2] * d;
          fade = 1 - d;
        }
        pos[i * 3] = x;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = z;
        col[i * 3] = baseColors[i * 3] * fade;
        col[i * 3 + 1] = baseColors[i * 3 + 1] * fade;
        col[i * 3 + 2] = baseColors[i * 3 + 2] * fade;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      camera.position.set(Math.cos(ang) * 5.4, 2.4 + Math.sin(t * 0.3) * 0.2, Math.sin(ang) * 5.4);
      camera.lookAt(0, 1.05, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [glbUrl]);

  return <div ref={mountRef} className="particle-scene" />;
}
