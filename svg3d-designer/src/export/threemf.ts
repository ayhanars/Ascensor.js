import * as THREE from "three";
import { strToU8, zipSync } from "three/examples/jsm/libs/fflate.module.js";
import type { Layer } from "../types";
import { buildAssemblyGroup } from "../geometry/extrude";
import { downloadBlob } from "./stl";

interface WorldMesh {
  /** World-space triangle vertices, 9 floats per triangle (already
   * expanded/unindexed — simplest possible mapping into 3MF's flat
   * vertex+triangle lists, and STL-export-sized meshes are small enough
   * that the minor duplication doesn't matter). */
  positions: Float32Array;
  name: string;
  colorHex: string;
}

// Below this triangle area (mm²), a triangle is treated as degenerate —
// vertices that are coincident or collinear after being baked to world
// space (can happen at seams in the bevel/corner-rounding/CSG-subtraction
// geometry) rather than real, printable surface. A slicer's own 3MF
// validator is free to reject a file over exactly this, so it's worth
// filtering here rather than assuming "STL-tolerant" geometry is also
// "3MF-tolerant."
const MIN_TRIANGLE_AREA_MM2 = 1e-6;

function isFinitePoint(x: number, y: number, z: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);
}

function triangleArea(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): number {
  // 0.5 * |AB x AC|
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const cxr = aby * acz - abz * acy;
  const cyr = abz * acx - abx * acz;
  const czr = abx * acy - aby * acx;
  return 0.5 * Math.sqrt(cxr * cxr + cyr * cyr + czr * czr);
}

function collectWorldMeshes(root: THREE.Object3D): WorldMesh[] {
  const meshes: WorldMesh[] = [];
  const v = new THREE.Vector3();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    const posAttr = geometry.getAttribute("position");
    const index = geometry.getIndex();
    const material = mesh.material as THREE.MeshStandardMaterial;
    const vertCount = index ? index.count : posAttr.count;

    const raw = new Float32Array(vertCount * 3);
    for (let i = 0; i < vertCount; i++) {
      const vi = index ? index.getX(i) : i;
      v.fromBufferAttribute(posAttr, vi).applyMatrix4(mesh.matrixWorld);
      raw[i * 3] = v.x;
      raw[i * 3 + 1] = v.y;
      raw[i * 3 + 2] = v.z;
    }

    // Drop degenerate/non-finite triangles rather than exporting them —
    // an object made entirely of them is skipped instead of emitting an
    // empty (and per-spec invalid) <object>.
    const kept: number[] = [];
    for (let t = 0; t < vertCount / 3; t++) {
      const o = t * 9;
      const ax = raw[o], ay = raw[o + 1], az = raw[o + 2];
      const bx = raw[o + 3], by = raw[o + 4], bz = raw[o + 5];
      const cx = raw[o + 6], cy = raw[o + 7], cz = raw[o + 8];
      if (!isFinitePoint(ax, ay, az) || !isFinitePoint(bx, by, bz) || !isFinitePoint(cx, cy, cz)) continue;
      if (triangleArea(ax, ay, az, bx, by, bz, cx, cy, cz) < MIN_TRIANGLE_AREA_MM2) continue;
      kept.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    }
    if (kept.length === 0) return;

    meshes.push({
      positions: new Float32Array(kept),
      name: mesh.name || "Shape",
      colorHex: `#${material.color.getHexString()}`,
    });
  });

  return meshes;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Builds the 3MF model XML: one `<m:colorgroup>` color entry and one
 * `<object>` per printable shape, referenced 1:1 by `pindex`, so every
 * shape keeps its own color independent of any other shape's.
 *
 * Deliberately uses the Materials Extension's `<m:colorgroup>`/`<m:color>`
 * rather than the 3MF core spec's `<basematerials>`/`displaycolor` — pulled
 * BambuStudio's own bbs_3mf.cpp source (its foreign-3MF color importer only
 * recognizes COLOR_GROUP_TAG = "m:colorgroup" / COLOR_TAG = "m:color", read
 * via the same `pid`/`pindex` attributes on `<object>`; it never parses
 * `<basematerials>` at all). A first version of this exporter used
 * basematerials and colors silently never showed up in Bambu Studio.
 */
function buildModelXml(meshes: WorldMesh[]): string {
  const colorEntries = meshes.map((m) => `<m:color color="${m.colorHex.toUpperCase()}FF"/>`).join("");

  const objects = meshes
    .map((m, i) => {
      const objectId = i + 2; // 1 is reserved for the colorgroup resource
      const vertexCount = m.positions.length / 3;
      let vertices = "";
      for (let v = 0; v < vertexCount; v++) {
        vertices += `<vertex x="${m.positions[v * 3]}" y="${m.positions[v * 3 + 1]}" z="${m.positions[v * 3 + 2]}"/>`;
      }
      let triangles = "";
      for (let t = 0; t < vertexCount / 3; t++) {
        triangles += `<triangle v1="${t * 3}" v2="${t * 3 + 1}" v3="${t * 3 + 2}"/>`;
      }
      return (
        `<object id="${objectId}" type="model" name="${xmlEscape(m.name)}" pid="1" pindex="${i}">` +
        `<mesh><vertices>${vertices}</vertices><triangles>${triangles}</triangles></mesh>` +
        `</object>`
      );
    })
    .join("");

  const items = meshes.map((_, i) => `<item objectid="${i + 2}"/>`).join("");

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<model unit="millimeter" xml:lang="en-US" ` +
    `xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" ` +
    `xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">` +
    `<resources><m:colorgroup id="1">${colorEntries}</m:colorgroup>${objects}</resources>` +
    `<build>${items}</build>` +
    `</model>`
  );
}

const CONTENT_TYPES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>` +
  `</Types>`;

const RELS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>` +
  `</Relationships>`;

/**
 * 3MF export — unlike STL, 3MF keeps each shape as its own colored object
 * inside a single file, with every object's real position preserved (no
 * manual re-assembly needed after opening it in a slicer). Colors are
 * carried per-object via a `<m:colorgroup>`/`pindex` (see buildModelXml),
 * which Bambu Studio recognizes on import and shows per-object so you can
 * assign an actual filament/AMS slot to each one.
 */
export function exportSceneToThreeMfBlob(layers: Record<string, Layer>, rootIds: string[]): Blob {
  const assembly = buildAssemblyGroup(layers, rootIds, { respectVisibility: true });
  const meshes = collectWorldMeshes(assembly);
  const modelXml = buildModelXml(meshes);

  const zipped = zipSync(
    {
      "[Content_Types].xml": strToU8(CONTENT_TYPES_XML),
      "_rels/.rels": strToU8(RELS_XML),
      "3D/3dmodel.model": strToU8(modelXml),
    },
    { level: 0 },
  );

  return new Blob([zipped.buffer as ArrayBuffer], { type: "model/3mf" });
}

export function exportSceneToThreeMf(layers: Record<string, Layer>, rootIds: string[], fileName: string): void {
  const blob = exportSceneToThreeMfBlob(layers, rootIds);
  downloadBlob(blob, fileName.endsWith(".3mf") ? fileName : `${fileName}.3mf`);
}
