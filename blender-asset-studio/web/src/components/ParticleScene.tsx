import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";

/**
 * Progress animation. Tiny dots sweep in from the camera's front-left and, when a reference
 * image exists, first assemble into that photo as a flat point cloud in the photo's own colors.
 * They then morph into a 3D sculpture (the parent version's model when iterating, otherwise a
 * small generic building), hold, lift off and fade, and start again.
 */
const COUNT = 7000;
const T_ASSEMBLE = 4.5, T_IMG_HOLD = 1.6, T_MORPH = 3.0, T_HOLD = 2.6, T_DISSOLVE = 2.4;
const SCULPT_H = 2.3;

function genericBuilding(): THREE.Mesh[] {
  const mat = new THREE.MeshBasicMaterial();
  const meshes: THREE.Mesh[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.updateMatrixWorld();
    meshes.push(m);
  };
  box(2.0, 0.95, 1.4, 0, 0.475, 0);
  box(1.7, 0.8, 1.25, 0, 1.35, 0);
  box(1.9, 0.08, 0.5, 0, 0.98, 0.85);
  const shape = new THREE.Shape();
  shape.moveTo(-0.95, 1.75);
  shape.lineTo(0.95, 1.75);
  shape.lineTo(0, 2.35);
  shape.closePath();
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: false }), mat);
  roof.position.z = -0.7;
  roof.updateMatrixWorld();
  meshes.push(roof);
  for (const x of [-0.8, -0.27, 0.27, 0.8]) box(0.06, 0.9, 0.06, x, 0.45, 1.1);
  box(1.75, 0.06, 0.9, 0, 0.92, 0.85);
  return meshes;
}

function surfaceArea(m: THREE.Mesh): number {
  const g = m.geometry, pos = g.attributes.position, idx = g.index;
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
  const areas = meshes.map(surfaceArea);
  const total = areas.reduce((a, b) => a + b, 0) || 1;
  const out = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  let k = 0;
  meshes.forEach((m, i) => {
    const n = i === meshes.length - 1 ? count - k : Math.round((areas[i] / total) * count);
    const sampler = new MeshSurfaceSampler(m).build();
    for (let j = 0; j < n && k < count; j++, k++) {
      sampler.sample(v);
      v.applyMatrix4(m.matrixWorld);
      out.set([v.x, v.y, v.z], k * 3);
    }
  });
  const box = new THREE.Box3();
  for (let i = 0; i < count; i++) box.expandByPoint(v.set(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]));
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const s = SCULPT_H / Math.max(size.y, size.x * 0.8, size.z * 0.8, 0.001);
  for (let i = 0; i < count; i++) {
    out[i * 3] = (out[i * 3] - center.x) * s;
    out[i * 3 + 1] = (out[i * 3 + 1] - box.min.y) * s;
    out[i * 3 + 2] = (out[i * 3 + 2] - center.z) * s;
  }
  return out;
}

/** Picks points from a photo, favouring edges and darker areas, with the photo's colors. */
function sampleImage(img: HTMLImageElement, count: number): { uv: Float32Array; rgb: Float32Array; aspect: number } | null {
  const W = 180, H = Math.max(40, Math.round((W * img.naturalHeight) / img.naturalWidth));
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);
  const luma = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) luma[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
  const weight = new Float32Array(W * H);
  let sum = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = luma[i + 1] - luma[i - 1], gy = luma[i + W] - luma[i - W];
      const edge = Math.min(1, Math.hypot(gx, gy) * 3);
      const w = edge * 0.75 + (1 - luma[i]) * 0.2 + 0.015;
      weight[i] = w;
      sum += w;
    }
  }
  // cumulative table for weighted sampling
  const cdf = new Float32Array(W * H);
  let acc = 0;
  for (let i = 0; i < W * H; i++) {
    acc += weight[i] / sum;
    cdf[i] = acc;
  }
  const uv = new Float32Array(count * 2), rgb = new Float32Array(count * 3);
  for (let k = 0; k < count; k++) {
    const r = Math.random();
    let lo = 0, hi = W * H - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    const x = lo % W, y = Math.floor(lo / W);
    uv[k * 2] = (x + Math.random()) / W;
    uv[k * 2 + 1] = (y + Math.random()) / H;
    // lift colors a little so dark photos still read on the dark background
    rgb[k * 3] = Math.min(1, data[lo * 4] / 255 * 0.85 + 0.2);
    rgb[k * 3 + 1] = Math.min(1, data[lo * 4 + 1] / 255 * 0.85 + 0.2);
    rgb[k * 3 + 2] = Math.min(1, data[lo * 4 + 2] / 255 * 0.85 + 0.22);
  }
  return { uv, rgb, aspect: W / H };
}

