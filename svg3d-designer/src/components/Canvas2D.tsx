import { useEffect, useRef, useState } from "react";
import { beginGesture, endGesture, useActivePlateRootIds, useSceneStore, type TrackedSceneSlice } from "../state/store";
import {
  boundsOverlap,
  getLayerWorldBounds,
  getLocalShapeBounds,
  getMultiLayerWorldBounds,
  getTopLevelId,
  isAncestorOrSelf,
  isEffectivelyLocked,
  stepIntoOnClick,
} from "../state/sceneUtils";
import { roundRegions } from "../geometry/roundCorners";
import type { Layer, PenAnchor, ShapeRegion, Transform2D } from "../types";
import { InfoIcon } from "./icons";

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

/** One path-data segment from anchor `a` to anchor `b` — a straight `L`
 * when neither end has a handle, a cubic `C` otherwise. Used only for the
 * in-progress Pen tool draft preview; the finished shape's own points are
 * already flattened (see flattenPenAnchors) before they ever become a
 * ShapeLayer, so nothing downstream of that needs this. */
function penSegmentD(a: PenAnchor, b: PenAnchor): string {
  if (!a.handleOut && !b.handleIn) return `L ${b.x} ${b.y} `;
  const c1 = a.handleOut ?? { x: a.x, y: a.y };
  const c2 = b.handleIn ?? { x: b.x, y: b.y };
  return `C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y} `;
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

/** Never let a resize handle drag scale a shape down to (or past) zero —
 * that flips into negative scale, which corrupts triangle winding on
 * export (see extrude.ts's own comment on why scale is never negative). */
const MIN_RESIZE_SCALE = 0.02;

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** Rotates a 2D vector by `deg`, matching the exact convention SVG's own
 * `rotate()` transform uses (a standard rotation matrix applied in this
 * app's Y-down document space) — so this can invert or replay that same
 * rotation when converting between world and local space during a resize
 * drag. */
function rotateVec(x: number, y: number, deg: number): { x: number; y: number } {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

/** Maps a point in a shape's own local (unscaled) coordinate space to
 * document/world space, mirroring exactly what `renderLayer`'s
 * `translate(...) rotate(...) scale(...)` attribute does — scale first,
 * then rotate, then translate. */
function localToWorld(local: { x: number; y: number }, t: Transform2D): { x: number; y: number } {
  const scaled = rotateVec(local.x * t.scaleX, local.y * t.scaleY, t.rotation);
  return { x: scaled.x + t.x, y: scaled.y + t.y };
}

interface Props {
  resetSignal: number;
}

export function Canvas2D({ resetSignal }: Props) {
  const document_ = useSceneStore((s) => s.document);
  const layers = useSceneStore((s) => s.layers);
  const rootIds = useActivePlateRootIds();
  const selection = useSceneStore((s) => s.selection);
  const selectLayer = useSceneStore((s) => s.selectLayer);
  const setSelection = useSceneStore((s) => s.setSelection);
  const clearSelection = useSceneStore((s) => s.clearSelection);
  const setLayerTransform = useSceneStore((s) => s.setLayerTransform);
  const showGrid = useSceneStore((s) => s.showGrid);
  const penToolActive = useSceneStore((s) => s.penToolActive);
  const penDraftAnchors = useSceneStore((s) => s.penDraftAnchors);
  const addPenAnchor = useSceneStore((s) => s.addPenAnchor);
  const finishPenTool = useSceneStore((s) => s.finishPenTool);

  const svgRef = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState<ViewBox>(() => fitView(document_.widthMM, document_.heightMM));
  const vbRef = useRef(vb);
  vbRef.current = vb;
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [marqueeRect, setMarqueeRect] = useState<ViewBox | null>(null);
  const [showHint, setShowHint] = useState(false);
  // Live cursor position in document (mm) space while the pen tool is
  // armed — drives the rubber-band preview line from the last placed point
  // to wherever the pointer currently is, the same live-preview feedback
  // Figma's own pen tool gives before you've clicked the next point.
  const [penHoverPoint, setPenHoverPoint] = useState<{ x: number; y: number } | null>(null);
  // A real bezier pen gesture, in progress between pointerdown and
  // pointerup: `anchorPoint` is where the new anchor will land (or, when
  // closing, the existing first anchor's own position), `closing` is set
  // if this gesture will finish the path rather than extend it. Committed
  // to the store's anchor list (or handed to finishPenTool) only on
  // pointerup, once it's known whether the gesture was a plain click (a
  // straight "corner" anchor) or a click-and-drag (a curved "smooth" one)
  // — matches Illustrator/Figma/Photoshop's own pen tool exactly.
  const penGestureRef = useRef<{ anchorPoint: { x: number; y: number }; closing: boolean; moved: boolean } | null>(
    null,
  );
  // Live drag position for the handle currently being pulled out, while a
  // pen gesture from penGestureRef is in progress — drives the handle-line
  // preview render. Separate from penHoverPoint, which only applies
  // between gestures (idle rubber-band to the next click).
  const [penDragPoint, setPenDragPoint] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!penToolActive) {
      setPenHoverPoint(null);
      setPenDragPoint(null);
      penGestureRef.current = null;
    }
  }, [penToolActive]);
  // Smart alignment guides: while dragging shapes, a dashed line highlights
  // any edge/center that lines up with another shape's, so you can actually
  // see the alignment happen instead of eyeballing it against the (visually
  // very similar) selection outline.
  const [alignGuides, setAlignGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const hintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showHint) return;
    function onDocDown(e: MouseEvent) {
      if (hintRef.current && !hintRef.current.contains(e.target as Node)) setShowHint(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowHint(false);
    }
    document.addEventListener("mousedown", onDocDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showHint]);

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

  // A resize-handle drag is kept entirely separate from dragState above
  // (pan/move/marquee) rather than folded into that union — its shape is
  // different enough (an anchor point that must stay fixed in world space,
  // which axes are actually being resized, the shape's own local bounds)
  // that sharing one type would mean every other mode carrying fields it
  // never uses.
  const resizeState = useRef<{
    id: string;
    handle: ResizeHandle;
    origTransform: Transform2D;
    /** The local-space point that must stay at the same world position
     * throughout the drag — the opposite corner/edge from the one being
     * dragged. */
    anchorLocal: { x: number; y: number };
    /** anchorWorld computed once at drag start from origTransform — the
     * fixed point every subsequent frame solves a new transform around. */
    anchorWorld: { x: number; y: number };
    /** handleLocal - anchorLocal, in local (unscaled) space — fixed for
     * the whole drag; only ever nonzero on the axis/axes this handle
     * actually resizes. */
    dLocal: { x: number; y: number };
    resizesX: boolean;
    resizesY: boolean;
    preGestureSnapshot: TrackedSceneSlice;
    moved: boolean;
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

  /** A gesture starting this close (in real screen pixels, not document mm
   * — so it feels the same at any zoom level) to the path's own first
   * anchor closes it, the same "click back on the start" convention every
   * vector pen tool uses. */
  const PEN_CLOSE_THRESHOLD_PX = 10;
  /** Below this much real on-screen movement, a pen gesture reads as a
   * plain click (a straight "corner" anchor) rather than a drag (a curved
   * "smooth" one) — matches the small dead-zone every other drag-vs-click
   * gesture in this file already uses, just named for this one. */
  const PEN_DRAG_THRESHOLD_PX = 3;

  function svgPointToClient(p: { x: number; y: number }): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = p.x;
    pt.y = p.y;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const t = pt.matrixTransform(ctm);
    return { x: t.x, y: t.y };
  }

  /** Reflects `handle` through `anchor` — the symmetric-handle convention
   * every pen tool uses when you drag a smooth anchor: the incoming and
   * outgoing tangents point in exactly opposite directions, so the curve
   * stays smooth (no visible kink) through that anchor. */
  function mirrorPoint(anchor: { x: number; y: number }, handle: { x: number; y: number }): { x: number; y: number } {
    return { x: 2 * anchor.x - handle.x, y: 2 * anchor.y - handle.y };
  }

  /** Starts a pen-tool gesture on pointerdown; returns whether it did
   * (callers should skip their normal select/pan/move handling if so) —
   * same shape as tryZoomToolClick above. The actual anchor/close commit
   * happens on pointerup (see onPointerUp below), once it's known whether
   * this was a click or a click-and-drag. */
  function tryPenToolDown(e: React.PointerEvent): boolean {
    if (!penToolActive) return false;
    e.stopPropagation();
    const p = clientToSvg(e.clientX, e.clientY);
    const first = penDraftAnchors[0];
    const firstClient = penDraftAnchors.length >= 3 && first ? svgPointToClient(first) : null;
    const closing = !!firstClient && Math.hypot(e.clientX - firstClient.x, e.clientY - firstClient.y) <= PEN_CLOSE_THRESHOLD_PX;
    penGestureRef.current = { anchorPoint: closing ? first : p, closing, moved: false };
    setPenDragPoint(null);
    (e.target as Element).setPointerCapture(e.pointerId);
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
      // A locked shape that ended up in a multi-selection some other way
      // (marquee-selected before being locked, part of a shift-clicked
      // group) still shouldn't move along with the rest of the drag.
      if (layer && !isEffectivelyLocked(layers, id)) originals[id] = { x: layer.transform.x, y: layer.transform.y };
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

  /** Which local point stays fixed, and which axes actually change, for
   * each of the 8 resize handles — see the derivation in the resizeState
   * doc comment above: dragging a handle keeps the OPPOSITE corner/edge
   * fixed in world space, Photoshop's own free-transform convention. */
  function resizeHandleGeometry(
    handle: ResizeHandle,
    b: { minX: number; minY: number; maxX: number; maxY: number },
  ): { anchorLocal: { x: number; y: number }; handleLocal: { x: number; y: number }; resizesX: boolean; resizesY: boolean } {
    const { minX, minY, maxX, maxY } = b;
    switch (handle) {
      case "e":
        return { anchorLocal: { x: minX, y: minY }, handleLocal: { x: maxX, y: minY }, resizesX: true, resizesY: false };
      case "w":
        return { anchorLocal: { x: maxX, y: minY }, handleLocal: { x: minX, y: minY }, resizesX: true, resizesY: false };
      case "n":
        return { anchorLocal: { x: minX, y: maxY }, handleLocal: { x: minX, y: minY }, resizesX: false, resizesY: true };
      case "s":
        return { anchorLocal: { x: minX, y: minY }, handleLocal: { x: minX, y: maxY }, resizesX: false, resizesY: true };
      case "ne":
        return { anchorLocal: { x: minX, y: maxY }, handleLocal: { x: maxX, y: minY }, resizesX: true, resizesY: true };
      case "nw":
        return { anchorLocal: { x: maxX, y: maxY }, handleLocal: { x: minX, y: minY }, resizesX: true, resizesY: true };
      case "se":
        return { anchorLocal: { x: minX, y: minY }, handleLocal: { x: maxX, y: maxY }, resizesX: true, resizesY: true };
      case "sw":
        return { anchorLocal: { x: maxX, y: minY }, handleLocal: { x: minX, y: maxY }, resizesX: true, resizesY: true };
    }
  }

  function beginResize(e: React.PointerEvent, id: string, handle: ResizeHandle) {
    const layer = layers[id];
    if (!layer || layer.type !== "shape") return;
    const localBounds = getLocalShapeBounds(layer);
    if (!localBounds) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const t = layer.transform;
    const { anchorLocal, handleLocal, resizesX, resizesY } = resizeHandleGeometry(handle, localBounds);
    resizeState.current = {
      id,
      handle,
      origTransform: t,
      anchorLocal,
      anchorWorld: localToWorld(anchorLocal, t),
      dLocal: { x: handleLocal.x - anchorLocal.x, y: handleLocal.y - anchorLocal.y },
      resizesX,
      resizesY,
      preGestureSnapshot: beginGesture(),
      moved: false,
    };
  }

  // How close two edges/centers need to be (in document mm) to count as
  // "aligned" — scaled by the current zoom so it reads as a consistent
  // few screen pixels whether zoomed in or out.
  const ALIGN_TOLERANCE_FRACTION = 0.004;

  function computeAlignGuides(draggedIds: string[], liveLayers: Record<string, Layer>): { v: number[]; h: number[] } {
    const draggedBounds = getMultiLayerWorldBounds(liveLayers, draggedIds);
    if (!draggedBounds) return { v: [], h: [] };
    const tolerance = Math.max(0.3, vbRef.current.w * ALIGN_TOLERANCE_FRACTION);
    const draggedSet = new Set(draggedIds);

    const dCenterX = (draggedBounds.minX + draggedBounds.maxX) / 2;
    const dCenterY = (draggedBounds.minY + draggedBounds.maxY) / 2;

    const v = new Set<number>();
    const h = new Set<number>();

    for (const id of rootIds) {
      if (draggedSet.has(id)) continue;
      const b = getLayerWorldBounds(liveLayers, id);
      if (!b) continue;
      const centerX = (b.minX + b.maxX) / 2;
      const centerY = (b.minY + b.maxY) / 2;

      if (Math.abs(draggedBounds.minX - b.minX) < tolerance) v.add(b.minX);
      if (Math.abs(draggedBounds.maxX - b.maxX) < tolerance) v.add(b.maxX);
      if (Math.abs(dCenterX - centerX) < tolerance) v.add(centerX);
      if (Math.abs(draggedBounds.minY - b.minY) < tolerance) h.add(b.minY);
      if (Math.abs(draggedBounds.maxY - b.maxY) < tolerance) h.add(b.maxY);
      if (Math.abs(dCenterY - centerY) < tolerance) h.add(centerY);
    }

    return { v: Array.from(v), h: Array.from(h) };
  }

  function onPointerMove(e: React.PointerEvent) {
    const resize = resizeState.current;
    if (resize) {
      const pointerWorld = clientToSvg(e.clientX, e.clientY);
      const rel = { x: pointerWorld.x - resize.anchorWorld.x, y: pointerWorld.y - resize.anchorWorld.y };
      // Un-rotate the pointer's world-space offset from the anchor back
      // into the shape's own local frame — this is what lets a rotated
      // shape's handle still drag along its own edge direction instead of
      // the screen's X/Y, the same way Photoshop's free-transform handles
      // track a rotated layer's own axes.
      const localDelta = rotateVec(rel.x, rel.y, -resize.origTransform.rotation);
      const t = resize.origTransform;
      const scaleX = resize.resizesX
        ? Math.max(MIN_RESIZE_SCALE, localDelta.x / resize.dLocal.x)
        : t.scaleX;
      const scaleY = resize.resizesY
        ? Math.max(MIN_RESIZE_SCALE, localDelta.y / resize.dLocal.y)
        : t.scaleY;
      // Solve position from the SAME equation beginResize's anchorWorld
      // came from, just inverted: with the new scale fixed, where must
      // the origin sit so the anchor point still lands exactly on
      // anchorWorld?
      const anchorContribution = rotateVec(resize.anchorLocal.x * scaleX, resize.anchorLocal.y * scaleY, t.rotation);
      resize.moved = true;
      setLayerTransform(resize.id, {
        scaleX,
        scaleY,
        x: resize.anchorWorld.x - anchorContribution.x,
        y: resize.anchorWorld.y - anchorContribution.y,
      });
      return;
    }

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
      const movedIds = Object.keys(drag.originals);
      const liveLayers = useSceneStore.getState().layers;
      setAlignGuides(computeAlignGuides(movedIds, liveLayers));
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
    const penGesture = penGestureRef.current;
    if (penGesture) {
      const drop = clientToSvg(e.clientX, e.clientY);
      if (penGesture.closing) {
        // A drag on the closing click curves the final segment back into
        // the first anchor — handed to finishPenTool as that anchor's own
        // handleIn, same as if it had always had that handle.
        finishPenTool(penGesture.moved ? drop : undefined);
      } else if (penGesture.moved) {
        // A smooth anchor: symmetric handles, so the curve stays smooth
        // (no visible kink) both into and out of this anchor.
        addPenAnchor({
          x: penGesture.anchorPoint.x,
          y: penGesture.anchorPoint.y,
          handleOut: drop,
          handleIn: mirrorPoint(penGesture.anchorPoint, drop),
        });
      } else {
        // A plain click: a straight "corner" anchor, no handles at all.
        addPenAnchor({ x: penGesture.anchorPoint.x, y: penGesture.anchorPoint.y });
      }
      penGestureRef.current = null;
      setPenDragPoint(null);
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      return;
    }

    const resize = resizeState.current;
    if (resize) {
      endGesture(resize.preGestureSnapshot, resize.moved);
      resizeState.current = null;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      return;
    }

    const drag = dragState.current;
    if (drag?.mode === "pan" && !drag.moved) clearSelection();
    if (drag?.mode === "move") setAlignGuides({ v: [], h: [] });
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
    // The pen tool places a point wherever you click, existing shapes
    // included — the same "draw right through anything" behavior Figma's
    // own pen tool has, rather than selecting/moving whatever's underneath.
    if (tryPenToolDown(e)) return;
    // Space+drag pans even when the pointer happens to come down on a
    // shape — without this, the shape's own handler (which runs first and
    // stops the event before it ever reaches the canvas-level pan check)
    // always started moving that shape instead, no matter where you
    // pressed down.
    if (spaceHeld) {
      beginPan(e);
      return;
    }
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

    // A plain click on a group's member — or on any member of an existing
    // MULTI-selection built via shift-click/marquee — should keep moving
    // the whole current selection as one unit, not just the shape under
    // the cursor. This has to be resolved ONLY once the gesture turns out
    // to be a genuine click with no movement (see below); if this same
    // mousedown turns into a drag, it must move whatever's currently
    // selected exactly as-is, unchanged. Getting this wrong (checking only
    // a single-shape selection, as this used to) silently narrowed ANY
    // multi-selection down to just the one shape you happened to grab the
    // instant you tried to drag it — selecting several shapes and dragging
    // one looked like it "deselected everything but that one."
    const clickedWithinSelection = selection.some((s) => isAncestorOrSelf(layers, s, rawId));
    if (clickedWithinSelection) {
      // Resolved in onPointerUp: if the pointer never actually moved, this
      // was a plain click, not a drag — collapse to just this shape (or,
      // for a single already-selected group, step one level deeper),
      // Figma's own "click to select the group, click again to work on
      // what's inside it," generalized to any nesting depth or selection
      // size.
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
            cursor: zoomToolArmed
              ? zoomToolOut ? "zoom-out" : "zoom-in"
              : penToolActive ? "crosshair"
              : isEffectivelyLocked(layers, id) ? "default" : "move",
          }}
          onPointerDown={(e) => {
            // The zoom tool zooms on anything you click, lock included —
            // it's not a selection action. Same for the pen tool: it draws
            // right through a locked shape rather than being blocked by it.
            if (tryZoomToolClick(e)) return;
            if (tryPenToolDown(e)) return;
            // A shape locked directly OR inherited from a locked ancestor
            // group is entirely inert to canvas clicks — matches Figma:
            // locking a group freezes everything inside it too, not just
            // whatever's locked at the top level.
            if (!isEffectivelyLocked(layers, id)) handleShapeDown(e, id);
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
          (zoomToolArmed ? (zoomToolOut ? " zoom-out-tool" : " zoom-in-tool") : "") +
          (penToolActive ? " pen-tool" : "")
        }
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        onPointerDown={(e) => {
          if (tryZoomToolClick(e)) return;
          if (tryPenToolDown(e)) return;
          if (e.target === svgRef.current || (e.target as Element).tagName === "rect") {
            if (spaceHeld) beginPan(e);
            else beginMarquee(e);
          }
        }}
        onPointerMove={(e) => {
          if (penToolActive) {
            const p = clientToSvg(e.clientX, e.clientY);
            const gesture = penGestureRef.current;
            if (gesture) {
              const anchorClient = svgPointToClient(gesture.anchorPoint);
              const clientDist = anchorClient ? Math.hypot(e.clientX - anchorClient.x, e.clientY - anchorClient.y) : 0;
              if (clientDist > PEN_DRAG_THRESHOLD_PX) gesture.moved = true;
              setPenDragPoint(p);
            } else {
              setPenHoverPoint(p);
            }
            return;
          }
          onPointerMove(e);
        }}
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

        {(() => {
          // Photoshop-style drag-to-resize handles — only for a single,
          // unlocked shape (not a group: a group's "size" would need its
          // own combined-bounds notion this doesn't have yet, and multiple
          // shapes have no single unambiguous handle to grab). Positioned
          // at the same axis-aligned world bounds the selection outline
          // above already uses, which is exact for an unrotated shape and
          // a reasonable approximation for a rotated one — the resize math
          // itself (see beginResize/onPointerMove) works in the shape's
          // true local+rotated frame regardless of where the handle is
          // drawn, so a rotated shape still resizes correctly even though
          // its handles sit at the bounding box rather than its own
          // rotated corners.
          if (selection.length !== 1) return null;
          const id = selection[0];
          const layer = layers[id];
          if (!layer || layer.type !== "shape" || isEffectivelyLocked(layers, id)) return null;
          const b = getLayerWorldBounds(layers, id);
          if (!b) return null;
          const size = Math.max(1.2, vb.w * 0.01);
          const half = size / 2;
          const midX = (b.minX + b.maxX) / 2;
          const midY = (b.minY + b.maxY) / 2;
          const handles: { handle: ResizeHandle; x: number; y: number; cursor: string }[] = [
            { handle: "nw", x: b.minX, y: b.minY, cursor: "nwse-resize" },
            { handle: "n", x: midX, y: b.minY, cursor: "ns-resize" },
            { handle: "ne", x: b.maxX, y: b.minY, cursor: "nesw-resize" },
            { handle: "e", x: b.maxX, y: midY, cursor: "ew-resize" },
            { handle: "se", x: b.maxX, y: b.maxY, cursor: "nwse-resize" },
            { handle: "s", x: midX, y: b.maxY, cursor: "ns-resize" },
            { handle: "sw", x: b.minX, y: b.maxY, cursor: "nesw-resize" },
            { handle: "w", x: b.minX, y: midY, cursor: "ew-resize" },
          ];
          return (
            <>
              {handles.map((h) => (
                <rect
                  key={h.handle}
                  className="selection-handle"
                  x={h.x - half}
                  y={h.y - half}
                  width={size}
                  height={size}
                  style={{ cursor: h.cursor }}
                  onPointerDown={(e) => beginResize(e, id, h.handle)}
                />
              ))}
            </>
          );
        })()}

        {alignGuides.v.map((x) => (
          <line
            key={`v${x}`}
            className="align-guide"
            x1={x}
            y1={vb.y}
            x2={x}
            y2={vb.y + vb.h}
            pointerEvents="none"
          />
        ))}
        {alignGuides.h.map((y) => (
          <line
            key={`h${y}`}
            className="align-guide"
            x1={vb.x}
            y1={y}
            x2={vb.x + vb.w}
            y2={y}
            pointerEvents="none"
          />
        ))}

        {penToolActive && penDraftAnchors.length > 0 && (() => {
          const gesture = penGestureRef.current;
          const dragging = !!(gesture?.moved && penDragPoint);

          // What the path would look like if the current gesture (or, with
          // no gesture running, just the hover position) were committed
          // right now — the same live preview every pen tool gives before
          // you've actually clicked/released the next anchor.
          let previewTarget: PenAnchor | null = null;
          if (gesture) {
            if (gesture.closing) {
              previewTarget = dragging ? { ...penDraftAnchors[0], handleIn: penDragPoint! } : penDraftAnchors[0];
            } else {
              previewTarget = dragging
                ? {
                    x: gesture.anchorPoint.x,
                    y: gesture.anchorPoint.y,
                    handleOut: penDragPoint!,
                    handleIn: mirrorPoint(gesture.anchorPoint, penDragPoint!),
                  }
                : { x: gesture.anchorPoint.x, y: gesture.anchorPoint.y };
            }
          } else if (penHoverPoint) {
            previewTarget = { x: penHoverPoint.x, y: penHoverPoint.y };
          }

          let d = `M ${penDraftAnchors[0].x} ${penDraftAnchors[0].y} `;
          for (let i = 1; i < penDraftAnchors.length; i++) d += penSegmentD(penDraftAnchors[i - 1], penDraftAnchors[i]);
          const last = penDraftAnchors[penDraftAnchors.length - 1];
          if (previewTarget) d += penSegmentD(last, previewTarget);

          const handleR = Math.max(0.7, vb.w * 0.0035);
          const mirroredHandle = dragging ? mirrorPoint(gesture!.anchorPoint, penDragPoint!) : null;

          return (
            <>
              <path className="pen-draft-line" d={d} pointerEvents="none" />
              {dragging && mirroredHandle && (
                <>
                  <line
                    className="pen-draft-handle-line"
                    x1={mirroredHandle.x}
                    y1={mirroredHandle.y}
                    x2={penDragPoint!.x}
                    y2={penDragPoint!.y}
                    pointerEvents="none"
                  />
                  <circle className="pen-draft-handle" cx={penDragPoint!.x} cy={penDragPoint!.y} r={handleR} pointerEvents="none" />
                  <circle className="pen-draft-handle" cx={mirroredHandle.x} cy={mirroredHandle.y} r={handleR} pointerEvents="none" />
                </>
              )}
              {penDraftAnchors.map((p, i) => {
                const isFirst = i === 0;
                const closable = isFirst && penDraftAnchors.length >= 3;
                const r = Math.max(0.9, vb.w * 0.005) * (isFirst ? 1.6 : 1);
                return (
                  <circle
                    key={i}
                    className={"pen-draft-point" + (isFirst ? " first-point" : "") + (closable ? " closable" : "")}
                    cx={p.x}
                    cy={p.y}
                    r={r}
                    pointerEvents="none"
                  />
                );
              })}
            </>
          );
        })()}
      </svg>
      <div className="canvas-status-bar" ref={hintRef}>
        <button
          type="button"
          className={"canvas-info-btn" + (showHint ? " active" : "")}
          aria-label="Canvas controls help"
          onClick={() => setShowHint((v) => !v)}
        >
          <InfoIcon size={13} />
        </button>
        {showHint && (
          <div className="canvas-hint">
            Drag empty space to select · Space+drag or scroll to pan · Cmd/Ctrl+scroll, pinch, or hold Z (Option+Z to
            zoom out) and click to zoom · Cmd/Ctrl+0 for 100% · Click a shape to select, drag to move
          </div>
        )}
        <div className="zoom-indicator">{zoomPct}%</div>
      </div>
    </>
  );
}
