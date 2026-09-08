import * as THREE from "three";
import { strToU8, zipSync } from "three/examples/jsm/libs/fflate.module.js";
import type { Layer } from "../types";
import { buildAssemblyGroup } from "../geometry/extrude";
import { computeConnectedClusters } from "../state/sceneUtils";
import { downloadBlob } from "./stl";

interface WorldMesh {
  /** World-space triangle vertices, 9 floats per triangle (already
   * expanded/unindexed — simplest possible mapping into 3MF's flat
   * vertex+triangle lists, and STL-export-sized meshes are small enough
   * that the minor duplication doesn't matter). */
  positions: Float32Array;
  name: string;
  colorHex: string;
  /** The originating layer id — used to sort meshes back into their real
   * connected-component cluster (see computeConnectedClusters) once
   * geometry has already been baked to world space. */
  layerId: string;
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
      layerId: (mesh.userData.layerId as string | undefined) ?? "",
    });
  });

  return meshes;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// A coordinate this close (mm) is the same physical vertex — well above a
// single float32 ULP at print-bed scale (~1.2e-5mm at 100mm from origin),
// comfortably below any real printable feature, so this only ever merges
// genuinely-coincident points, never two that are actually distinct.
const WELD_EPSILON_MM = 1e-4;

/**
 * Welds `positions` (flat, 9-floats-per-triangle, already-expanded/unshared
 * — see WorldMesh) back into a real indexed mesh: coincident corners across
 * DIFFERENT triangles collapse onto one shared vertex, so adjacent
 * triangles reference the same vertex index at a shared edge.
 *
 * This matters because a 3MF/STL consumer determines whether a mesh is
 * manifold (has no holes) by checking that every edge — a (vertex-index,
 * vertex-index) pair — is used by exactly two triangles, in opposite
 * directions. That check works on INDICES, not coordinates: it never
 * re-derives which vertices are "the same point" by comparing their
 * numbers. Emitting a fresh, never-reused vertex index per triangle corner
 * (as this exporter used to) makes every edge trivially "open" — shared by
 * only one triangle — regardless of how geometrically sound the mesh
 * actually is, which is exactly what a slicer's own mesh-repair step
 * flags as broken.
 */
function buildIndexedMesh(positions: Float32Array): { vertices: [number, number, number][]; triangles: [number, number, number][] } {
  const key = (x: number, y: number, z: number) =>
    `${Math.round(x / WELD_EPSILON_MM)},${Math.round(y / WELD_EPSILON_MM)},${Math.round(z / WELD_EPSILON_MM)}`;
  const indexOf = new Map<string, number>();
  const vertices: [number, number, number][] = [];
  const triangles: [number, number, number][] = [];
  const triangleCount = positions.length / 9;
  for (let t = 0; t < triangleCount; t++) {
    const o = t * 9;
    const corner: number[] = [];
    for (let c = 0; c < 3; c++) {
      const x = positions[o + c * 3];
      const y = positions[o + c * 3 + 1];
      const z = positions[o + c * 3 + 2];
      const k = key(x, y, z);
      let vi = indexOf.get(k);
      if (vi === undefined) {
        vi = vertices.length;
        indexOf.set(k, vi);
        vertices.push([x, y, z]);
      }
      corner.push(vi);
    }
    triangles.push([corner[0], corner[1], corner[2]]);
  }
  return { vertices, triangles };
}

/**
 * Builds the 3MF model XML: one `<m:colorgroup>` color entry and one
 * `<object>` per printable shape, referenced 1:1 by `pindex`, so every
 * shape keeps its own color independent of any other shape's.
 *
 * `clusters` groups those per-shape objects into the sets that actually,
 * physically touch each other (see computeConnectedClusters) — each
 * cluster of 2+ shapes is wrapped as a single rigid assembly `<object>`
 * (its members placed as `<component>`s, with only the assembly itself
 * placed in `<build>`); a cluster of exactly 1 shape is placed directly as
 * its own top-level `<item>`, with no assembly wrapper needed. See the
 * comment on the assembly-building loop below for why this grouping (welding
 * only real clusters, not the entire document into one object) matters.
 *
 * Deliberately uses the Materials Extension's `<m:colorgroup>`/`<m:color>`
 * rather than the 3MF core spec's `<basematerials>`/`displaycolor` — pulled
 * BambuStudio's own bbs_3mf.cpp source (its foreign-3MF color importer only
 * recognizes COLOR_GROUP_TAG = "m:colorgroup" / COLOR_TAG = "m:color", read
 * via the same `pid`/`pindex` attributes on `<object>`; it never parses
 * `<basematerials>` at all). A first version of this exporter used
 * basematerials and colors silently never showed up in Bambu Studio.
 */