const ease = (x: number) => 1 - Math.pow(1 - x, 3);

export default function ParticleScene({ glbUrl, refUrl }: { glbUrl: string | null; refUrl: string | null }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101319);
    scene.fog = new THREE.Fog(0x101319, 7, 13);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const grid = new THREE.GridHelper(12, 24, 0x27304a, 0x1a2030);
    grid.position.y = -0.01;
    scene.add(grid);

    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const sculptColors = new Float32Array(COUNT * 3);
    const starts = new Float32Array(COUNT * 3);
    const scatter = new Float32Array(COUNT * 3);
    const keys = new Float32Array(COUNT); // sweep order for the sculpture
    const imgKeys = new Float32Array(COUNT); // sweep order for the photo (left to right)
    const seeds = new Float32Array(COUNT);
    const corner = new THREE.Vector3(-3.2, 0.2, 2.6);
    for (let i = 0; i < COUNT; i++) {
      const r = 0.3 + Math.random() * 1.4, a = Math.random() * Math.PI * 2, b = (Math.random() - 0.5) * Math.PI;
      starts[i * 3] = corner.x + r * Math.cos(a) * Math.cos(b);
      starts[i * 3 + 1] = Math.max(0, corner.y + r * Math.sin(b) + 0.4);
      starts[i * 3 + 2] = corner.z + r * Math.sin(a) * Math.cos(b);
      seeds[i] = Math.random() * Math.PI * 2;
      scatter[i * 3] = (Math.random() - 0.5) * 1.2;
      scatter[i * 3 + 1] = 0.6 + Math.random() * 1.6;
      scatter[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
    }

    let targets: Float32Array = new Float32Array(COUNT * 3);
    const applyTargets = (t: Float32Array) => {
      targets = t;
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < COUNT; i++) {
        const k = (t[i * 3] + 3.2) * 0.6 + t[i * 3 + 1] * 0.55 - (t[i * 3 + 2] - 2.6) * 0.45;
        keys[i] = k;
        if (k < min) min = k;
        if (k > max) max = k;
      }
      for (let i = 0; i < COUNT; i++) keys[i] = (keys[i] - min) / (max - min || 1) + (Math.random() - 0.5) * 0.06;
      const cA = new THREE.Color(0x3b82f6), cB = new THREE.Color(0xbfe3ff), cC = new THREE.Color(0xa78bfa), c = new THREE.Color();
      for (let i = 0; i < COUNT; i++) {
        c.copy(cA).lerp(cB, THREE.MathUtils.clamp(t[i * 3 + 1] / SCULPT_H, 0, 1));
        if (Math.random() < 0.12) c.lerp(cC, 0.6);
        sculptColors.set([c.r, c.g, c.b], i * 3);
      }
    };
    applyTargets(sampleTargets(genericBuilding(), COUNT));

    // photo point cloud (uv in 0..1, colors from the photo)
    let img: { uv: Float32Array; rgb: Float32Array; aspect: number } | null = null;
    let cancelled = false;
    if (refUrl) {
      const im = new Image();
      im.onload = () => {
        if (cancelled) return;
        img = sampleImage(im, COUNT);
        if (img) for (let i = 0; i < COUNT; i++) imgKeys[i] = img.uv[i * 2] + (Math.random() - 0.5) * 0.08;
      };
      im.src = refUrl;
    }
    if (glbUrl) {
      new GLTFLoader().load(glbUrl, (gltf) => {
        if (cancelled) return;
        const meshes: THREE.Mesh[] = [];
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && m.geometry.attributes.position) meshes.push(m);
        });
        if (meshes.length) applyTargets(sampleTargets(meshes, COUNT));
      }, undefined, () => {});
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: 0.022, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
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

    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      const withImage = !!img;
      const cycle = (withImage ? T_ASSEMBLE + T_IMG_HOLD + T_MORPH : T_ASSEMBLE + 1.5) + T_HOLD + T_DISSOLVE;
      const ph = t % cycle;
      // phase values: arrive (0..1), morph photo->sculpture (0..1), dissolve (0..1)
      let arrive = 0, morph = withImage ? 0 : 1, dissolve = 0;
      const tAssemble = withImage ? T_ASSEMBLE : T_ASSEMBLE + 1.5;
      if (ph < tAssemble) arrive = ph / tAssemble;
      else if (withImage && ph < tAssemble + T_IMG_HOLD) arrive = 1;
      else if (withImage && ph < tAssemble + T_IMG_HOLD + T_MORPH) { arrive = 1; morph = (ph - tAssemble - T_IMG_HOLD) / T_MORPH; }
      else if (ph < cycle - T_DISSOLVE) { arrive = 1; morph = 1; }
      else { arrive = 1; morph = 1; dissolve = (ph - (cycle - T_DISSOLVE)) / T_DISSOLVE; }

      const ang = -0.6 + t * 0.11;
      const camX = Math.cos(ang) * 5.4, camZ = Math.sin(ang) * 5.4;
      // photo plane faces the camera; right vector of the camera in the ground plane
      const rx = Math.sin(ang), rz = -Math.cos(ang);
      const planeH = SCULPT_H, planeW = withImage ? planeH * img!.aspect : planeH;
      const ca = Math.cos(ang + 0.9), sa = Math.sin(ang + 0.9);
      const pos = geo.attributes.position.array as Float32Array;
      const col = geo.attributes.color.array as Float32Array;
      for (let i = 0; i < COUNT; i++) {
        const s = seeds[i];
        const ox = starts[i * 3] + Math.sin(t * 0.9 + s) * 0.25, oz = starts[i * 3 + 2] + Math.cos(t * 0.8 + s) * 0.25;
        const sx = ox * ca - oz * sa, sz = ox * sa + oz * ca, sy = starts[i * 3 + 1] + Math.sin(t * 1.3 + s * 2) * 0.18;
        // first destination: the photo (if any) or the sculpture directly
        let dx: number, dy: number, dz: number, cr: number, cg: number, cb: number, k: number;
        if (withImage) {
          const u = (img!.uv[i * 2] - 0.5) * planeW, v = (1 - img!.uv[i * 2 + 1]) * planeH + 0.05;
          dx = u * rx; dy = v; dz = u * rz;
          cr = img!.rgb[i * 3]; cg = img!.rgb[i * 3 + 1]; cb = img!.rgb[i * 3 + 2];
          k = imgKeys[i];
        } else {
          dx = targets[i * 3]; dy = targets[i * 3 + 1]; dz = targets[i * 3 + 2];
          cr = sculptColors[i * 3]; cg = sculptColors[i * 3 + 1]; cb = sculptColors[i * 3 + 2];
          k = keys[i];
        }
        const p = ease(THREE.MathUtils.clamp((arrive * 1.18 - k) / 0.18, 0, 1));
        let x = sx + (dx - sx) * p, y = sy + (dy - sy) * p, z = sz + (dz - sz) * p;
        if (withImage && morph > 0) {
          const m = ease(THREE.MathUtils.clamp((morph * 1.18 - keys[i]) / 0.18, 0, 1));
          x += (targets[i * 3] - x) * m; y += (targets[i * 3 + 1] - y) * m; z += (targets[i * 3 + 2] - z) * m;
          cr += (sculptColors[i * 3] - cr) * m; cg += (sculptColors[i * 3 + 1] - cg) * m; cb += (sculptColors[i * 3 + 2] - cb) * m;
        }
        let fade = 1;
        if (dissolve > 0) {
          const d = ease(THREE.MathUtils.clamp((dissolve * 1.4 - y / SCULPT_H) / 0.4, 0, 1));
          x += scatter[i * 3] * d; y += scatter[i * 3 + 1] * d; z += scatter[i * 3 + 2] * d;
          fade = 1 - d;
        }
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        col[i * 3] = cr * fade; col[i * 3 + 1] = cg * fade; col[i * 3 + 2] = cb * fade;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      camera.position.set(camX, 2.4 + Math.sin(t * 0.3) * 0.2, camZ);
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
  }, [glbUrl, refUrl]);

  return <div ref={mountRef} className="particle-scene" />;
}
