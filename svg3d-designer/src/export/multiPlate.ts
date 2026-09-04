import { strToU8, zipSync } from "three/examples/jsm/libs/fflate.module.js";
import type { Layer, Plate } from "../types";
import { downloadBlob, exportSceneToStlBlob } from "./stl";
import { exportSceneToThreeMfBlob } from "./threemf";

// Filesystem-unsafe characters a plate name could contain (renamed freely
// by the user) — swapped for a space so the per-plate filename inside the
// zip always writes cleanly on Windows/macOS/Linux alike.
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|]/g;

function safeName(name: string): string {
  return name.replace(UNSAFE_FILENAME_CHARS, " ").trim() || "Plate";
}

/**
 * Exports every plate that has at least one root layer on it as its own
 * file inside a single zip — "one file per plate" being the practical
 * alternative to a browser triggering several simultaneous downloads
 * (which most browsers block or prompt for individually).
 */
export async function exportAllPlatesToZip(
  layers: Record<string, Layer>,
  plates: Plate[],
  rootIdsByPlate: Map<string, string[]>,
  documentName: string,
  format: "stl" | "3mf",
): Promise<number> {
  const entries: [string, Uint8Array][] = [];
  for (const plate of plates) {
    const rootIds = rootIdsByPlate.get(plate.id) ?? [];
    if (rootIds.length === 0) continue;
    const blob = format === "stl" ? exportSceneToStlBlob(layers, rootIds) : exportSceneToThreeMfBlob(layers, rootIds);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    entries.push([`${safeName(documentName)} - ${safeName(plate.name)}.${format}`, bytes]);
  }
  if (entries.length === 0) return 0;

  const files: Record<string, Uint8Array> = {};
  for (const [name, bytes] of entries) files[name] = bytes;
  // Bundle a plain manifest too — handy context once the zip is unpacked
  // next to a slicer, without needing to open every file.
  const manifest = plates
    .filter((p) => (rootIdsByPlate.get(p.id)?.length ?? 0) > 0)
    .map((p) => `${p.name}: ${rootIdsByPlate.get(p.id)?.length} object(s)`)
    .join("\n");
  files["plates.txt"] = strToU8(manifest);

  const zipped = zipSync(files, { level: 0 });
  const blob = new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" });
  downloadBlob(blob, `${safeName(documentName)} - all plates (${format}).zip`);
  return entries.length;
}
