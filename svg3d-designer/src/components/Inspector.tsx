import { useRef, useState } from "react";
import { BED_PRESETS, beginGesture, endGesture, useSceneStore, type TrackedSceneSlice } from "../state/store";
import { collectShapeLayers } from "../state/sceneUtils";
import { ToggleSwitch } from "./ToggleSwitch";
import { displayToMM, formatLength, mmToDisplay, UNIT_LABELS } from "../state/units";
import type { AlignMode, Units } from "../types";
import {
  AlignBottomIcon,
  AlignCenterHIcon,
  AlignLeftIcon,
  AlignMiddleVIcon,
  AlignRightIcon,
  AlignTopIcon,
} from "./icons";

/** Left/center/right + top/middle/bottom align buttons — aligns to the
 * artboard for a single selection, or the selection's own combined
 * bounding box for several, matching Figma. */
function AlignRow() {
  const alignSelection = useSceneStore((s) => s.alignSelection);
  const buttons: { mode: AlignMode; title: string; Icon: typeof AlignLeftIcon }[] = [
    { mode: "left", title: "Align left", Icon: AlignLeftIcon },
    { mode: "centerH", title: "Align center (horizontal)", Icon: AlignCenterHIcon },
    { mode: "right", title: "Align right", Icon: AlignRightIcon },
    { mode: "top", title: "Align top", Icon: AlignTopIcon },
    { mode: "middleV", title: "Align middle (vertical)", Icon: AlignMiddleVIcon },
    { mode: "bottom", title: "Align bottom", Icon: AlignBottomIcon },
  ];
  return (
    <div className="align-row">
      {buttons.map(({ mode, title, Icon }) => (
        <button key={mode} className="icon-btn align-btn" title={title} onClick={() => alignSelection(mode)}>
          <Icon />
        </button>
      ))}
    </div>
  );
}

/**
 * A controlled number input that's still editable. A plain
 * `value={someNumber}` input fights the user: clearing the field to type a
 * new value (e.g. replacing "1" with "30") produces an empty string, which
 * fails validation, so the onChange is skipped — and React then snaps the
 * DOM value straight back to the old number on the next render, making it
 * look impossible to clear. While focused, this shows the user's raw typed
 * text instead of the committed value, and only reconciles with the real
 * value (or reverts, if what's left isn't a valid number) on blur.
 */
