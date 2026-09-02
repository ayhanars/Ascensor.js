import { useRef } from "react";
import { BED_PRESETS, beginGesture, endGesture, useSceneStore, type TrackedSceneSlice } from "../state/store";

function NumberField({
  label,
  value,
  onChange,
  step = 0.1,
  min,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <div className="field-grid-item">
      <span className="field-caption">{label}</span>
      <input
        className="field-input"
        type="number"
        step={step}
        min={min}
        value={Number.isFinite(value) ? round(value) : 0}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
      />
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function Inspector() {
  const docSettings = useSceneStore((s) => s.document);
  const setBed = useSceneStore((s) => s.setBed);
  const setDocumentName = useSceneStore((s) => s.setDocumentName);
  const layers = useSceneStore((s) => s.layers);
  const selection = useSceneStore((s) => s.selection);
  const setLayerColor = useSceneStore((s) => s.setLayerColor);
  const setLayerTransform = useSceneStore((s) => s.setLayerTransform);
  const setExtrusionDepth = useSceneStore((s) => s.setExtrusionDepth);
  const setCornerRadius = useSceneStore((s) => s.setCornerRadius);
  const radiusGesture = useRef<TrackedSceneSlice | null>(null);
  const fitDocumentToSelection = useSceneStore((s) => s.fitDocumentToSelection);
  const matchDocumentToBed = useSceneStore((s) => s.matchDocumentToBed);
  const mergeLayers = useSceneStore((s) => s.mergeLayers);

  if (selection.length === 0) {
    const preset = BED_PRESETS.find(
      (p) => p.width === docSettings.bed.width && p.depth === docSettings.bed.depth,
    );
    return (
      <div className="sidebar sidebar-right">
        <div className="sidebar-header">Document</div>
        <div className="inspector">
          <div className="inspector-section">
            <div className="inspector-section-title">Project</div>
            <div className="field-row">
              <span className="field-label">Name</span>
              <input
                className="field-input"
                value={docSettings.name}
                onChange={(e) => setDocumentName(e.target.value)}
              />
            </div>
            <div className="field-row">
              <span className="field-label">Units</span>
              <select className="select-input field-input" value={docSettings.units} disabled>
                <option value="mm">Millimeters (mm)</option>
              </select>
            </div>
          </div>

          <div className="inspector-section">
            <div className="inspector-section-title">Print bed</div>
            <div className="field-row">
              <span className="field-label">Preset</span>
              <select
                className="select-input field-input"
                value={preset?.name ?? "Custom"}
                onChange={(e) => {
                  const p = BED_PRESETS.find((b) => b.name === e.target.value);
                  if (p) setBed(p);
                }}
              >
                {BED_PRESETS.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-grid-3">
              <NumberField label="Width" value={docSettings.bed.width} min={1} onChange={(v) => setBed({ width: v })} />
              <NumberField label="Depth" value={docSettings.bed.depth} min={1} onChange={(v) => setBed({ depth: v })} />
              <NumberField label="Height" value={docSettings.bed.height} min={1} onChange={(v) => setBed({ height: v })} />
            </div>
          </div>

          <div className="inspector-section">
            <div className="inspector-section-title">Artboard</div>
            <div className="dialog-row">
              <span className="k">Width</span>
              <span>{round(docSettings.widthMM)} mm</span>
            </div>
            <div className="dialog-row">
              <span className="k">Height</span>
              <span>{round(docSettings.heightMM)} mm</span>
            </div>
            <button className="btn" style={{ width: "100%", marginTop: 6 }} onClick={matchDocumentToBed}>
              Match print bed size
            </button>
          </div>

          <p className="empty-inspector">Select a layer on the canvas or in the Layers panel to edit its properties.</p>
        </div>
      </div>
    );
  }

  if (selection.length > 1) {
    const selLayers = selection.map((id) => layers[id]).filter(Boolean);
    const allShapes = selLayers.every((l) => l!.type === "shape");
    return (
      <div className="sidebar sidebar-right">
        <div className="sidebar-header">Properties</div>
        <div className="inspector">
          <div className="inspector-section-title">{selection.length} objects selected</div>
          {allShapes && (
            <div className="field-row" style={{ marginTop: 8 }}>
              <span className="field-label">Color</span>
              <div className="color-field field-input" style={{ height: 26 }}>
                <input
                  className="color-swatch-input"
                  type="color"
                  onChange={(e) => selection.forEach((id) => setLayerColor(id, e.target.value))}
                />
                <span style={{ color: "var(--text-faint)" }}>Apply to all</span>
              </div>
            </div>
          )}
          <button
            className="btn primary"
            style={{ width: "100%", marginTop: 10 }}
            onClick={() => mergeLayers(selection)}
            title="Combine the selected layers into a single flat shape (Cmd/Ctrl+E)"
          >
            Merge layers
          </button>
          <button className="btn" style={{ width: "100%", marginTop: 6 }} onClick={fitDocumentToSelection}>
            Fit artboard to selection
          </button>
        </div>
      </div>
    );
  }

  const layer = layers[selection[0]];
  if (!layer) return <div className="sidebar sidebar-right" />;

  return (
    <div className="sidebar sidebar-right">
      <div className="sidebar-header">Properties</div>
      <div className="inspector">
        <div className="inspector-section">
          <div className="inspector-section-title">{layer.type === "group" ? "Group" : "Shape"}</div>
          <div className="field-row">
            <span className="field-label">Name</span>
            <input
              className="field-input"
              value={layer.name}
              onChange={(e) =>
                useSceneStore.getState().renameLayer(layer.id, e.target.value)
              }
            />
          </div>
          {layer.type === "group" && (
            <button
              className="btn"
              style={{ width: "100%", marginTop: 8 }}
              onClick={() => mergeLayers([layer.id])}
              title="Combine everything in this group into one flat shape (Cmd/Ctrl+E)"
            >
              Flatten group
            </button>
          )}
        </div>

        <div className="inspector-section">
          <div className="inspector-section-title">Transform</div>
          <div className="field-grid-2">
            <NumberField
              label="X (mm)"
              value={layer.transform.x}
              onChange={(v) => setLayerTransform(layer.id, { x: v })}
            />
            <NumberField
              label="Y (mm)"
              value={layer.transform.y}
              onChange={(v) => setLayerTransform(layer.id, { y: v })}
            />
          </div>
          <div className="field-grid-2">
            <NumberField
              label="Scale X"
              value={layer.transform.scaleX}
              step={0.05}
              onChange={(v) => setLayerTransform(layer.id, { scaleX: v })}
            />
            <NumberField
              label="Scale Y"
              value={layer.transform.scaleY}
              step={0.05}
              onChange={(v) => setLayerTransform(layer.id, { scaleY: v })}
            />
          </div>
          <div className="field-grid-item" style={{ marginBottom: 6 }}>
            <span className="field-caption">Rotation (deg)</span>
            <input
              className="field-input"
              type="number"
              step={1}
              value={round(layer.transform.rotation)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!Number.isNaN(v)) setLayerTransform(layer.id, { rotation: v });
              }}
            />
          </div>
          <button className="btn" style={{ width: "100%" }} onClick={fitDocumentToSelection}>
            Fit artboard to selection
          </button>
        </div>

        {layer.type === "shape" && (
          <>
            <div className="inspector-section">
              <div className="inspector-section-title">Color</div>
              <div className="color-field">
                <input
                  className="color-swatch-input"
                  type="color"
                  value={layer.color}
                  onChange={(e) => setLayerColor(layer.id, e.target.value)}
                />
                <input
                  className="field-input"
                  value={layer.color}
                  onChange={(e) => setLayerColor(layer.id, e.target.value)}
                />
              </div>
            </div>

            <div className="inspector-section">
              <div className="inspector-section-title">Extrusion</div>
              <div className="field-grid-item">
                <span className="field-caption">Depth (mm)</span>
                <input
                  className="field-input"
                  type="number"
                  step={0.1}
                  min={0.05}
                  value={round(layer.extrusionDepth)}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!Number.isNaN(v)) setExtrusionDepth(layer.id, v);
                  }}
                />
              </div>
            </div>

            <div className="inspector-section">
              <div className="inspector-section-title">Corners</div>
              <div className="field-row">
                <span className="field-label">Radius (mm)</span>
                <input
                  className="field-input"
                  type="range"
                  min={0}
                  max={20}
                  step={0.1}
                  value={Math.min(20, layer.cornerRadius)}
                  onPointerDown={() => {
                    radiusGesture.current = beginGesture();
                  }}
                  onPointerUp={() => {
                    if (radiusGesture.current) {
                      endGesture(radiusGesture.current, true);
                      radiusGesture.current = null;
                    }
                  }}
                  onChange={(e) => setCornerRadius(layer.id, parseFloat(e.target.value))}
                  style={{ flex: "1 1 auto" }}
                />
                <input
                  className="field-input"
                  type="number"
                  step={0.1}
                  min={0}
                  value={round(layer.cornerRadius)}
                  style={{ flex: "0 0 60px" }}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!Number.isNaN(v)) setCornerRadius(layer.id, v);
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
