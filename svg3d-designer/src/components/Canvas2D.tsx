import { useEffect, useRef, useState } from "react";
import { beginGesture, endGesture, useSceneStore, type TrackedSceneSlice } from "../state/store";
import { boundsOverlap, getLayerWorldBounds, getTopLevelId, isAncestorOrSelf, stepIntoOnClick } from "../state/sceneUtils";
import { roundRegions } from "../geometry/roundCorners";
import type { Layer, ShapeRegion } from "../types";

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function regionsToPathD(regions: ShapeRegion[]): string {
  let d = "";
  for (const region of regions) {
    d += pointsToD(region.outer.points);
    for (const hole of region.holes) d += pointsToD(hole.points);
  }
  return d;
}

function pointsToD(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  let d = `M ${points[0].x} ${points[0].y} `;
  for (let i = 1; i < points.length; i++) d += `L ${points[i].x} ${points[i].y} `;
  return d + "Z ";
}

function fitView(width: number, height: number): ViewBox {
  const pad = Math.max(width, height) * 0.15 + 10;
  return { x: -pad, y: -pad, w: width + pad * 2, h: height + pad * 2 };
}

// Wheel/pinch zoom: multiplies deltaY into an exponential zoom factor. The
// old 0.001 needed several full pinch gestures or wheel notches to move
// the zoom level at all — this makes a single mouse-wheel notch (~deltaY
// 100) and a trackpad pinch both give a clearly visible step.
const ZOOM_SENSITIVITY = 0.003;
// Discrete zoom step for keyboard shortcuts (Z / Option+Z, +/-) — a single
// keypress should read as one clear zoom level change, like a zoom button.
const ZOOM_KEY_FACTOR = 1.4;
// How far the selection outline sits outside a shape's own edge — see the
// comment where it's used for why this can't just be 0.
const SELECTION_OUTLINE_MARGIN_MM = 0.6;

interface Props {
  resetSignal: number;
}

