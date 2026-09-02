import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import type { Layer } from "../types";
import { buildAssemblyGroup } from "../geometry/extrude";

export function exportSceneToStlBlob(
  layers: Record<string, Layer>,
  rootIds: string[],
): Blob {
  const assembly = buildAssemblyGroup(layers, rootIds, { respectVisibility: true });
  const exporter = new STLExporter();
  const result = exporter.parse(assembly, { binary: true }) as unknown as DataView;
  return new Blob([result.buffer as ArrayBuffer], { type: "application/sla" });
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportSceneToStl(
  layers: Record<string, Layer>,
  rootIds: string[],
  fileName: string,
): void {
  const blob = exportSceneToStlBlob(layers, rootIds);
  downloadBlob(blob, fileName.endsWith(".stl") ? fileName : `${fileName}.stl`);
}
