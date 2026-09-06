import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
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

// Fraction of the dial's radius, measured from its center, past which a
// pointer-down grabs the outer ring (roll/Z) instead of the inner ball
// (yaw+pitch) — matches the ring drawn in CSS (.rotate-dial-ring).
const OUTER_RING_THRESHOLD = 0.68;

// Degrees of yaw/pitch per pixel of drag inside the inner ball. Tuned so a
// drag across the whole inner area covers a bit more than a quarter turn —
// slower than the outer ring's 1:1 angle tracking, since small pixel moves
// here cross two axes' worth of rotation at once.
const ORBIT_DEG_PER_PX = 0.5;

const WORLD_X = new THREE.Vector3(1, 0, 0);
const WORLD_Y = new THREE.Vector3(0, 1, 0);
// Matches applyLayerTransform's own Euler order in extrude.ts — rotationX/
// rotationY/rotation must round-trip through the identical order there and
// here, or a stored orientation would render differently than it was dragged.
const EULER_ORDER: THREE.EulerOrder = "XYZ";

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function eulerDegToQuaternion(rotationX: number, rotationY: number, rotation: number): THREE.Quaternion {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(rotationX),
    THREE.MathUtils.degToRad(rotationY),
    THREE.MathUtils.degToRad(rotation),
    EULER_ORDER,
  );
  return new THREE.Quaternion().setFromEuler(euler);
}

function quaternionToEulerDeg(q: THREE.Quaternion): { rotationX: number; rotationY: number; rotation: number } {
  const euler = new THREE.Euler().setFromQuaternion(q, EULER_ORDER);
  return {
    rotationX: THREE.MathUtils.radToDeg(euler.x),
    rotationY: THREE.MathUtils.radToDeg(euler.y),
    rotation: THREE.MathUtils.radToDeg(euler.z),
  };
}

type RotateDrag =
  | {
      mode: "roll";
      id: string;
      lastAngle: number;
      cumulative: number;
      snapshot: TrackedSceneSlice;
      moved: boolean;
    }
  | {
      mode: "orbit";
      id: string;
      lastX: number;
      lastY: number;
      quaternion: THREE.Quaternion;
      snapshot: TrackedSceneSlice;
      moved: boolean;
    };

/**
 * A control bar docked to the right edge of the 3D viewport itself (not the
 * Inspector panel on the far right of the whole app) for the things that are
 * awkward to dial in with a plain number field: how high an object sits
 * above the bed, and orienting it freely in 3D. The dial is a trackball —
 * dragging its outer ring spins the object around Z (roll), same
 * continuous-accumulation behavior the old single-axis dial had; dragging
 * its inner ball orbits it around world X and Y (pitch/yaw) together, like
 * spinning a real ball under a fingertip, so every axis is reachable from
 * one control without a separate mode switch.
 *
 * Roll keeps the old delta-accumulation approach (each pointer sample's
 * angle change, unwrapped into (-180, 180] before adding) because it
 * already handles continuous multi-turn spinning correctly. Orbit instead
 * composes incremental world-axis quaternions (premultiplied onto the
 * drag's running orientation, decomposed back to Euler for storage each
 * step) rather than driving rotationX/rotationY additively — plain
 * per-axis Euler dragging fights itself once an object is significantly
 * tilted (a horizontal drag no longer yaws it "on screen" the way it did
 * from upright), which is exactly the gimbal-lock-flavored wrong-direction
 * feel a real trackball avoids by always rotating around world axes.
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
  const rotateDrag = useRef<RotateDrag | null>(null);

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

  function fractionFromCenter(clientX: number, clientY: number): number | null {
    const el = dialRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dist = Math.hypot(clientX - cx, clientY - cy);
    return dist / (rect.width / 2);
  }

  function onDialPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!layer) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const fraction = fractionFromCenter(e.clientX, e.clientY);
    if (fraction === null) return;
    if (fraction >= OUTER_RING_THRESHOLD) {
      const angle = angleFromClient(e.clientX, e.clientY);
      if (angle === null) return;
      rotateDrag.current = {
        mode: "roll",
        id: layer.id,
        lastAngle: angle,
        cumulative: layer.transform.rotation,
        snapshot: beginGesture(),
        moved: false,
      };
    } else {
      rotateDrag.current = {
        mode: "orbit",
        id: layer.id,
        lastX: e.clientX,
        lastY: e.clientY,
        quaternion: eulerDegToQuaternion(layer.transform.rotationX, layer.transform.rotationY, layer.transform.rotation),
        snapshot: beginGesture(),
        moved: false,
      };
    }
  }

  function onDialPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = rotateDrag.current;
    if (!drag) return;

    if (drag.mode === "roll") {
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
      return;
    }

    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    if (dx === 0 && dy === 0) return;
    // Horizontal drag yaws around world Y, vertical drag pitches around
    // world X — both premultiplied (applied in world space, on top of the
    // object's existing orientation) rather than folded into its local
    // frame, which is what keeps the drag direction feeling consistent no
    // matter how the object is currently tilted.
    const yawQ = new THREE.Quaternion().setFromAxisAngle(WORLD_Y, THREE.MathUtils.degToRad(dx * ORBIT_DEG_PER_PX));
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(WORLD_X, THREE.MathUtils.degToRad(dy * ORBIT_DEG_PER_PX));
    drag.quaternion.premultiply(pitchQ).premultiply(yawQ);
    drag.moved = true;
    const euler = quaternionToEulerDeg(drag.quaternion);
    setLayerTransform(drag.id, euler);
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
  // Purely cosmetic tilt indicator for the inner ball — bounded within the
  // dial for any angle (unlike a linear mapping, which would run off the
  // edge past 90°), so it always reads as "which way is it tilted" rather
  // than a literal projection.
  const innerRadiusPx = 13;
  const tiltX = innerRadiusPx * Math.sin(THREE.MathUtils.degToRad(layer.transform.rotationY));
  const tiltY = innerRadiusPx * Math.sin(THREE.MathUtils.degToRad(layer.transform.rotationX));

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
          title="Drag the outer ring to roll (Z), drag the inner ball to orbit (yaw/pitch) — combine freely, any number of turns"
        >
          <div className="rotate-dial-sweep" style={{ transform: `rotate(${layer.transform.rotation}deg)` }}>
            <div className="rotate-dial-handle" />
          </div>
          <div className="rotate-dial-ball">
            <div className="rotate-dial-ball-dot" style={{ transform: `translate(${tiltX}px, ${tiltY}px)` }} />
          </div>
        </div>
        <div className="axis-side-bar-value">{rotationDisplay}°</div>
      </div>
    </div>
  );
}
