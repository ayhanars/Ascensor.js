import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { beginGesture, endGesture, useSceneStore, type TrackedSceneSlice } from "../state/store";
import { isEffectivelyLocked } from "../state/sceneUtils";
import { formatLength, UNIT_LABELS } from "../state/units";

// A minimum floor for the slider's usable range, for the degenerate case of
// a bed configured with ~0 height. Deliberately NOT derived from the
// layer's current z: a range that grows with its own value creates a
// feedback loop mid-drag (each pixel of motion nudges z up, which raises
// the max, which lets the same motion nudge z up again) that runs away
// well past the bed height. Values already above the bed (typed into the
// Inspector's unbounded Z field) still show fine — just pinned to the top
// of the track — the same way any range input clips an out-of-range value.
const Z_SLIDER_MIN_RANGE_MM = 50;

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * A control bar docked to the right edge of the 3D viewport itself (not the
 * Inspector panel on the far right of the whole app) for the two things
 * that are awkward to dial in with a plain number field: how high an object
 * sits above the bed, and spinning it around freely. Replaces the old
 * in-scene rotate ring, which computed each drag step as a one-shot delta
 * from the drag's start angle — correct for less than half a turn, but it
 * silently snapped backward by a full turn the moment a drag crossed the
 * atan2 seam behind the object, which is exactly what made continuous
 * spinning "not work as expected". This dial instead accumulates the delta
 * between consecutive pointer samples (normalized into (-180, 180] before
 * adding), so any number of full turns in either direction stays smooth.
 */
export function AxisSideBar() {
  const layers = useSceneStore((s) => s.layers);
  const selection = useSceneStore((s) => s.selection);
  const bed = useSceneStore((s) => s.document.bed);
  const unit = useSceneStore((s) => s.document.units);
  const setLayerZ = useSceneStore((s) => s.setLayerZ);
  const setLayerTransform = useSceneStore((s) => s.setLayerTransform);

  const dialRef = useRef<HTMLDivElement>(null);
  const zGesture = useRef<TrackedSceneSlice | null>(null);
  const rotateDrag = useRef<{
    id: string;
    lastAngle: number;
    cumulative: number;
    snapshot: TrackedSceneSlice;
    moved: boolean;
  } | null>(null);

  const selectedId = selection.length === 1 ? selection[0] : null;
  const layer = selectedId ? layers[selectedId] : null;
  const locked = selectedId ? isEffectivelyLocked(layers, selectedId) : false;

  function angleFromClient(clientX: number, clientY: number): number | null {
    const el = dialRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // atan2 with screen-space Y (grows downward) already sweeps clockwise
    // as the angle increases, matching the Inspector's "rotate clockwise"
    // +45 button — no extra sign flip needed to keep the two consistent.
    return (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
  }

  function onDialPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!layer) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const angle = angleFromClient(e.clientX, e.clientY);
    if (angle === null) return;
    rotateDrag.current = {
      id: layer.id,
      lastAngle: angle,
      cumulative: layer.transform.rotation,
      snapshot: beginGesture(),
      moved: false,
    };
  }

  function onDialPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = rotateDrag.current;
    if (!drag) return;
    const angle = angleFromClient(e.clientX, e.clientY);
    if (angle === null) return;
    let delta = angle - drag.lastAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    drag.lastAngle = angle;
    if (delta === 0) return;
    drag.cumulative += delta;
    drag.moved = true;
    setLayerTransform(drag.id, { rotation: drag.cumulative });
  }

  function onDialPointerUp() {
    const drag = rotateDrag.current;
    rotateDrag.current = null;
    if (!drag) return;
    endGesture(drag.snapshot, drag.moved);
  }

  if (!layer || locked) return null;

  const zMax = Math.max(bed.height, Z_SLIDER_MIN_RANGE_MM);
  const rotationDisplay = Math.round(normalizeDeg(layer.transform.rotation));

  return (
    <div className="axis-side-bar">
      <div className="axis-side-bar-group">
        <div className="axis-side-bar-label">Height</div>
        <div className="z-slider-wrap">
          <input
            className="z-slider"
            type="range"
            min={0}
            max={zMax}
            step={0.1}
            value={Math.min(zMax, layer.transform.z)}
            onPointerDown={() => {
              zGesture.current = beginGesture();
            }}
            onPointerUp={() => {
              if (zGesture.current) {
                endGesture(zGesture.current, true);
                zGesture.current = null;
              }
            }}
            onChange={(e) => setLayerZ(layer.id, parseFloat(e.target.value))}
          />
        </div>
        <div className="axis-side-bar-value">
          {formatLength(layer.transform.z, unit)} {UNIT_LABELS[unit]}
        </div>
      </div>

      <div className="axis-side-bar-group">
        <div className="axis-side-bar-label">Rotate</div>
        <div
          ref={dialRef}
          className="rotate-dial"
          onPointerDown={onDialPointerDown}
          onPointerMove={onDialPointerMove}
          onPointerUp={onDialPointerUp}
          title="Drag anywhere on the dial to spin the object freely, any number of turns"
        >
          <div className="rotate-dial-sweep" style={{ transform: `rotate(${layer.transform.rotation}deg)` }}>
            <div className="rotate-dial-handle" />
          </div>
        </div>
        <div className="axis-side-bar-value">{rotationDisplay}°</div>
      </div>
    </div>
  );
}
