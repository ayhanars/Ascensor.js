import { useMemo, useState } from "react";
import type { ImportSummary, Layer } from "../types";
import { computeThinFeatureWarnings } from "../state/sceneUtils";

interface Props {
  summary: ImportSummary;
  layers: Record<string, Layer>;
  rootIds: string[];
  onCancel: () => void;
  onConfirm: (mode: "layers" | "merge") => void;
}

export function ImportDialog({ summary, layers, rootIds, onCancel, onConfirm }: Props) {
  const [mode, setMode] = useState<"layers" | "merge">("layers");

  // Checked right here, before the user even confirms the import, rather
  // than only after the fact via the persistent in-canvas warning banner —
  // this is the one moment a too-thin detail is easiest to actually fix:
  // scale the whole SVG up on the next import, instead of hand-editing a
  // shape's geometry after the fact (which we tried automating and found
  // unreliable on real, complex outlines — see the thin-feature warning's
  // own "Select" button, which is deliberately manual now).
  const thinFeatureWarnings = useMemo(
    () => computeThinFeatureWarnings(layers, rootIds),
    [layers, rootIds],
  );
  const narrowestThinFeatureMM = thinFeatureWarnings.reduce(
    (min, w) => Math.min(min, w.minWidthMM),
    Infinity,
  );

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog">
        <div className="dialog-header">Import {summary.fileName}</div>
        <div className="dialog-body">
          <div className="dialog-row">
            <span className="k">Detected size</span>
            <span>
              {Math.round(summary.detectedWidth * 100) / 100} × {Math.round(summary.detectedHeight * 100) / 100} mm
            </span>
          </div>
          <div className="dialog-row">
            <span className="k">Layers</span>
            <span>{summary.layerCount}</span>
          </div>
          <div className="dialog-row">
            <span className="k">Paths</span>
            <span>{summary.pathCount}</span>
          </div>
          {summary.colors.length > 0 && (
            <div className="dialog-row" style={{ alignItems: "center" }}>
              <span className="k">Colors</span>
              <div className="dialog-colors">
                {summary.colors.map((c) => (
                  <span key={c} className="dialog-color-chip" style={{ background: c }} title={c} />
                ))}
              </div>
            </div>
          )}

          {summary.unsupportedCount > 0 && (
            <div className="dialog-warning">
              {summary.unsupportedCount} SVG element{summary.unsupportedCount === 1 ? "" : "s"} could not be
              converted to printable geometry (text, images, or stroke-only shapes are not yet supported) and
              {summary.unsupportedCount === 1 ? " was" : " were"} skipped.
            </div>
          )}

          {thinFeatureWarnings.length > 0 && (
            <div className="dialog-warning">
              {thinFeatureWarnings.length} detail{thinFeatureWarnings.length === 1 ? "" : "s"} in this file
              {thinFeatureWarnings.length === 1 ? " is" : " are"} as narrow as {narrowestThinFeatureMM.toFixed(2)}mm
              at this size — thinner than a standard 0.4mm nozzle can reliably print. If this matters, cancel and
              re-import at a larger scale, or size up the artboard/print bed after importing; a too-thin detail can
              also be selected and thickened by hand from the warning banner once it's in the scene.
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <label className="radio-row">
              <input
                type="radio"
                name="import-mode"
                checked={mode === "layers"}
                onChange={() => setMode("layers")}
              />
              <span>
                <div className="radio-title">Import as layers</div>
                <div className="radio-desc">Preserve SVG groups and paths as separate, independently editable layers.</div>
              </span>
            </label>
            <label className="radio-row">
              <input
                type="radio"
                name="import-mode"
                checked={mode === "merge"}
                onChange={() => setMode("merge")}
              />
              <span>
                <div className="radio-title">Merge into one layer</div>
                <div className="radio-desc">Combine everything into a single flat shape with one color and depth.</div>
              </span>
            </label>
          </div>
        </div>
        <div className="dialog-footer">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => onConfirm(mode)}>
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
