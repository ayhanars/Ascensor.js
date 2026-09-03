import { useEffect, useRef, useState } from "react";
import { BED_PRESETS, beginGesture, endGesture, useSceneStore, type TrackedSceneSlice } from "../state/store";
import { collectShapeLayers, getLocalShapeBounds } from "../state/sceneUtils";
import { ToggleSwitch } from "./ToggleSwitch";
import { displayToMM, formatLength, mmToDisplay, UNIT_LABELS } from "../state/units";
import type { AlignMode, ShapeLayer, Units } from "../types";
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
 * A native color-swatch input, wired so the WHOLE picker interaction —
 * however many `input` events dragging inside the OS color wheel fires —
 * collapses into ONE undo step, the same way the range sliders below do
 * for a drag. Without this, each tiny drag tick inside the native picker
 * pushed its own history entry, so a single Ctrl+Z only undid the very
 * last (usually imperceptible) color increment — indistinguishable from
 * undo "not working" once you'd dragged across the picker at all.
 */
function ColorSwatchInput({
  value,
  onChange,
  className,
}: {
  /** Omit for an uncontrolled swatch (e.g. the multi-select "apply to
   * all" picker, which has no single current color to reflect). */
  value?: string;
  onChange: (color: string) => void;
  className?: string;
}) {
  const gesture = useRef<TrackedSceneSlice | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    // The native `change` event (distinct from the `input` event React's
    // onChange is actually bound to for this input type) fires exactly
    // once, when the picker is closed/committed — the real end of the
    // gesture.
    function onNativeChange() {
      if (gesture.current) {
        endGesture(gesture.current, true);
        gesture.current = null;
      }
    }
    el.addEventListener("change", onNativeChange);
    return () => el.removeEventListener("change", onNativeChange);
  }, []);

  return (
    <input
      ref={inputRef}
      className={className}
      type="color"
      {...(value !== undefined ? { value } : {})}
      onPointerDown={() => {
        if (!gesture.current) gesture.current = beginGesture();
      }}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        // Safety net in case a browser never fires a distinct native
        // `change` here — don't leave undo tracking paused forever.
        if (gesture.current) {
          endGesture(gesture.current, true);
          gesture.current = null;
        }
      }}
    />
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

/**
 * Applies `fn` to every id in `ids` as ONE undo step. Without this, an
 * "apply to all" edit — a multi-selection, or every shape inside a selected
 * group — calls the underlying store action once per shape, and since each
 * call is its own tracked `set()`, that pushes one history entry per shape
 * instead of one for the whole edit. A single Ctrl+Z then only reverts the
 * last shape touched — and because the field shown in the Inspector mirrors
 * the *first* target, not the last, that one undo often looks like it did
 * nothing at all. Reuses the same pause-mutate-resume gesture the range
 * sliders below already use for a drag.
 */
function applyToAll<T>(items: T[], fn: (item: T) => void) {
  const snapshot = beginGesture();
  for (const item of items) fn(item);
  endGesture(snapshot, items.length > 0);
}

/** Common magnet disc diameters, for the hole "diameter preset" picker. */
const MAGNET_DIAMETER_PRESETS_MM = [3, 4, 5, 6, 8, 10, 12];
/** Common magnet disc thicknesses, for the hole "thickness preset" picker. */
const MAGNET_THICKNESS_PRESETS_MM = [1, 1.5, 2, 3];
/** ISO 273 medium-series clearance hole diameters for metric screws. */
const SCREW_CLEARANCE_PRESETS_MM: { label: string; mm: number }[] = [
  { label: "M2", mm: 2.4 },
  { label: "M2.5", mm: 2.9 },
  { label: "M3", mm: 3.4 },
  { label: "M4", mm: 4.5 },
  { label: "M5", mm: 5.5 },
  { label: "M6", mm: 6.6 },
  { label: "M8", mm: 9 },
];
/** A thin-but-printable floor under a recessed pocket (~3 layers at a
 * typical 0.2mm layer height) — enough to hide a magnet without it showing
 * through, without needing so many layers the magnet's pull is blocked. */
