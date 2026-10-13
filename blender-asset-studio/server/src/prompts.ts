import path from "node:path";
import { DETAILS, EFFORTS, type Detail, type Effort, type Materials } from "./config.js";
import type { Change } from "./types.js";
import { describeTextures } from "./textures.js";

const MATERIAL_BRIEF: Record<Materials, string> = {
  flat: "Materials: flat. One Principled BSDF base color per material, sensible roughness. No textures.",
  procedural:
    "Materials: procedural. Build node-based textures for realism (noise/musgrave for stucco and plaster, wave or image-free wood grain, brick texture node for masonry, voronoi or checker for tiles, glass with transmission, metal with metallic=1). Keep base colors meaningful because the GLB viewer only shows base colors.",
  pbr:
    "Materials: PBR textures. Use the Blender MCP Poly Haven tools (search for textures, download at 1k or 2k, apply the generated material) for the main surfaces: walls, roof, ground, wood, metal, fabric. Set the mapping scale so textures read at real-world size. If the Poly Haven tools are unavailable or fail, fall back to procedural node textures and say so in your summary.",
};

const DETAIL_BRIEF: Record<Detail, string> = {
  draft: "Detail: draft. Primitives, array/mirror modifiers, no subdivision. Get proportions and silhouette right; skip small details.",
  game: "Detail: game. Bevel modifier (2-3 segments) on hard edges, Subdivision Surface level 1 with edge creases on rounded parts, boolean cuts for openings and reveals, shade smooth by angle. Model the details that read from 3 m away.",
  hero: "Detail: hero. Subdivision Surface level 2 on organic and rounded parts, Displace modifier driven by noise/voronoi textures for surface relief, curve objects with bevel depth for cables, rails and trims, Skin modifier on edge chains for limbs and branches, voxel Remesh plus smooth for blended organic masses. Decimate only if the budget is exceeded.",
};

export function buildPrompt(opts: {
  versionDir: string;
  assetName: string;
  description: string;
  changes: Change[];
  effort: Effort;
  materials: Materials;
  detail: Detail;
  textures: string[];
  references: string[];
  isIteration: boolean;
  parentSummary: string | null;
  parentParts: string[];
}): string {
  const buildPy = path.join(opts.versionDir, "build.py");
  const e = EFFORTS[opts.effort];
  const lines: string[] = [];
  lines.push(`Asset: "${opts.assetName}"`);
  lines.push(`Working directory: ${opts.versionDir}`);
  lines.push(`BUILD_PY = ${buildPy}`);
  lines.push(`Allowed compare-and-fix passes for this run: ${e.passes}.`);
  lines.push(MATERIAL_BRIEF[opts.materials]);
  lines.push(`${DETAIL_BRIEF[opts.detail]} Triangle budget: ${DETAILS[opts.detail].maxTriangles.toLocaleString("en-US")} triangles for the whole asset; print count_tris() after each build pass and stay under it.`);
  const kit = describeTextures(opts.textures);
  if (kit) {
    lines.push("");
    lines.push(kit);
    lines.push("Kit textures take priority over procedural or downloaded ones for the surfaces they fit.");
  }
  lines.push("");
  if (opts.references.length === 1) {
    lines.push(`A reference image is at ./${opts.references[0]}. Read it first and match it as closely as the description allows.`);
  } else if (opts.references.length > 1) {
    lines.push(`Reference images (read all of them first): ${opts.references.map((r) => "./" + r).join(", ")}.`);
    lines.push("The first is the main view; the others are extra angles or close-ups of materials and details. Match them as closely as the description allows.");
  } else {
    lines.push("There is no reference image. Build from the description alone.");
  }
  lines.push("");
  if (!opts.isIteration) {
    lines.push("TASK: build this asset from scratch.");
    lines.push("Description:");
    lines.push(opts.description.trim());
  } else {
    lines.push("TASK: iterate on the existing asset. ./build.py already contains the previous version's script");
    lines.push("(including any manual tweaks appended at the end). Edit it, do not rewrite it from nothing.");
    lines.push("Keep the whole asset within the triangle budget above; if the previous version exceeded it, simplify the parts you touch.");
    if (opts.parentSummary) {
      lines.push("");
      lines.push("Previous version summary:");
      lines.push(opts.parentSummary.trim());
    }
    if (opts.parentParts.length) {
      lines.push("");
      lines.push("Existing parts (keep these names): " + opts.parentParts.join(", "));
    }
    lines.push("");
    if (opts.changes.length > 1) {
      lines.push(`Change requests (apply all ${opts.changes.length} in this version, in order):`);
      opts.changes.forEach((c, i) => lines.push(`${i + 1}. ${c.part ? `[part: ${c.part}] ` : ""}${c.text.trim()}`));
    } else {
      const c = opts.changes[0] ?? { text: opts.description, part: null };
      lines.push(c.part ? `Change request, scoped to the part "${c.part}" only:` : "Change request:");
      lines.push(c.text.trim());
    }
  }
  lines.push("");
  lines.push("When finished, reply with one line per part in the form `PartName - what it is`, nothing else.");
  return lines.join("\n");
}