function NumberField({
  label,
  value,
  onChange,
  step = 0.1,
  min,
  style,
  unit,
}: {
  label?: string;
  /** Always mm when `unit` is set — the field itself does the mm <-> display
   * conversion, so every caller keeps working in the store's real unit. */
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  style?: React.CSSProperties;
  /** When set, `value`/`onChange` are treated as mm and shown/typed in this
   * unit instead — for physical lengths only, never Scale or Rotation. */
  unit?: Units;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const displayValue = unit ? mmToDisplay(value, unit) : value;
  const displayMin = unit && min !== undefined ? mmToDisplay(min, unit) : min;

  return (
    <div className="field-grid-item" style={style}>
      {label && <span className="field-caption">{label}</span>}
      <input
        className="field-input"
        type="number"
        step={step}
        min={displayMin}
        value={draft ?? (Number.isFinite(displayValue) ? round(displayValue) : 0)}
        onChange={(e) => {
          setDraft(e.target.value);
          const typed = parseFloat(e.target.value);
          if (Number.isNaN(typed)) return;
          const mm = unit ? displayToMM(typed, unit) : typed;
          onChange(min !== undefined ? Math.max(min, mm) : mm);
        }}
        onBlur={() => setDraft(null)}
      />
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function Inspector() {
  const docSettings = useSceneStore((s) => s.document);
  const unit = docSettings.units;
  const unitLabel = UNIT_LABELS[unit];
  const setBed = useSceneStore((s) => s.setBed);
  const setDocumentName = useSceneStore((s) => s.setDocumentName);
  const setUnits = useSceneStore((s) => s.setUnits);
  const layers = useSceneStore((s) => s.layers);
  const selection = useSceneStore((s) => s.selection);
  const setLayerColor = useSceneStore((s) => s.setLayerColor);
  const setLayerTransform = useSceneStore((s) => s.setLayerTransform);
  const setExtrusionDepth = useSceneStore((s) => s.setExtrusionDepth);
  const setCornerRadius = useSceneStore((s) => s.setCornerRadius);
  const setBevelBottom = useSceneStore((s) => s.setBevelBottom);
  const setBevelTop = useSceneStore((s) => s.setBevelTop);
  const setIsHole = useSceneStore((s) => s.setIsHole);
  const setLayerZ = useSceneStore((s) => s.setLayerZ);
  const radiusGesture = useRef<TrackedSceneSlice | null>(null);
  const bevelBottomGesture = useRef<TrackedSceneSlice | null>(null);
  const bevelTopGesture = useRef<TrackedSceneSlice | null>(null);
  const fitDocumentToSelection = useSceneStore((s) => s.fitDocumentToSelection);
  const matchDocumentToBed = useSceneStore((s) => s.matchDocumentToBed);
  const mergeLayers = useSceneStore((s) => s.mergeLayers);
  const groupSelection = useSceneStore((s) => s.groupSelection);
  const ungroupSelection = useSceneStore((s) => s.ungroupSelection);

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
              <select
                className="select-input field-input"
                value={docSettings.units}
                onChange={(e) => setUnits(e.target.value as Units)}
              >
                <option value="mm">Millimeters (mm)</option>
                <option value="cm">Centimeters (cm)</option>
                <option value="in">Inches (in)</option>
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
              <NumberField label="Width" value={docSettings.bed.width} min={1} unit={unit} onChange={(v) => setBed({ width: v })} />
              <NumberField label="Depth" value={docSettings.bed.depth} min={1} unit={unit} onChange={(v) => setBed({ depth: v })} />
              <NumberField label="Height" value={docSettings.bed.height} min={1} unit={unit} onChange={(v) => setBed({ height: v })} />
            </div>
          </div>

          <div className="inspector-section">
            <div className="inspector-section-title">Artboard</div>
            <div className="dialog-row">
              <span className="k">Width</span>
              <span>{formatLength(docSettings.widthMM, unit)} {unitLabel}</span>
            </div>
            <div className="dialog-row">
              <span className="k">Height</span>
              <span>{formatLength(docSettings.heightMM, unit)} {unitLabel}</span>
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

          <div className="inspector-section" style={{ marginTop: 10 }}>
            <div className="inspector-section-title">Align</div>
            <AlignRow />
          </div>

          <button
            className="btn"
            style={{ width: "100%", marginTop: 4 }}
            onClick={() => groupSelection()}
            title="Nest the selection under a new group, keeping each shape independently editable (Cmd/Ctrl+G)"
          >
            Group selection
          </button>
          <button
            className="btn primary"
            style={{ width: "100%", marginTop: 6 }}
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
            <>
              <button
                className="btn"
                style={{ width: "100%", marginTop: 8 }}
                onClick={() => ungroupSelection()}
                title="Dissolve this group, keeping its contents in place (Cmd/Ctrl+Shift+G)"
              >
                Ungroup
              </button>
              <button
                className="btn"
                style={{ width: "100%", marginTop: 6 }}
                onClick={() => mergeLayers([layer.id])}
                title="Combine everything in this group into one flat shape (Cmd/Ctrl+E)"
              >
                Flatten group
              </button>
            </>
          )}
        </div>

        <div className="inspector-section">
          <div className="inspector-section-title">Align to artboard</div>
          <AlignRow />
        </div>

        <div className="inspector-section">
          <div className="inspector-section-title">Transform</div>
          <div className="field-grid-3">
            <NumberField
              label={`X (${unitLabel})`}
              value={layer.transform.x}
              unit={unit}
              onChange={(v) => setLayerTransform(layer.id, { x: v })}
            />
            <NumberField
              label={`Y (${unitLabel})`}
              value={layer.transform.y}
              unit={unit}
              onChange={(v) => setLayerTransform(layer.id, { y: v })}
            />
            <NumberField
              label={`Z (${unitLabel})`}
              value={layer.transform.z}
              min={0}
              unit={unit}
              onChange={(v) => setLayerZ(layer.id, v)}
            />
          </div>
          <button
            className="btn"
            style={{ width: "100%", marginBottom: 6 }}
            onClick={() => setLayerZ(layer.id, 0)}
            title="Set Z back to 0 — sitting directly on the print bed"
          >
            Drop to bed
          </button>
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
          <NumberField
            label="Rotation (deg)"
            value={layer.transform.rotation}
            step={1}
            style={{ marginBottom: 6 }}
            onChange={(v) => setLayerTransform(layer.id, { rotation: v })}
          />
          <button className="btn" style={{ width: "100%" }} onClick={fitDocumentToSelection}>
            Fit artboard to selection
          </button>
        </div>

        {(() => {
          // A group has no shape properties of its own, but forcing the
          // user to hunt down each nested shape individually just to set
          // one color or depth isn't it either — editing a selected group
          // applies to every shape inside it at once, the same "apply to
          // all" pattern the multi-select panel already uses for color.
          const targets = layer.type === "shape" ? [layer] : collectShapeLayers(layers, layer.id);
          const display = targets[0];
          if (!display) return null;
          const isBatch = layer.type === "group";

          return (
            <>
              <div className="inspector-section">
                <div className="inspector-section-title">Color{isBatch ? " (all shapes in group)" : ""}</div>
                <div className="color-field">
                  <input
                    className="color-swatch-input"
                    type="color"
                    value={display.color}
                    onChange={(e) => targets.forEach((t) => setLayerColor(t.id, e.target.value))}
                  />
                  <input
                    className="field-input"
                    value={display.color}
                    onChange={(e) => targets.forEach((t) => setLayerColor(t.id, e.target.value))}
                  />
                </div>
              </div>

              <div className="inspector-section">
                <div className="inspector-section-title">Extrusion{isBatch ? " (all shapes in group)" : ""}</div>
                <NumberField
                  label={`Depth (${unitLabel})`}
                  value={display.extrusionDepth}
                  min={0.05}
                  unit={unit}
                  onChange={(v) => targets.forEach((t) => setExtrusionDepth(t.id, v))}
                />
              </div>

              <div className="inspector-section">
                <div className="inspector-section-title">Corners{isBatch ? " (all shapes in group)" : ""}</div>
                <div className="field-row">
                  <span className="field-label">Radius ({unitLabel})</span>
                  <input
                    className="field-input"
                    type="range"
                    min={0}
                    max={20}
                    step={0.1}
                    value={Math.min(20, display.cornerRadius)}
                    onPointerDown={() => {
                      radiusGesture.current = beginGesture();
                    }}
                    onPointerUp={() => {
                      if (radiusGesture.current) {
                        endGesture(radiusGesture.current, true);
                        radiusGesture.current = null;
                      }
                    }}
                    onChange={(e) =>
                      targets.forEach((t) => setCornerRadius(t.id, parseFloat(e.target.value)))
                    }
                    style={{ flex: "1 1 auto" }}
                  />
                  <NumberField
                    value={display.cornerRadius}
                    min={0}
                    unit={unit}
                    style={{ flex: "0 0 60px" }}
                    onChange={(v) => targets.forEach((t) => setCornerRadius(t.id, v))}
                  />
                </div>
              </div>

              <div className="inspector-section">
                <div className="inspector-section-title">Edge bevel{isBatch ? " (all shapes in group)" : ""}</div>
                {(() => {
                  const bevelMax = Math.max(0.5, display.extrusionDepth / 2);
                  return (
                    <>
                      <div className="field-row">
                        <span className="field-label">Top ({unitLabel})</span>
                        <input
                          className="field-input"
                          type="range"
                          min={0}
                          max={bevelMax}
                          step={0.05}
                          value={Math.min(bevelMax, display.bevelTop)}
                          onPointerDown={() => {
                            bevelTopGesture.current = beginGesture();
                          }}
                          onPointerUp={() => {
                            if (bevelTopGesture.current) {
                              endGesture(bevelTopGesture.current, true);
                              bevelTopGesture.current = null;
                            }
                          }}
                          onChange={(e) => targets.forEach((t) => setBevelTop(t.id, parseFloat(e.target.value)))}
                          style={{ flex: "1 1 auto" }}
                        />
                        <NumberField
                          value={display.bevelTop}
                          min={0}
                          step={0.05}
                          unit={unit}
                          style={{ flex: "0 0 60px" }}
                          onChange={(v) => targets.forEach((t) => setBevelTop(t.id, v))}
                        />
                      </div>
                      <div className="field-row">
                        <span className="field-label">Bottom ({unitLabel})</span>
                        <input
                          className="field-input"
                          type="range"
                          min={0}
                          max={bevelMax}
                          step={0.05}
                          value={Math.min(bevelMax, display.bevelBottom)}
                          onPointerDown={() => {
                            bevelBottomGesture.current = beginGesture();
                          }}
                          onPointerUp={() => {
                            if (bevelBottomGesture.current) {
                              endGesture(bevelBottomGesture.current, true);
                              bevelBottomGesture.current = null;
                            }
                          }}
                          onChange={(e) => targets.forEach((t) => setBevelBottom(t.id, parseFloat(e.target.value)))}
                          style={{ flex: "1 1 auto" }}
                        />
                        <NumberField
                          value={display.bevelBottom}
                          min={0}
                          step={0.05}
                          unit={unit}
                          style={{ flex: "0 0 60px" }}
                          onChange={(v) => targets.forEach((t) => setBevelBottom(t.id, v))}
                        />
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="inspector-section">
                <div className="inspector-section-title">Negative space{isBatch ? " (all shapes in group)" : ""}</div>
                <ToggleSwitch
                  label="Use as hole"
                  checked={display.isHole}
                  onChange={() => targets.forEach((t) => setIsHole(t.id, !display.isHole))}
                  title="Cuts this shape's volume out of whatever it overlaps, instead of printing it as its own solid — for magnet wells, screw holes, etc."
                />
                <p className="hole-hint">
                  Cuts out of whatever it overlaps instead of adding material — for magnet wells, screw holes, etc.
                  Shown in red while editing; never printed as its own solid.
                </p>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
