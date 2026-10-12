import path from "node:path";
import { EFFORTS, type Effort } from "./config.js";

export function buildPrompt(opts: {
  versionDir: string;
  assetName: string;
  description: string;
  effort: Effort;
  hasReference: boolean;
  isIteration: boolean;
  scopedPart: string | null;
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
  lines.push("");
  if (opts.hasReference) {
    lines.push("A reference image is at ./reference.png. Read it first and match it as closely as the description allows.");
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
    if (opts.scopedPart) {
      lines.push(`Change request, scoped to the part "${opts.scopedPart}" only:`);
    } else {
      lines.push("Change request:");
    }
    lines.push(opts.description.trim());
  }
  lines.push("");
  lines.push("When finished, reply with one line per part in the form `PartName - what it is`, nothing else.");
  return lines.join("\n");
}