export function Canvas2D({ resetSignal }: Props) {
  const document_ = useSceneStore((s) => s.document);
  const layers = useSceneStore((s) => s.layers);
  const rootIds = useSceneStore((s) => s.rootIds);
  const selection = useSceneStore((s) => s.selection);
  const selectLayer = useSceneStore((s) => s.selectLayer);
  const setSelection = useSceneStore((s) => s.setSelection);
  const clearSelection = useSceneStore((s) => s.clearSelection);
  const setLayerTransform = useSceneStore((s) => s.setLayerTransform);
  const showGrid = useSceneStore((s) => s.showGrid);

  const svgRef = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState<ViewBox>(() => fitView(document_.widthMM, document_.heightMM));
  const vbRef = useRef(vb);
  vbRef.current = vb;
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [marqueeRect, setMarqueeRect] = useState<ViewBox | null>(null);

  const dragState = useRef<{
    mode: "pan" | "move" | "marquee" | null;
    startClientX: number;
    startClientY: number;
    startSvg: { x: number; y: number };
    startVb: ViewBox;
    moved: boolean;
    originals: Record<string, { x: number; y: number }>;
    preGestureSnapshot: TrackedSceneSlice | null;
    /** Marquee only: shift/cmd/ctrl held at drag start — adds to the
     * existing selection instead of replacing it, matching how a single
     * shift-click already behaves. */
    additive: boolean;
    /** move only: set when the click landed within the already-selected
     * group/shape — the gesture keeps the current selection (so if it
     * turns into a drag, the whole thing moves together, unchanged) and
     * only resolves as a "step one level deeper" click if pointerup finds
     * the pointer never actually moved. Without this, a click that landed
     * on a group's member would drill in immediately even when it was
     * really the start of a drag. */
    pendingDrillRawId: string | null;
  } | null>(null);

  // Space+drag pans, matching the 3D viewport's own convention — plain
  // drag on empty canvas is reserved for marquee-select instead.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" || e.repeat || isEditableTarget(e.target)) return;
      e.preventDefault();
      setSpaceHeld(true);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      setSpaceHeld(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    setVb(fitView(document_.widthMM, document_.heightMM));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  function clientToSvg(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const transformed = pt.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  }

  function zoomAround(center: { x: number; y: number }, factor: number) {
    setVb((old) => ({
      w: old.w * factor,
      h: old.h * factor,
      x: center.x - (center.x - old.x) * factor,
      y: center.y - (center.y - old.y) * factor,
    }));
  }

  // +/- mirror the universal browser-zoom convention (viewport-centered,
  // repeat allowed — holding the key zooms continuously, same as a
  // browser's own Cmd/Ctrl +/-). Cmd/Ctrl+0 resets to a true 100%.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault();
        const v = vbRef.current;
        zoomAround(
          { x: document_.widthMM / 2, y: document_.heightMM / 2 },
          document_.widthMM / v.w,
        );
        return;
      }
      if (e.metaKey || e.ctrlKey) return;
      // A factor < 1 shrinks the viewBox, i.e. zooms IN (higher zoom%).
      let factor = 0;
      if (e.key === "+" || e.key === "=") factor = 1 / ZOOM_KEY_FACTOR;
      else if (e.key === "-" || e.key === "_") factor = ZOOM_KEY_FACTOR;
      if (!factor) return;
      e.preventDefault();
      const v = vbRef.current;
      zoomAround({ x: v.x + v.w / 2, y: v.y + v.h / 2 }, factor);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document_.widthMM, document_.heightMM]);

  // Figma's zoom tool: holding Z (Option/Alt+Z for zoom-out) swaps the
  // cursor to a magnifying glass and does nothing by itself — a *click* on
  // the artboard while it's held zooms one step centered on exactly where
  // you clicked. This used to be an instant zoom fired straight off the Z
  // keydown, with no e.repeat guard: holding the key let the OS's own key
  // -repeat fire dozens of keydowns a second, each compounding the zoom
  // factor multiplicatively into an unusable runaway zoom in under a
  // second — which is what "zooms enormously" was.
  const [zoomToolArmed, setZoomToolArmed] = useState(false);
  const [zoomToolOut, setZoomToolOut] = useState(false);
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      // e.code, not e.key: with Option/Alt held, macOS remaps the letter
      // "z" produces (e.g. to "Ω") — matching on e.key meant that once the
      // user pressed Option to zoom out, the keyup for the Z key no longer
      // matched "z"/"Z" at all, so it never cleared zoomToolArmed and the
      // magnifier cursor + zoom-on-click stuck on permanently. e.code is
      // the physical key and is immune to modifier remapping (same reason
      // Space is matched by e.code elsewhere in this file).
      if (e.code === "KeyZ" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setZoomToolArmed(true);
      }
      if (e.key === "Alt") setZoomToolOut(true);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "KeyZ") setZoomToolArmed(false);
      if (e.key === "Alt") setZoomToolOut(false);
    }
    // Losing focus mid-hold (e.g. Alt-tabbing away) would otherwise leave
    // the tool stuck armed with no keyup ever coming.
    function onBlur() {
      setZoomToolArmed(false);
      setZoomToolOut(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  /** Handles a click while the zoom tool is armed; returns whether it did
   * (callers should skip their normal select/pan/move handling if so). */
  function tryZoomToolClick(e: React.PointerEvent): boolean {
    if (!zoomToolArmed) return false;
    // Without this, a click that lands on a shape (rather than empty
    // background) bubbles from the shape's own onPointerDown up to the
    // svg's, and both handlers call this — applying the zoom TWICE for
    // one click.
    e.stopPropagation();
    zoomAround(clientToSvg(e.clientX, e.clientY), zoomToolOut ? ZOOM_KEY_FACTOR : 1 / ZOOM_KEY_FACTOR);
    return true;
  }

  // A native (non-passive) listener is required here: React attaches wheel
  // handlers as passive by default, so e.preventDefault() inside a React
  // onWheel prop is silently ignored — the browser's own pinch-zoom keeps
  // firing on top of ours, which is exactly what zooms the whole page
  // instead of just the canvas, and makes both fight for smoothness.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      if (e.ctrlKey) {
        // Trackpad pinch (Mac reports it as wheel+ctrlKey) or Ctrl/Cmd+scroll: zoom.
        // ZOOM_SENSITIVITY tuned so a single mouse-wheel notch (~deltaY 100)
        // gives a clearly visible step and a trackpad pinch tracks the
        // fingers closely — the previous 0.001 needed several full pinch
        // gestures to change the zoom level at all.
        const factor = Math.exp(e.deltaY * ZOOM_SENSITIVITY);
        zoomAround(clientToSvg(e.clientX, e.clientY), factor);
      } else {
        // Plain scroll / two-finger trackpad swipe: pan, same as Figma.
        setVb((old) => {
          const scale = old.w / (svg!.clientWidth || 1);
          return { ...old, x: old.x + e.deltaX * scale, y: old.y + e.deltaY * scale };
        });
      }
    }

    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function beginPan(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = {
      mode: "pan",
      startClientX: e.clientX,
      startClientY: e.clientY,
      startSvg: clientToSvg(e.clientX, e.clientY),
      startVb: vb,
      moved: false,
      originals: {},
      preGestureSnapshot: null,
      additive: false,
      pendingDrillRawId: null,
    };
    setIsPanning(true);
  }

  function beginMarquee(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    const start = clientToSvg(e.clientX, e.clientY);
    dragState.current = {
      mode: "marquee",
      startClientX: e.clientX,
      startClientY: e.clientY,
      startSvg: start,
      startVb: vb,
      moved: false,
      originals: {},
      preGestureSnapshot: null,
      additive: e.shiftKey || e.metaKey || e.ctrlKey,
      pendingDrillRawId: null,
    };
    setMarqueeRect({ x: start.x, y: start.y, w: 0, h: 0 });
  }

  function beginMove(e: React.PointerEvent, ids: string[], pendingDrillRawId: string | null = null) {
    (e.target as Element).setPointerCapture(e.pointerId);
    const originals: Record<string, { x: number; y: number }> = {};
    for (const id of ids) {
      const layer = layers[id];
      if (layer) originals[id] = { x: layer.transform.x, y: layer.transform.y };
    }
    dragState.current = {
      mode: "move",
      startClientX: e.clientX,
      startClientY: e.clientY,
      startSvg: clientToSvg(e.clientX, e.clientY),
      startVb: vb,
      moved: false,
      originals,
      // The whole drag — however many pointermove events it produces —
      // should collapse into a single undo step.
      preGestureSnapshot: beginGesture(),
      additive: false,
      pendingDrillRawId,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragState.current;
    if (!drag) return;
    const dxClient = e.clientX - drag.startClientX;
    const dyClient = e.clientY - drag.startClientY;
    if (Math.abs(dxClient) + Math.abs(dyClient) > 2) drag.moved = true;

    if (drag.mode === "pan") {
      const cur = clientToSvg(e.clientX, e.clientY);
      const dx = cur.x - drag.startSvg.x;
      const dy = cur.y - drag.startSvg.y;
      setVb({ ...drag.startVb, x: drag.startVb.x - dx, y: drag.startVb.y - dy });
    } else if (drag.mode === "move") {
      const cur = clientToSvg(e.clientX, e.clientY);
      const dx = cur.x - drag.startSvg.x;
      const dy = cur.y - drag.startSvg.y;
      for (const [id, orig] of Object.entries(drag.originals)) {
        setLayerTransform(id, { x: orig.x + dx, y: orig.y + dy });
      }
    } else if (drag.mode === "marquee") {
      const cur = clientToSvg(e.clientX, e.clientY);
      setMarqueeRect({
        x: Math.min(drag.startSvg.x, cur.x),
        y: Math.min(drag.startSvg.y, cur.y),
        w: Math.abs(cur.x - drag.startSvg.x),
        h: Math.abs(cur.y - drag.startSvg.y),
      });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const drag = dragState.current;
    if (drag?.mode === "pan" && !drag.moved) clearSelection();
    if (drag?.mode === "move" && drag.preGestureSnapshot) {
      endGesture(drag.preGestureSnapshot, drag.moved);
      // The pointer never actually moved — this was a plain click on an
      // already-selected group/shape, not the start of a drag, so now
      // (and only now) resolve it as "step one level deeper" instead of
      // moving the current selection as-is.
      if (!drag.moved && drag.pendingDrillRawId) {
        const singleSelected = selection.length === 1 ? selection[0] : undefined;
        selectLayer(stepIntoOnClick(layers, singleSelected, drag.pendingDrillRawId), false);
      }
    }
    if (drag?.mode === "marquee") {
      if (drag.moved && marqueeRect) {
        const box = {
          minX: marqueeRect.x,
          minY: marqueeRect.y,
          maxX: marqueeRect.x + marqueeRect.w,
          maxY: marqueeRect.y + marqueeRect.h,
        };
        // Top-level items only — matches "Select All" (Cmd/Ctrl+A), which
        // also only ever selects rootIds, not individual nested children.
        const hitIds = rootIds.filter((id) => {
          const b = getLayerWorldBounds(layers, id);
          return b && boundsOverlap(b, box);
        });
        if (drag.additive) {
          setSelection([...new Set([...selection, ...hitIds])]);
        } else {
          setSelection(hitIds);
        }
      } else if (!drag.moved) {
        clearSelection();
      }
      setMarqueeRect(null);
    }
    dragState.current = null;
    setIsPanning(false);
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }

  function handleShapeDown(e: React.PointerEvent, rawId: string) {
    e.stopPropagation();
    if (tryZoomToolClick(e)) return;
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;

    if (additive) {
      // Shift-click always toggles the exact shape under the cursor — no
      // top-level resolution here, unlike a plain click. rawId is always
      // an individual leaf shape's own id already (only shapes have a
      // pointer handler; a group renders as a plain unclickable <g>
      // wrapper around its children), so this is precisely "add/remove
      // this one shape," letting you build a multi-selection out of
      // individual children inside a group without needing to drill in
      // first. Climbing to the group here (as a plain click does) was the
      // bug: shift-clicking two children of the same group ended up
      // selecting the parent group twice instead of the two children.
      const id = rawId;
      const nextSelection = selection.includes(id)
        ? selection.filter((s) => s !== id)
        : // Drop any ancestor of the newly clicked shape that's already
          // selected — having both a group and one of its own children
          // selected at once would double-apply a drag (the child moves
          // via its own transform AND via its parent's), the exact
          // "top-of-selection only" invariant mergeLayers/groupSelection/
          // duplicateSelection already enforce elsewhere.
          [...selection.filter((s) => !isAncestorOrSelf(layers, s, id)), id];
      setSelection(nextSelection);
      beginMove(e, nextSelection);
      return;
    }

    // A plain click on a group's member should select/move the whole
    // group as one unit — but ONLY once resolved as a genuine click
    // (see below); if this same mousedown turns into a drag, it should
    // move whatever's currently selected exactly as-is, unchanged,
    // otherwise dragging a grouped shape on the canvas silently broke the
    // group selection down to that single child instead of moving
    // everything together.
    const singleSelected = selection.length === 1 ? selection[0] : undefined;
    if (singleSelected !== undefined && isAncestorOrSelf(layers, singleSelected, rawId)) {
      // Clicking within the already-selected group/shape: keep the
      // current selection for the drag, and only resolve this as a "step
      // one level deeper" click in onPointerUp, if the pointer turns out
      // not to have moved at all — Figma's own "click to select the
      // group, click again (without dragging) to work on what's inside
      // it," generalized to any nesting depth.
      beginMove(e, selection, rawId);
      return;
    }

    const id = getTopLevelId(layers, rawId);
    selectLayer(id, false);
    beginMove(e, [id]);
  }

  function renderLayer(id: string): React.ReactNode {
    const layer: Layer | undefined = layers[id];
    if (!layer || !layer.visible) return null;
    const t = layer.transform;
    const transformAttr = `translate(${t.x} ${t.y}) rotate(${t.rotation}) scale(${t.scaleX} ${t.scaleY})`;

    if (layer.type === "group") {
      return (
        <g key={id} transform={transformAttr}>
          {layer.children.map((c) => renderLayer(c))}
        </g>
      );
    }

    const pathD = regionsToPathD(roundRegions(layer.regions, layer.cornerRadius));
    return (
      <g key={id} transform={transformAttr}>
        <path
          d={pathD}
          fill={layer.isHole ? "#ef4444" : layer.color}
          fillOpacity={layer.isHole ? 0.35 : 1}
          fillRule="evenodd"
          stroke={layer.isHole ? "#ef4444" : "none"}
          strokeWidth={layer.isHole ? 1 : 0}
          strokeDasharray={layer.isHole ? "3 2" : undefined}
          vectorEffect={layer.isHole ? "non-scaling-stroke" : undefined}
          style={{
            cursor: zoomToolArmed ? (zoomToolOut ? "zoom-out" : "zoom-in") : layer.locked ? "default" : "move",
          }}
          onPointerDown={(e) => {
            // The zoom tool zooms on anything you click, lock included —
            // it's not a selection action.
            if (tryZoomToolClick(e)) return;
            if (!layer.locked) handleShapeDown(e, id);
          }}
        />
      </g>
    );
  }

  const gridSize = 10;
  const zoomPct = Math.round((document_.widthMM / vb.w) * 100);

  return (
    <>
      <svg
        ref={svgRef}
        className={
          "canvas2d" +
          (isPanning ? " panning" : "") +
          (spaceHeld ? " space-pan" : "") +
          (zoomToolArmed ? (zoomToolOut ? " zoom-out-tool" : " zoom-in-tool") : "")
        }
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        onPointerDown={(e) => {
          if (tryZoomToolClick(e)) return;
          if (e.target === svgRef.current || (e.target as Element).tagName === "rect") {
            if (spaceHeld) beginPan(e);
            else beginMarquee(e);
          }
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <defs>
          <pattern id="grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
            <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="#d8d8d8" strokeWidth={0.15} />
          </pattern>
        </defs>

        <rect
          x={0}
          y={0}
          width={document_.widthMM}
          height={document_.heightMM}
          fill="#ffffff"
          stroke="#c6c6c6"
          strokeWidth={0.3}
        />
        {showGrid && (
          <rect
            x={0}
            y={0}
            width={document_.widthMM}
            height={document_.heightMM}
            fill="url(#grid)"
            pointerEvents="none"
          />
        )}

        {rootIds.map((id) => renderLayer(id))}

        {selection.map((id) => {
          const b = getLayerWorldBounds(layers, id);
          if (!b) return null;
          // Outset a hair past the shape's own edge. Drawn exactly on top of
          // it, the outline's inner half anti-aliases straight into the
          // fill (a near-identical accent-blue against an indigo shape,
          // there's nothing to see) and only shows where a corner happens
          // to land on bare background — which is why a plain rectangle
          // showed no visible outline at all while a circle's square
          // bounding box (corners poking past the round fill) did.
          const m = SELECTION_OUTLINE_MARGIN_MM;
          return (
            <rect
              key={id}
              className="selection-box"
              x={b.minX - m}
              y={b.minY - m}
              width={Math.max(0.01, b.maxX - b.minX + m * 2)}
              height={Math.max(0.01, b.maxY - b.minY + m * 2)}
              pointerEvents="none"
            />
          );
        })}

        {marqueeRect && (
          <rect
            className="marquee-box"
            x={marqueeRect.x}
            y={marqueeRect.y}
            width={marqueeRect.w}
            height={marqueeRect.h}
            pointerEvents="none"
          />
        )}
      </svg>
      <div className="canvas-hint">
        Drag empty space to select · Space+drag or scroll to pan · Cmd/Ctrl+scroll, pinch, or hold Z (Option+Z to
        zoom out) and click to zoom · Cmd/Ctrl+0 for 100% · Click a shape to select, drag to move
      </div>
      <div className="zoom-indicator">{zoomPct}%</div>
    </>
  );
}