const RECOMMENDED_FLOOR_MM = 0.6;

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
  const snapHoleToRecessedPocket = useSceneStore((s) => s.snapHoleToRecessedPocket);
  const [floorThickness, setFloorThickness] = useState(RECOMMENDED_FLOOR_MM);
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
                <ColorSwatchInput
                  className="color-swatch-input"
                  onChange={(color) => selection.forEach((id) => setLayerColor(id, color))}
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

          // Scales a shape (about its own local origin) so its raw bounding
          // box matches a real-world diameter — the same direct
          // scaleX/scaleY the Scale fields above already use, just solved
          // for a target size instead of read from a slider.
          const applyDiameterPreset = (target: ShapeLayer, diameterMM: number) => {
            const bounds = getLocalShapeBounds(target);
            if (!bounds) return;
            const w = bounds.maxX - bounds.minX;
            const h = bounds.maxY - bounds.minY;
            if (w <= 0 || h <= 0) return;
            setLayerTransform(target.id, { scaleX: diameterMM / w, scaleY: diameterMM / h });
          };

          return (
            <>
              <div className="inspector-section">
                <div className="inspector-section-title">Color{isBatch ? " (all shapes in group)" : ""}</div>
                <div className="color-field">
                  <ColorSwatchInput
                    className="color-swatch-input"
                    value={display.color}
                    onChange={(color) => targets.forEach((t) => setLayerColor(t.id, color))}
                  />
                  <input
                    className="field-input"
                    value={display.color}
                    onChange={(e) => {
                      const color = e.target.value;
                      applyToAll(targets.map((t) => t.id), (id) => setLayerColor(id, color));
                    }}
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
                  onChange={(v) => applyToAll(targets.map((t) => t.id), (id) => setExtrusionDepth(id, v))}
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
                    onChange={(v) => applyToAll(targets.map((t) => t.id), (id) => setCornerRadius(id, v))}
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
                          onChange={(v) => applyToAll(targets.map((t) => t.id), (id) => setBevelTop(id, v))}
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
                          onChange={(v) => applyToAll(targets.map((t) => t.id), (id) => setBevelBottom(id, v))}
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
                  onChange={() => {
                    const next = !display.isHole;
                    applyToAll(targets.map((t) => t.id), (id) => setIsHole(id, next));
                  }}
                  title="Cuts this shape's volume out of whatever it overlaps, instead of printing it as its own solid — for magnet wells, screw holes, etc."
                />
                <p className="hole-hint">
                  Cuts out of whatever it overlaps instead of adding material — for magnet wells, screw holes, etc.
                  Shown in red while editing; never printed as its own solid.
                </p>

                {display.isHole && (
                  <>
                    <div className="field-row">
                      <span className="field-label">Diameter</span>
                      <select
                        className="field-input"
                        value=""
                        onChange={(e) => {
                          const mm = parseFloat(e.target.value);
                          if (!Number.isFinite(mm)) return;
                          applyToAll(targets, (t) => applyDiameterPreset(t, mm));
                        }}
                      >
                        <option value="" disabled>
                          Common sizes…
                        </option>
                        <optgroup label="Magnets">
                          {MAGNET_DIAMETER_PRESETS_MM.map((d) => (
                            <option key={`mag-${d}`} value={d}>
                              {d} mm
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Screw clearance">
                          {SCREW_CLEARANCE_PRESETS_MM.map(({ label, mm }) => (
                            <option key={label} value={mm}>
                              {label} ({mm} mm)
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                    <div className="field-row">
                      <span className="field-label">Thickness</span>
                      <select
                        className="field-input"
                        value=""
                        onChange={(e) => {
                          const mm = parseFloat(e.target.value);
                          if (!Number.isFinite(mm)) return;
                          applyToAll(targets, (t) => setExtrusionDepth(t.id, mm));
                        }}
                      >
                        <option value="" disabled>
                          Common sizes…
                        </option>
                        {MAGNET_THICKNESS_PRESETS_MM.map((t) => (
                          <option key={t} value={t}>
                            {t} mm
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field-row">
                      <NumberField
                        label={`Floor left under it (${unitLabel})`}
                        value={floorThickness}
                        min={0}
                        step={0.05}
                        unit={unit}
                        onChange={setFloorThickness}
                      />
                    </div>
                    <button
                      className="btn"
                      style={{ width: "100%" }}
                      onClick={() => applyToAll(targets, (t) => snapHoleToRecessedPocket(t.id, floorThickness))}
                      title="Sinks this hole so it stops just short of the bottom of whatever it overlaps, leaving the floor thickness above as solid material — the usual way to embed a magnet flush and invisible instead of punching all the way through."
                    >
                      Snap to recessed pocket
                    </button>
                    <p className="hole-hint">
                      Recommended floor: {formatLength(RECOMMENDED_FLOOR_MM, unit)} (~3 layers at a typical 0.2mm
                      layer height) — thin enough to hide the magnet, thick enough to print cleanly.
                    </p>
                  </>
                )}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
