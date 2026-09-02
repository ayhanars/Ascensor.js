import { useState } from "react";
import type { ImportSummary } from "../types";

interface Props {
  summary: ImportSummary;
  onCancel: () => void;
  onConfirm: (mode: "layers" | "merge") => void;
}

export function ImportDialog({ summary, onCancel, onConfirm }: Props) {
  const [mode, setMode] = useState<"layers" | "merge">("layers");

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
