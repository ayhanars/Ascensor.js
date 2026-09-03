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
    const triCount = index ? index.count : posAttr.count;
    const positions = new Float32Array(triCount * 3);

    for (let i = 0; i < triCount; i++) {
      const vi = index ? index.getX(i) : i;
      v.fromBufferAttribute(posAttr, vi).applyMatrix4(mesh.matrixWorld);
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
    }

    meshes.push({ positions, name: mesh.name || "Shape", colorHex: `#${material.color.getHexString()}` });
  });

  return meshes;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Builds the 3MF model XML: one `<basematerials>` color entry and one
 * `<object>` per printable shape, referenced 1:1 by `pindex`, so every
 * shape keeps its own color independent of any other shape's. */
function buildModelXml(meshes: WorldMesh[]): string {
  const materialEntries = meshes
    .map((m) => `<base name="${xmlEscape(m.name)}" displaycolor="${m.colorHex.toUpperCase()}FF"/>`)
    .join("");

  const objects = meshes
    .map((m, i) => {
      const objectId = i + 2; // 1 is reserved for the basematerials resource
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
    `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    `<resources><basematerials id="1">${materialEntries}</basematerials>${objects}</resources>` +
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
 * carried per-object via the 3MF core spec's `<basematerials>`/`pindex`,
 * which Bambu Studio (and any other 3MF-reading slicer) shows in the
 * object list for you to assign an actual filament/AMS slot to.
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