function buildModelXml(clusters: WorldMesh[][]): string {
  const flat = clusters.flat();
  const colorEntries = flat.map((m) => `<m:color color="${m.colorHex.toUpperCase()}FF"/>`).join("");

  let nextObjectId = 2; // 1 is reserved for the colorgroup resource
  const objectIdOf = new Map<WorldMesh, number>();
  const objectsXml = flat
    .map((m) => {
      const objectId = nextObjectId++;
      objectIdOf.set(m, objectId);
      const pindex = objectId - 2;
      const { vertices: weldedVertices, triangles: weldedTriangles } = buildIndexedMesh(m.positions);
      let vertices = "";
      for (const [x, y, z] of weldedVertices) {
        vertices += `<vertex x="${x}" y="${y}" z="${z}"/>`;
      }
      let triangles = "";
      for (const [v1, v2, v3] of weldedTriangles) {
        triangles += `<triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`;
      }
      return (
        `<object id="${objectId}" type="model" name="${xmlEscape(m.name)}" pid="1" pindex="${pindex}">` +
        `<mesh><vertices>${vertices}</vertices><triangles>${triangles}</triangles></mesh>` +
        `</object>`
      );
    })
    .join("");

  // Every cluster of shapes that actually touch is welded into ONE rigid
  // assembly object (its members placed as <component>s of it, rather than
  // each getting its own top-level <item> in <build>) — this is what tells
  // a slicer "these parts are one fixed assembly," not "N independent
  // objects I placed on the plate together." A flat list of independent
  // items is exactly what a design built from several thin, closely-stacked
  // or touching layers (a multi-color relief, e.g.) looks like to Bambu
  // Studio's own arrange/collision logic: pieces that share or nearly share
  // a footprint, or don't individually rest on the bed, register as objects
  // needing to be pulled apart — so opening the file silently scattered
  // them, discarding the exact relative layout this app spent so much
  // effort getting right.
  //
  // But welding EVERY shape in the document into one object regardless of
  // whether it's geometrically connected overcorrects: a shape with no real
  // contact to anything else (a genuinely separate part, or — just as
  // often — a leftover duplicate sitting elsewhere on the bed) then reads
  // to the slicer as a floating, unsupported region of what's supposed to
  // be one connected object, which is its own printability warning. Each
  // cluster gets exactly one item — a real assembly for 2+ touching shapes,
  // or the shape's own object directly for a lone one — so a genuinely
  // separate part stays independently placeable/printable instead of being
  // falsely glued to a cluster it never touched. No `transform` attribute is
  // needed on a `<component>` (it defaults to identity) since every vertex
  // above is already baked to absolute world coordinates by
  // collectWorldMeshes.
  const assembliesXml: string[] = [];
  const itemsXml: string[] = [];
  for (const cluster of clusters) {
    if (cluster.length === 0) continue;
    if (cluster.length === 1) {
      itemsXml.push(`<item objectid="${objectIdOf.get(cluster[0])}"/>`);
      continue;
    }
    const assemblyId = nextObjectId++;
    const components = cluster.map((m) => `<component objectid="${objectIdOf.get(m)}"/>`).join("");
    assembliesXml.push(`<object id="${assemblyId}" type="model"><components>${components}</components></object>`);
    itemsXml.push(`<item objectid="${assemblyId}"/>`);
  }

  // Bambu Studio (and the rest of the Slic3r-derived family it shares its
  // 3MF importer lineage with, AnkerMake's own slicer included) reads the
  // core-spec <metadata name="Application"> element to identify which
  // program produced a 3MF, in the "AppName-Version" form every one of
  // them writes (e.g. "BambuStudio-01.09.00.65", "OrcaSlicer-1.9.0"). This
  // exporter never wrote one at all, leaving that field blank — with
  // nothing to identify the file as ours, an importer with its own list of
  // known third-party producers (Bambu Studio ships one, for its
  // third-party-printer support) has nothing to go on but an empty string,
  // and can fall through to whatever it guesses for "unrecognized," which
  // is how one of our own files ended up read back as if AnkerMake's own
  // software had made it. Declaring our own identity here removes the
  // ambiguity outright, independent of whatever any single importer's
  // fallback happens to guess otherwise.
  const metadataXml =
    `<metadata name="Application">SVGto3DPrint-1.0</metadata>` +
    `<metadata name="CreationDate">${new Date().toISOString().slice(0, 10)}</metadata>`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<model unit="millimeter" xml:lang="en-US" ` +
    `xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" ` +
    `xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">` +
    metadataXml +
    `<resources><m:colorgroup id="1">${colorEntries}</m:colorgroup>${objectsXml}${assembliesXml.join("")}</resources>` +
    `<build>${itemsXml.join("")}</build>` +
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

  // Group the already world-baked meshes back into the real connected
  // clusters they belong to (see buildModelXml) — computed independently
  // from the layer tree, then matched up here by layerId, since that's
  // cheaper and more direct than re-deriving connectivity from raw
  // triangles.
  const clusterIdLists = computeConnectedClusters(layers, rootIds);
  const clusterIndexByLayerId = new Map<string, number>();
  clusterIdLists.forEach((ids, idx) => ids.forEach((id) => clusterIndexByLayerId.set(id, idx)));
  const clusters: WorldMesh[][] = clusterIdLists.map(() => []);
  for (const m of meshes) {
    const idx = clusterIndexByLayerId.get(m.layerId);
    // Every exportable mesh should have a matching cluster — this only
    // falls back to a lone cluster of its own if that ever isn't true,
    // rather than silently lumping it in with something unrelated.
    if (idx === undefined) clusters.push([m]);
    else clusters[idx].push(m);
  }

  const modelXml = buildModelXml(clusters);

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
